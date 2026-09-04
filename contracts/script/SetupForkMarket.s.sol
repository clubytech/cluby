// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IMorpho, Id, MarketParams, MarketParamsLib} from "../src/interfaces/IMorpho.sol";
import {Lens} from "../src/periphery/Lens.sol";
import {FlashLiquidator} from "../src/periphery/FlashLiquidator.sol";
import {Addresses} from "../src/Addresses.sol";
import {MockOracle} from "../test/mocks/Mocks.sol";

/// @notice Stands up a complete, liquidatable position on an anvil fork so the keeper can be
/// watched doing its job for real.
///
/// @dev The market gets an oracle we control rather than the live feed: the point of the exercise
/// is to move the price and see what happens, and there is no honest way to move a Chainlink feed.
/// Everything else — Morpho, the pool the collateral is sold into, the token contracts — is the
/// real thing at the forked block.
contract SetupForkMarket is Script {
    using MarketParamsLib for MarketParams;

    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    address constant IRM = 0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1;
    uint256 constant LLTV = 0.625e18;

    function run() external {
        address me = msg.sender;
        // NVDA at $231.46 on Morpho's raw scale for an 18-decimal collateral in 6-decimal USDG.
        uint256 startPrice = 231_460_000_000_000_000_000_000_000;

        vm.startBroadcast();

        MockOracle oracle = new MockOracle(startPrice);
        Lens lens = new Lens(address(MORPHO));
        FlashLiquidator liquidator =
            new FlashLiquidator(address(MORPHO), Addresses.UNI_V3_SWAP_ROUTER02, me);
        liquidator.setKeeper(me, true);

        MarketParams memory params = MarketParams({
            loanToken: Addresses.USDG,
            collateralToken: Addresses.NVDA,
            oracle: address(oracle),
            irm: IRM,
            lltv: LLTV
        });
        MORPHO.createMarket(params);

        // Sized to what the fork actually has on hand: Morpho holds under five NVDA on this chain,
        // and borrowing tokens from it is how the test account gets any.
        uint256 supplyAmount = vm.envOr("FORK_SUPPLY", uint256(2_000e6));
        uint256 collateralAmount = vm.envOr("FORK_COLLATERAL", uint256(4e18));

        IERC20(Addresses.USDG).approve(address(MORPHO), type(uint256).max);
        IERC20(Addresses.NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supply(params, supplyAmount, 0, me, "");
        MORPHO.supplyCollateral(params, collateralAmount, me, "");

        // Borrow right up to the liquidation line, so a small drop is enough to go underwater.
        uint256 maxBorrow = lens.userView(params, me, 0).maxBorrowAssets;
        MORPHO.borrow(params, (maxBorrow * 99) / 100, 0, me, me);

        vm.stopBroadcast();

        Id id = params.id();
        console2.log("MARKET_ID", vm.toString(Id.unwrap(id)));
        console2.log("ORACLE", address(oracle));
        console2.log("LENS", address(lens));
        console2.log("LIQUIDATOR", address(liquidator));
        console2.log("health factor", lens.userView(params, me, 0).healthFactorWad);
    }
}
