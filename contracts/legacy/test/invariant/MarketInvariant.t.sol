// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Market} from "../../src/Market.sol";
import {Id, MarketParams, MarketState, RiskParams, Position} from "../../src/interfaces/IMarket.sol";
import {MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";

contract Handler is Test {
    Market public market;
    Id public id;
    MockERC20 public stock;
    MockERC20 public usdg;
    MockOracle public oracle;

    address[] public actors;
    address public feeRecipient;

    uint256 public constant BASE_PRICE = 200e24;

    constructor(Market m, Id id_, MockERC20 s, MockERC20 u, MockOracle o, address fee) {
        market = m;
        id = id_;
        stock = s;
        usdg = u;
        oracle = o;
        feeRecipient = fee;
        for (uint256 i = 0; i < 4; i++) {
            address a = address(uint160(0x1000 + i));
            actors.push(a);
            stock.mint(a, 1_000_000e18);
            usdg.mint(a, 1_000_000_000e6);
            vm.startPrank(a);
            stock.approve(address(market), type(uint256).max);
            usdg.approve(address(market), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function supply(uint256 seed, uint256 amt) external {
        amt = bound(amt, 1, 10_000e18);
        vm.prank(_actor(seed));
        market.supply(id, amt, _actor(seed));
    }

    function withdraw(uint256 seed, uint256 shares) external {
        address a = _actor(seed);
        uint256 have = market.position(id, a).supplyShares;
        if (have == 0) return;
        shares = bound(shares, 1, have);
        vm.prank(a);
        try market.withdraw(id, shares, a, a) {} catch {}
    }

    function supplyCollateral(uint256 seed, uint256 amt) external {
        amt = bound(amt, 1, 10_000_000e6);
        vm.prank(_actor(seed));
        market.supplyCollateral(id, amt, _actor(seed));
    }

    function withdrawCollateral(uint256 seed, uint256 amt) external {
        address a = _actor(seed);
        uint256 have = market.position(id, a).collateral;
        if (have == 0) return;
        amt = bound(amt, 1, have);
        vm.prank(a);
        try market.withdrawCollateral(id, amt, a, a) {} catch {}
    }

    function borrow(uint256 seed, uint256 amt) external {
        amt = bound(amt, 1, 1_000e18);
        address a = _actor(seed);
        vm.prank(a);
        try market.borrow(id, amt, a, a) {} catch {}
    }

    function repay(uint256 seed, uint256 shares) external {
        address a = _actor(seed);
        uint256 have = market.position(id, a).borrowShares;
        if (have == 0) return;
        shares = bound(shares, 1, have);
        vm.prank(a);
        try market.repay(id, shares, a) {} catch {}
    }

    function liquidate(uint256 seed, uint256 victimSeed, uint256 shares) external {
        address victim = _actor(victimSeed);
        uint256 have = market.position(id, victim).borrowShares;
        if (have == 0) return;
        shares = bound(shares, 1, have);
        address a = _actor(seed);
        vm.prank(a);
        try market.liquidate(id, victim, shares, 0, "") {} catch {}
    }

    function warp(uint256 dt) external {
        dt = bound(dt, 1, 30 days);
        vm.warp(block.timestamp + dt);
        market.accrueInterest(id);
    }

    function movePrice(uint256 bps) external {
        // 50% .. 300% of base
        bps = bound(bps, 5_000, 30_000);
        oracle.set(address(stock), BASE_PRICE * bps / 10_000);
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }
}

contract MarketInvariantTest is Test {
    Market market;
    Handler handler;
    MockERC20 stock;
    MockERC20 usdg;
    MockOracle oracle;
    MockIrm irm;
    Id id;
    address feeRecipient = makeAddr("fee");

    function setUp() public {
        stock = new MockERC20("NVDA", "NVDA", 18);
        usdg = new MockERC20("USDG", "USDG", 6);
        oracle = new MockOracle();
        irm = new MockIrm();
        irm.set(uint256(0.5e18) / 365 days); // 50% APR
        market = new Market(address(this), feeRecipient);
        MarketParams memory p =
            MarketParams({stock: address(stock), collateral: address(usdg), oracle: address(oracle), irm: address(irm)});
        oracle.set(address(stock), 200e24);
        id = market.createMarket(
            p,
            RiskParams({initialMarginBps: 15_000, liqThresholdBps: 12_000, liqBonusBps: 500, borrowCap: type(uint128).max, flags: 0}),
            1_500
        );
        handler = new Handler(market, id, stock, usdg, oracle, feeRecipient);
        targetContract(address(handler));
    }

    function invariant_stockBalanceCoversSupplyMinusBorrow() public view {
        MarketState memory s = market.state(id);
        assertGe(stock.balanceOf(address(market)), uint256(s.totalSupplyAssets) - s.totalBorrowAssets);
    }

    function invariant_borrowLeSupply() public view {
        MarketState memory s = market.state(id);
        assertLe(s.totalBorrowAssets, s.totalSupplyAssets);
    }

    function invariant_usdgBalanceEqualsCollateral() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            sum += market.position(id, handler.actors(i)).collateral;
        }
        assertEq(usdg.balanceOf(address(market)), sum);
    }

    function invariant_sharesSumToTotals() public view {
        uint256 supplyShares = market.position(id, feeRecipient).supplyShares;
        uint256 borrowShares;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            Position memory p = market.position(id, handler.actors(i));
            supplyShares += p.supplyShares;
            borrowShares += p.borrowShares;
        }
        MarketState memory s = market.state(id);
        assertEq(supplyShares, s.totalSupplyShares);
        assertEq(borrowShares, s.totalBorrowShares);
    }

    function invariant_noBorrowSharesWithoutAssets() public view {
        MarketState memory s = market.state(id);
        if (s.totalBorrowShares == 0) assertEq(s.totalBorrowAssets, 0);
    }
}
