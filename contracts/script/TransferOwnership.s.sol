// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";

interface IOwnable2Step {
    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
    function transferOwnership(address newOwner) external;
}

/// @notice Hands every contract we own to a Safe.
///
/// @dev Ownable2Step, so this is only the first half: each contract records a PENDING owner, and
/// nothing moves until the Safe itself calls `acceptOwnership()`. That is the point of the two-step
/// form — a fat-fingered address cannot strand a contract with an owner that does not exist.
///
/// After running this, the Safe must accept on each contract. In the Safe UI that is the
/// Transaction Builder: one batched transaction calling `acceptOwnership()` on each address printed
/// below.
///
///   SAFE=0x… forge script script/TransferOwnership.s.sol --rpc-url robinhood \
///     --private-key $PRIVATE_KEY --broadcast
contract TransferOwnership is Script {
    function run() external {
        address safe = vm.envAddress("SAFE");
        require(safe.code.length > 0, "SAFE has no code - is it deployed on this chain?");

        address[] memory targets = new address[](3);
        string[] memory names = new string[](3);
        targets[0] = vm.envOr("VAULT", address(0x97e813828B0250dCa5c05FF2567dfD616E5b3C61));
        names[0] = "Cluby Core USDG vault";
        targets[1] = vm.envOr("FLASH_LIQUIDATOR", address(0x91B3c5b8C76386A8293B1CE97fE8dceB10733F5B));
        names[1] = "FlashLiquidator";
        targets[2] = vm.envOr("CREDIT_REGISTRY", address(0x86e8f3Bf88087774a530d70FfaD19b5257054E53));
        names[2] = "CreditRegistry";

        vm.startBroadcast();
        for (uint256 i; i < targets.length; ++i) {
            IOwnable2Step target = IOwnable2Step(targets[i]);
            if (target.owner() != msg.sender) {
                console2.log(names[i], "skipped - not owned by the sender");
                continue;
            }
            target.transferOwnership(safe);
            console2.log(names[i], targets[i], "-> pending owner");
        }
        vm.stopBroadcast();

        console2.log("");
        console2.log("Now, FROM THE SAFE, call acceptOwnership() on each address above.");
        console2.log("Nothing has changed hands until it does.");
    }
}
