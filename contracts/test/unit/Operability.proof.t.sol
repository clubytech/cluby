// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {IOracle, Id, MarketParams, Market, Position, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";

/// @dev An oracle that has stopped answering. Exactly what a Chainlink aggregator behind MinOracle
/// looks like when its feed is retired, or what TwapOracle looks like when the pool cannot serve
/// the window: `price()` reverts instead of returning a number.
contract DeadOracle is IOracle {
    error FeedDown();

    function price() external pure returns (uint256) {
        revert FeedDown();
    }
}

contract OperabilityProofTest is Test {
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

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        router = new MockRouter(100e6);

        liquidator = new FlashLiquidator(address(morpho), address(router), OWNER);
        lens = new Lens(address(morpho));
        vm.prank(OWNER);
        liquidator.setKeeper(KEEPER, true);

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(100e24)),
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

    // ---------------------------------------------------------------------------------------
    // Claim 1: FlashLiquidator.sol:116 compares the swap output against the FLASH LOAN SIZE, not
    // against what Morpho actually pulled. Over-size the flash loan — which is the keeper's own
    // safety habit — and a liquidation that ends the transaction solvent AND in profit reverts,
    // with a NoProfit() that blames the swap for the keeper's sizing.
    // ---------------------------------------------------------------------------------------
    function test_solventProfitableLiquidationIsNotRejectedByItsOwnFlashMargin() public {
        // Morpho will pull 500 USDG for 10 collateral (mock default 50e6 per unit), and the pool
        // pays the oracle's 100 per unit, so the sale returns 1,000. Honest market, real profit.
        //
        // The keeper borrows 1,500 rather than 505 — the wider margin anyone would reach for after
        // one liquidation reverted for want of balance. Where the money stands at the check:
        //   held = flashAmount - repaid + received = 1500 - 500 + 1000 = 2000
        //   owed = 1500
        // Solvent by 500. The old gate compared `received` against the size of the LOAN and
        // reverted anyway; the fixed one compares it against what Morpho actually took.
        vm.prank(KEEPER);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 1500e6,
                minAmountOut: 550e6
            })
        );
        assertEq(usdg.balanceOf(OWNER), 500e6, "an oversized flash loan must not reject the profit");
        assertEq(usdg.balanceOf(address(liquidator)), 0);
    }

    // ---------------------------------------------------------------------------------------
    // Claim 2: one dead oracle takes down every Lens batch read it appears in. `healthFactors` and
    // `marketViews` have no per-entry guard, so the keeper's hot path returns nothing at all —
    // not "this market is unreadable", nothing — the moment a single market's oracle stops
    // answering. Sixteen healthy markets go unwatched because of the seventeenth.
    // ---------------------------------------------------------------------------------------
    function test_proof_oneDeadOracleBlindsTheWholeLensBatch() public {
        _setPosition(10e18, 1_000e6);

        // Healthy today.
        address[] memory users = new address[](1);
        users[0] = BORROWER;
        uint256[] memory before = lens.healthFactors(params, users);
        assertGt(before[0], 0);

        MarketParams memory dead = params;
        dead.oracle = address(new DeadOracle());
        morpho.setMarket(
            dead,
            Market({
                totalSupplyAssets: 1_000e6,
                totalSupplyShares: 1_000e6,
                totalBorrowAssets: 0,
                totalBorrowShares: 0,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );

        // A batch of two markets, one of them fine. Nothing comes back.
        MarketParams[] memory batch = new MarketParams[](2);
        batch[0] = params;
        batch[1] = dead;
        vm.expectRevert(DeadOracle.FeedDown.selector);
        lens.marketViews(batch);

        // Same for the keeper's per-user path on that market: no partial answer, just a revert.
        vm.expectRevert(DeadOracle.FeedDown.selector);
        lens.healthFactors(dead, users);
    }

    function _setPosition(uint256 collateral, uint256 borrowAssets) internal {
        Market memory m = morpho.market(params.id());
        uint256 shares = borrowAssets == 0
            ? 0
            : (borrowAssets * uint256(m.totalBorrowShares)) / uint256(m.totalBorrowAssets);
        morpho.setPosition(
            params,
            BORROWER,
            Position({supplyShares: 0, borrowShares: uint128(shares), collateral: uint128(collateral)})
        );
    }
}
