// SPDX-License-Identifier: MIT
// The vendored MetaMorpho sources pin this exact compiler; the pragma here matches so the deploy
// and the audited code compile as one unit.
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MetaMorphoV1_1Factory} from "../lib/metamorpho-v1.1/src/MetaMorphoV1_1Factory.sol";

/// @notice Deploys Morpho's own vault factory, unmodified.
///
/// @dev Morpho has not deployed MetaMorpho on Robinhood Chain — the factory is absent at both its
/// Ethereum and its Base addresses — so Earn has no vault to point at until this runs. The sources
/// are vendored from morpho-org/metamorpho-v1.1 at commit 89de5264 and are NOT edited: the whole
/// value of using them is that this is the code that was audited and that runs elsewhere.
///
///   FOUNDRY_PROFILE=vault forge script script/DeployVaultFactory.s.sol \
///     --rpc-url robinhood --private-key $PRIVATE_KEY --broadcast
contract DeployVaultFactory is Script {
    address constant MORPHO = 0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010;

    function run() external {
        vm.startBroadcast();
        MetaMorphoV1_1Factory factory = new MetaMorphoV1_1Factory(MORPHO);
        vm.stopBroadcast();

        console2.log("MetaMorphoV1_1Factory", address(factory));
        console2.log("MORPHO", factory.MORPHO());
    }
}
