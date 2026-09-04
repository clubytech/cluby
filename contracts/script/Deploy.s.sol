// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {Market} from "../src/Market.sol";
import {KinkedIRM} from "../src/KinkedIRM.sol";
import {StockOracle} from "../src/StockOracle.sol";
import {Lens} from "../src/periphery/Lens.sol";
import {ShortRouter} from "../src/periphery/ShortRouter.sol";
import {FlashLiquidator} from "../src/periphery/FlashLiquidator.sol";
import {Id, MarketParams, RiskParams} from "../src/interfaces/IMarket.sol";
import {IAggregatorV3, ISwapRouter02} from "../src/interfaces/IExternal.sol";
import {Addresses as A} from "../src/Addresses.sol";

/// @notice Canary deployment: whole stack + two markets (NVDA, SPY) with tiny caps.
///
/// Dry run:   forge script script/Deploy.s.sol --rpc-url robinhood -vvvv
/// Broadcast: forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --private-key "$PK"
/// Env: ADMIN (final admin, e.g. Safe; defaults to deployer), KEEPER (flash liquidator owner + cap manager),
///      FEE_RECIPIENT (defaults to ADMIN), CANARY_CAP (stock wei, default 1e18).
contract Deploy is Script {
    struct Out {
        Market market;
        KinkedIRM irm;
        StockOracle oracle;
        Lens lens;
        ShortRouter router;
        FlashLiquidator flash;
        Id nvdaId;
        Id spyId;
    }

    address constant NVDA_USDG_500 = 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3;
    address constant SPY_USDG_500 = 0xa7Bb1AC63BBaB0C44316E6c8C455213441689167;

    function run() external returns (Out memory o) {
        address deployer = msg.sender;
        address admin = vm.envOr("ADMIN", deployer);
        address keeper = vm.envOr("KEEPER", deployer);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", admin);
        uint128 cap = uint128(vm.envOr("CANARY_CAP", uint256(1e18)));

        vm.startBroadcast();

        // Deployer keeps admin during wiring, hands over at the end.
        o.irm = new KinkedIRM(deployer, KinkedIRM.Curve({baseApr: 0.02e18, kinkApr: 0.12e18, maxApr: 1.5e18, kink: 0.8e18}));
        o.oracle = new StockOracle(deployer);
        o.market = new Market(deployer, feeRecipient);
        o.lens = new Lens(o.market);
        o.router = new ShortRouter(o.market, ISwapRouter02(A.UNI_V3_SWAP_ROUTER02));
        o.flash = new FlashLiquidator(o.market, ISwapRouter02(A.UNI_V3_SWAP_ROUTER02), keeper);

        o.oracle.setConfig(A.NVDA, A.USDG, _cfg(A.FEED_NVDA, NVDA_USDG_500));
        o.oracle.setConfig(A.SPY, A.USDG, _cfg(A.FEED_SPY, SPY_USDG_500));

        o.nvdaId = o.market.createMarket(
            MarketParams({stock: A.NVDA, collateral: A.USDG, oracle: address(o.oracle), irm: address(o.irm)}),
            RiskParams({initialMarginBps: 15_000, liqThresholdBps: 12_000, liqBonusBps: 500, borrowCap: cap, flags: 0}),
            1_500
        );
        o.spyId = o.market.createMarket(
            MarketParams({stock: A.SPY, collateral: A.USDG, oracle: address(o.oracle), irm: address(o.irm)}),
            RiskParams({initialMarginBps: 12_500, liqThresholdBps: 11_000, liqBonusBps: 300, borrowCap: cap, flags: 0}),
            1_500
        );

        // Roles: keeper manages caps; admin gets everything; deployer renounces if different.
        o.market.grantRole(o.market.CAP_MANAGER_ROLE(), keeper);
        if (admin != deployer) {
            o.market.grantRole(o.market.DEFAULT_ADMIN_ROLE(), admin);
            o.market.grantRole(o.market.RISK_ROLE(), admin);
            o.market.grantRole(o.market.GUARDIAN_ROLE(), admin);
            o.market.renounceRole(o.market.RISK_ROLE(), deployer);
            o.market.renounceRole(o.market.GUARDIAN_ROLE(), deployer);
            o.market.renounceRole(o.market.CAP_MANAGER_ROLE(), deployer);
            o.market.renounceRole(o.market.DEFAULT_ADMIN_ROLE(), deployer);
            o.irm.transferOwnership(admin); // 2-step: admin must accept
            o.oracle.transferOwnership(admin);
        }
        vm.stopBroadcast();

        console2.log("Market         ", address(o.market));
        console2.log("KinkedIRM      ", address(o.irm));
        console2.log("StockOracle    ", address(o.oracle));
        console2.log("Lens           ", address(o.lens));
        console2.log("ShortRouter    ", address(o.router));
        console2.log("FlashLiquidator", address(o.flash));
        console2.log("NVDA market id ");
        console2.logBytes32(Id.unwrap(o.nvdaId));
        console2.log("SPY market id  ");
        console2.logBytes32(Id.unwrap(o.spyId));
    }

    function _cfg(address feed, address pool) internal pure returns (StockOracle.Cfg memory) {
        return StockOracle.Cfg({
            feed: IAggregatorV3(feed),
            softAge: 2 hours,
            hardAge: 5 days,
            v3Pool: pool,
            twapWindow: 30 minutes,
            multiplierGuard: true,
            feedScale: 0
        });
    }
}
