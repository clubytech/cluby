// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IMorpho, IOracle, Id, MarketParams, Position, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {IUniswapV3PoolMinimal} from "../../src/interfaces/IExternal.sol";
import {TwapOracle} from "../../src/oracles/TwapOracle.sol";
import {InverseOracle} from "../../src/oracles/InverseOracle.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {Addresses} from "../../src/Addresses.sol";

interface IPoolObservations {
    function observations(uint256 index)
        external
        view
        returns (uint32 blockTimestamp, int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128, bool initialized);
}

/// @notice ECONOMICS proofs. Each test asserts the property that OUGHT to hold; a failure is the
/// finding. Nothing here touches production code.
contract EconProofsForkTest is Test {
    using MarketParamsLib for MarketParams;

    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    address constant IRM = 0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1;
    address constant USDG = Addresses.USDG;

    // The three markets priced ONLY by a Uniswap TWAP, and their pools.
    address constant HIMS = 0xCceE82fE024c36fA15E1005edE3E9e4787e23D09;
    address constant HIMS_POOL = 0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64;
    address constant PONS_POOL = 0x7A192E71564ec66eE0763e328a3Ac274942dE4e1;
    address constant CASHCAT_POOL = 0x4B0c312fFbB068F6a0bEa128759E35d94B94D0E1;

    // Deployed oracles, read live.
    address constant ORACLE_NVDA = 0xB5736a58CE6370DaD1888d8996cf64A22e622BB8;
    address constant ORACLE_NVDA_SHORT = 0x2e72230DA46B888BB71d419d4e194577E43bF881;
    address constant ORACLE_TSLA = 0x621F64e2cb5AB5367B6Da286c3C126c6d7F5612F;
    address constant ORACLE_TSLA_SHORT = 0x3D28890c7c929c996BFB1ff581aee503986274B0;

    uint32 constant WINDOW = 1800;

    address supplier = makeAddr("econ-supplier");
    address borrower = makeAddr("econ-borrower");

    Lens lens;

    function setUp() public {
        vm.skip(bytes(vm.envOr("ROBINHOOD_RPC_URL", string(""))).length == 0);
        lens = new Lens(address(MORPHO));
    }

    // ------------------------------------------------------------------ 1 --
    // A pool's observation ring is the entire lifetime of the TWAP. If the ring cannot physically
    // hold `window` seconds of history at this chain's block rate, anyone willing to pay gas can
    // roll it shorter than the window, `observe` reverts with OLD, and every oracle-reading Morpho
    // call on that market — liquidate included — reverts with it.
    //
    // Blocks here are ~0.100 s and Uniswap writes at most one observation per block, so a ring of
    // N slots holds at most N/10 seconds of history under an attacker who writes every block.
    // Covering a 1800 s window therefore needs ~18000 slots. Assert the far weaker bound
    // (cardinality >= window) and watch it fail anyway.
    /// KNOWN RED until the rings are paid for. Not a regression and not a mystery: the three pools
    /// carry 300-360 observation slots against an 1,800-second window, growing them costs about
    /// 0.077 ETH in total, and the money is not there yet. It is safe to be red because all three
    /// markets are capped at zero with no supply and no borrows, and the oracle constructor now
    /// refuses any NEW listing in this state.
    ///
    /// To clear it: ./scripts/grow-twap-rings.sh --send, then wait for the swaps to wrap the index.
    function test_knownRed_twapPoolRingCannotHoldTheOracleWindow() public view {
        address[3] memory pools = [HIMS_POOL, PONS_POOL, CASHCAT_POOL];
        string[3] memory names = ["HIMS", "PONS", "CASHCAT"];

        for (uint256 i; i < 3; ++i) {
            (,,, uint16 cardinality,,,) = IUniswapV3PoolMinimal(pools[i]).slot0();
            console2.log(names[i], "observationCardinality", cardinality);
            console2.log("   slots the window needs:", uint256(WINDOW));
            assertGe(
                uint256(cardinality),
                uint256(WINDOW),
                "ring cannot hold the window: run scripts/grow-twap-rings.sh --send"
            );
        }
    }

    // The other half of the same mechanism, measured against the live pool rather than argued:
    // once the requested window is older than the oldest buffered observation, `observe` reverts.
    /// Uniswap's `observe` reverts `OLD` for anything past the end of the ring. That is correct
    /// behaviour and the reason the ring size is a safety parameter rather than a detail: a window
    /// the pool cannot reach back over is not a long window, it is an oracle that stops answering —
    /// and `price()` reverting takes borrow, withdrawCollateral and liquidate down with it.
    ///
    /// The live pool serves its configured 1,800-second window today. What this pins is the cliff
    /// just past the buffer, so the constructor check has a measured reason to exist.
    function test_observeRevertsPastTheEndOfTheRing() public {
        (,, uint16 index, uint16 cardinality,,,) = IUniswapV3PoolMinimal(HIMS_POOL).slot0();
        (uint32 oldestTs,,, bool init) = IPoolObservations(HIMS_POOL).observations((index + 1) % cardinality);
        if (!init) (oldestTs,,,) = IPoolObservations(HIMS_POOL).observations(0);

        uint32 span = uint32(block.timestamp) - oldestTs;
        console2.log("HIMS pool buffered history (s)", span);
        assertGt(span, WINDOW, "the live pool still covers its window");

        uint32[] memory ok = new uint32[](2);
        ok[0] = WINDOW;
        ok[1] = 0;
        IUniswapV3PoolMinimal(HIMS_POOL).observe(ok);

        uint32[] memory ago = new uint32[](2);
        ago[0] = span + 600; // just past the end of the buffer
        ago[1] = 0;
        vm.expectRevert(bytes("OLD"));
        IUniswapV3PoolMinimal(HIMS_POOL).observe(ago);
    }

    // And the consequence, end to end against the real Morpho: an underwater borrower on a
    // TWAP-priced market cannot be liquidated while `observe` is unavailable.
    /// The oracle now refuses to be built against a ring that cannot hold its window, so this
    /// scenario cannot be listed in the first place. Growing the ring is permissionless, which is
    /// why the check is a listing-time chore rather than a restriction on which pools can be used.
    function test_twapOracleRefusesTheLiveRingUntilItIsGrown() public {
        (,,, uint16 cardinality,,,) = IUniswapV3PoolMinimal(HIMS_POOL).slot0();
        assertLt(cardinality, WINDOW, "HIMS ring is still short of its window");

        vm.expectRevert(abi.encodeWithSelector(TwapOracle.RingTooSmall.selector, cardinality, WINDOW));
        new TwapOracle(HIMS_POOL, HIMS, USDG, WINDOW);

        // Anyone can pay for the slots. But `increaseObservationCardinalityNext` only raises the
        // TARGET: `observationCardinality` itself does not move until a tick-moving swap wraps the
        // index past the old end, which on a quiet pool can take a while. That is why the check
        // reads the live cardinality and not the next one — a ring that is merely paid for is not a
        // ring you can observe over — and why listing is a two-step: grow it, then wait for it.
        IUniswapV3PoolMinimal(HIMS_POOL).increaseObservationCardinalityNext(uint16(WINDOW));
        (,,, uint16 afterPaying,,,) = IUniswapV3PoolMinimal(HIMS_POOL).slot0();
        assertEq(afterPaying, cardinality, "paying for slots does not grow the ring by itself");
        vm.expectRevert(abi.encodeWithSelector(TwapOracle.RingTooSmall.selector, cardinality, WINDOW));
        new TwapOracle(HIMS_POOL, HIMS, USDG, WINDOW);

        // Once the swaps have caught up and the ring really is that size, it constructs.
        _pretendRingIsGrown();
        TwapOracle grown = new TwapOracle(HIMS_POOL, HIMS, USDG, WINDOW);
        assertGt(grown.price(), 0, "and then it prices normally");
    }

    /// @dev Report a grown ring from slot0 without simulating the thousand swaps that would grow it.
    function _pretendRingIsGrown() internal {
        (uint160 sqrtP, int24 tick, uint16 index,, uint16 next, uint8 fee, bool unlocked) =
            IUniswapV3PoolMinimal(HIMS_POOL).slot0();
        vm.mockCall(
            HIMS_POOL,
            abi.encodeWithSelector(IUniswapV3PoolMinimal.slot0.selector),
            abi.encode(sqrtP, tick, index, uint16(WINDOW), next, fee, unlocked)
        );
    }

    /// Kept whole: once the ring is grown, a market on this oracle behaves. The body below is the
    /// original scenario, which is still the one worth being sure of.
    function test_aRevertingTwapOracleFreezesLiquidationOnItsMarket() public {
        _pretendRingIsGrown();
        TwapOracle oracle = new TwapOracle(HIMS_POOL, HIMS, USDG, WINDOW);
        vm.clearMockedCalls();
        MarketParams memory params = MarketParams({
            loanToken: USDG,
            collateralToken: HIMS,
            oracle: address(oracle),
            irm: IRM,
            lltv: 0.385e18
        });
        if (MORPHO.idToMarketParams(params.id()).lltv == 0) MORPHO.createMarket(params);

        deal(USDG, supplier, 50_000e6);
        deal(HIMS, borrower, 500e18);

        vm.startPrank(supplier);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, 50_000e6, 0, supplier, "");
        vm.stopPrank();

        vm.startPrank(borrower);
        IERC20(HIMS).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, 500e18, borrower, "");
        uint256 borrowAmount = lens.userView(params, borrower, 0.02e18).safeBorrowAssets;
        MORPHO.borrow(params, borrowAmount, 0, borrower, borrower);
        vm.stopPrank();

        // Halve the mean tick's price: craft the cumulative pair the oracle averages.
        int24 tickNow = oracle.meanTick();
        int24 crashed = tickNow - 6931; // ln(2)/ln(1.0001) ≈ 6931 ticks ≈ −50%
        int24 lower = _lowerPriceTick(HIMS_POOL, tickNow, crashed);
        int56[] memory cum = new int56[](2);
        uint160[] memory spl = new uint160[](2);
        cum[0] = 0;
        cum[1] = int56(lower) * int56(uint56(WINDOW));
        vm.mockCall(HIMS_POOL, abi.encodeWithSelector(IUniswapV3PoolMinimal.observe.selector), abi.encode(cum, spl));

        Lens.UserView memory u = lens.userView(params, borrower, 0);
        assertTrue(u.liquidatable, "setup: position should be underwater after the crash");
        console2.log("health factor after the crash (wad)", u.healthFactorWad);

        // Now the ring has been rolled shorter than the window and `observe` reverts OLD. The
        // liquidation goes with it — Morpho prices the seizure through the same oracle — so an
        // underwater position becomes unliquidatable for exactly as long as the attacker keeps the
        // ring rolling. That is the impact behind the cardinality requirement, and it is why the
        // requirement is in the constructor rather than in a runbook.
        vm.mockCallRevert(HIMS_POOL, abi.encodeWithSelector(IUniswapV3PoolMinimal.observe.selector), "OLD");

        deal(USDG, address(this), 100_000e6);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        Position memory p = MORPHO.position(params.id(), borrower);
        vm.expectRevert(bytes("OLD"));
        MORPHO.liquidate(params, borrower, 0, p.borrowShares / 2, "");
    }

    // ------------------------------------------------------------------ 2 --
    // The keeper's own gate, replayed on the LLTVs that are actually deployed.
    //   flashAmount   = repaid · 1.01           (liquidate.ts:99)
    //   minAmountOut  = seizedValue · 0.92      (liquidate.ts:100)
    //   repaid        = seizedValue / LIF       (liquidate.ts:98)
    //   skip unless minAmountOut > flashAmount  (liquidate.ts:102)
    // => the keeper acts only while 0.92 > 1.01/LIF, i.e. LLTV < 70.297%.
    /// The keeper's swap floor used to be a flat 92% of the collateral's oracle value while the
    /// repayment is that value divided by the liquidation premium. Those two cross at LLTV 70.297%:
    /// above it the floor sat BELOW the repayment, so the gate refused every liquidation on ETH and
    /// SGOV, in every state, silently.
    ///
    /// Deriving the floor from the repayment removes the threshold. What narrows with the premium
    /// is the slippage budget, which is the thing that should narrow: at 86% LLTV the premium
    /// really is only 4.4%, so there really is only 3.7% of room to sell into.
    function test_keeperSizingWorksOnEveryDeployedLltv() public pure {
        uint256[4] memory lltvs = [uint256(0.385e18), 0.625e18, 0.77e18, 0.86e18];
        string[4] memory who = ["long-tail 38.5%", "stocks 62.5%", "ETH 77%", "SGOV 86%"];

        uint256 seizedValue = 1_000e6; // 1000 USDG of collateral seized
        uint256 maxSlippageWad = 0.08e18; // FlashLiquidator's own floor
        uint256 marginBps = 50; // PROFIT_MARGIN_BPS

        for (uint256 i; i < 4; ++i) {
            uint256 lif = _lif(lltvs[i]);
            uint256 repaid = (seizedValue * 1e18) / lif;

            uint256 minAmountOut = repaid + (repaid * marginBps) / 10_000;
            uint256 contractFloor = (seizedValue * (1e18 - maxSlippageWad)) / 1e18;
            if (contractFloor > minAmountOut) minAmountOut = contractFloor;

            console2.log(who[i], "minOut", minAmountOut);
            assertGt(minAmountOut, repaid, "the sale must beat the repayment");
            assertLe(minAmountOut, seizedValue, "and must be fillable at the oracle price");
            assertGe(minAmountOut, contractFloor, "and must not sit under the contract's own floor");
        }
    }

    // ------------------------------------------------------------------ 3 --
    // Control: does Lens agree with Morpho's own health test, on the live oracle, at the boundary?
    function test_lensLiquidatableAgreesWithMorphoAtTheBoundary() public {
        MarketParams memory params = MarketParams({
            loanToken: USDG,
            collateralToken: Addresses.NVDA,
            oracle: ORACLE_NVDA,
            irm: IRM,
            lltv: 0.625e18
        });
        if (MORPHO.idToMarketParams(params.id()).lltv == 0) MORPHO.createMarket(params);

        deal(USDG, supplier, 50_000e6);
        deal(Addresses.NVDA, borrower, 20e18);

        vm.startPrank(supplier);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, 50_000e6, 0, supplier, "");
        vm.stopPrank();

        uint256 price = IOracle(ORACLE_NVDA).price();
        uint256 collateral = 20e18;
        uint256 maxBorrow = (collateral * price / 1e36) * 0.625e18 / 1e18;

        vm.startPrank(borrower);
        IERC20(Addresses.NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, collateral, borrower, "");
        MORPHO.borrow(params, maxBorrow, 0, borrower, borrower);
        vm.stopPrank();

        // Exactly at the line: Morpho calls this healthy, Lens must agree.
        Lens.UserView memory at = lens.userView(params, borrower, 0);
        assertFalse(at.liquidatable, "Lens calls liquidatable what Morpho calls healthy");
        assertGe(at.healthFactorWad, 1e18);

        deal(USDG, address(this), 100_000e6);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        vm.expectRevert();
        MORPHO.liquidate(params, borrower, 1e15, 0, "");

        // One second of interest is enough to cross it. Lens must flip in the same second Morpho does.
        for (uint256 i; i < 400; ++i) {
            vm.warp(block.timestamp + 1);
            if (lens.userView(params, borrower, 0).liquidatable) break;
        }
        Lens.UserView memory over = lens.userView(params, borrower, 0);
        assertTrue(over.liquidatable, "Lens never flipped");
        console2.log("crossed at hf (wad)", over.healthFactorWad);
        // Morpho must accept the liquidation in the very block Lens says it is liquidatable.
        MORPHO.liquidate(params, borrower, 1e15, 0, "");
    }

    // ------------------------------------------------------------------ 4 --
    // Control: is the 1e36/1e72 scaling right for the short markets, with 6-decimal collateral and
    // 18-decimal loan, against the LIVE deployed oracles?
    function test_inverseOracleScalingIsExactOnChain() public view {
        uint256 nvda = IOracle(ORACLE_NVDA).price();
        uint256 nvdaShort = IOracle(ORACLE_NVDA_SHORT).price();
        uint256 tsla = IOracle(ORACLE_TSLA).price();
        uint256 tslaShort = IOracle(ORACLE_TSLA_SHORT).price();

        console2.log("NVDA long ", nvda);
        console2.log("NVDA short", nvdaShort);
        assertEq(nvdaShort, (1e36 * 1e36) / nvda, "NVDA-SHORT is not the exact inverse");
        assertEq(tslaShort, (1e36 * 1e36) / tsla, "TSLA-SHORT is not the exact inverse");

        // 100 USDG of collateral (6 dec) at 62.5% must license the stock amount (18 dec) that the
        // long price says it is worth. Round-trip within one part in 1e12.
        uint256 collateral = 100e6;
        uint256 borrowable = (collateral * nvdaShort / 1e36) * 0.625e18 / 1e18; // NVDA wei
        uint256 backToUsdg = borrowable * nvda / 1e36; // USDG raw
        console2.log("100 USDG licenses NVDA wei", borrowable);
        console2.log("worth USDG raw           ", backToUsdg);
        assertApproxEqRel(backToUsdg, 62_500_000, 1e12); // 1e-6 relative
    }

    function _lif(uint256 lltv) internal pure returns (uint256) {
        uint256 f = (1e18 * 1e18) / (1e18 - (0.3e18 * (1e18 - lltv)) / 1e18);
        return f < 1.15e18 ? f : 1.15e18;
    }

    /// @dev The oracle's tick is signed relative to token order; pick whichever direction lowers
    /// the reported collateral price.
    function _lowerPriceTick(address pool, int24 tickNow, int24 crashed) internal view returns (int24) {
        return IUniswapV3PoolMinimal(pool).token0() == HIMS ? crashed : tickNow + (tickNow - crashed);
    }
}
