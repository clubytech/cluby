// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2, stdError} from "forge-std/Test.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {MarketParams, Market, Position, Id, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";
import {SharesMath} from "../../src/libraries/SharesMath.sol";
import {MathLib} from "../../src/libraries/MathLib.sol";

/// @dev Same elapsed-sensitive IRM the architecture report used, so its own instrument is turned
/// against its own claim.
contract ElapsedIrm {
    uint256 public immutable base;

    constructor(uint256 _base) {
        base = _base;
    }

    function _rate(Market memory m) internal view returns (uint256) {
        return base + (block.timestamp - uint256(m.lastUpdate));
    }

    function borrowRate(MarketParams memory, Market memory m) external view returns (uint256) {
        return _rate(m);
    }

    function borrowRateView(MarketParams memory, Market memory m) external view returns (uint256) {
        return _rate(m);
    }
}

/// @dev Morpho Blue's own `repay` share arithmetic and its own `_accrueInterest`, transcribed so a
/// claim about what Morpho will do can be checked instead of asserted.
library MorphoReplay {
    using MathLib for uint256;
    using SharesMath for uint256;

    /// Morpho `repay`: `if (assets > 0) shares = assets.toSharesDown(...)`, then
    /// `position.borrowShares -= shares.toUint128()` — an unchecked-free subtraction that reverts.
    function repaySharesBurned(uint256 assets, uint256 totalBorrowAssets, uint256 totalBorrowShares)
        internal
        pure
        returns (uint256)
    {
        return assets.toSharesDown(totalBorrowAssets, totalBorrowShares);
    }

    /// Morpho `_accrueInterest`: the rate is read from the market BEFORE lastUpdate moves, exactly
    /// as Lens does. Returned: the interest Morpho would add.
    function accrueInterest(uint256 rate, uint256 totalBorrowAssets, uint256 elapsed)
        internal
        pure
        returns (uint256)
    {
        return totalBorrowAssets.wMulDown(rate.wTaylorCompounded(elapsed));
    }
}

contract ArchRefutation is Test {
    using MarketParamsLib for MarketParams;
    using MathLib for uint256;

    MockMorpho morpho;
    MockRouter router;
    MockERC20 usdg;
    MockERC20 nvda;
    FlashLiquidator liquidator;
    Lens lens;
    MarketParams params;

    address constant OWNER = address(0xA11CE);
    address constant KEEPER = address(0xCEE9E4);
    address constant BORROWER = address(0xB0B);

    uint256 constant WAD = 1e18;
    uint256 constant ORACLE_SCALE = 1e36;
    uint256 constant PRICE = 231_460_000_000_000_000_000_000_000;

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        // The pool has to agree with the oracle, or every price floor downstream is testing the
        // gap between two mocks rather than the contract.
        router = new MockRouter(231.46e6);
        liquidator = new FlashLiquidator(address(morpho), address(router), OWNER);
        lens = new Lens(address(morpho));

        vm.prank(OWNER);
        liquidator.setKeeper(KEEPER, true);

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(PRICE)),
            irm: address(new MockIrm(0)),
            lltv: 0.625e18
        });

        usdg.mint(address(morpho), 1_000_000e6);
        nvda.mint(address(morpho), 1_000e18);
        usdg.mint(address(router), 1_000_000e6);

        morpho.setMarket(
            params,
            Market({
                totalSupplyAssets: 100_000e6,
                totalSupplyShares: 100_000e6 * 1e6,
                totalBorrowAssets: 40_000e6,
                totalBorrowShares: 40_000e6 * 1e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 0, collateral: 100e18}));
    }

    /* ================================================================== */
    /* R1. Finding 3 is UNREACHABLE — and finding 2 is exactly why        */
    /* ================================================================== */

    function _keeperPlan(uint256 lltv, uint256 seizedValue)
        internal
        pure
        returns (uint256 flashAmount, uint256 minAmountOut, bool skipped)
    {
        uint256 f = (WAD * WAD) / (WAD - ((0.3e18 * (WAD - lltv)) / WAD));
        uint256 lif = f < 1.15e18 ? f : 1.15e18;
        uint256 repaid = (seizedValue * WAD) / lif;
        flashAmount = (repaid * 101) / 100;
        minAmountOut = (seizedValue * 92) / 100;
        skipped = minAmountOut <= flashAmount;
    }

    /// The report calls `received < assets` (FlashLiquidator.sol:120) a defect that "reverts a
    /// profitable liquidation". The only caller is the keeper, and the keeper's guard at
    /// liquidate.ts:100 is *precisely* `minAmountOut <= flashAmount`. So on every market the keeper
    /// does NOT skip, minAmountOut > flashAmount == assets; and the swap itself enforces
    /// `received >= minAmountOut`. Therefore received > assets always, and NoProfit cannot fire.
    ///
    /// Findings 2 and 3 of that report are the same inequality read from opposite sides: they
    /// cannot both bite. Fixing #2 the way the report proposes is what would first make #3
    /// reachable.
    function testFuzz_refute_noProfitBranchIsUnreachableFromTheKeeper(uint256 lltv, uint96 seizedValue) public pure {
        lltv = bound(lltv, 0.30e18, 0.98e18);
        vm.assume(seizedValue > 1e6);

        (uint256 flashAmount, uint256 minAmountOut, bool skipped) = _keeperPlan(lltv, seizedValue);
        if (skipped) return; // the keeper never calls the contract at all

        // Not skipped => the floor the swap must clear already exceeds the flash loan.
        assertGt(minAmountOut, flashAmount, "keeper sized a loan its own floor cannot cover");
        // The swap reverts below minAmountOut, so the worst legal `received` is minAmountOut.
        uint256 worstLegalReceived = minAmountOut;
        assertGe(worstLegalReceived, flashAmount, "NoProfit would be reachable");
    }

    /// End to end, with the pool paying the WORST price the floor permits: the keeper-sized
    /// liquidation the report says is at risk goes through and pays the owner.
    function test_refute_keeperSizedLiquidationNeverHitsNoProfit() public {
        uint256 seized = 10e18;
        uint256 seizedValue = 2314.6e6; // 10 collateral at the oracle's $231.46
        (uint256 flashAmount, uint256 minAmountOut, bool skipped) = _keeperPlan(params.lltv, seizedValue);
        assertFalse(skipped);

        // Pool pays exactly the floor — the least the swap is allowed to return.
        router.set(minAmountOut * 1e18 / seized);

        vm.prank(KEEPER);
        liquidator.liquidate(_p(seized, flashAmount, minAmountOut));
        assertGt(usdg.balanceOf(OWNER), 0, "owner was paid");
    }

    /* ================================================================== */
    /* R2. Finding 4's mechanism is wrong: interest is NOT charged twice  */
    /* ================================================================== */

    /// The report says Lens "charges the elapsed window twice". Morpho's own `_accrueInterest`
    /// reads `borrowRate(marketParams, market)` with `market.lastUpdate` STILL STALE and only then
    /// writes lastUpdate. Lens does the same thing, so the accrued debt — the only number here that
    /// moves money — is bit-identical to Morpho's.
    ///
    /// What was actually wrong was narrower, and is now fixed: `marketView` makes a SECOND
    /// borrowRateView call on the already-accrued struct. While `_accrued` left `lastUpdate` in the
    /// past, that second call was answered for a window that had already been charged, so the
    /// published APY was the trailing average rather than the forward rate. Stamping the timestamp
    /// makes the quote forward-looking without touching the debt, which this test pins from both
    /// sides.
    function test_refute_lensAccruesExactlyWhatMorphoWouldAccrue() public {
        ElapsedIrm eirm = new ElapsedIrm(1e9);
        params.irm = address(eirm);
        uint128 tBorrow = 40_000e6;
        morpho.setMarket(
            params,
            Market({
                totalSupplyAssets: 100_000e6,
                totalSupplyShares: 100_000e6 * 1e6,
                totalBorrowAssets: tBorrow,
                totalBorrowShares: 40_000e6 * 1e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );

        uint256 t0 = block.timestamp;
        vm.warp(t0 + 3 days);

        Lens.MarketView memory v = lens.marketView(params);

        // Morpho, replayed: rate read from the stale-lastUpdate market, then interest.
        Market memory stale = morpho.market(params.id());
        uint256 morphoRate = eirm.borrowRate(params, stale);
        uint256 morphoInterest = MorphoReplay.accrueInterest(morphoRate, tBorrow, 3 days);

        assertEq(
            uint256(v.state.totalBorrowAssets),
            uint256(tBorrow) + morphoInterest,
            "Lens debt differs from Morpho's"
        );
        // Not "twice": exactly once, with the same rate Morpho itself uses. The debt above is the
        // proof of that; it is bit-identical.
        //
        // The quoted rate is a different number on purpose. `_accrued` now stamps `lastUpdate`, so
        // the IRM is asked about a market with no unaccounted seconds in it and answers with the
        // rate from here on — which is what an APY on a screen means. The old behaviour returned
        // `morphoRate`, the average across the window that was just charged.
        Market memory current = v.state;
        assertEq(uint256(current.lastUpdate), block.timestamp, "accrued state still claims to be stale");
        assertEq(v.borrowRatePerSecond, eirm.borrowRate(params, current), "quote is not the forward rate");
        assertLt(v.borrowRatePerSecond, morphoRate, "quote did not move off the trailing average");
    }

    /* ================================================================== */
    /* R3. Finding 6 is real but bounded at ONE WEI, always               */
    /* ================================================================== */

    /// The report says the SDK "shows less debt than Morpho will take". True, and the comment above
    /// it is backwards. But toAssetsUp and toAssetsDown are a ceil and a floor of the same rational:
    /// the gap is 0 or 1 raw unit — 1e-6 USDG — for every input, at any TVL.
    function testFuzz_refute_sdkDebtGapIsAtMostOneWei(uint128 shares, uint128 tAssets, uint128 tShares) public pure {
        uint256 up = SharesMath.toAssetsUp(shares, tAssets, tShares);
        uint256 down = SharesMath.toAssetsDown(shares, tAssets, tShares);
        assertLe(up - down, 1, "the two debt numbers differ by more than one wei");
    }

    /* ================================================================== */
    /* R4. Finding 1 is real, but the reachable set is 1-2 wei, not "dust" */
    /* ================================================================== */

    /// `collateral.wMulDown(lltv)` is zero only while `collateral * lltv < 1e18`, i.e. for
    /// collateral < 1e18/lltv. At the live LLTVs that is one or two RAW units of collateral, not a
    /// range of small positions. Everything above it is fine.
    function test_narrow_lensPanicWindowIsOneOrTwoRawUnits() public pure {
        uint256[4] memory lltvs = [uint256(0.86e18), 0.77e18, 0.625e18, 0.385e18];
        uint256[4] memory expectedLast = [uint256(1), 1, 1, 2]; // largest collateral that still floors to 0
        for (uint256 i; i < 4; ++i) {
            assertEq(uint256(expectedLast[i]).wMulDown(lltvs[i]), 0, "boundary is not zero");
            assertGt((expectedLast[i] + 1).wMulDown(lltvs[i]), 0, "window is wider than claimed");
        }
    }

    /// And it is not a short-market or a decimals bug: 1 raw unit of an 18-decimal stock collateral
    /// panics identically. What the short market changes is only how the state is REACHED — there,
    /// 1 raw unit still carries borrowing power, so the state can be created directly instead of
    /// having to be left behind by a liquidation.
    function test_dustReadsOnLongMarketsToo() public {
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 1e6, collateral: 1}));
        Lens.UserView memory dust = lens.userView(params, BORROWER, 0);
        assertEq(dust.liquidationPrice, type(uint256).max, "one raw unit must read, not panic");

        // Two raw units on this market was always safe, and still reads the ordinary way.
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 1e6, collateral: 2}));
        Lens.UserView memory two = lens.userView(params, BORROWER, 0);
        assertLt(two.liquidationPrice, type(uint256).max, "two units has a real liquidation price");
    }

    /* ================================================================== */
    /* R5. Finding 7's mechanism is INVERTED                              */
    /* ================================================================== */

    /// The report claims `close()` leaves residual shares behind because Morpho's repay rounds
    /// shares DOWN. Morpho rounds the shares BURNED down from the assets paid — and the assets a
    /// borrower owes were rounded UP from their shares. Round-tripping therefore burns MORE shares
    /// than the borrower holds, and `position.borrowShares -= shares` underflows.
    ///
    /// So the docstring at LeverageRouter.sol:55 — "Pass the full debt in assets to close the
    /// position outright" — does not silently leave dust. It REVERTS. The finding's conclusion
    /// (close-by-assets cannot close) stands; its stated mechanism is the opposite of the truth,
    /// and the fix it proposes is right for the wrong reason.
    function test_refute_closeWithFullDebtRevertsRatherThanLeavingDust() public pure {
        uint256 totalBorrowAssets = 40_000e6;
        uint256 totalBorrowShares = 40_000e6 * 1e6;
        uint256 heldShares = 1_234_567_890_123;

        uint256 fullDebtAssets = SharesMath.toAssetsUp(heldShares, totalBorrowAssets, totalBorrowShares);
        uint256 burned = MorphoReplay.repaySharesBurned(fullDebtAssets, totalBorrowAssets, totalBorrowShares);

        console2.log("shares held  ", heldShares);
        console2.log("shares burned", burned);
        assertGt(burned, heldShares, "repaying the full debt would leave a residue, as the report claims");
        // borrowShares -= burned  =>  underflow  =>  revert, not dust.
    }

    function _p(uint256 seized, uint256 flashAmount, uint256 minOut)
        internal
        view
        returns (FlashLiquidator.LiquidateParams memory)
    {
        return FlashLiquidator.LiquidateParams({
            marketParams: params,
            borrower: BORROWER,
            seizedAssets: seized,
            repaidShares: 0,
            swapFee: 500,
            flashAmount: flashAmount,
            minAmountOut: minOut
        });
    }
}
