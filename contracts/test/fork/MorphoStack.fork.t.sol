// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {
    IMorpho,
    IOracle,
    IChainlinkOracleV2Factory,
    Id,
    MarketParams,
    Market,
    Position,
    MarketParamsLib
} from "../../src/interfaces/IMorpho.sol";
import {IAggregatorV3} from "../../src/interfaces/IExternal.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {Addresses} from "../../src/Addresses.sol";

/// @notice The full cycle against real Robinhood Chain state: create a market through Morpho's own
/// factory, supply, borrow, repay, and liquidate an underwater position with a flash loan.
///
/// @dev Run with an archive RPC — the public node is pruned and forking on it hangs:
///   forge test --match-path 'test/fork/*' --fork-url robinhood -vv
contract MorphoStackForkTest is Test {
    using MarketParamsLib for MarketParams;

    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    address constant IRM = 0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1;
    IChainlinkOracleV2Factory constant ORACLE_FACTORY =
        IChainlinkOracleV2Factory(0xB7c16F6F8cF531447Bf27Ca7220f981E79C9cdF2);

    address constant USDG = Addresses.USDG;
    address constant NVDA = Addresses.NVDA;
    address constant FEED_NVDA = Addresses.FEED_NVDA;
    address constant SWAP_ROUTER = Addresses.UNI_V3_SWAP_ROUTER02;

    uint256 constant LLTV = 0.625e18;

    address supplier = makeAddr("supplier");
    address borrower = makeAddr("borrower");
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");

    MarketParams params;
    Lens lens;
    FlashLiquidator liquidator;

    function setUp() public {
        vm.skip(bytes(vm.envOr("ROBINHOOD_RPC_URL", string(""))).length == 0);

        lens = new Lens(address(MORPHO));
        liquidator = new FlashLiquidator(address(MORPHO), SWAP_ROUTER, owner);
        vm.prank(owner);
        liquidator.setKeeper(keeper, true);

        address oracle = ORACLE_FACTORY.createMorphoChainlinkOracleV2(
            address(0), 1, FEED_NVDA, address(0), 18, address(0), 1, address(0), address(0), 6, bytes32("cluby-nvda")
        );

        params = MarketParams({
            loanToken: USDG,
            collateralToken: NVDA,
            oracle: oracle,
            irm: IRM,
            lltv: LLTV
        });

        if (MORPHO.idToMarketParams(params.id()).lltv == 0) MORPHO.createMarket(params);
    }

    /// The oracle Morpho's factory builds must agree with the feed it reads, or every number after
    /// this point is wrong in a way no later test would catch.
    /// Morpho's own formula, mirrored here because the keeper has to size the flash loan with it.
    function _liquidationIncentiveFactor(uint256 lltv) internal pure returns (uint256) {
        uint256 cursor = 0.3e18;
        uint256 factor = (1e18 * 1e18) / (1e18 - (cursor * (1e18 - lltv)) / 1e18);
        return factor < 1.15e18 ? factor : 1.15e18;
    }

    function test_oracleMatchesTheFeed() public view {
        (, int256 answer,,,) = IAggregatorV3(FEED_NVDA).latestRoundData();
        uint256 feedPrice = uint256(answer); // 8 decimals

        uint256 oraclePrice = IOracle(params.oracle).price();
        // 1e36 raw scale with an 18-decimal base and a 6-decimal quote: feed · 1e36 · 1e6 / 1e18 / 1e8.
        uint256 expected = feedPrice * 1e16;

        assertApproxEqRel(oraclePrice, expected, 0.001e18);
        console2.log("NVDA feed price (8dp)", feedPrice);
        console2.log("oracle price (1e36)  ", oraclePrice);
    }

    /// Supply, post collateral, borrow inside the safe cap, repay, withdraw — the whole user path.
    function test_supplyBorrowRepayWithdraw() public {
        uint256 supplyAmount = 10_000e6;
        uint256 collateralAmount = 20e18;

        deal(USDG, supplier, supplyAmount);
        deal(NVDA, borrower, collateralAmount);

        vm.startPrank(supplier);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, supplyAmount, 0, supplier, "");
        vm.stopPrank();

        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, collateralAmount, borrower, "");

        // Borrow at the app's safe cap rather than the liquidation line.
        Lens.UserView memory before = lens.userView(params, borrower, 0.05e18);
        uint256 borrowAmount = before.safeBorrowAssets;
        assertGt(borrowAmount, 0);
        MORPHO.borrow(params, borrowAmount, 0, borrower, borrower);
        vm.stopPrank();

        assertEq(IERC20(USDG).balanceOf(borrower), borrowAmount);

        Lens.UserView memory open = lens.userView(params, borrower, 0.05e18);
        assertGt(open.healthFactorWad, 1e18);
        assertFalse(open.liquidatable);
        console2.log("health factor    ", open.healthFactorWad);
        console2.log("liquidation price", open.liquidationPrice);

        // A day of interest, then repay by shares so the debt closes exactly instead of leaving dust.
        vm.warp(block.timestamp + 1 days);
        Position memory p = MORPHO.position(params.id(), borrower);
        deal(USDG, borrower, borrowAmount * 2);

        vm.startPrank(borrower);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.repay(params, 0, p.borrowShares, borrower, "");
        MORPHO.withdrawCollateral(params, collateralAmount, borrower, borrower);
        vm.stopPrank();

        assertEq(MORPHO.position(params.id(), borrower).borrowShares, 0);
        assertEq(IERC20(NVDA).balanceOf(borrower), collateralAmount);
    }

    /// Interest has to reach the supplier, not merely be charged to the borrower.
    function test_interestAccruesToSupplier() public {
        deal(USDG, supplier, 10_000e6);
        deal(NVDA, borrower, 20e18);

        vm.startPrank(supplier);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, 10_000e6, 0, supplier, "");
        vm.stopPrank();

        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, 20e18, borrower, "");
        MORPHO.borrow(params, 2_000e6, 0, borrower, borrower);
        vm.stopPrank();

        Lens.MarketView memory before = lens.marketView(params);
        vm.warp(block.timestamp + 30 days);
        Lens.MarketView memory later = lens.marketView(params);

        assertGt(later.state.totalBorrowAssets, before.state.totalBorrowAssets);
        assertGt(later.state.totalSupplyAssets, before.state.totalSupplyAssets);
        assertGt(later.borrowApyWad, 0);
        console2.log("borrow APY (wad)", later.borrowApyWad);
        console2.log("supply APY (wad)", later.supplyApyWad);
    }

    /// The one that matters: when the price gaps down, the position must be liquidatable and the
    /// flash-loan liquidator must clear it at a profit, holding no capital of its own.
    function test_flashLiquidationClearsAnUnderwaterPosition() public {
        deal(USDG, supplier, 50_000e6);
        deal(NVDA, borrower, 20e18);

        vm.startPrank(supplier);
        IERC20(USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, 50_000e6, 0, supplier, "");
        vm.stopPrank();

        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, 20e18, borrower, "");
        uint256 borrowAmount = lens.userView(params, borrower, 0.05e18).safeBorrowAssets;
        MORPHO.borrow(params, borrowAmount, 0, borrower, borrower);
        vm.stopPrank();

        assertFalse(lens.userView(params, borrower, 0).liquidatable);

        // Monday opens 35% down — the gap the 62.5% LLTV is sized for.
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            IAggregatorV3(FEED_NVDA).latestRoundData();
        vm.mockCall(
            FEED_NVDA,
            abi.encodeWithSelector(IAggregatorV3.latestRoundData.selector),
            abi.encode(roundId, (answer * 65) / 100, startedAt, updatedAt, answeredInRound)
        );

        Lens.UserView memory shocked = lens.userView(params, borrower, 0);
        assertTrue(shocked.liquidatable);
        console2.log("health factor after the gap", shocked.healthFactorWad);

        uint256 seize = 5e18;
        uint256 price = IOracle(params.oracle).price();
        // Floor the swap at 92% of oracle value: enough room for pool fees, tight enough that a
        // pool pushed away from the market reverts instead of selling into it.
        uint256 minOut = (seize * price * 92) / (1e36 * 100);
        // What Morpho will actually pull for that much collateral. Seizing by amount means the
        // repayment is the seized value discounted by the liquidation incentive, NOT the whole
        // debt — flash-borrowing the debt instead leaves the swap unable to cover the loan.
        //   LIF = min(1.15, 1 / (1 − 0.3·(1 − LLTV)))
        uint256 lif = _liquidationIncentiveFactor(LLTV);
        uint256 repaid = ((seize * price) / 1e36) * 1e18 / lif;
        uint256 flashAmount = (repaid * 101) / 100; // a point of margin for rounding

        uint256 ownerBefore = IERC20(USDG).balanceOf(owner);
        vm.prank(keeper);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: borrower,
                seizedAssets: seize,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: flashAmount,
                minAmountOut: minOut
            })
        );

        assertGt(IERC20(USDG).balanceOf(owner), ownerBefore, "liquidation made no profit");
        assertEq(IERC20(USDG).balanceOf(address(liquidator)), 0, "liquidator kept a balance");
        assertEq(IERC20(NVDA).balanceOf(address(liquidator)), 0, "liquidator kept collateral");
        console2.log("liquidation profit (USDG)", IERC20(USDG).balanceOf(owner) - ownerBefore);
    }
}
