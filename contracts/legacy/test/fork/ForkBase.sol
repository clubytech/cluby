// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Market} from "../../src/Market.sol";
import {KinkedIRM} from "../../src/KinkedIRM.sol";
import {StockOracle} from "../../src/StockOracle.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {ShortRouter} from "../../src/periphery/ShortRouter.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {Id, MarketParams, RiskParams} from "../../src/interfaces/IMarket.sol";
import {IAggregatorV3, ISwapRouter02, IUniswapV3PoolMinimal} from "../../src/interfaces/IExternal.sol";
import {Addresses as A} from "../../src/Addresses.sol";

/// @notice Shared fork fixture: deploys the whole stack against real NVDA, USDG, Chainlink and the
/// NVDA/USDG 0.05% v3 pool. Run with --fork-url robinhood (needs recent state; archive for pinning).
abstract contract ForkBase is Test {
    address constant NVDA_USDG_500 = 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3;
    uint24 constant FEE = 500;

    Market market;
    KinkedIRM irm;
    StockOracle oracle;
    Lens lens;
    ShortRouter router;
    FlashLiquidator flash;
    Id id;

    IERC20 nvda = IERC20(A.NVDA);
    IERC20 usdg = IERC20(A.USDG);

    address admin = makeAddr("admin");
    address lender = makeAddr("lender");
    address shorter = makeAddr("shorter");
    address keeper = makeAddr("keeper");

    function setUp() public virtual {
        vm.createSelectFork("robinhood");

        irm = new KinkedIRM(admin, KinkedIRM.Curve({baseApr: 0.02e18, kinkApr: 0.12e18, maxApr: 1.5e18, kink: 0.8e18}));
        oracle = new StockOracle(admin);
        market = new Market(admin, admin);
        lens = new Lens(market);
        router = new ShortRouter(market, ISwapRouter02(A.UNI_V3_SWAP_ROUTER02));
        flash = new FlashLiquidator(market, ISwapRouter02(A.UNI_V3_SWAP_ROUTER02), keeper);

        vm.startPrank(admin);
        oracle.setConfig(
            A.NVDA,
            A.USDG,
            StockOracle.Cfg({
                feed: IAggregatorV3(A.FEED_NVDA),
                softAge: 2 hours,
                hardAge: 5 days,
                v3Pool: NVDA_USDG_500,
                twapWindow: 30 minutes,
                multiplierGuard: true,
                feedScale: 0
            })
        );
        MarketParams memory p =
            MarketParams({stock: A.NVDA, collateral: A.USDG, oracle: address(oracle), irm: address(irm)});
        id = market.createMarket(
            p,
            RiskParams({initialMarginBps: 15_000, liqThresholdBps: 12_000, liqBonusBps: 500, borrowCap: 1_000e18, flags: 0}),
            1_500
        );
        vm.stopPrank();

        deal(A.NVDA, lender, 100e18);
        deal(A.USDG, shorter, 1_000_000e6);
        vm.prank(lender);
        nvda.approve(address(market), type(uint256).max);
        vm.startPrank(shorter);
        usdg.approve(address(market), type(uint256).max);
        usdg.approve(address(router), type(uint256).max);
        market.setAuthorization(address(router), true);
        vm.stopPrank();
    }

    /// @dev Push the pool price up by buying NVDA with USDG.
    function _pumpPool(uint256 usdgIn) internal {
        address whale = makeAddr("whale");
        deal(A.USDG, whale, usdgIn);
        vm.startPrank(whale);
        usdg.approve(A.UNI_V3_SWAP_ROUTER02, usdgIn);
        ISwapRouter02(A.UNI_V3_SWAP_ROUTER02).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: A.USDG,
                tokenOut: A.NVDA,
                fee: FEE,
                recipient: whale,
                amountIn: usdgIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();
    }

    function _spotPrice() internal view returns (uint256 p1e36) {
        (uint160 sqrtP,,,,,,) = IUniswapV3PoolMinimal(NVDA_USDG_500).slot0();
        bool nvdaIs0 = IUniswapV3PoolMinimal(NVDA_USDG_500).token0() == A.NVDA;
        uint256 half = nvdaIs0 ? (uint256(sqrtP) * 1e18) >> 96 : ((uint256(1) << 96) * 1e18) / sqrtP;
        return half * half;
    }
}
