// SPDX-License-Identifier: MIT
// Matches the vendored sources, which pin this compiler exactly.
pragma solidity 0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {PreLiquidationFactory} from "../lib/pre-liquidation/src/PreLiquidationFactory.sol";

/// @notice Deploys Morpho's pre-liquidation factory, unmodified.
///
/// @dev Pre-liquidation is the difference between a Monday gap trimming a position and closing it.
/// Between preLltv and the market's LLTV a borrower who opted in can be partially unwound at a 2–4%
/// penalty instead of the full ~12.7% liquidation incentive. Nothing here can touch a borrower who
/// has not authorised the instance for their own account.
///
/// Not deployed by Morpho on this chain, so we deploy their code from
/// morpho-org/pre-liquidation @ a9ef88fe.
///
///   FOUNDRY_PROFILE=preliq forge script script/DeployPreLiquidation.s.sol \
///     --rpc-url robinhood --private-key $PRIVATE_KEY --broadcast
contract DeployPreLiquidation is Script {
    address constant MORPHO = 0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010;

    function run() external {
        vm.startBroadcast();
        PreLiquidationFactory factory = new PreLiquidationFactory(MORPHO);
        vm.stopBroadcast();

        console2.log("PreLiquidationFactory", address(factory));
    }
}
