// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IMorpho, IOracle, Id, MarketParams, Position, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {LeverageRouter} from "../../src/periphery/LeverageRouter.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {Addresses} from "../../src/Addresses.sol";

/// @notice Multiply against the live NVDA market: open a leveraged position through a real Uniswap
/// swap, then unwind it.
contract LeverageForkTest is Test {
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

        // Someone has to be lending before anyone can borrow.
        deal(Addresses.USDG, supplier, 50_000e6);
        vm.startPrank(supplier);
        IERC20(Addresses.USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, 50_000e6, 0, supplier, "");
        vm.stopPrank();
    }

    /// Two times exposure from one unit of equity, in a single transaction.
    function test_openTwoTimesLeverage() public {
        uint256 equity = 1e18; // 1 NVDA
        uint256 price = IOracle(params.oracle).price();
        uint256 equityValue = (equity * price) / ORACLE_SCALE;

        // Borrow the value of the equity again: total exposure ≈ 2x, LTV ≈ 50%.
        uint256 flashAmount = equityValue;
        // Accept 3% of slippage and fees against the oracle price on the way in.
        uint256 minCollateralOut = (((flashAmount * ORACLE_SCALE) / price) * 97) / 100;

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
                minCollateralOut: minCollateralOut,
                onBehalf: user
            })
        );
        vm.stopPrank();

        Position memory p = MORPHO.position(NVDA_MARKET, user);
        Lens.UserView memory u = lens.userView(params, user, 0);

        assertGt(p.collateral, (equity * 19) / 10, "exposure should be about twice the equity");
        assertEq(u.borrowAssets, flashAmount, "debt should equal what was flash-borrowed");
        assertGt(u.healthFactorWad, 1e18, "position must open healthy");
        assertEq(IERC20(Addresses.NVDA).balanceOf(address(leverage)), 0, "router kept collateral");
        assertEq(IERC20(Addresses.USDG).balanceOf(address(leverage)), 0, "router kept loan tokens");

        console2.log("equity           ", equity);
        console2.log("exposure         ", p.collateral);
        console2.log("debt (USDG)      ", u.borrowAssets);
        console2.log("health factor    ", u.healthFactorWad);
        console2.log("liquidation price", u.liquidationPrice);
    }

    /// And it must come apart again: repay the debt out of the collateral, keep the remainder.
    function test_closeReturnsTheRemainder() public {
        uint256 equity = 1e18;
        uint256 price = IOracle(params.oracle).price();
        uint256 flashAmount = (equity * price) / ORACLE_SCALE;
        uint256 minCollateralOut = (((flashAmount * ORACLE_SCALE) / price) * 97) / 100;

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
                minCollateralOut: minCollateralOut,
                onBehalf: user
            })
        );

        Lens.UserView memory open_ = lens.userView(params, user, 0);
        Position memory p = MORPHO.position(NVDA_MARKET, user);

        // Sell enough collateral to clear the debt, with room for the swap's own cost.
        uint256 debt = open_.borrowAssets;
        uint256 toSell = (((debt * ORACLE_SCALE) / price) * 106) / 100;
        assertLt(toSell, p.collateral, "not enough collateral to unwind");

        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: debt,
                collateralToSell: toSell,
                swapFee: 500,
                minLoanOut: (debt * 99) / 100,
                onBehalf: user
            })
        );
        vm.stopPrank();

        Lens.UserView memory closed = lens.userView(params, user, 0);
        assertEq(closed.borrowAssets, 0, "debt should be gone");
        assertGt(MORPHO.position(NVDA_MARKET, user).collateral, 0, "collateral should remain");
        assertEq(IERC20(Addresses.NVDA).balanceOf(address(leverage)), 0);
        assertEq(IERC20(Addresses.USDG).balanceOf(address(leverage)), 0);

        console2.log("collateral left after unwind", MORPHO.position(NVDA_MARKET, user).collateral);
        console2.log("USDG returned to the user   ", IERC20(Addresses.USDG).balanceOf(user));
    }

    /// Without Morpho authorisation the router must not be able to act for anyone.
    function test_refusesWithoutAuthorization() public {
        deal(Addresses.NVDA, user, 1e18);
        vm.startPrank(user);
        IERC20(Addresses.NVDA).approve(address(leverage), 1e18);
        vm.expectRevert(LeverageRouter.NotAuthorized.selector);
        leverage.open(
            LeverageRouter.OpenParams({
                marketParams: params,
                equityCollateral: 1e18,
                flashAmount: 100e6,
                swapFee: 500,
                minCollateralOut: 0,
                onBehalf: user
            })
        );
        vm.stopPrank();
    }

    /// And it must not open a position for somebody else.
    function test_refusesToActForAnotherAccount() public {
        vm.prank(user);
        vm.expectRevert(LeverageRouter.NotAuthorized.selector);
        leverage.open(
            LeverageRouter.OpenParams({
                marketParams: params,
                equityCollateral: 1e18,
                flashAmount: 100e6,
                swapFee: 500,
                minCollateralOut: 0,
                onBehalf: supplier
            })
        );
    }
}
