// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {Lens} from "../src/periphery/Lens.sol";
import {IMorpho, Id, MarketParams} from "../src/interfaces/IMorpho.sol";

/// @notice Deploy the Lens on its own, and prove the deployed one answers before printing it.
///
/// @dev The Lens is the only periphery contract deployed by hand more than once — it is pure reads,
/// so replacing it costs a deploy and a config line, and it got replaced whenever a view was wrong.
/// The fourth one was created outside this repository's scripts with a constructor argument typed
/// at a shell, and the argument was an address with no code. Nothing caught it: the deploy
/// succeeded, the contract verified, and every read reverted with empty data, which reads
/// downstream as "this market is broken" rather than "this Lens is broken". It stayed that way
/// until the keeper's alert was traced by hand.
///
/// So the address comes from `config/markets.json` and never from an argument, and the script
/// finishes by calling `marketView` on a live market through the contract it just deployed. A Lens
/// that cannot answer is not printed as an address to paste into the config; the script fails.
///
///   MARKET_ID=0x… FOUNDRY_PROFILE=deploy forge script script/DeployLens.s.sol \
///     --rpc-url robinhood --broadcast
contract DeployLens is Script {
    using stdJson for string;

    function run() external {
        string memory json = vm.readFile("config/markets.json");
        address morpho = json.readAddress(".morpho.blue");
        require(morpho.code.length > 0, "markets.json .morpho.blue has no code on this chain");

        // A market that already exists, read straight from Morpho so the check cannot be fed a
        // hand-written params tuple that happens to hash to nothing.
        Id id = Id.wrap(bytes32(vm.envBytes32("MARKET_ID")));
        MarketParams memory params = IMorpho(morpho).idToMarketParams(id);
        require(params.oracle != address(0), "MARKET_ID does not exist on that Morpho");

        vm.startBroadcast();
        Lens lens = new Lens(morpho);
        vm.stopBroadcast();

        // The read-back. Reverts the whole script if the new Lens cannot answer.
        Lens.MarketView memory v = lens.marketView(params);
        require(v.price > 0, "deployed Lens returned a zero price");

        console2.log("Lens", address(lens));
        console2.log("  morpho()", address(lens.morpho()));
        console2.log("  read back price", v.price);
        console2.log("  read back borrowRatePerSecond", v.borrowRatePerSecond);
    }
}
