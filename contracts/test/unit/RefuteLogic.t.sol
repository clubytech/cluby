// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {MarketParams, Market, Position} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";

/// @notice Adversarial pass over the LOGIC findings: is the path reachable, and is the price right?
contract RefuteLogicTest is Test {
    MockMorpho morpho;
    MockRouter router;
    MockERC20 usdg;
    MockERC20 nvda;
    FlashLiquidator liq;
    MarketParams params;

    address constant BORROWER = address(0xB0B);
    uint256 constant WAD = 1e18;
    uint256 constant LLTV = 0.625e18;

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        router = new MockRouter(100e6);
        liq = new FlashLiquidator(address(morpho), address(router), address(this));

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(50e24)), // 1e36 scale, 18->6 decimals: $50 a share
            irm: address(new MockIrm(0)),
            lltv: LLTV
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

    /// apps/keeper/src/liquidate.ts:95-99, transcribed.
    function _keeperParams(uint256 seized) internal view returns (uint256 flashAmount, uint256 minAmountOut) {
        uint256 lif = (WAD * WAD) / (WAD - (3e17 * (WAD - LLTV)) / WAD); // 1.1268e18 at 62.5%
        uint256 price = 50e24;
        uint256 repaid = (((seized * price) / 1e36) * WAD) / lif;
        flashAmount = (repaid * 101) / 100;
        minAmountOut = (((seized * price) / 1e36) * 92) / 100;
    }

    /// L2(a) REACHABILITY: the keeper refuses to send anything whose swap floor is not already above
    /// the flash loan (liquidate.ts:101). So `received >= minAmountOut > flashAmount == assets`
    /// holds by construction and the gate at FlashLiquidator.sol:116 cannot be the binding check.
    function test_refute_keeperSizedLiquidationNeverTouchesTheGate() public {
        uint256 seized = 10e18;
        (uint256 flashAmount, uint256 minAmountOut) = _keeperParams(seized);
        // Morpho repays debt/LIF for the collateral it hands over; mirror that in the mock.
        morpho.setRepayPerCollateral(44_374_778); // 10e18 seized -> ~443.7 USDG repaid
        console2.log("flashAmount ", flashAmount);
        console2.log("minAmountOut", minAmountOut);
        assertGt(minAmountOut, flashAmount, "keeper's own guard: it skips unless the floor clears the loan");

        // The pool pays exactly the floor: the worst trade the keeper will still send.
        router.set(46e6); // 10e18 * 46e6 / 1e18 = 460e6 == minAmountOut
        liq.liquidate(
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
        console2.log("owner profit", usdg.balanceOf(address(this)));
        assertGt(usdg.balanceOf(address(this)), 0, "the deployed keeper's own numbers pass the gate");
    }

    /// L2 ROOT: with an empty contract the invariant the finding asks for -- `received >= repaid` --
    /// is already enforced, not by the gate but by Morpho pulling the flash loan back afterwards.
    /// Set `flashAmount` below the debt so the gate is trivially satisfied and the sale still loses
    /// money: the transaction reverts anyway, on the flash-loan repayment.
    function test_refute_lossMakingLiquidationRevertsWithoutADonation() public {
        router.set(45e6); // seize 10 -> repay 500, sale returns 450
        vm.expectRevert(); // ERC20 underflow inside Morpho's post-callback pull
        liq.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 100e6,
                minAmountOut: 0
            })
        );
        assertEq(usdg.balanceOf(address(liq)), 0);
    }

    /// L2(b) PRICE: the loss is bounded by the stray balance and cannot exceed it -- past that the
    /// flash repayment reverts. It is the owner's own donated money, which `sweep()` would have
    /// handed them anyway, and only a keeper or the owner can spend it.
    function test_refute_strayLossIsCappedByTheStrayBalance() public {
        usdg.mint(address(liq), 400e6);
        router.set(45e6); // 50 USDG short on every 500 repaid

        // Ask for a loss bigger than the donation: 10x the size, 500 of loss against 400 donated.
        morpho.setRepayPerCollateral(50e6);
        vm.expectRevert();
        liq.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 90e18, // repay 4500, sale returns 4050: 450 of loss > 400 donated
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 100e6,
                minAmountOut: 0
            })
        );
        assertEq(usdg.balanceOf(address(liq)), 400e6, "the donation is still there; nothing beyond it is at risk");
    }

    /// L2(b) REACHABILITY: the entry point is gated. A stranger cannot spend the donation.
    function test_refute_strangerCannotTriggerTheLossPath() public {
        usdg.mint(address(liq), 400e6);
        router.set(45e6);
        vm.prank(address(0xBAD));
        vm.expectRevert(FlashLiquidator.NotKeeper.selector);
        liq.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 100e6,
                minAmountOut: 0
            })
        );
    }
}
