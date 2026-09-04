// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {
    IMorpho,
    IOracle,
    IChainlinkOracleV2Factory,
    Id,
    MarketParams,
    MarketParamsLib
} from "../src/interfaces/IMorpho.sol";
import {TwapOracle} from "../src/oracles/TwapOracle.sol";
import {InverseOracle} from "../src/oracles/InverseOracle.sol";
import {MinOracle} from "../src/oracles/MinOracle.sol";

/// @notice Deploys an oracle per market and creates the market on Morpho Blue.
///
/// @dev The market list comes from `contracts/config/markets.json`, generated from
/// `packages/config` by `pnpm export:markets` — so the site, the indexer and this script cannot
/// disagree about a market's parameters.
///
/// Market creation is irreversible in the way that matters: the parameters are immutable, so a
/// wrong LLTV or a wrong oracle cannot be edited afterwards, only abandoned. Every oracle is
/// therefore made to answer a non-zero price BEFORE the market that will depend on it is created.
///
///   forge script script/CreateMarkets.s.sol --rpc-url robinhood --broadcast --slow
contract CreateMarkets is Script {
    using stdJson for string;
    using MarketParamsLib for MarketParams;

    IMorpho internal morpho;
    address internal irm;
    IChainlinkOracleV2Factory internal oracleFactory;
    uint32 internal twapWindow;

    function run() external {
        string memory json = vm.readFile("config/markets.json");

        morpho = IMorpho(json.readAddress(".morpho.blue"));
        irm = json.readAddress(".morpho.irm");
        oracleFactory = IChainlinkOracleV2Factory(json.readAddress(".morpho.chainlinkOracleFactory"));
        twapWindow = uint32(json.readUint(".twapWindow"));

        uint256 count = json.readUint(".marketCount");
        // ONLY="NVDA,SPY,ETH" restricts the run to a subset. Markets are immutable and cost real
        // gas, so the canary creates three and the rest wait rather than all seventeen going out at
        // once because the script had no way to say "not yet".
        string memory only = vm.envOr("ONLY", string(""));
        console2.log("markets in config:", count);
        if (bytes(only).length > 0) console2.log("restricted to:", only);

        vm.startBroadcast();
        for (uint256 i; i < count; ++i) {
            _createOne(json, i, only);
        }
        vm.stopBroadcast();
    }

    function _createOne(string memory json, uint256 i, string memory only) internal {
        string memory at = string.concat(".markets[", vm.toString(i), "]");
        string memory key = json.readString(string.concat(at, ".key"));
        if (!_selected(only, key)) return;

        // Skip before touching the oracle factory, not after. The factory salts by market key, so
        // building an oracle for a market that already exists collides on CREATE2 and reverts the
        // whole run — the batch would die on the first market it had already made.
        Id recorded = Id.wrap(json.readBytes32(string.concat(at, ".deployedId")));
        if (Id.unwrap(recorded) != bytes32(0) && morpho.idToMarketParams(recorded).lltv != 0) {
            console2.log(key, "already created");
            return;
        }

        MarketParams memory params = MarketParams({
            loanToken: json.readAddress(string.concat(at, ".loanToken")),
            collateralToken: json.readAddress(string.concat(at, ".collateralToken")),
            oracle: _deployOracle(json, at, key),
            irm: irm,
            lltv: json.readUint(string.concat(at, ".lltv"))
        });

        uint256 price = IOracle(params.oracle).price();
        require(price > 0, string.concat("oracle returned 0 for ", key));
        console2.log(key, "oracle price", price);

        // Re-running after a partial failure is normal; creating an existing market reverts.
        Id id = params.id();
        if (morpho.idToMarketParams(id).lltv != 0) {
            console2.log(key, "already created");
            return;
        }

        morpho.createMarket(params);
        console2.log(key, "created", vm.toString(Id.unwrap(id)));
    }

    /// @dev Substring match on a comma-wrapped list, so "NVDA" does not also select "NVDA-SHORT".
    function _selected(string memory only, string memory key) internal pure returns (bool) {
        if (bytes(only).length == 0) return true;
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

    function _deployOracle(string memory json, string memory at, string memory key) internal returns (address) {
        bytes32 kind = keccak256(bytes(json.readString(string.concat(at, ".oracleKind"))));

        if (kind == keccak256("chainlink")) {
            return _chainlinkOracle(json, at, key);
        }
        if (kind == keccak256("twap")) {
            return _twapOracle(json, at, key);
        }
        if (kind == keccak256("chainlinkTwapMin")) {
            // Collateral takes the lower of the two. See MinOracle for why it is never the higher.
            return address(new MinOracle(_chainlinkOracle(json, at, key), _twapOracle(json, at, key)));
        }
        if (kind == keccak256("inverse")) {
            // A short market is the long market with the tokens swapped: collateral is USDG and the
            // borrowed asset is the stock. The inner oracle must still be built the LONG way round —
            // stock as base, USDG as quote — because InverseOracle is what performs the swap. Passing
            // the short market's own decimals here inverts them a second time and misprices the
            // collateral by 10^24, which still looks like a plausible number.
            return address(
                new InverseOracle(
                    _chainlinkOracleWithDecimals(
                        json,
                        at,
                        key,
                        json.readUint(string.concat(at, ".loanDecimals")),
                        json.readUint(string.concat(at, ".collateralDecimals"))
                    )
                )
            );
        }
        revert(string.concat("unknown oracle kind for ", key));
    }

    /// @dev Morpho's own factory. Audited, and it keeps oracle code of ours out of the price path.
    function _chainlinkOracle(string memory json, string memory at, string memory key) internal returns (address) {
        return _chainlinkOracleWithDecimals(
            json,
            at,
            key,
            json.readUint(string.concat(at, ".collateralDecimals")),
            json.readUint(string.concat(at, ".loanDecimals"))
        );
    }

    function _chainlinkOracleWithDecimals(
        string memory json,
        string memory at,
        string memory key,
        uint256 baseDecimals,
        uint256 quoteDecimals
    ) internal returns (address) {
        address feed = json.readAddress(string.concat(at, ".feed"));
        require(feed != address(0), string.concat("no feed for ", key));
        return oracleFactory.createMorphoChainlinkOracleV2(
            address(0),
            1,
            feed,
            address(0),
            baseDecimals,
            address(0),
            1,
            address(0),
            address(0),
            quoteDecimals,
            keccak256(bytes(key))
        );
    }

    function _twapOracle(string memory json, string memory at, string memory key) internal returns (address) {
        address pool = json.readAddress(string.concat(at, ".pool"));
        require(pool != address(0), string.concat("no pool for ", key));
        return address(
            new TwapOracle(
                pool,
                json.readAddress(string.concat(at, ".collateralToken")),
                json.readAddress(string.concat(at, ".loanToken")),
                twapWindow
            )
        );
    }
}
