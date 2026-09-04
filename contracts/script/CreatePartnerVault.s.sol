// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MetaMorphoV1_1Factory} from "../lib/metamorpho-v1.1/src/MetaMorphoV1_1Factory.sol";
import {IMetaMorphoV1_1} from "../lib/metamorpho-v1.1/src/interfaces/IMetaMorphoV1_1.sol";
import {Id, IMorpho} from "../lib/metamorpho-v1.1/lib/morpho-blue/src/interfaces/IMorpho.sol";

/// @notice A vault for one partner and one market: they set the cap, they bring the liquidity, and
/// the borrow demand is their users'.
///
/// @dev Ownership goes to the partner in the same transaction that creates the vault. The point of
/// a partner vault is that it is theirs — Cluby curates which market it may lend into and nothing
/// else, so a partner who stops trusting us can walk away with their own depositors intact.
///
///   VAULT_FACTORY=0x… PARTNER=0x… MARKET_ID=0x… CAP=1000000000 NAME="Foo USDG" SYMBOL=fooUSDG \
///   FOUNDRY_PROFILE=vault forge script script/CreatePartnerVault.s.sol --rpc-url robinhood --broadcast
contract CreatePartnerVault is Script {
    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    function run() external {
        MetaMorphoV1_1Factory factory = MetaMorphoV1_1Factory(vm.envAddress("VAULT_FACTORY"));
        address partner = vm.envAddress("PARTNER");
        Id marketId = Id.wrap(vm.envBytes32("MARKET_ID"));
        uint184 cap = uint184(vm.envUint("CAP"));
        address asset = vm.envOr("ASSET", USDG);
        string memory name = vm.envString("NAME");
        string memory symbol = vm.envString("SYMBOL");
        // A partner vault starts with a real timelock: its depositors are not the deployer.
        uint256 timelock = vm.envOr("TIMELOCK", uint256(1 days));

        require(MORPHO.idToMarketParams(marketId).lltv != 0, "market does not exist");

        vm.startBroadcast();

        IMetaMorphoV1_1 vault = IMetaMorphoV1_1(
            factory.createMetaMorpho(msg.sender, 0, asset, name, symbol, keccak256(bytes(symbol)))
        );

        vault.submitCap(MORPHO.idToMarketParams(marketId), cap);
        vault.acceptCap(MORPHO.idToMarketParams(marketId));

        Id[] memory queue = new Id[](1);
        queue[0] = marketId;
        vault.setSupplyQueue(queue);

        // Timelock first, then hand it over — set afterwards it would be the partner's problem to
        // remember, and an ungoverned vault is exactly what this is meant to avoid.
        vault.submitTimelock(timelock);
        vault.setCurator(partner);
        vault.setIsAllocator(partner, true);
        vault.transferOwnership(partner);

        vm.stopBroadcast();

        console2.log("partner vault", address(vault));
        console2.log("owner (pending acceptance by partner)", partner);
        console2.log("timelock", vault.timelock());
    }
}
