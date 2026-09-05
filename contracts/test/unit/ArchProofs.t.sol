// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2, stdError} from "forge-std/Test.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {MarketParams, Market, Position, Id, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm, MockV3Pool} from "../mocks/Mocks.sol";
import {TwapOracle} from "../../src/oracles/TwapOracle.sol";
import {SharesMath} from "../../src/libraries/SharesMath.sol";

/// @dev An IRM whose rate depends on how long the market has been untouched, the way
/// AdaptiveCurveIrm's `borrowRateView` does (it averages over block.timestamp - market.lastUpdate).
contract ElapsedSensitiveIrm {
    uint256 public immutable base;

    constructor(uint256 _base) {
        base = _base;
    }

    function _rate(Market memory m) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - uint256(m.lastUpdate);
        // Average over the window is strictly above the instantaneous (elapsed == 0) rate here.
        return base + elapsed;
    }

    function borrowRate(MarketParams memory, Market memory m) external view returns (uint256) {
        return _rate(m);
    }

    function borrowRateView(MarketParams memory, Market memory m) external view returns (uint256) {
        return _rate(m);
    }
}

contract ArchProofs is Test {
    using MarketParamsLib for MarketParams;

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
    uint256 constant PRICE = 231_460_000_000_000_000_000_000_000; // $231.46, 18->6 decimals

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        // The pool pays what the oracle says a share is worth. A mock pool that disagrees with
        // the mock oracle tests the gap between two fixtures, not the contract between them.
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

    /* ------------------------------------------------------------------ */
    /* 1. FlashLiquidator gates profit on the SIZE OF THE FLASH LOAN       */
    /* ------------------------------------------------------------------ */

    /// Seizing 10 collateral costs 500 USDG of repayment and fetches 1,000 USDG in the pool.
    /// That is a 500 USDG profit no matter how the repayment was funded. Flash-borrowing 1,500
    /// instead of 505 leaves the contract holding 2,000 against a 1,500 obligation — solvent, and
    /// 500 in profit — yet `received < assets` at FlashLiquidator.sol:120 reverts it.
    function test_flashLoanSizeDoesNotDecideWhetherALiquidationIsProfitable() public {
        // Baseline: the same liquidation, correctly sized, pays the owner 500 USDG.
        uint256 snap = vm.snapshotState();
        vm.prank(KEEPER);
        liquidator.liquidate(_p(10e18, 505e6, 920e6));
        assertEq(usdg.balanceOf(OWNER), 1814.6e6, "correctly sized liquidation is profitable");
        vm.revertToState(snap);

        // Same seizure, same pool, same oracle floor, three times the flash loan. It goes through
        // and pays the same profit: what the contract borrowed is not what it had to earn back,
        // and `NoProfit` now says so by comparing against `repaid`.
        vm.prank(KEEPER);
        liquidator.liquidate(_p(10e18, 1500e6, 920e6));
        assertEq(usdg.balanceOf(OWNER), 1814.6e6, "flash size must not change the outcome");
    }

    /* ------------------------------------------------------------------ */
    /* 2. The keeper's own guard turns liquidation OFF on high-LLTV markets */
    /* ------------------------------------------------------------------ */

    /// Replica of apps/keeper/src/liquidate.ts:16-19 and 96-105, exactly.
    function _keeperPlan(uint256 lltv, uint256 seizedValue)
        internal
        pure
        returns (uint256 lif, uint256 flashAmount, uint256 minAmountOut, bool skipped)
    {
        uint256 f = (WAD * WAD) / (WAD - ((0.3e18 * (WAD - lltv)) / WAD));
        lif = f < 1.15e18 ? f : 1.15e18;
        uint256 repaid = (seizedValue * WAD) / lif;
        flashAmount = (repaid * 101) / 100;
        minAmountOut = (seizedValue * 92) / 100;
        skipped = minAmountOut <= flashAmount; // liquidate.ts:100 -> `return`, silently
    }

    /// The keeper skips every liquidation on ETH (77% LLTV) and SGOV (86% LLTV): its 8% swap-floor
    /// allowance is wider than the liquidation bonus those LLTVs earn, so `minAmountOut` never
    /// clears `flashAmount` and `tryLiquidate` returns before it ever simulates. Two live markets,
    /// including the largest cap, have no liquidator at all — and no alert fires either.
    function test_proof_keeperSkipsEveryLiquidationOnHighLltvMarkets() public pure {
        uint256 V = 10_000e6; // $10k of collateral seized

        (uint256 lifSgov,,, bool skipSgov) = _keeperPlan(0.86e18, V);
        (uint256 lifEth,,, bool skipEth) = _keeperPlan(0.77e18, V);
        (uint256 lifStock,,, bool skipStock) = _keeperPlan(0.625e18, V);
        (uint256 lifTail,,, bool skipTail) = _keeperPlan(0.385e18, V);

        console2.log("SGOV  lltv 86.0%  LIF", lifSgov, "skipped", skipSgov);
        console2.log("ETH   lltv 77.0%  LIF", lifEth, "skipped", skipEth);
        console2.log("stock lltv 62.5%  LIF", lifStock, "skipped", skipStock);
        console2.log("tail  lltv 38.5%  LIF", lifTail, "skipped", skipTail);

        assertTrue(skipSgov, "SGOV liquidation would be attempted");
        assertTrue(skipEth, "ETH liquidation would be attempted");
        assertFalse(skipStock, "62.5% markets still work");
        assertFalse(skipTail, "38.5% markets still work");
    }

    /* ------------------------------------------------------------------ */
    /* 3. Lens hands out a Market struct Morpho can never hold             */
    /* ------------------------------------------------------------------ */

    /// `_accrued` (Lens.sol:161-180) applies interest but never advances `lastUpdate`, so the
    /// returned struct claims interest was accrued at a timestamp it was not. `marketView` then
    /// feeds that struct straight back into `borrowRateView`, which charges the elapsed window a
    /// second time: the rate the site quotes is not the rate Morpho would report after accrual.
    function test_accruedStateCarriesItsOwnTimestampAndQuotesTheForwardRate() public {
        ElapsedSensitiveIrm eirm = new ElapsedSensitiveIrm(1e9);
        params.irm = address(eirm);
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

        uint256 t0 = block.timestamp;
        vm.warp(t0 + 3 days);

        Lens.MarketView memory v = lens.marketView(params);

        // Interest was applied, and the clock moved with it, so the struct is one a Morpho storage
        // slot could actually hold.
        assertGt(v.state.totalBorrowAssets, 40_000e6, "no interest applied");
        assertEq(uint256(v.state.lastUpdate), block.timestamp, "accrued state must not stay stale");
        assertGt(uint256(v.state.lastUpdate), t0);

        // Which makes the published rate the forward one — what Morpho itself would report right
        // after accruing, at elapsed == 0 — instead of the average across the window just charged.
        uint256 trueRate = eirm.borrowRateView(params, v.state);
        assertEq(trueRate, 1e9);
        assertEq(v.borrowRatePerSecond, trueRate, "quoted rate must be the forward rate");
    }

    /* ------------------------------------------------------------------ */
    /* 4. previewBorrow returns a struct with stale fields                 */
    /* ------------------------------------------------------------------ */

    /// `previewBorrow` (Lens.sol:107-133) overwrites six of UserView's nine fields and leaves the
    /// rest as the caller's CURRENT position. `safeBorrowAssets` — the number the deposit screen
    /// exists to show — still describes the collateral the user has not deposited yet.
    function test_previewBorrowRecomputesTheSafeCapAgainstThePreviewedCollateral() public {
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 0, collateral: 0}));

        Lens.UserView memory u = lens.previewBorrow(params, BORROWER, 10e18, 0, 0);

        assertEq(u.collateral, 10e18);
        assertGt(u.maxBorrowAssets, 0, "maxBorrow was recomputed");
        // With a zero margin the safe cap IS the max, and with a margin it sits strictly inside it.
        assertEq(u.safeBorrowAssets, u.maxBorrowAssets, "safe cap must track the previewed deposit");

        Lens.UserView memory m = lens.previewBorrow(params, BORROWER, 10e18, 0, 0.05e18);
        assertLt(m.safeBorrowAssets, m.maxBorrowAssets, "the margin must bite");
        assertGt(m.safeBorrowAssets, 0);
    }

    /* ------------------------------------------------------------------ */
    /* 5. packages/sdk debtOf rounds the opposite way to Lens and Morpho   */
    /* ------------------------------------------------------------------ */

    /// Morpho's `_isHealthy` and Lens both use toAssetsUp for debt. `packages/sdk/src/reads.ts:72`
    /// uses toAssetsDown under a comment claiming it rounds "the way Morpho rounds it against the
    /// borrower". It rounds the other way, so every SDK consumer sees less debt than Morpho will.
    function test_proof_sdkDebtOfUndercountsRelativeToLens() public pure {
        uint256 totalBorrowAssets = 40_000e6 + 7;
        uint256 totalBorrowShares = 40_000e6 * 1e6;
        uint256 shares = 1_234_567_890_123;

        uint256 lensDebt = SharesMath.toAssetsUp(shares, totalBorrowAssets, totalBorrowShares);
        uint256 sdkDebt = SharesMath.toAssetsDown(shares, totalBorrowAssets, totalBorrowShares);

        assertEq(lensDebt, sdkDebt + 1, "the two debt numbers in this repo differ");
    }


    /* ------------------------------------------------------------------ */
    /* 6. TwapOracle reverts on ticks Uniswap considers perfectly valid    */
    /* ------------------------------------------------------------------ */

    /// `(sqrtPriceX96 * sqrtPriceX96) >> 64` at TwapOracle.sol:71 overflows uint256 once
    /// sqrtPriceX96 crosses 2**128, i.e. above tick ~443,636 — half of Uniswap's valid range.
    /// Uniswap's own OracleLibrary uses FullMath.mulDiv precisely to avoid this. An oracle that
    /// reverts does not fail safe on Morpho: `liquidate` and `withdrawCollateral` both call
    /// `price()`, so the market freezes with the bad debt inside it.
    function test_twapOraclePricesInsideUniswapsValidTickRange() public {
        MockERC20 a = new MockERC20("A", "A", 6);
        MockERC20 b = new MockERC20("B", "B", 18);
        (address t0, address t1) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));
        MockV3Pool pool = new MockV3Pool(t0, t1);
        TwapOracle oracle = new TwapOracle(address(pool), t1, t0, 1800);

        // Just below the boundary: fine.
        pool.setMeanTick(443_000, 1800);
        oracle.price();

        // Still a legal Uniswap tick (MAX_TICK is 887,272). It used to panic on overflow here;
        // now it prices, because the square goes through mulDiv's 512-bit intermediate.
        pool.setMeanTick(444_000, 1800);
        assertGt(oracle.price(), 0);
    }

    /// The window is only a defence if the pool can physically reach back over it. Uniswap's ring
    /// advances at most once a second, so the oracle refuses to be constructed against a pool whose
    /// ring is shorter than the window it was asked for.
    function test_twapOracleRefusesAPoolWhoseRingCannotHoldItsWindow() public {
        MockERC20 a = new MockERC20("A", "A", 6);
        MockERC20 b = new MockERC20("B", "B", 18);
        (address t0, address t1) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));
        MockV3Pool pool = new MockV3Pool(t0, t1);

        pool.setObservationCardinality(360); // the live HIMS ring when this was written
        vm.expectRevert(abi.encodeWithSelector(TwapOracle.RingTooSmall.selector, uint16(360), uint32(1800)));
        new TwapOracle(address(pool), t1, t0, 1800);

        // Grown to the window — the permissionless call anyone can make — it constructs.
        pool.setObservationCardinality(1800);
        TwapOracle ok = new TwapOracle(address(pool), t1, t0, 1800);
        pool.setMeanTick(100, 1800);
        assertGt(ok.price(), 0);
    }

    /// Uniswap rounds the mean tick DOWN, and Solidity's division truncates toward zero, so a
    /// negative cumulative delta that is not a whole multiple of the window needs a correction.
    /// A fixture whose delta is always a multiple can never exercise it.
    function test_twapOracleRoundsTheMeanTickDownOnANegativeRemainder() public {
        MockERC20 a = new MockERC20("A", "A", 6);
        MockERC20 b = new MockERC20("B", "B", 18);
        (address t0, address t1) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));
        MockV3Pool pool = new MockV3Pool(t0, t1);
        TwapOracle oracle = new TwapOracle(address(pool), t1, t0, 1800);

        // Delta = -100·1800 - 1: the true mean is just below -100, so the reported tick is -101.
        pool.setMeanTickWithRemainder(-100, 1800, -1);
        assertEq(oracle.meanTick(), -101, "a negative remainder must round away from zero");

        // The positive side truncates toward zero, which is already down.
        pool.setMeanTickWithRemainder(100, 1800, 1);
        assertEq(oracle.meanTick(), 100);
    }



    /* ------------------------------------------------------------------ */
    /* 7. Lens PANICS on a legal short-market position — keeper goes blind  */
    /* ------------------------------------------------------------------ */

    /// On a SHORT market the collateral is USDG (6 decimals), not an 18-decimal stock. Lens
    /// divides by `collateral.wMulDown(lltv)` (Lens.sol:104), which floors to ZERO for any
    /// collateral below 1e18/lltv units — on a 6-decimal collateral that is a perfectly ordinary,
    /// borrow-capable position. mulDivUp then computes `d - 1` with d == 0 and panics.
    ///
    /// `userView` is the keeper's only read (apps/keeper/src/liquidate.ts:47-55, inside a
    /// Promise.all with no per-user catch) and `healthFactors` loops it, so ONE such position
    /// makes every health read on that market revert. 1 micro-USDG buys a blind keeper.
    function test_dustCollateralReadsAsNeverLiquidatableInsteadOfPanicking() public {
        MockERC20 usdgCollateral = new MockERC20("USDG", "USDG", 6);
        MockERC20 stockLoan = new MockERC20("NVDA", "NVDA", 18);
        // NVDA-SHORT price: 1e72 / (long price of 1.8e26) — USDG quoted in NVDA, raw 6->18.
        uint256 longPrice = 180_000_000_000_000_000_000_000_000;
        uint256 shortPrice = (uint256(1e36) * 1e36) / longPrice;

        MarketParams memory shortParams = MarketParams({
            loanToken: address(stockLoan),
            collateralToken: address(usdgCollateral),
            oracle: address(new MockOracle(shortPrice)),
            irm: address(new MockIrm(0)),
            lltv: 0.625e18
        });
        morpho.setMarket(
            shortParams,
            Market({
                totalSupplyAssets: 100e18,
                totalSupplyShares: 100e18 * 1e6,
                totalBorrowAssets: 40e18,
                totalBorrowShares: 40e18 * 1e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );

        // 1 micro-USDG of collateral. Morpho is perfectly happy with this: it is worth 5.5e9 raw
        // NVDA, so the borrower can even take debt against it.
        uint256 collateralValue = (1 * shortPrice) / 1e36;
        assertGt(collateralValue, 0, "the position has real borrowing power");

        morpho.setPosition(shortParams, BORROWER, Position({supplyShares: 0, borrowShares: 1e6, collateral: 1}));

        // The read survives. `collateral.wMulDown(lltv)` is still zero — that is arithmetic, not a
        // bug — so the answer is the one the zero-collateral branch already gave: there is no price
        // at which this becomes liquidatable, because the lend side can never take anything for it.
        Lens.UserView memory u = lens.userView(shortParams, BORROWER, 0);
        assertEq(u.liquidationPrice, type(uint256).max, "dust must read as never-liquidatable");
        assertEq(u.collateral, 1);

        // And the batch read survives with it, which is the property that matters: one dust
        // position used to take every other borrower's health down with it.
        address[] memory batch = new address[](2);
        batch[0] = address(0xDEAD);
        batch[1] = BORROWER;
        uint256[] memory hfs = lens.healthFactors(shortParams, batch);
        assertEq(hfs.length, 2);
    }

    /* --- REFUTED HYPOTHESIS, kept as a regression fence ---------------- */

    /// Hypothesis: Lens's `liquidatable` disagrees with Morpho's `_isHealthy` at the boundary, so
    /// the keeper acts on a position Morpho considers healthy (or misses one it does not).
    /// It does not: both compute maxBorrow the same way and the >= / < boundary lines up exactly.
    function testFuzz_lensLiquidatableMatchesMorphoIsHealthy(uint96 collateral, uint96 borrowShares) public {
        vm.assume(borrowShares > 0);
        // Excluded: collateral so small that collateral*lltv floors to 0 makes Lens panic (proof 7).
        vm.assume((uint256(collateral) * params.lltv) / WAD > 0);
        morpho.setPosition(
            params, BORROWER, Position({supplyShares: 0, borrowShares: uint128(borrowShares), collateral: uint128(collateral)})
        );

        Market memory m = morpho.market(params.id());
        // Morpho's _isHealthy, verbatim.
        uint256 borrowed = SharesMath.toAssetsUp(borrowShares, m.totalBorrowAssets, m.totalBorrowShares);
        uint256 maxBorrow = ((uint256(collateral) * PRICE) / ORACLE_SCALE) * params.lltv / WAD;
        bool morphoHealthy = maxBorrow >= borrowed;

        assertEq(lens.userView(params, BORROWER, 0).liquidatable, !morphoHealthy);
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
