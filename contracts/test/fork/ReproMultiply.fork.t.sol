// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMorpho, Id, MarketParams, Market} from "../../src/interfaces/IMorpho.sol";
import {LeverageRouter} from "../../src/periphery/LeverageRouter.sol";
import {Addresses} from "../../src/Addresses.sol";

/// @notice The failure a user hit opening 1.6x on NVDA, kept so it stays diagnosed.
///
/// @dev The panel reported it as `The contract function "open" reverted with the following reason:`
/// and a truncated hex string, which reads like a contract bug and is not one. Reproducing it
/// against the live market names it in one word: the market had 41 cents free and the position
/// needed to borrow 60.
///
/// It is a red test on purpose while that market is thin. What it guards is the diagnosis: if this
/// ever fails with something OTHER than "insufficient liquidity", the cause has changed and the
/// panel's new liquidity ceiling is not the thing standing between a user and this revert.
contract ReproMultiplyTest is Test {
    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    LeverageRouter constant ROUTER = LeverageRouter(payable(0x12aD902c5004d5147D7F46dC97818cA26Fcb25cf));
    Id constant NVDA = Id.wrap(0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826);

    address user = 0x9C5C4b4A985b0A60a1067a0d82020774661d074A;

    function setUp() public {
        vm.createSelectFork(vm.envOr("ROBINHOOD_RPC_URL", string("https://rpc.mainnet.chain.robinhood.com")));
    }

    function test_knownRed_openOnePointSixOnNvdaRunsOutOfLiquidity() public {
        MarketParams memory p = MORPHO.idToMarketParams(NVDA);
        Market memory m = MORPHO.market(NVDA);
        console2.log("supplied ", m.totalSupplyAssets);
        console2.log("borrowed ", m.totalBorrowAssets);
        console2.log("available", m.totalSupplyAssets - m.totalBorrowAssets);

        // What the panel computed at $230.24: $1 of equity, $0.60 of debt at 1.6x.
        uint256 equity = 4_343_000_000_000_000;   // ~0.004343 NVDA
        uint256 flash = 600_000;                  // 0.60 USDG
        uint256 minOut = 2_528_000_000_000_000;   // 0.97 x the oracle rate

        deal(p.collateralToken, user, equity * 10);
        vm.startPrank(user);
        IERC20(p.collateralToken).approve(address(ROUTER), type(uint256).max);
        if (!MORPHO.isAuthorized(user, address(ROUTER))) MORPHO.setAuthorization(address(ROUTER), true);

        LeverageRouter.OpenParams memory op = LeverageRouter.OpenParams({
            marketParams: p,
            equityCollateral: equity,
            flashAmount: flash,
            swapFee: 500,
            minCollateralOut: minOut,
            onBehalf: user
        });

        // Named, so a different cause cannot hide behind a test that merely expects failure.
        vm.expectRevert(bytes("insufficient liquidity"));
        ROUTER.open(op);
        vm.stopPrank();

        // And the arithmetic the panel now uses to stop offering this in the first place.
        uint256 available = m.totalSupplyAssets - m.totalBorrowAssets;
        assertLt(available, flash, "the market cannot fund the loan this position needs");
    }
}
