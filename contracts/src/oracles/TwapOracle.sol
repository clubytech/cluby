// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IOracle} from "../interfaces/IMorpho.sol";
import {IUniswapV3PoolMinimal} from "../interfaces/IExternal.sol";
import {TickMath} from "../libraries/TickMath.sol";

/// @title TwapOracle
/// @notice Morpho oracle for a collateral with no Chainlink feed: an arithmetic-mean-tick TWAP of
/// a Uniswap v3 pool, reported on Morpho's 1e36 scale.
///
/// @dev The window is the whole defence. A spot read can be moved inside one transaction by anyone
/// with a flash loan; an average over half an hour cannot be, unless the attacker is willing to
/// hold the price away from the market for that entire time and be arbitraged the whole way. The
/// pool must already carry enough observations for the window — if it does not, `observe` reverts,
/// and reverting is the right answer: a shorter window silently substituted would be a cheaper
/// oracle to attack, not a working one.
contract TwapOracle is IOracle {
    /// @dev Morpho quotes collateral in loan-token units on a 1e36 scale, decimals folded in.
    uint256 internal constant PRICE_SCALE = 1e36;

    IUniswapV3PoolMinimal public immutable pool;
    address public immutable baseToken;
    address public immutable quoteToken;
    bool public immutable baseIsToken0;
    uint32 public immutable window;

    error WindowTooShort();
    error TokenNotInPool();
    error PriceOutOfRange();
    error RingTooSmall(uint16 cardinality, uint32 needed);

    /// @param _window Seconds to average over. 30–60 minutes on this chain: long enough that moving
    /// it costs more than the position it would unlock, short enough to track a real move.
    constructor(address _pool, address _baseToken, address _quoteToken, uint32 _window) {
        if (_window < 300) revert WindowTooShort();

        pool = IUniswapV3PoolMinimal(_pool);

        // A window the pool cannot physically reach back over is not a long window, it is an oracle
        // that reverts. Uniswap's observation ring advances at most once per SECOND — `Oracle.write`
        // deduplicates by timestamp, not by block — so a pool needs one slot per second of window
        // in the worst case, and someone moving the tick every second can otherwise push the far
        // end of the window off the end of the ring. When that happens `observe` reverts `OLD`, and
        // `borrow`, `withdrawCollateral` and `liquidate` all stop with it: exactly the half that
        // protects the lender.
        //
        // The ring is grown permissionlessly with `increaseObservationCardinalityNext`, so this is
        // a listing-time chore, not a constraint on which pools can be used.
        (,,, uint16 cardinality,,,) = pool.slot0();
        if (cardinality < _window) revert RingTooSmall(cardinality, _window);

        address token0 = pool.token0();
        address token1 = pool.token1();

        if (_baseToken == token0 && _quoteToken == token1) {
            baseIsToken0 = true;
        } else if (_baseToken == token1 && _quoteToken == token0) {
            baseIsToken0 = false;
        } else {
            revert TokenNotInPool();
        }

        baseToken = _baseToken;
        quoteToken = _quoteToken;
        window = _window;
    }

    /// @notice Collateral price in loan-token units on Morpho's 1e36 scale.
    ///
    /// @dev No decimal adjustment appears here, and its absence is deliberate. A pool tick already
    /// describes RAW token1 per RAW token0, so the token decimals are baked into it; Morpho's
    /// `price()` is defined against raw amounts too. Folding 10^(quoteDecimals − baseDecimals) in
    /// on top — the factor a human-readable price needs — would count the 18-vs-6 gap twice and
    /// misprice the collateral by twelve orders of magnitude.
    function price() external view returns (uint256) {
        int24 meanTick = _meanTick();

        uint256 sqrtPriceX96 = uint256(TickMath.getSqrtRatioAtTick(meanTick));
        // ratioX128 = (sqrtPriceX96 / 2^96)^2 · 2^128 = raw token1 per raw token0, Q128.
        // Through mulDiv, not a shift: the square overflows uint256 above tick 443,637 — half of
        // Uniswap's own legal range — and would panic there instead of reverting PriceOutOfRange.
        uint256 ratioX128 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);

        // mulDiv keeps the 512-bit intermediate: ratio · 1e36 overflows uint256 on its own for any
        // pool where token0 is the cheaper-decimalled asset.
        uint256 result = baseIsToken0
            ? Math.mulDiv(ratioX128, PRICE_SCALE, 1 << 128)
            : Math.mulDiv(PRICE_SCALE, 1 << 128, ratioX128);

        if (result == 0) revert PriceOutOfRange();
        return result;
    }

    /// @notice The tick the price is derived from, exposed so a keeper can watch it directly.
    function meanTick() external view returns (int24) {
        return _meanTick();
    }

    function _meanTick() internal view returns (int24) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = window;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives,) = pool.observe(secondsAgos);
        int56 delta = tickCumulatives[1] - tickCumulatives[0];

        int24 tick = int24(delta / int56(uint56(window)));
        // Solidity truncates toward zero; Uniswap's convention rounds the mean tick down.
        if (delta < 0 && (delta % int56(uint56(window)) != 0)) tick--;
        return tick;
    }
}
