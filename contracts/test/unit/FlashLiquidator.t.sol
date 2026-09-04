// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {MarketParams, Market, Position} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";

contract FlashLiquidatorTest is Test {
    MockMorpho morpho;
    MockRouter router;
    MockERC20 usdg;
    MockERC20 nvda;
    FlashLiquidator liquidator;
    MarketParams params;

    address constant OWNER = address(0xA11CE);
    address constant KEEPER = address(0xCEE9E4);
    address constant BORROWER = address(0xB0B);

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        // One collateral token buys 100 USDG in the mock pool.
        router = new MockRouter(100e6);

        liquidator = new FlashLiquidator(address(morpho), address(router), OWNER);
        vm.prank(OWNER);
        liquidator.setKeeper(KEEPER, true);

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(1e36)),
            irm: address(new MockIrm(0)),
            lltv: 0.625e18
        });

        // Morpho holds the loan token it will lend out; the router holds what it pays out.
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

    /// The whole point: no capital of ours goes in, and the profit lands with the owner.
    function test_liquidatesWithoutCapitalAndPaysOwner() public {
        assertEq(usdg.balanceOf(address(liquidator)), 0);

        vm.prank(KEEPER);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 500e6,
                minAmountOut: 500e6
            })
        );

        // Seized 10 collateral, sold at 100 each = 1,000 USDG; the flash loan was 500.
        assertEq(usdg.balanceOf(OWNER), 500e6);
        // And nothing is left behind in the contract, which is what makes it safe to be small.
        assertEq(usdg.balanceOf(address(liquidator)), 0);
        assertEq(nvda.balanceOf(address(liquidator)), 0);
    }

    /// A pool pushed away from the oracle must make the whole liquidation revert rather than sell
    /// the collateral into it.
    function test_revertsWhenSwapOutputIsBelowTheFloor() public {
        router.set(40e6); // collateral now fetches far less than the oracle says it is worth

        vm.prank(KEEPER);
        vm.expectRevert(MockRouter.TooLittleReceived.selector);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 500e6,
                minAmountOut: 500e6
            })
        );
    }

    function test_onlyKeeperOrOwnerCanTrigger() public {
        vm.expectRevert(FlashLiquidator.NotKeeper.selector);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 500e6,
                minAmountOut: 500e6
            })
        );
    }

    /// The flash-loan callback is the one entry point an attacker would aim at: it must refuse
    /// anyone but Morpho.
    function test_callbackRejectsAnyoneButMorpho() public {
        vm.expectRevert(FlashLiquidator.NotMorpho.selector);
        liquidator.onMorphoFlashLoan(1, "");
    }
}
