// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMorpho, IIrm, Id, MarketParams, Market} from "../../src/interfaces/IMorpho.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {LeverageRouter} from "../../src/periphery/LeverageRouter.sol";
import {IOracle} from "../../src/interfaces/IMorpho.sol";
import {Addresses} from "../../src/Addresses.sol";

contract ProofLensStateTest is Test {
    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    Id constant NVDA_MARKET = Id.wrap(0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826);
    uint256 constant ORACLE_SCALE = 1e36;

    Lens lens;
    LeverageRouter leverage;
    MarketParams params;
    address supplier = makeAddr("supplier");
    address user = makeAddr("user");

    function setUp() public {
        vm.skip(bytes(vm.envOr("ROBINHOOD_RPC_URL", string(""))).length == 0);
        lens = new Lens(address(MORPHO));
        leverage = new LeverageRouter(address(MORPHO), Addresses.UNI_V3_SWAP_ROUTER02);
        params = MORPHO.idToMarketParams(NVDA_MARKET);

        deal(Addresses.USDG, supplier, 50_000e6);
        vm.startPrank(supplier);
        IERC20(Addresses.USDG).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, 50_000e6, 0, supplier, "");
        vm.stopPrank();
    }

    /// CLAIM: marketView returns a Market whose totals carry pending interest but whose lastUpdate
    /// is still the old one, then feeds that half-updated struct back to the IRM. The rate it
    /// publishes is not the rate the next transaction will accrue at.
    function test_proof_marketViewRateUsesHalfUpdatedState() public {
        // Give the market a real borrower so interest actually accrues.
        uint256 price = IOracle(params.oracle).price();
        deal(Addresses.NVDA, user, 10e18);
        vm.startPrank(user);
        IERC20(Addresses.NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, 10e18, user, "");
        MORPHO.borrow(params, ((10e18 * price) / ORACLE_SCALE) / 3, 0, user, user);
        vm.stopPrank();

        vm.warp(block.timestamp + 7 days);

        Lens.MarketView memory v = lens.marketView(params);
        Market memory raw = MORPHO.market(NVDA_MARKET);
        uint256 morphoRate = IIrm(params.irm).borrowRateView(params, raw);

        console2.log("lens borrowRatePerSecond  ", v.borrowRatePerSecond);
        console2.log("morpho borrowRateView     ", morphoRate);
        console2.log("lens state.lastUpdate     ", v.state.lastUpdate);
        console2.log("block.timestamp           ", block.timestamp);

        assertEq(v.borrowRatePerSecond, morphoRate, "Lens must publish the rate Morpho will use");
        assertEq(v.state.lastUpdate, block.timestamp, "accrued state must carry the accrual time");
    }

    /// HYPOTHESIS: open() and close() leave allowances behind on the router or on Morpho.
    function test_proof_leverageLeavesNoAllowance() public {
        uint256 equity = 1e18;
        uint256 price = IOracle(params.oracle).price();
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

        uint256 debt = lens.userView(params, user, 0).borrowAssets;
        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: debt,
                collateralToSell: (((debt * ORACLE_SCALE) / price) * 106) / 100,
                swapFee: 500,
                minLoanOut: (debt * 99) / 100,
                onBehalf: user
            })
        );
        vm.stopPrank();

        assertEq(IERC20(Addresses.USDG).allowance(address(leverage), address(MORPHO)), 0, "USDG -> Morpho");
        assertEq(
            IERC20(Addresses.USDG).allowance(address(leverage), Addresses.UNI_V3_SWAP_ROUTER02), 0, "USDG -> swap"
        );
        assertEq(IERC20(Addresses.NVDA).allowance(address(leverage), address(MORPHO)), 0, "NVDA -> Morpho");
        assertEq(
            IERC20(Addresses.NVDA).allowance(address(leverage), Addresses.UNI_V3_SWAP_ROUTER02), 0, "NVDA -> swap"
        );
    }
}
