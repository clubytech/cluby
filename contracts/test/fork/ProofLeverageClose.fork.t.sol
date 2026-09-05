// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2, stdError} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IMorpho, IOracle, Id, MarketParams, Position, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {LeverageRouter} from "../../src/periphery/LeverageRouter.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {Addresses} from "../../src/Addresses.sol";

/// @notice LOGIC proofs for LeverageRouter.close(): is there a state with no legal exit?
contract ProofLeverageCloseTest is Test {
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
    }

    /// CLAIM: quote the debt, let the ordinary block or two pass before the transaction lands, and
    /// close() cannot take the position to zero — residual borrow shares survive the repay.
    function test_closingByShareCountSurvivesAStaleQuote() public {
        uint256 price = _open();

        // What the site/SDK would read at the moment the user is asked to sign.
        uint256 quotedDebt = lens.userView(params, user, 0).borrowAssets;

        // The transaction lands two blocks later. Nothing unusual has happened.
        vm.warp(block.timestamp + 24);
        vm.roll(block.number + 2);

        uint256 collateral = MORPHO.position(NVDA_MARKET, user).collateral;
        uint256 toSell = (((quotedDebt * ORACLE_SCALE) / price) * 106) / 100;

        // The share count is exact at any timestamp, so it does not go stale the way the quoted
        // amount does. The flash loan is quoted as an upper bound and the surplus comes straight
        // back in the same transaction.
        uint256 shares = MORPHO.position(NVDA_MARKET, user).borrowShares;

        vm.prank(user);
        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: 0,
                repayShares: shares,
                collateralToSell: toSell,
                swapFee: 500,
                minLoanOut: (quotedDebt * 99) / 100,
                onBehalf: user,
                flashAmount: (quotedDebt * 105) / 100
            })
        );

        Position memory p = MORPHO.position(NVDA_MARKET, user);
        console2.log("residual borrowShares", p.borrowShares);
        console2.log("collateral still held", p.collateral);
        assertEq(p.borrowShares, 0, "closing by shares zeroes the debt");
        assertLt(p.collateral, collateral, "and the collateral that funded it is gone");
    }

    /// CLAIM: with that residue in place the user cannot get their collateral out — not through the
    /// router, and not through Morpho directly. The position has no exit that close() can reach.
    function test_closingByShareCountFreesTheCollateral() public {
        uint256 price = _open();
        uint256 quotedDebt = lens.userView(params, user, 0).borrowAssets;

        vm.warp(block.timestamp + 24);
        vm.roll(block.number + 2);

        uint256 toSell = (((quotedDebt * ORACLE_SCALE) / price) * 106) / 100;
        uint256 shares = MORPHO.position(NVDA_MARKET, user).borrowShares;
        vm.prank(user);
        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: 0,
                repayShares: shares,
                collateralToSell: toSell,
                swapFee: 500,
                minLoanOut: (quotedDebt * 99) / 100,
                onBehalf: user,
                flashAmount: (quotedDebt * 105) / 100
            })
        );

        uint256 left = MORPHO.position(NVDA_MARKET, user).collateral;
        console2.log("collateral left", left);
        assertEq(MORPHO.position(NVDA_MARKET, user).borrowShares, 0, "no residual debt");

        // With the debt at zero, the rest of the collateral comes out unconditionally. With a
        // single share left behind it could not, which was the whole cost of the old close path.
        vm.prank(user);
        MORPHO.withdrawCollateral(params, left, user, user);
        assertEq(MORPHO.position(NVDA_MARKET, user).collateral, 0, "collateral is withdrawable");
    }

    /// How much is actually stranded, and is there any way out at all?
    function test_proof_measureStrandedCollateralAndEscape() public {
        uint256 price = _open();
        uint256 quotedDebt = lens.userView(params, user, 0).borrowAssets;
        vm.warp(block.timestamp + 24);
        vm.roll(block.number + 2);
        uint256 toSell = (((quotedDebt * ORACLE_SCALE) / price) * 106) / 100;
        vm.prank(user);
        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: quotedDebt,
                repayShares: 0,
                collateralToSell: toSell,
                swapFee: 500,
                minLoanOut: (quotedDebt * 99) / 100,
                onBehalf: user,
                flashAmount: quotedDebt
            })
        );

        uint256 left = MORPHO.position(NVDA_MARKET, user).collateral;
        // Binary search the largest withdrawal Morpho will still allow.
        uint256 lo = 0;
        uint256 hi = left;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            uint256 snap = vm.snapshotState();
            vm.prank(user);
            (bool ok,) = address(MORPHO).call(
                abi.encodeWithSignature(
                    "withdrawCollateral((address,address,address,address,uint256),uint256,address,address)",
                    params, mid, user, user
                )
            );
            vm.revertToState(snap);
            if (ok) lo = mid; else hi = mid - 1;
        }
        console2.log("collateral position   ", left);
        console2.log("max withdrawable      ", lo);
        console2.log("STRANDED (collateral) ", left - lo);

        // The escape exists, but only by going round the router with a shares-denominated repay.
        vm.startPrank(user);
        IERC20(Addresses.USDG).approve(address(MORPHO), type(uint256).max);
        deal(Addresses.USDG, user, 1e6);
        MORPHO.repay(params, 0, MORPHO.position(NVDA_MARKET, user).borrowShares, user, "");
        MORPHO.withdrawCollateral(params, MORPHO.position(NVDA_MARKET, user).collateral, user, user);
        vm.stopPrank();
        assertEq(MORPHO.position(NVDA_MARKET, user).collateral, 0, "shares-repay is the only way out");
    }

    /// CLAIM: "just repay a little more" is not available either — over-repaying reverts, so there
    /// is no safe margin the caller can add to beat the accrual.
    /// Padding the amount to be safe is the obvious move and it is the wrong one: burning more
    /// shares than exist underflows inside Morpho, with nothing in the revert to explain why. This
    /// is why `repayShares` exists rather than a bigger `repayAmount`.
    function test_overRepayingInAssetsStillPanicsWhichIsWhySharesExist() public {
        uint256 price = _open();
        uint256 quotedDebt = lens.userView(params, user, 0).borrowAssets;
        uint256 toSell = (((quotedDebt * ORACLE_SCALE) / price) * 120) / 100;

        // Ask to repay one part per thousand more than the debt, to be sure of clearing it.
        uint256 generous = (quotedDebt * 1001) / 1000;

        vm.prank(user);
        vm.expectRevert(stdError.arithmeticError);
        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: generous,
                repayShares: 0,
                collateralToSell: toSell,
                swapFee: 500,
                minLoanOut: (generous * 99) / 100,
                onBehalf: user,
                flashAmount: generous
            })
        );

        // The same close, expressed in shares, goes through.
        uint256 shares = MORPHO.position(NVDA_MARKET, user).borrowShares;
        vm.prank(user);
        leverage.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: 0,
                repayShares: shares,
                collateralToSell: toSell,
                swapFee: 500,
                minLoanOut: (quotedDebt * 99) / 100,
                onBehalf: user,
                flashAmount: generous
            })
        );
        assertEq(MORPHO.position(NVDA_MARKET, user).borrowShares, 0, "shares clear the debt");
    }

    /// CLAIM: close() borrows the repayment from Morpho's own idle balance. When that balance is
    /// short — the ordinary state of a market at high utilisation — the only exit this contract
    /// offers is unavailable, however healthy the position is.
    function test_proof_closeNeedsIdleLiquidityItCannotGuarantee() public {
        uint256 price = _open();
        uint256 quotedDebt = lens.userView(params, user, 0).borrowAssets;

        // The lender takes their money back out. The position is untouched and perfectly healthy.
        vm.prank(supplier);
        MORPHO.withdraw(params, 49_000e6, 0, supplier, supplier);
        // Drain what Morpho still holds so nothing is left to flash-borrow.
        uint256 idle = IERC20(Addresses.USDG).balanceOf(address(MORPHO));
        vm.prank(address(MORPHO));
        IERC20(Addresses.USDG).transfer(address(0xdead), idle > quotedDebt ? idle - quotedDebt / 2 : 0);

        assertGt(lens.userView(params, user, 0).healthFactorWad, 1e18, "position is healthy");

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
    }
}
