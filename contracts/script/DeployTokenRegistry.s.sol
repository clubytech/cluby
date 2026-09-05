// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TokenRegistry} from "../src/token/TokenRegistry.sol";

/// @notice Deploy the token registry, owned by the Safe from the first block it exists.
///
/// @dev Owned by the Safe directly rather than by the deployer with a handover: `Ownable2Step`
/// would leave a window in which the deploy key could publish an address to the front page, and
/// there is no reason to open one — nothing has to be configured between deploying this and the
/// Safe using it.
///
///   OWNER=0x… FOUNDRY_PROFILE=deploy forge script script/DeployTokenRegistry.s.sol \
///     --rpc-url robinhood --broadcast
contract DeployTokenRegistry is Script {
    function run() external {
        address owner = vm.envAddress("OWNER");
        require(owner.code.length > 0, "OWNER has no code, so it is not the Safe");

        vm.startBroadcast();
        TokenRegistry reg = new TokenRegistry(owner);
        vm.stopBroadcast();

        // Read back through the deployed contract before printing an address to paste anywhere.
        (address t,, uint64 at,,,) = reg.listing();
        require(t == address(0) && at == 0, "a fresh registry must announce nothing");
        require(reg.owner() == owner, "owner did not stick");

        console2.log("TokenRegistry", address(reg));
        console2.log("  owner", reg.owner());
    }
}
