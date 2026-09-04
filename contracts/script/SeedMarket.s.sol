// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IMorpho, IOracle, Id, MarketParams, MarketParamsLib} from "../src/interfaces/IMorpho.sol";
import {Lens} from "../src/periphery/Lens.sol";

/// @notice Moves real money: supplies the loan asset into a market, and optionally posts collateral
/// and draws a loan against it. Kept as a separate script from the deploys on purpose — deploying
/// contracts costs gas, this costs principal.
///
///   MARKET=NVDA SUPPLY=100000000 \
///   FOUNDRY_PROFILE=deploy forge script script/SeedMarket.s.sol \
///     --rpc-url robinhood --private-key $PRIVATE_KEY --broadcast
///
/// SUPPLY is in loan-token units (USDG has 6 decimals, so 100000000 = $100).
/// Add COLLATERAL and BORROW to open a position in the same run; both are optional and both are
/// checked against the safe cap before anything is signed.
contract SeedMarket is Script {
    using stdJson for string;
    using MarketParamsLib for MarketParams;

    function run() external {
        string memory json = vm.readFile("config/markets.json");
        IMorpho morpho = IMorpho(json.readAddress(".morpho.blue"));
        string memory key = vm.envString("MARKET");

        MarketParams memory params = _paramsFor(json, morpho, key);
        Lens lens = Lens(vm.envAddress("LENS"));

        uint256 supplyAmount = vm.envOr("SUPPLY", uint256(0));
        uint256 collateralAmount = vm.envOr("COLLATERAL", uint256(0));
        uint256 borrowAmount = vm.envOr("BORROW", uint256(0));

        address me = msg.sender;
        console2.log("market", key);
        console2.log("oracle price", IOracle(params.oracle).price());

        vm.startBroadcast();

        if (supplyAmount > 0) {
            IERC20(params.loanToken).approve(address(morpho), supplyAmount);
            morpho.supply(params, supplyAmount, 0, me, "");
            console2.log("supplied", supplyAmount);
        }

        if (collateralAmount > 0) {
            IERC20(params.collateralToken).approve(address(morpho), collateralAmount);
            morpho.supplyCollateral(params, collateralAmount, me, "");
            console2.log("collateral posted", collateralAmount);
        }

        if (borrowAmount > 0) {
            // The safe cap, not the liquidation line: five points of room is the difference between
            // a position that survives an ordinary day and one that does not.
            uint256 safeCap = lens.userView(params, me, 0.05e18).safeBorrowAssets;
            require(borrowAmount <= safeCap, "borrow exceeds the safe cap");
            morpho.borrow(params, borrowAmount, 0, me, me);
            console2.log("borrowed", borrowAmount, "of a safe cap of", safeCap);
        }

        vm.stopBroadcast();

        Lens.UserView memory u = lens.userView(params, me, 0.05e18);
        console2.log("collateral value", u.collateralValue);
        console2.log("debt            ", u.borrowAssets);
        console2.log("health factor   ", u.healthFactorWad);
        console2.log("liquidation price", u.liquidationPrice);
    }

    function _paramsFor(string memory json, IMorpho morpho, string memory key)
        internal
        view
        returns (MarketParams memory)
    {
        uint256 count = json.readUint(".marketCount");
        for (uint256 i; i < count; ++i) {
            string memory at = string.concat(".markets[", vm.toString(i), "]");
            if (keccak256(bytes(json.readString(string.concat(at, ".key")))) != keccak256(bytes(key))) continue;

            // The oracle address is not in the catalog — it is chosen at deploy time — so the market
            // is looked up by its id from the deploy record instead.
            bytes32 id = vm.envBytes32("MARKET_ID");
            MarketParams memory p = morpho.idToMarketParams(Id.wrap(id));
            require(p.lltv != 0, "market not created");
            return p;
        }
        revert("market not in catalog");
    }
}
