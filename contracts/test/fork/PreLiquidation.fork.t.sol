// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test, console2} from "forge-std/Test.sol";
import {PreLiquidationFactory} from "../../lib/pre-liquidation/src/PreLiquidationFactory.sol";
import {IPreLiquidation, PreLiquidationParams} from "../../lib/pre-liquidation/src/interfaces/IPreLiquidation.sol";
import {
    Id,
    IMorpho,
    MarketParams,
    Position
} from "../../lib/pre-liquidation/lib/morpho-blue/src/interfaces/IMorpho.sol";
import {IOracle} from "../../lib/pre-liquidation/lib/morpho-blue/src/interfaces/IOracle.sol";

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @notice The soft-liquidation path on the live NVDA market: a borrower who has drifted past the
/// pre-liquidation line, but is not yet liquidatable, gets trimmed at a 2–4% penalty instead of
/// waiting for the full ~12.7% incentive.
contract PreLiquidationForkTest is Test {
    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    Id constant NVDA_MARKET = Id.wrap(0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826);
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    uint256 constant ORACLE_SCALE = 1e36;
    uint256 constant WAD = 1e18;

    PreLiquidationFactory factory;
    IPreLiquidation preLiq;
    MarketParams params;

    address supplier = makeAddr("supplier");
    address borrower = makeAddr("borrower");
    address keeper = makeAddr("keeper");

    function setUp() public {
        vm.skip(bytes(vm.envOr("ROBINHOOD_RPC_URL", string(""))).length == 0);

        params = MORPHO.idToMarketParams(NVDA_MARKET);
        factory = new PreLiquidationFactory(address(MORPHO));

        // preLltv sits five points below the market's 62.5%, and the penalty runs 2% at that line
        // to 4% at the hard one — against Morpho's ~12.7% incentive at the same LLTV.
        preLiq = factory.createPreLiquidation(
            NVDA_MARKET,
            PreLiquidationParams({
                preLltv: 0.575e18,
                preLCF1: 0.2e18,
                preLCF2: 1e18,
                preLIF1: 1.02e18,
                preLIF2: 1.04e18,
                preLiquidationOracle: params.oracle
            })
        );

        deal(USDG, supplier, 50_000e6);
        vm.startPrank(supplier);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, 50_000e6, 0, supplier, "");
        vm.stopPrank();
    }

    /// A position between the pre-liquidation line and the liquidation line is trimmed, not closed,
    /// and the collateral taken is far less than a hard liquidation would take for the same debt.
    function test_softLiquidationCostsFarLessThanTheHardOne() public {
        uint256 collateral = 10e18;
        uint256 price = IOracle(params.oracle).price();
        uint256 collateralValue = (collateral * price) / ORACLE_SCALE;

        // Borrow to 60% LTV: past the 57.5% pre-liquidation line, inside the 62.5% liquidation one.
        uint256 borrowAmount = (collateralValue * 60) / 100;

        deal(NVDA, borrower, collateral);
        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, collateral, borrower, "");
        MORPHO.borrow(params, borrowAmount, 0, borrower, borrower);
        // Opting in is the borrower's own decision, and nothing can happen without it.
        MORPHO.setAuthorization(address(preLiq), true);
        vm.stopPrank();

        Position memory before = MORPHO.position(NVDA_MARKET, borrower);
        assertGt(before.borrowShares, 0);

        // The keeper repays a slice of the debt and takes collateral at the soft penalty.
        uint256 repayShares = before.borrowShares / 10;
        deal(USDG, keeper, borrowAmount);
        vm.startPrank(keeper);
        IERC20(USDG).approve(address(preLiq), type(uint256).max);
        (uint256 seized, uint256 repaid) = preLiq.preLiquidate(borrower, 0, repayShares, "");
        vm.stopPrank();

        Position memory after_ = MORPHO.position(NVDA_MARKET, borrower);
        assertLt(after_.borrowShares, before.borrowShares, "debt should fall");
        assertLt(after_.collateral, before.collateral, "collateral should fall");

        // What the borrower paid for the trim, as a fraction of the debt cleared.
        uint256 seizedValue = (seized * price) / ORACLE_SCALE;
        uint256 penaltyBps = ((seizedValue - repaid) * 10_000) / repaid;
        console2.log("repaid (USDG)      ", repaid);
        console2.log("seized value (USDG)", seizedValue);
        console2.log("penalty (bps)      ", penaltyBps);

        // 2–4% by construction, against roughly 1268 bps for a hard liquidation at this LLTV.
        assertLt(penaltyBps, 450, "soft penalty should stay under 4.5%");
        assertGt(penaltyBps, 150, "and be a real penalty, not zero");
    }

    /// Without the borrower's authorisation, nothing may touch their position.
    function test_refusesWithoutBorrowerAuthorization() public {
        uint256 collateral = 10e18;
        uint256 price = IOracle(params.oracle).price();
        uint256 borrowAmount = (((collateral * price) / ORACLE_SCALE) * 60) / 100;

        deal(NVDA, borrower, collateral);
        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, collateral, borrower, "");
        MORPHO.borrow(params, borrowAmount, 0, borrower, borrower);
        vm.stopPrank();

        // Read the shares BEFORE expectRevert: it applies to the next call, and an argument
        // expression is a call too — pointing it at the wrong one is how a guard test passes
        // vacuously, or fails while the guard works.
        uint256 shares = MORPHO.position(NVDA_MARKET, borrower).borrowShares / 10;

        deal(USDG, keeper, borrowAmount);
        vm.startPrank(keeper);
        IERC20(USDG).approve(address(preLiq), type(uint256).max);
        vm.expectRevert();
        preLiq.preLiquidate(borrower, 0, shares, "");
        vm.stopPrank();
    }

    /// A healthy position below the pre-liquidation line must be untouchable, authorised or not.
    function test_refusesBelowThePreLiquidationLine() public {
        uint256 collateral = 10e18;
        uint256 price = IOracle(params.oracle).price();
        // 40% LTV: comfortably below the 57.5% line.
        uint256 borrowAmount = (((collateral * price) / ORACLE_SCALE) * 40) / 100;

        deal(NVDA, borrower, collateral);
        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, collateral, borrower, "");
        MORPHO.borrow(params, borrowAmount, 0, borrower, borrower);
        MORPHO.setAuthorization(address(preLiq), true);
        vm.stopPrank();

        // Read the shares BEFORE expectRevert: it applies to the next call, and an argument
        // expression is a call too — pointing it at the wrong one is how a guard test passes
        // vacuously, or fails while the guard works.
        uint256 shares = MORPHO.position(NVDA_MARKET, borrower).borrowShares / 10;

        deal(USDG, keeper, borrowAmount);
        vm.startPrank(keeper);
        IERC20(USDG).approve(address(preLiq), type(uint256).max);
        vm.expectRevert();
        preLiq.preLiquidate(borrower, 0, shares, "");
        vm.stopPrank();
    }
}
