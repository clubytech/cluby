// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Market} from "../../src/Market.sol";
import {
    Id, MarketParams, MarketState, RiskParams, Position, Flags, IMarket
} from "../../src/interfaces/IMarket.sol";
import {MockERC20, MockOracle, MockIrm, MockFlashLiquidator} from "../mocks/Mocks.sol";
import {SharesMath} from "../../src/libraries/SharesMath.sol";

contract MarketTest is Test {
    Market market;
    MockERC20 stock; // 18 dec
    MockERC20 usdg; // 6 dec
    MockOracle oracle;
    MockIrm irm;

    address admin = makeAddr("admin");
    address feeRecipient = makeAddr("fee");
    address lender = makeAddr("lender");
    address shorter = makeAddr("shorter");
    address liquidator = makeAddr("liquidator");

    MarketParams params;
    Id id;

    // $200 per share, USDG 6 dec, stock 18 dec: price1e36 = 200e6 * 1e36 / 1e18 = 200e24
    uint256 constant PRICE = 200e24;
    uint256 constant ONE = 1e18;

    function setUp() public {
        stock = new MockERC20("NVDA", "NVDA", 18);
        usdg = new MockERC20("USDG", "USDG", 6);
        oracle = new MockOracle();
        irm = new MockIrm();
        market = new Market(admin, feeRecipient);

        params = MarketParams({stock: address(stock), collateral: address(usdg), oracle: address(oracle), irm: address(irm)});
        oracle.set(address(stock), PRICE);
        vm.prank(admin);
        id = market.createMarket(params, _risk(15_000, 12_000, 500, 1_000_000e18), 1_500);

        stock.mint(lender, 1_000e18);
        usdg.mint(shorter, 1_000_000e6);
        stock.mint(liquidator, 1_000e18);
        vm.prank(lender);
        stock.approve(address(market), type(uint256).max);
        vm.prank(shorter);
        usdg.approve(address(market), type(uint256).max);
        vm.prank(shorter);
        stock.approve(address(market), type(uint256).max);
        vm.prank(liquidator);
        stock.approve(address(market), type(uint256).max);
    }

    function _risk(uint16 im, uint16 lt, uint16 bonus, uint128 cap) internal pure returns (RiskParams memory) {
        return RiskParams({initialMarginBps: im, liqThresholdBps: lt, liqBonusBps: bonus, borrowCap: cap, flags: 0});
    }

    function _supply(uint256 amt) internal returns (uint256) {
        vm.prank(lender);
        return market.supply(id, amt, lender);
    }

    function _openShort(uint256 collateral, uint256 borrowAmt) internal {
        vm.startPrank(shorter);
        market.supplyCollateral(id, collateral, shorter);
        market.borrow(id, borrowAmt, shorter, shorter);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ creation
    function test_createMarket_setsState() public view {
        MarketState memory s = market.state(id);
        assertEq(s.lastUpdate, block.timestamp);
        assertEq(s.feeBps, 1_500);
        assertEq(market.idToParams(id).stock, address(stock));
    }

    function test_createMarket_duplicateReverts() public {
        vm.prank(admin);
        vm.expectRevert(IMarket.MarketExists.selector);
        market.createMarket(params, _risk(15_000, 12_000, 500, 1e18), 0);
    }

    function test_createMarket_invalidRisk() public {
        vm.startPrank(admin);
        MarketParams memory p2 = params;
        p2.irm = address(1);
        vm.expectRevert(IMarket.InvalidRisk.selector);
        market.createMarket(p2, _risk(12_000, 12_000, 500, 1e18), 0); // im <= lt
        vm.expectRevert(IMarket.InvalidRisk.selector);
        market.createMarket(p2, _risk(15_000, 10_400, 500, 1e18), 0); // lt <= 100% + bonus
        vm.stopPrank();
    }

    function test_createMarket_onlyRiskRole() public {
        vm.expectRevert();
        market.createMarket(params, _risk(15_000, 12_000, 500, 1e18), 0);
    }

    // -------------------------------------------------------------- supply
    function test_supply_firstDepositorShares() public {
        uint256 shares = _supply(10e18);
        // virtual shares: shares = assets * (0 + 1e6) / (0 + 1)
        assertEq(shares, 10e18 * SharesMath.VIRTUAL_SHARES);
        assertEq(market.position(id, lender).supplyShares, shares);
        assertEq(stock.balanceOf(address(market)), 10e18);
    }

    function test_withdraw_roundTrip() public {
        uint256 shares = _supply(10e18);
        vm.prank(lender);
        uint256 assets = market.withdraw(id, shares, lender, lender);
        assertEq(assets, 10e18);
        assertEq(stock.balanceOf(lender), 1_000e18);
    }

    function test_withdraw_revertsWhenBorrowed() public {
        uint256 shares = _supply(10e18);
        _openShort(3_000e6, 10e18); // borrow everything
        vm.prank(lender);
        vm.expectRevert(IMarket.InsufficientLiquidity.selector);
        market.withdraw(id, shares, lender, lender);
    }

    function test_withdraw_unauthorized() public {
        uint256 shares = _supply(10e18);
        vm.prank(shorter);
        vm.expectRevert(IMarket.Unauthorized.selector);
        market.withdraw(id, shares, lender, shorter);
    }

    function test_authorization_allowsOperator() public {
        uint256 shares = _supply(10e18);
        vm.prank(lender);
        market.setAuthorization(shorter, true);
        vm.prank(shorter);
        market.withdraw(id, shares, lender, lender);
        assertEq(stock.balanceOf(lender), 1_000e18);
    }

    // -------------------------------------------------------------- borrow
    function test_borrow_requiresInitialMargin() public {
        _supply(100e18);
        // 1 share = $200 debt; 150% margin => need 300 USDG
        vm.startPrank(shorter);
        market.supplyCollateral(id, 299e6, shorter);
        vm.expectRevert(IMarket.InsufficientCollateral.selector);
        market.borrow(id, 1e18, shorter, shorter);
        market.supplyCollateral(id, 1e6, shorter);
        market.borrow(id, 1e18, shorter, shorter);
        vm.stopPrank();
        assertEq(stock.balanceOf(shorter), 1e18);
        assertEq(market.state(id).totalBorrowAssets, 1e18);
    }

    function test_borrow_capEnforced() public {
        _supply(100e18);
        vm.prank(admin);
        market.setRisk(id, _risk(15_000, 12_000, 500, 5e18));
        vm.startPrank(shorter);
        market.supplyCollateral(id, 100_000e6, shorter);
        vm.expectRevert(IMarket.BorrowCapExceeded.selector);
        market.borrow(id, 6e18, shorter, shorter);
        market.borrow(id, 5e18, shorter, shorter);
        vm.stopPrank();
    }

    function test_borrow_liquidityEnforced() public {
        _supply(1e18);
        vm.startPrank(shorter);
        market.supplyCollateral(id, 100_000e6, shorter);
        vm.expectRevert(IMarket.InsufficientLiquidity.selector);
        market.borrow(id, 2e18, shorter, shorter);
        vm.stopPrank();
    }

    function test_borrow_flagPaused() public {
        _supply(10e18);
        vm.prank(admin);
        market.setFlags(id, Flags.BORROW_PAUSED);
        vm.startPrank(shorter);
        market.supplyCollateral(id, 1_000e6, shorter);
        vm.expectRevert(abi.encodeWithSelector(IMarket.FlagPaused.selector, Flags.BORROW_PAUSED));
        market.borrow(id, 1e18, shorter, shorter);
        vm.stopPrank();
    }

    function test_withdrawCollateral_keepsMargin() public {
        _supply(10e18);
        _openShort(400e6, 1e18); // 200% collateralized
        vm.startPrank(shorter);
        vm.expectRevert(IMarket.InsufficientCollateral.selector);
        market.withdrawCollateral(id, 101e6, shorter, shorter); // would leave 299 < 300
        market.withdrawCollateral(id, 100e6, shorter, shorter);
        vm.stopPrank();
        assertEq(market.position(id, shorter).collateral, 300e6);
    }

    // --------------------------------------------------------------- repay
    function test_repay_full_clearsDebt() public {
        _supply(10e18);
        _openShort(400e6, 1e18);
        Position memory p = market.position(id, shorter);
        vm.prank(shorter);
        uint256 assets = market.repay(id, p.borrowShares, shorter);
        assertEq(assets, 1e18);
        assertEq(market.position(id, shorter).borrowShares, 0);
        assertEq(market.state(id).totalBorrowAssets, 0);
        // collateral can now be fully withdrawn
        vm.prank(shorter);
        market.withdrawCollateral(id, 400e6, shorter, shorter);
    }

    function test_repay_allowedWhenPaused() public {
        _supply(10e18);
        _openShort(400e6, 1e18);
        vm.prank(admin);
        market.pause();
        Position memory p = market.position(id, shorter);
        vm.prank(shorter);
        market.repay(id, p.borrowShares, shorter);
        vm.prank(shorter);
        vm.expectRevert();
        market.borrow(id, 1e18, shorter, shorter);
    }

    // ------------------------------------------------------------- accrual
    function test_accrual_interestAndFee() public {
        _supply(100e18);
        _openShort(100_000e6, 50e18); // 50% utilization
        // 10% APR as per-second WAD
        uint256 rate = uint256(0.1e18) / 365 days;
        irm.set(rate);
        vm.warp(block.timestamp + 365 days);
        market.accrueInterest(id);

        MarketState memory s = market.state(id);
        // Taylor(0.1) = 0.1 + 0.005 + 0.000166.. ~= 0.105166
        uint256 expectedInterest = 50e18 * (rate * 365 days) / 1e18;
        expectedInterest += 50e18 * ((rate * 365 days) * (rate * 365 days) / 2e18) / 1e18;
        // allow 0.1% tolerance for the third term and per-second truncation
        assertApproxEqRel(s.totalBorrowAssets, 50e18 + expectedInterest, 1e15);
        assertEq(s.totalSupplyAssets, 100e18 + (s.totalBorrowAssets - 50e18));

        // fee recipient holds shares worth ~15% of the interest
        uint256 interest = s.totalBorrowAssets - 50e18;
        uint256 feeShares = market.position(id, feeRecipient).supplyShares;
        uint256 feeAssets = feeShares * (s.totalSupplyAssets + 1) / (s.totalSupplyShares + 1e6);
        assertApproxEqRel(feeAssets, interest * 15 / 100, 1e14);
        // lender's share is the rest
        uint256 lenderAssets = uint256(market.position(id, lender).supplyShares) * (s.totalSupplyAssets + 1)
            / (s.totalSupplyShares + 1e6);
        assertApproxEqRel(lenderAssets, 100e18 + interest * 85 / 100, 1e14);
    }

    function test_accrual_noBorrowNoInterest() public {
        _supply(100e18);
        irm.set(1e18);
        vm.warp(block.timestamp + 30 days);
        market.accrueInterest(id);
        assertEq(market.state(id).totalSupplyAssets, 100e18);
    }

    // ---------------------------------------------------------- liquidation
    function test_liquidate_healthyReverts() public {
        _supply(10e18);
        _openShort(400e6, 1e18);
        vm.prank(liquidator);
        vm.expectRevert(IMarket.HealthyPosition.selector);
        market.liquidate(id, shorter, 1, 0, "");
    }

    function test_liquidate_full_withBonus() public {
        _supply(10e18);
        _openShort(300e6, 1e18); // exactly 150%
        // stock goes to $260: 300/260 = 115% < 120% threshold
        oracle.set(address(stock), 260e24);
        Position memory p = market.position(id, shorter);
        uint256 before = stock.balanceOf(liquidator);
        vm.prank(liquidator);
        (uint256 seized, uint256 repaid) = market.liquidate(id, shorter, p.borrowShares, 0, "");
        assertEq(repaid, 1e18);
        assertEq(seized, 260e6 * 105 / 100); // 273 USDG
        assertEq(usdg.balanceOf(liquidator), seized);
        assertEq(before - stock.balanceOf(liquidator), 1e18);
        Position memory after_ = market.position(id, shorter);
        assertEq(after_.borrowShares, 0);
        assertEq(after_.collateral, 300e6 - seized);
        assertEq(market.state(id).totalBorrowAssets, 0);
    }

    function test_liquidate_partial() public {
        _supply(10e18);
        _openShort(300e6, 1e18);
        oracle.set(address(stock), 260e24);
        Position memory p = market.position(id, shorter);
        vm.prank(liquidator);
        (uint256 seized, uint256 repaid) = market.liquidate(id, shorter, p.borrowShares / 2, 0, "");
        assertEq(repaid, 0.5e18);
        assertEq(seized, 130e6 * 105 / 100);
        assertEq(market.position(id, shorter).borrowShares, p.borrowShares - p.borrowShares / 2);
    }

    function test_liquidate_badDebtSocialized() public {
        _supply(10e18);
        _openShort(300e6, 1e18);
        // stock doubles to $400: collateral 300 < debt 400. Liquidator can only get 300 USDG
        oracle.set(address(stock), 400e24);
        Position memory p = market.position(id, shorter);
        uint256 supplyBefore = market.state(id).totalSupplyAssets;
        vm.prank(liquidator);
        (uint256 seized, uint256 repaid) = market.liquidate(id, shorter, p.borrowShares, 0, "");
        assertEq(seized, 300e6);
        // repaid = 300 / 1.05 / 400 shares = 0.714285.. stock
        assertApproxEqAbs(repaid, uint256(300e18) * 100 / 105 / 400, 1e6);
        Position memory after_ = market.position(id, shorter);
        assertEq(after_.borrowShares, 0);
        assertEq(after_.collateral, 0);
        MarketState memory s = market.state(id);
        assertEq(s.totalBorrowAssets, 0);
        assertEq(s.totalBorrowShares, 0);
        // lenders lost the unrepaid part
        assertEq(s.totalSupplyAssets, supplyBefore - (1e18 - repaid));
        // solvency: stock held == supply - borrow
        assertEq(stock.balanceOf(address(market)), s.totalSupplyAssets);
    }

    function test_liquidate_slippageGuard() public {
        _supply(10e18);
        _openShort(300e6, 1e18);
        oracle.set(address(stock), 260e24);
        Position memory p = market.position(id, shorter);
        vm.prank(liquidator);
        vm.expectRevert(IMarket.SlippageExceeded.selector);
        market.liquidate(id, shorter, p.borrowShares, 1_000e6, "");
    }

    function test_liquidate_flashCallback() public {
        _supply(10e18);
        _openShort(300e6, 1e18);
        oracle.set(address(stock), 260e24);
        // liquidator contract holds no stock; sources it in the callback from `liquidator` EOA
        MockFlashLiquidator fl = new MockFlashLiquidator(address(market), address(stock), liquidator);
        vm.prank(liquidator);
        stock.approve(address(fl), type(uint256).max);
        Position memory p = market.position(id, shorter);
        (uint256 seized,) = fl.market() == address(market)
            ? _callLiquidate(fl, p.borrowShares)
            : (uint256(0), uint256(0));
        assertEq(usdg.balanceOf(address(fl)), seized);
        assertEq(market.position(id, shorter).borrowShares, 0);
    }

    function _callLiquidate(MockFlashLiquidator fl, uint256 shares) internal returns (uint256, uint256) {
        vm.prank(address(fl));
        return market.liquidate(id, shorter, shares, 0, hex"01");
    }

    function test_liquidate_flagPaused() public {
        _supply(10e18);
        _openShort(300e6, 1e18);
        oracle.set(address(stock), 260e24);
        vm.prank(admin);
        market.setFlags(id, Flags.LIQ_PAUSED);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(IMarket.FlagPaused.selector, Flags.LIQ_PAUSED));
        market.liquidate(id, shorter, 1, 0, "");
    }

    // ----------------------------------------------------------- admin caps
    function test_setBorrowCap_bounded() public {
        _supply(100e18);
        vm.startPrank(admin);
        market.setBorrowCap(id, 90e18); // == 90% of supply, ok
        vm.expectRevert(IMarket.CapAboveMax.selector);
        market.setBorrowCap(id, 1_000_001e18); // above max and above current
        market.setBorrowCap(id, 10e18); // lowering always ok
        vm.stopPrank();
        assertEq(market.risk(id).borrowCap, 10e18);
    }

    function test_oracleDown_blocksBorrowNotRepay() public {
        _supply(10e18);
        _openShort(400e6, 1e18);
        oracle.setRevert(true);
        vm.startPrank(shorter);
        vm.expectRevert("oracle down");
        market.borrow(id, 0.1e18, shorter, shorter);
        Position memory p = market.position(id, shorter);
        market.repay(id, p.borrowShares, shorter); // works without a price
        vm.stopPrank();
    }
}
