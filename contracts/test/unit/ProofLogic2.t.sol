// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {MarketParams, Market, Position} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";

contract ProofLogic2Test is Test {
    MockMorpho morpho;
    MockRouter router;
    MockERC20 usdg;
    MockERC20 nvda;
    FlashLiquidator liq;
    MarketParams params;

    address constant BORROWER = address(0xB0B);

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        router = new MockRouter(100e6);
        liq = new FlashLiquidator(address(morpho), address(router), address(this));

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(1e36)),
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

    /// HYPOTHESIS: a successful liquidation leaves allowance behind (the callback opens with an
    /// unbounded approval to Morpho).
    function test_proof_noDanglingAllowanceAfterLiquidation() public {
        liq.liquidate(
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
        assertEq(usdg.allowance(address(liq), address(morpho)), 0, "loan-token allowance to Morpho");
        assertEq(nvda.allowance(address(liq), address(router)), 0, "collateral allowance to the swap router");
        assertEq(usdg.balanceOf(address(liq)), 0);
        assertEq(nvda.balanceOf(address(liq)), 0);
    }

    /// CLAIM (same root cause as the profit gate): because the gate is `received >= flashAmount`
    /// and not `received >= repaid`, a stray balance sitting in the contract lets a liquidation
    /// that loses money on the money that actually moved go through.
    function test_proof_strayBalanceFundsALossMakingLiquidation() public {
        // Somebody sends the liquidator 400 USDG. The contract is meant to hold nothing.
        usdg.mint(address(liq), 400e6);

        // The pool pays 45 per unit; seizing 10 collateral repays 500 and returns only 450.
        router.set(45e6);

        // Flash only 100, so the gate is `received >= 100e6` — trivially met by a 450 sale.
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

        // 400 donated, 500 repaid, 450 received: the owner ends up with 350, down 50 on the stray
        // balance they started with, and the gate called it profit.
        console2.log("owner USDG after a 'profitable' liquidation", usdg.balanceOf(address(this)));
        assertGe(usdg.balanceOf(address(this)), 400e6, "the gate should not pass a loss-making sale");
    }
}
