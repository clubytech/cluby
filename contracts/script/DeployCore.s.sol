// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {Lens} from "../src/periphery/Lens.sol";
import {FlashLiquidator} from "../src/periphery/FlashLiquidator.sol";

/// @notice Deploys the two contracts of ours that are not oracles: the read aggregator the site and
/// keeper use, and the liquidator.
///
/// @dev Neither holds user funds. The liquidator works entirely inside one transaction on a Morpho
/// flash loan, and the Lens is pure reads — so the deploy has no privileged setup beyond naming an
/// owner and a keeper.
///
///   FOUNDRY_PROFILE=deploy forge script script/DeployCore.s.sol --rpc-url robinhood --broadcast
contract DeployCore is Script {
    using stdJson for string;

    function run() external {
        string memory json = vm.readFile("config/markets.json");
        address morpho = json.readAddress(".morpho.blue");
        address router = vm.envOr("SWAP_ROUTER", address(0xCaf681a66D020601342297493863E78C959E5cb2));
        address owner = vm.envOr("OWNER", msg.sender);
        address keeper = vm.envOr("KEEPER", address(0));

        vm.startBroadcast();

        Lens lens = new Lens(morpho);
        console2.log("Lens", address(lens));

        FlashLiquidator liquidator = new FlashLiquidator(morpho, router, owner);
        console2.log("FlashLiquidator", address(liquidator));

        // The keeper key only triggers liquidations; profit always goes to the owner, so a leak of
        // it costs gas, not money.
        if (keeper != address(0) && owner == msg.sender) {
            liquidator.setKeeper(keeper, true);
            console2.log("keeper authorised", keeper);
        }

        vm.stopBroadcast();
    }
}
