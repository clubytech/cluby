// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {MarketParams, Market, Position} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockOracle, MockIrm, MockERC20} from "../mocks/Mocks.sol";

contract LensTest is Test {
    MockMorpho morpho;
    MockOracle oracle;
    MockIrm irm;
    Lens lens;
    MarketParams params;

    address constant BORROWER = address(0xB0B);

    uint256 constant WAD = 1e18;
    /// $231.46 a share: 231.46 · 1e6/1e18 · 1e36 on Morpho's raw scale.
    uint256 constant PRICE = 231_460_000_000_000_000_000_000_000;
    uint256 constant LLTV = 0.625e18;

    function setUp() public {
        morpho = new MockMorpho();
        oracle = new MockOracle(PRICE);
        irm = new MockIrm(0);
        lens = new Lens(address(morpho));

        params = MarketParams({
            loanToken: address(new MockERC20("USDG", "USDG", 6)),
            collateralToken: address(new MockERC20("NVDA", "NVDA", 18)),
            oracle: address(oracle),
            irm: address(irm),
            lltv: LLTV
        });

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
    }

    /// 10 NVDA at $231.46 backs $2,314.60; at 62.5% LLTV that is $1,446.62 of borrowing power.
    function test_collateralValueAndMaxBorrow() public {
        _setPosition(10e18, 0);
        Lens.UserView memory u = lens.userView(params, BORROWER, 0);
        assertEq(u.collateralValue, 2314_600000);
        assertEq(u.maxBorrowAssets, 1446_625000);
    }

    /// A debt of $1,000 against $1,446.62 of borrowing power is a health factor of 1.4466.
    function test_healthFactor() public {
        _setPosition(10e18, 1_000e6);
        Lens.UserView memory u = lens.userView(params, BORROWER, 0);
        assertApproxEqRel(u.healthFactorWad, 1.4466e18, 0.001e18);
        assertFalse(u.liquidatable);
    }

    /// Below 1 the position is liquidatable, and the flag has to flip exactly there.
    function test_liquidatableBelowOne() public {
        _setPosition(10e18, 1_400e6);
        assertFalse(lens.userView(params, BORROWER, 0).liquidatable);

        // Price falls far enough that 62.5% of the collateral no longer covers the debt.
        oracle.set(PRICE / 2);
        Lens.UserView memory u = lens.userView(params, BORROWER, 0);
        assertTrue(u.liquidatable);
        assertLt(u.healthFactorWad, WAD);
    }

    /// The liquidation price is where health factor reaches exactly 1 — so setting the oracle to it
    /// must produce a health factor of 1, not merely something close.
    function test_liquidationPriceIsTheCrossingPoint() public {
        _setPosition(10e18, 1_000e6);
        uint256 liqPrice = lens.userView(params, BORROWER, 0).liquidationPrice;

        oracle.set(liqPrice);
        assertApproxEqRel(lens.userView(params, BORROWER, 0).healthFactorWad, WAD, 0.0001e18);

        // A hair below it, the position is liquidatable.
        oracle.set(liqPrice - liqPrice / 1000);
        assertTrue(lens.userView(params, BORROWER, 0).liquidatable);
    }

    /// The safe cap must sit strictly inside the liquidation line: that gap is the whole point.
    function test_safeBorrowIsInsideMaxBorrow() public {
        _setPosition(10e18, 0);
        Lens.UserView memory u = lens.userView(params, BORROWER, 0.05e18);
        assertLt(u.safeBorrowAssets, u.maxBorrowAssets);
        // 57.5% of $2,314.60.
        assertEq(u.safeBorrowAssets, 1330_895000);
    }

    /// No debt means no health factor and no liquidation price — not a zero, which would read as
    /// "about to be liquidated" in any comparison that follows.
    function test_noDebtHasNoHealthFactor() public {
        _setPosition(10e18, 0);
        Lens.UserView memory u = lens.userView(params, BORROWER, 0);
        assertEq(u.healthFactorWad, type(uint256).max);
        assertEq(u.liquidationPrice, 0);
        assertFalse(u.liquidatable);
    }

    /// Morpho only accrues on interaction. A view that skipped pending interest would report a
    /// healthier position than the next transaction will see.
    function test_pendingInterestIsApplied() public {
        irm.set(uint256(1e18) / 365 days); // ~100% a year, easy to see
        Lens.MarketView memory before = lens.marketView(params);

        vm.warp(block.timestamp + 30 days);
        Lens.MarketView memory later = lens.marketView(params);

        assertGt(later.state.totalBorrowAssets, before.state.totalBorrowAssets);
        assertGt(later.state.totalSupplyAssets, before.state.totalSupplyAssets);
        // Interest is owed by borrowers and credited to suppliers, so both sides move by the same
        // amount.
        assertEq(
            uint256(later.state.totalBorrowAssets) - uint256(before.state.totalBorrowAssets),
            uint256(later.state.totalSupplyAssets) - uint256(before.state.totalSupplyAssets)
        );
    }

    function test_marketViewRatesAndUtilization() public view {
        Lens.MarketView memory v = lens.marketView(params);
        assertEq(v.utilizationWad, 0.4e18); // 40k borrowed of 100k supplied
        assertEq(v.liquidityAssets, 60_000e6);
        assertEq(v.price, PRICE);
    }

    /// The preview a wallet signs against must match what the position becomes.
    function test_previewBorrowMatchesResultingPosition() public {
        _setPosition(10e18, 0);
        Lens.UserView memory preview = lens.previewBorrow(params, BORROWER, 0, 1_000e6);

        _setPosition(10e18, 1_000e6);
        Lens.UserView memory actual = lens.userView(params, BORROWER, 0);

        assertEq(preview.healthFactorWad, actual.healthFactorWad);
        assertEq(preview.liquidationPrice, actual.liquidationPrice);
    }

    function _setPosition(uint128 collateral, uint256 borrowAssets) internal {
        Market memory m = morpho.market(_id());
        uint128 borrowShares =
            m.totalBorrowAssets == 0 ? uint128(borrowAssets * 1e6) : uint128(borrowAssets * uint256(m.totalBorrowShares) / uint256(m.totalBorrowAssets));
        morpho.setPosition(
            params, BORROWER, Position({supplyShares: 0, borrowShares: borrowShares, collateral: collateral})
        );
    }

    function _id() internal view returns (Id) {
        return MarketParamsLibTest.id(params);
    }
}

import {Id, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";

library MarketParamsLibTest {
    function id(MarketParams memory p) internal pure returns (Id) {
        return MarketParamsLib.id(p);
    }
}
