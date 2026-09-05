// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {Lens} from "../src/periphery/Lens.sol";
import {FlashLiquidator} from "../src/periphery/FlashLiquidator.sol";
import {LeverageRouter} from "../src/periphery/LeverageRouter.sol";

/// @notice Redeploy the three periphery contracts after the audit fixes.
///
/// @dev None of them holds anything between transactions, so there is nothing to migrate: the new
/// addresses simply replace the old ones in the config, and the old ones are abandoned where they
/// stand. That property is why this costs a deploy and nothing else.
///
/// The liquidator is deployed owned by the DEPLOYER and handed to the Safe in the same transaction
/// batch, so the keeper can be authorised without a Safe round trip first. `Ownable2Step` means the
/// Safe still has to call `acceptOwnership()` before the handover completes; until it does, the
/// deployer owns it, which is where liquidation profit would go. With no borrows outstanding that
/// window is worth nothing, and it buys a keeper that works the moment it is pointed here.
///
///   FOUNDRY_PROFILE=deploy forge script script/Redeploy.s.sol --rpc-url robinhood --broadcast
contract Redeploy is Script {
    using stdJson for string;

    function run() external {
        string memory json = vm.readFile("config/markets.json");
        address morpho = json.readAddress(".morpho.blue");
        address router = vm.envOr("SWAP_ROUTER", address(0xCaf681a66D020601342297493863E78C959E5cb2));
        address safe = vm.envAddress("OWNER");
        address keeper = vm.envAddress("KEEPER");

        vm.startBroadcast();

        Lens lens = new Lens(morpho);
        console2.log("Lens", address(lens));

        FlashLiquidator liquidator = new FlashLiquidator(morpho, router, msg.sender);
        console2.log("FlashLiquidator", address(liquidator));
        liquidator.setKeeper(keeper, true);
        console2.log("  keeper authorised", keeper);
        console2.log("  maxSlippageWad", liquidator.maxSlippageWad());
        liquidator.transferOwnership(safe);
        console2.log("  ownership offered to", safe);

        LeverageRouter lev = new LeverageRouter(morpho, router);
        console2.log("LeverageRouter", address(lev));

        vm.stopBroadcast();
    }
}
