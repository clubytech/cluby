// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {PreLiquidationFactory} from "../lib/pre-liquidation/src/PreLiquidationFactory.sol";
import {IPreLiquidation, PreLiquidationParams} from "../lib/pre-liquidation/src/interfaces/IPreLiquidation.sol";
import {Id, IMorpho, MarketParams} from "../lib/pre-liquidation/lib/morpho-blue/src/interfaces/IMorpho.sol";

/// @notice One pre-liquidation instance per market, so a borrower who opts in is trimmed at 2–4%
/// rather than closed at the full incentive.
///
/// @dev Nothing here can act on a borrower who has not authorised the instance for their own
/// account, so deploying an instance takes nothing away from anyone: it only makes the softer path
/// available. ONLY=NVDA,SPY restricts the run.
///
///   PRELIQ_FACTORY=0x… ONLY=NVDA,SPY FOUNDRY_PROFILE=preliq \
///   forge script script/CreatePreLiquidations.s.sol --rpc-url robinhood --broadcast
contract CreatePreLiquidations is Script {
    using stdJson for string;

    /// @dev preLltv is five points inside the market's own LLTV, matching the safe cap the app
    /// already refuses to lend past.
    uint256 constant PRE_LLTV_OFFSET = 0.05e18;

    function run() external {
        string memory json = vm.readFile("config/markets.json");
        IMorpho morpho = IMorpho(json.readAddress(".morpho.blue"));
        PreLiquidationFactory factory = PreLiquidationFactory(vm.envAddress("PRELIQ_FACTORY"));
        string memory only = vm.envOr("ONLY", string(""));

        uint256 count = json.readUint(".marketCount");
        vm.startBroadcast();

        for (uint256 i; i < count; ++i) {
            string memory at = string.concat(".markets[", vm.toString(i), "]");
            string memory key = json.readString(string.concat(at, ".key"));
            if (bytes(only).length > 0 && !_selected(only, key)) continue;

            Id id = Id.wrap(json.readBytes32(string.concat(at, ".deployedId")));
            if (Id.unwrap(id) == bytes32(0)) continue;

            MarketParams memory params = morpho.idToMarketParams(id);
            if (params.lltv == 0) continue;
            // A market whose LLTV is at or under the offset would have a nonsensical pre-line.
            if (params.lltv <= PRE_LLTV_OFFSET) continue;

            IPreLiquidation instance = factory.createPreLiquidation(
                id,
                PreLiquidationParams({
                    preLltv: params.lltv - PRE_LLTV_OFFSET,
                    // Close factor ramps from a fifth of the debt at the pre-line to all of it at
                    // the liquidation line: the closer to trouble, the more may be unwound.
                    preLCF1: 0.2e18,
                    preLCF2: 1e18,
                    // And the penalty ramps 2% → 4%, against roughly 12.7% for a hard liquidation.
                    preLIF1: 1.02e18,
                    preLIF2: 1.04e18,
                    preLiquidationOracle: params.oracle
                })
            );
            console2.log(key, "preLiquidation", address(instance));
        }

        vm.stopBroadcast();
    }

    function _selected(string memory only, string memory key) internal pure returns (bool) {
        bytes memory haystack = bytes(string.concat(",", only, ","));
        bytes memory needle = bytes(string.concat(",", key, ","));
        if (needle.length > haystack.length) return false;
        for (uint256 i; i <= haystack.length - needle.length; ++i) {
            bool hit = true;
            for (uint256 j; j < needle.length; ++j) {
                if (haystack[i + j] != needle[j]) {
                    hit = false;
                    break;
                }
            }
            if (hit) return true;
        }
        return false;
    }
}
