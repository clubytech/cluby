// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MetaMorphoV1_1Factory} from "../lib/metamorpho-v1.1/src/MetaMorphoV1_1Factory.sol";
import {IMetaMorphoV1_1} from "../lib/metamorpho-v1.1/src/interfaces/IMetaMorphoV1_1.sol";
import {Id, IMorpho} from "../lib/metamorpho-v1.1/lib/morpho-blue/src/interfaces/IMorpho.sol";

/// @notice Creates the Core USDG vault and points it at the canary markets.
///
/// @dev Deposits are not part of this: creating a vault costs gas, funding one costs principal, and
/// the two belong in separate transactions signed for separate reasons.
///
/// The timelock starts at zero so the caps can be set in the same run. It MUST be raised to 24h
/// before anyone else's money is in here — with a zero timelock the owner can raise a cap and move
/// depositors' liquidity into a new market in a single block, which is exactly the power a timelock
/// exists to remove.
///
///   FOUNDRY_PROFILE=vault forge script script/CreateVault.s.sol \
///     --rpc-url robinhood --private-key $PRIVATE_KEY --broadcast
contract CreateVault is Script {
    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    Id constant NVDA_MARKET = Id.wrap(0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826);
    Id constant SPY_MARKET = Id.wrap(0xf95832e36d9d8baf35eb78ce80cbed92d20198ba639659b3f9a2ab00ced0a0c1);
    Id constant ETH_MARKET = Id.wrap(0x6722f53f25a8d6e73493893c4f7f80ddc535cf97c4a93116fd55296e714216ae);

    function run() external {
        MetaMorphoV1_1Factory factory = MetaMorphoV1_1Factory(vm.envAddress("VAULT_FACTORY"));
        address owner = vm.envOr("OWNER", msg.sender);

        vm.startBroadcast();

        IMetaMorphoV1_1 vault = IMetaMorphoV1_1(
            factory.createMetaMorpho(msg.sender, 0, USDG, "Cluby Core USDG", "cUSDG", bytes32("cluby-core-usdg"))
        );
        console2.log("vault", address(vault));

        vault.setIsAllocator(msg.sender, true);

        // Caps in USDG units. Small on purpose, raised only against measured exit depth.
        _cap(vault, NVDA_MARKET, 2_000e6);
        _cap(vault, SPY_MARKET, 2_000e6);
        _cap(vault, ETH_MARKET, 5_000e6);

        Id[] memory queue = new Id[](3);
        queue[0] = NVDA_MARKET;
        queue[1] = SPY_MARKET;
        queue[2] = ETH_MARKET;
        vault.setSupplyQueue(queue);

        if (owner != msg.sender) {
            vault.setCurator(owner);
            vault.transferOwnership(owner);
            console2.log("ownership handed to", owner);
        }

        vm.stopBroadcast();

        console2.log("asset", vault.asset());
        console2.log("fee", vault.fee());
        console2.log("timelock", vault.timelock());
    }

    function _cap(IMetaMorphoV1_1 vault, Id id, uint184 cap) internal {
        vault.submitCap(MORPHO.idToMarketParams(id), cap);
        vault.acceptCap(MORPHO.idToMarketParams(id));
    }
}
