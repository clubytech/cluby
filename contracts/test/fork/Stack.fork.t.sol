// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ForkBase} from "./ForkBase.sol";
import {StockOracle} from "../../src/StockOracle.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {Position, MarketState} from "../../src/interfaces/IMarket.sol";
import {Addresses as A} from "../../src/Addresses.sol";
import {console2} from "forge-std/Test.sol";

contract StackForkTest is ForkBase {
    function test_oracle_feedAndTwapAgree() public view {
        StockOracle.Quote memory q = oracle.quote(A.NVDA);
        console2.log("feed  1e36", q.feedPrice);
        console2.log("twap  1e36", q.twapPrice);
        console2.log("spot  1e36", _spotPrice());
        console2.log("feedFresh", q.feedFresh, "feedValid", q.feedValid);
        assertTrue(q.feedValid, "feed valid");
        assertTrue(q.twapValid, "twap valid");
        // both should be within 10% of each other on a normal day
        assertApproxEqRel(q.twapPrice, q.feedPrice, 0.1e18);
        assertEq(oracle.price(A.NVDA), q.feedPrice > q.twapPrice ? q.feedPrice : q.twapPrice);
    }

    function test_lendShortRepay_roundTrip() public {
        vm.prank(lender);
        market.supply(id, 50e18, lender);

        uint256 price = oracle.price(A.NVDA);
        uint256 usdBefore = usdg.balanceOf(shorter);

        // short 1 NVDA with 2x collateral, proceeds to wallet.
        // price is USDG-wei per stock-wei * 1e36, so USDG-wei per whole share = price / 1e18
        uint256 sharePrice = price / 1e18;
        uint256 collateral = sharePrice * 2;
        vm.prank(shorter);
        uint256 proceeds = router.openShort(id, collateral, 1e18, FEE, 0, false);
        assertGt(proceeds, sharePrice * 95 / 100, "sold near oracle price");

        Lens.UserView memory u = lens.userView(id, shorter);
        assertEq(u.pos.collateral, collateral);
        assertApproxEqAbs(u.borrowAssets, 1e18, 1);
        assertGt(u.healthFactorWad, 1e18);

        // a day passes, interest accrues
        vm.warp(block.timestamp + 1 days);
        Lens.MarketView memory m = lens.marketView(id);
        assertGt(m.state.totalBorrowAssets, 1e18);

        // close: buy back and repay, withdraw all collateral
        Position memory p = market.position(id, shorter);
        vm.prank(shorter);
        (uint256 repaid, uint256 spent) = router.closeShort(id, p.borrowShares, FEE, 400e6, 0);
        assertGt(repaid, 1e18);
        assertLt(spent, 400e6);
        assertEq(market.position(id, shorter).borrowShares, 0);
        vm.prank(shorter);
        market.withdrawCollateral(id, collateral, shorter, shorter);

        // net cost is roughly swap fees + interest: shorter is out less than 2% of notional
        uint256 usdAfter = usdg.balanceOf(shorter);
        assertLt(usdBefore - usdAfter, sharePrice * 2 / 100 + 1e6);
    }

    function test_weekendPump_twapDrivesLiquidation() public {
        vm.prank(lender);
        market.supply(id, 50e18, lender);

        uint256 price = oracle.price(A.NVDA);
        uint256 collateral = (price / 1e18) * 16 / 10; // 160% collateral for 1 share
        vm.prank(shorter);
        router.openShort(id, collateral, 1e18, FEE, 0, false);
        assertTrue(market.isHealthy(id, shorter));

        // It's the weekend: feed goes stale, a memecoin pumps the pool by ~40%
        uint256 feedUpdated = oracle.quote(A.NVDA).feedUpdatedAt;
        uint256 spotBefore = _spotPrice();
        uint256 pumped;
        uint256 usdgIn = 1_000_000e6;
        for (uint256 i = 0; i < 40; i++) {
            _pumpPool(usdgIn);
            pumped = _spotPrice();
            if (pumped > spotBefore * 140 / 100) break;
        }
        assertGt(pumped, spotBefore * 135 / 100, "pool pumped");

        // TWAP window elapses on the pumped price; feed is now > softAge old
        vm.warp(block.timestamp + 3 hours);
        StockOracle.Quote memory q = oracle.quote(A.NVDA);
        assertFalse(q.feedFresh, "weekend mode");
        assertTrue(q.feedValid, "feed still valid within hardAge");
        assertGt(q.twapPrice, q.feedPrice * 130 / 100, "twap reflects pump");
        assertEq(oracle.price(A.NVDA), q.twapPrice, "max rule picks twap");
        assertEq(feedUpdated, q.feedUpdatedAt);

        // 160% collateral vs +35..40% price => ~115% < 120% threshold: liquidatable
        assertFalse(market.isHealthy(id, shorter), "position unhealthy on twap");

        // keeper flash-liquidates: buys NVDA on the pumped pool with seized USDG
        Position memory p = market.position(id, shorter);
        vm.prank(keeper);
        uint256 profit = flash.liquidate(id, shorter, p.borrowShares, FEE, 0);
        console2.log("liquidator profit USDG", profit);
        assertEq(market.position(id, shorter).borrowShares, 0);
        MarketState memory s = market.state(id);
        assertGe(nvda.balanceOf(address(market)), uint256(s.totalSupplyAssets) - s.totalBorrowAssets);
    }

    function test_corporateActionGuard_blocksRiskOps() public {
        vm.prank(lender);
        market.supply(id, 50e18, lender);
        uint256 price = oracle.price(A.NVDA);
        vm.prank(shorter);
        router.openShort(id, (price / 1e18) * 2, 1e18, FEE, 0, false);

        vm.mockCall(A.NVDA, abi.encodeWithSignature("oraclePaused()"), abi.encode(true));
        vm.startPrank(shorter);
        vm.expectRevert(abi.encodeWithSelector(StockOracle.CorporateAction.selector, A.NVDA));
        market.borrow(id, 0.1e18, shorter, shorter);
        // repay always works
        Position memory p = market.position(id, shorter);
        deal(A.NVDA, shorter, 2e18);
        nvda.approve(address(market), type(uint256).max);
        market.repay(id, p.borrowShares, shorter);
        vm.stopPrank();
        vm.clearMockedCalls();
    }
}
