// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, stdError} from "forge-std/Test.sol";

import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {TwapOracle} from "../../src/oracles/TwapOracle.sol";
import {MarketParams, Market, Position} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm, MockV3Pool} from "../mocks/Mocks.sol";

contract Proofs is Test {
    MockMorpho morpho;
    MockRouter router;
    MockERC20 usdg;
    MockERC20 nvda;
    FlashLiquidator liquidator;
    Lens lens;
    MarketParams params;

    address constant OWNER = address(0xA11CE);
    address constant KEEPER = address(0xCEE9E4);
    address constant BORROWER = address(0xB0B);

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        router = new MockRouter(100e6);
        lens = new Lens(address(morpho));

        liquidator = new FlashLiquidator(address(morpho), address(router), OWNER);
        vm.prank(OWNER);
        liquidator.setKeeper(KEEPER, true);

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(100e24)),
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

    // -------------------------------------------------------------------------------------------
    // CLAIM 1: FlashLiquidator's profit guard compares the swap output against the FLASH AMOUNT,
    // not against what Morpho actually pulled. The keeper is told (LiquidateParams.flashAmount doc)
    // to add a margin; apps/keeper/src/liquidate.ts:99 adds 1%. That margin is then required to come
    // out of the swap as well, so a liquidation that nets a real profit reverts as NoProfit.
    // -------------------------------------------------------------------------------------------
    function test_noProfitMeasuresTheRepaymentNotTheLoan() public {
        // Morpho will pull 500 USDG for 10 collateral; the pool pays 502 USDG for those 10.
        // Net to the contract: +2 USDG. Unambiguously profitable.
        morpho.setRepayPerCollateral(50e6); // 10e18 collateral -> 500e6 repaid
        router.set(50.2e6); // 10e18 collateral -> 502e6 received

        // The oracle sits where the pool sits, so the price floor is satisfied and cannot be the
        // thing under test: what is under test is the margin the keeper adds to the flash loan.
        MockOracle(params.oracle).set(50.2e24);

        uint256 flashAmount = 505e6; // the keeper's 1% margin over the 500 it expects to repay

        // This used to revert `NoProfit(502, 505)` — comparing the sale against the size of the
        // loan rather than against what Morpho took out of it.
        vm.prank(KEEPER);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: flashAmount,
                minAmountOut: 400e6
            })
        );
        assertEq(usdg.balanceOf(OWNER), 2e6, "the profit the margin used to cost");
        assertEq(usdg.balanceOf(address(liquidator)), 0);

        // And a sale that genuinely does not cover the repayment is still refused, so the guard was
        // relaxed rather than removed.
        router.set(49e6);
        vm.prank(KEEPER);
        vm.expectRevert(abi.encodeWithSelector(FlashLiquidator.NoProfit.selector, uint256(490e6), uint256(500e6)));
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: flashAmount,
                minAmountOut: 400e6
            })
        );
    }

    // -------------------------------------------------------------------------------------------
    // CLAIM 2: TwapOracle guards the bottom of its range (PriceOutOfRange) and nothing at the top.
    // sqrtPriceX96 * sqrtPriceX96 on line 68 is plain checked arithmetic; above tick ~443,636 it
    // overflows and price() reverts with Panic(0x11) instead of any error the contract declares.
    // -------------------------------------------------------------------------------------------
    function test_twapOraclePricesTheWholeUniswapTickRange() public {
        MockERC20 stock = new MockERC20("Stock", "STK", 18);
        MockERC20 quote = new MockERC20("USDG", "USDG", 6);
        // USDG is token0, the 18-decimal token is token1 — the HIMS ordering on this chain.
        MockV3Pool pool = new MockV3Pool(address(quote), address(stock));
        TwapOracle o = new TwapOracle(address(pool), address(stock), address(quote), 1800);

        // 443,636 used to be the last tick that worked: the square of sqrtPriceX96 overflowed a
        // uint256 one tick later and panicked, halfway through Uniswap's own legal range.
        pool.setMeanTick(443_636, 1800);
        uint256 below = o.price();

        pool.setMeanTick(443_637, 1800);
        uint256 above = o.price();
        assertLe(above, below, "this pool is inverted, so a higher tick is a lower price");

        // And all the way out to Uniswap's MAX_TICK, the answer is a revert with a name on it
        // rather than a panic — the price genuinely is outside what a 1e36 scale can carry.
        pool.setMeanTick(887_272, 1800);
        vm.expectRevert(TwapOracle.PriceOutOfRange.selector);
        o.price();
    }

    // -------------------------------------------------------------------------------------------
    // CLAIM 3: Lens rounds the borrower's debt UP (Lens.sol:92, toAssetsUp) exactly as Morpho does.
    // packages/sdk/src/reads.ts:73 rounds the same number DOWN under a comment claiming it rounds
    // "the way Morpho rounds it against the borrower". Every site and MCP surface reads the SDK.
    // This pins the on-chain side so the two can be compared.
    // -------------------------------------------------------------------------------------------
    function test_proof_lensRoundsDebtUpWhereTheSdkRoundsItDown() public {
        // A share price that is not a whole number of assets, so the two directions differ.
        morpho.setMarket(
            params,
            Market({
                totalSupplyAssets: 100_000e6,
                totalSupplyShares: 100_000e6 * 1e6,
                totalBorrowAssets: 40_000e6 + 7,
                totalBorrowShares: 40_000e6 * 1e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 1_000e6 * 1e6, collateral: 100e18}));

        uint256 onChain = lens.userView(params, BORROWER, 0).borrowAssets;

        // The SDK's toAssetsDown on the same inputs.
        uint256 shares = 1_000e6 * 1e6;
        uint256 sdk = (shares * (uint256(40_000e6 + 7) + 1)) / (uint256(40_000e6 * 1e6) + 1e6);

        assertEq(onChain, sdk + 1, "Lens is one unit above what every UI shows");
    }

    // -------------------------------------------------------------------------------------------
    // CLAIM 4: Lens._accrued mints fee shares but never advances lastUpdate, so marketView asks the
    // IRM for a rate against a state whose utilisation has moved forward while its clock has not.
    // -------------------------------------------------------------------------------------------
    function test_accruedStateStampsItsOwnLastUpdate() public {
        uint128 t0 = uint128(block.timestamp);
        MockIrm(params.irm).set(uint256(1e18) / 365 days);
        vm.warp(block.timestamp + 30 days);

        Lens.MarketView memory v = lens.marketView(params);
        assertGt(v.state.totalBorrowAssets, 50_000e6, "interest was applied");
        assertEq(v.state.lastUpdate, uint128(block.timestamp), "and the clock was applied with it");
        assertGt(v.state.lastUpdate, t0);
    }
}
