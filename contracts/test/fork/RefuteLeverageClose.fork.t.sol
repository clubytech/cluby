// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IMorpho, IOracle, Id, MarketParams, Position, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {LeverageRouter} from "../../src/periphery/LeverageRouter.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {Addresses} from "../../src/Addresses.sol";

/// @notice Adversarial pass over L1: how absolute is "close() can never zero the debt", and how
/// much does the residue actually cost?
contract RefuteLeverageCloseTest is Test {
    using MarketParamsLib for MarketParams;

    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    Id constant NVDA_MARKET = Id.wrap(0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826);
    uint256 constant ORACLE_SCALE = 1e36;

    LeverageRouter leverage;
    Lens lens;
    MarketParams params;

    address supplier = makeAddr("supplier");
    address user = makeAddr("user");

    function setUp() public {
        vm.skip(bytes(vm.envOr("ROBINHOOD_RPC_URL", string(""))).length == 0);
        leverage = new LeverageRouter(address(MORPHO), Addresses.UNI_V3_SWAP_ROUTER02);
        lens = new Lens(address(MORPHO));
        params = MORPHO.idToMarketParams(NVDA_MARKET);

        deal(Addresses.USDG, supplier, 50_000e6);
        vm.startPrank(supplier);
        IERC20(Addresses.USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, 50_000e6, 0, supplier, "");
        vm.stopPrank();
    }

    function _open() internal returns (uint256 price) {
        uint256 equity = 1e18;
        price = IOracle(params.oracle).price();
        uint256 flashAmount = (equity * price) / ORACLE_SCALE;
        deal(Addresses.NVDA, user, equity);
        vm.startPrank(user);
        IERC20(Addresses.NVDA).approve(address(leverage), equity);
        MORPHO.setAuthorization(address(leverage), true);
        leverage.open(
            LeverageRouter.OpenParams({
                marketParams: params,
                equityCollateral: equity,
                flashAmount: flashAmount,
                swapFee: 500,
                minCollateralOut: (((flashAmount * ORACLE_SCALE) / price) * 97) / 100,
                onBehalf: user
            })
        );
        vm.stopPrank();
    }

    /// L1 SCOPE: quote and close in the SAME block -- no warp, no roll -- and the debt does go to
    /// zero. The defect is the staleness of the quote, not the assets-denominated repay as such.
    function test_refute_closeZeroesTheDebtInTheSameBlock() public {
        uint256 price = _open();
        uint256 debt = lens.userView(params, user, 0).borrowAssets;

        vm.prank(user);
        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: debt,
                repayShares: 0,
                collateralToSell: (((debt * ORACLE_SCALE) / price) * 106) / 100,
                swapFee: 500,
                minLoanOut: (debt * 99) / 100,
                onBehalf: user,
                flashAmount: debt
            })
        );
        Position memory p = MORPHO.position(NVDA_MARKET, user);
        console2.log("same-block residual borrowShares", p.borrowShares);
        console2.log("same-block collateral left      ", p.collateral);
        assertEq(p.borrowShares, 0, "same-block close does zero the debt");
    }

    /// L1 PRICE: with the dust debt in place, what is actually at stake? Value the stranded
    /// collateral and the residual debt in USD, and show a healthy position is neither liquidatable
    /// nor blocked from any other Morpho action.
    function test_refute_priceOfTheResidue() public {
        uint256 price = _open();
        uint256 quotedDebt = lens.userView(params, user, 0).borrowAssets;
        vm.warp(block.timestamp + 24);
        vm.roll(block.number + 2);

        vm.prank(user);
        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: quotedDebt,
                repayShares: 0,
                collateralToSell: (((quotedDebt * ORACLE_SCALE) / price) * 106) / 100,
                swapFee: 500,
                minLoanOut: (quotedDebt * 99) / 100,
                onBehalf: user,
                flashAmount: quotedDebt
            })
        );

        Position memory p = MORPHO.position(NVDA_MARKET, user);
        Lens.UserView memory u = lens.userView(params, user, 0);
        // Stranded = collateral that LLTV pins behind the residual debt: debt / lltv, in collateral.
        uint256 pinnedCollateral = (((u.borrowAssets * ORACLE_SCALE) / params.lltv) * 1e18) / price;
        console2.log("residual debt (USDG 1e6)     ", u.borrowAssets);
        console2.log("pinned collateral (NVDA wei) ", pinnedCollateral);
        console2.log("pinned value  (USDG 1e6)     ", (pinnedCollateral * price) / ORACLE_SCALE);
        console2.log("health factor (wad)          ", u.healthFactorWad);
        assertFalse(u.liquidatable, "the residue never makes the position liquidatable");
        assertLt(u.borrowAssets, 10, "residual debt is single-digit wei of a 6-decimal token");
        assertLt((pinnedCollateral * price) / ORACLE_SCALE, 10, "value pinned is under 1e-5 dollars");

        // And one wei of USDG plus a shares-repay unwinds it, from the user's own key.
        deal(Addresses.USDG, user, 1e6);
        vm.startPrank(user);
        IERC20(Addresses.USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.repay(params, 0, p.borrowShares, user, "");
        MORPHO.withdrawCollateral(params, MORPHO.position(NVDA_MARKET, user).collateral, user, user);
        vm.stopPrank();
        assertEq(MORPHO.position(NVDA_MARKET, user).collateral, 0, "the user can always get out unaided");
    }
}
