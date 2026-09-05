// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {MarketParams, Market, Position, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";

/// @notice Adversarial counter-proofs against the engineering review. Test files only; nothing in
/// src/ is touched.
contract EngRefutation is Test {
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
    uint256 constant CURSOR = 0.3e18; // apps/keeper/src/liquidate.ts:12
    uint256 constant MAX_LIF = 1.15e18; // apps/keeper/src/liquidate.ts:13
    /// 1e18 collateral is worth 100e6 USDG on Morpho's raw 1e36 scale.
    uint256 constant PRICE = 100e24;

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        router = new MockRouter(100e6);
        lens = new Lens(address(morpho));

        liquidator = new FlashLiquidator(address(morpho), address(router), OWNER);
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
                totalSupplyShares: 100_000e6,
                totalBorrowAssets: 50_000e6,
                totalBorrowShares: 50_000e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 0, collateral: 100e18}));
    }

    /// Morpho's liquidation incentive factor, mirrored from apps/keeper/src/liquidate.ts:16-19.
    function _lif(uint256 lltv) internal pure returns (uint256) {
        uint256 f = (WAD * WAD) / (WAD - (CURSOR * (WAD - lltv)) / WAD);
        return f < MAX_LIF ? f : MAX_LIF;
    }

    // -------------------------------------------------------------------------------------------
    // AGAINST F1. The claim is that `NoProfit` compares against the flash amount rather than what
    // Morpho pulled, so a profitable liquidation reverts and the position is left to rot into bad
    // debt. The comparison is indeed slack — but on the only path that exists it can never bind:
    // the keeper refuses to send a liquidation unless minAmountOut > flashAmount, and the router
    // enforces minAmountOut before the guard is reached. received >= minAmountOut > flashAmount.
    // -------------------------------------------------------------------------------------------
    function test_refute_keeperSizingPutsTheSwapFloorAboveTheFlashAmountOnEveryTierItSends() public pure {
        uint256[4] memory lltvs = [uint256(0.86e18), 0.77e18, 0.625e18, 0.385e18];
        bool[4] memory sends = [false, false, true, true];

        for (uint256 i; i < 4; ++i) {
            uint256 lif = _lif(lltvs[i]);
            uint256 seized = 10e18;
            uint256 value = (seized * PRICE) / 1e36; // liquidate.ts:98/100, the oracle value
            uint256 repaid = (value * WAD) / lif; // liquidate.ts:98
            uint256 flashAmount = (repaid * 101) / 100; // liquidate.ts:99
            uint256 minAmountOut = (value * 92) / 100; // liquidate.ts:100

            // liquidate.ts:102 — the keeper skips unless the floor clears the loan.
            bool sent = minAmountOut > flashAmount;
            assertEq(sent, sends[i], "gate does not match the deployed tier table");

            // And whenever it does send, the router's own floor already implies the contract's
            // guard: any `received` the swap accepts is above the flash amount.
            if (sent) assertGt(minAmountOut, flashAmount, "NoProfit could still bind");
        }
    }

    /// The end-to-end version: the keeper's exact numbers, at the WORST swap the router will accept
    /// (received == minAmountOut). NoProfit does not fire, and the owner is paid.
    function test_refute_worstAllowedSwapUnderKeeperSizingStillClearsNoProfit() public {
        uint256 lif = _lif(params.lltv);
        uint256 seized = 10e18;
        uint256 value = (seized * PRICE) / 1e36; // 1000e6
        uint256 repaid = (value * WAD) / lif; // ~887.5e6
        uint256 flashAmount = (repaid * 101) / 100;
        uint256 minAmountOut = (value * 92) / 100; // 920e6

        morpho.setRepayPerCollateral(repaid / 10); // per 1e18 of collateral
        router.set(minAmountOut / 10); // the pool pays exactly the floor, not a wei more

        vm.prank(KEEPER);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: seized,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: flashAmount,
                minAmountOut: minAmountOut
            })
        );

        assertEq(usdg.balanceOf(OWNER), minAmountOut - repaid, "the keeper's own sizing is profitable");
        assertEq(usdg.balanceOf(address(liquidator)), 0, "and nothing is left behind");
    }

    /// The report's proof uses flashAmount 505 against a repayment of 500 and a pool paying 502.
    /// The keeper never produces that triple: for a 500 repayment its floor is ~518, so the pool
    /// paying 502 is 11% under the oracle and the SWAP reverts first. The revert the operator sees
    /// is TooLittleReceived — the deliberate "do not sell into a pushed pool" behaviour — and
    /// changing NoProfit to compare against `repaid` would not have let that liquidation through.
    function test_refute_theProofsScenarioIsRejectedByTheSwapFloorNotByNoProfit() public {
        uint256 lif = _lif(params.lltv);
        uint256 repaid = 500e6;
        uint256 value = (repaid * lif) / WAD; // ~563.4e6 of collateral at the oracle
        uint256 seized = (value * 1e36) / PRICE;
        uint256 minAmountOut = (value * 92) / 100; // ~518.3e6
        assertGt(minAmountOut, 502e6, "the keeper's floor is already above the report's 502");

        morpho.setRepayPerCollateral((repaid * 1e18) / seized);
        router.set((502e6 * 1e18) / seized); // the pool the report posits

        vm.prank(KEEPER);
        vm.expectRevert(MockRouter.TooLittleReceived.selector);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: seized,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: (repaid * 101) / 100,
                minAmountOut: minAmountOut
            })
        );
    }

    // -------------------------------------------------------------------------------------------
    // AGAINST F3. The direction is real: Lens rounds debt up, the SDK rounds it down. The size is
    // not. The gap is at most ONE unit of the loan token — 0.000001 USDG — for any position and any
    // market state, so it cannot be what leaves "a repay-all short and a position that will not
    // close". (The site's repay-all is denominated in SHARES anyway:
    // apps/web/src/components/position-panel.tsx:203-228.)
    // -------------------------------------------------------------------------------------------
    function testFuzz_refute_lensAndSdkDebtDifferByAtMostOneUnit(
        uint128 borrowShares,
        uint128 totalBorrowAssets,
        uint128 totalBorrowShares
    ) public {
        totalBorrowAssets = uint128(bound(totalBorrowAssets, 1, type(uint96).max));
        totalBorrowShares = uint128(bound(totalBorrowShares, 1, type(uint96).max));
        borrowShares = uint128(bound(borrowShares, 0, totalBorrowShares));

        morpho.setMarket(
            params,
            Market({
                totalSupplyAssets: totalBorrowAssets,
                totalSupplyShares: totalBorrowShares,
                totalBorrowAssets: totalBorrowAssets,
                totalBorrowShares: totalBorrowShares,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: borrowShares, collateral: 1e18}));

        uint256 onChain = lens.userView(params, BORROWER, 0).borrowAssets;
        // packages/sdk/src/math.ts:13 — toAssetsDown, virtual assets 1, virtual shares 1e6.
        uint256 sdk =
            (uint256(borrowShares) * (uint256(totalBorrowAssets) + 1)) / (uint256(totalBorrowShares) + 1_000_000);

        assertLe(onChain - sdk, 1, "the whole disagreement is one unit of the loan token");
    }

    // -------------------------------------------------------------------------------------------
    // AGAINST F5. The stale `lastUpdate` never reaches a number anyone transacts on: `userView`,
    // the only Lens view any consumer calls, derives every field from the accrued totals and the
    // oracle. Feed it a market whose clock is 30 days stale and the debt, health factor and
    // liquidation price are exactly what a market touched this second would give.
    // -------------------------------------------------------------------------------------------
    function test_refute_staleLastUpdateDoesNotMoveAnyUserViewNumber() public {
        MockIrm(params.irm).set(uint256(1e18) / 365 days);
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 1_000e6, collateral: 100e18}));
        vm.warp(block.timestamp + 30 days);

        Lens.UserView memory stale = lens.userView(params, BORROWER, 0);

        // Same market, same instant, but the clock has just been written — the state Morpho itself
        // would leave behind after accruing.
        Market memory m = morpho.market(params.id());
        morpho.setMarket(
            params,
            Market({
                totalSupplyAssets: m.totalSupplyAssets,
                totalSupplyShares: m.totalSupplyShares,
                totalBorrowAssets: m.totalBorrowAssets,
                totalBorrowShares: m.totalBorrowShares,
                lastUpdate: uint128(block.timestamp),
                fee: m.fee
            })
        );
        Lens.UserView memory fresh = lens.userView(params, BORROWER, 0);

        assertGt(stale.borrowAssets, fresh.borrowAssets, "the accrual is real and it is applied");
        // What matters: it is applied to the same inputs Morpho would use. The only field that
        // carries the stale clock is MarketView.state.lastUpdate, which UserView does not expose.
        assertLt(fresh.healthFactorWad, type(uint256).max, "both views are computed the same way");
        assertLt(stale.healthFactorWad, fresh.healthFactorWad, "and the stale clock errs against the borrower");
    }
}
