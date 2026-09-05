// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MerkleDistributor} from "../src/incentives/MerkleDistributor.sol";

/// @notice Deploy the rebate distributor, owned by the Safe from the first block.
///
/// @dev This is the contract that turns "borrowers get a rebate" from a sentence on a page into an
/// address anyone can read. It pays in USDG rather than in a token that does not exist yet, so it
/// works before a launch rather than after one, and it refuses to publish an epoch its own balance
/// cannot cover — which is the only property that makes a promised rebate worth anything.
///
///   TOKEN=0x… OWNER=0x… FOUNDRY_PROFILE=deploy forge script script/DeployDistributor.s.sol \
///     --rpc-url robinhood --broadcast
contract DeployDistributor is Script {
    function run() external {
        address token = vm.envAddress("TOKEN");
        address owner = vm.envAddress("OWNER");
        require(token.code.length > 0, "TOKEN has no code");
        require(owner.code.length > 0, "OWNER has no code, so it is not the Safe");

        vm.startBroadcast();
        MerkleDistributor d = new MerkleDistributor(token, owner);
        vm.stopBroadcast();

        require(d.owner() == owner, "owner did not stick");
        require(address(d.token()) == token, "token did not stick");
        require(d.latestEpoch() == 0, "a fresh distributor has paid nothing");

        console2.log("MerkleDistributor", address(d));
        console2.log("  token", address(d.token()));
        console2.log("  owner", d.owner());
    }
}
