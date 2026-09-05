// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IMorpho, IOracle, Id, MarketParams, Market} from "../../src/interfaces/IMorpho.sol";
import {IUniswapV3PoolMinimal} from "../../src/interfaces/IExternal.sol";

interface IObs {
    function observations(uint256 i)
        external view returns (uint32 ts, int56 tickCum, uint160 splCum, bool init);
}
interface IFactory { function getPool(address, address, uint24) external view returns (address); }
interface IVault {
    function config(Id) external view returns (uint184 cap, bool enabled, uint64 removableAt);
    function supplyQueueLength() external view returns (uint256);
    function supplyQueue(uint256) external view returns (Id);
    function totalAssets() external view returns (uint256);
}
interface ITwapish { function window() external view returns (uint32); function pool() external view returns (address); }

/// @notice ADVERSARIAL measurement pass. Read-only; asserts nothing, prints the numbers each
/// finding's severity depends on.
contract EconRefuteForkTest is Test {
    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    address constant FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address constant VAULT = 0x97e813828B0250dCa5c05FF2567dfD616E5b3C61;

    function setUp() public {
        vm.skip(bytes(vm.envOr("ROBINHOOD_RPC_URL", string(""))).length == 0);
    }

    // ---- what is actually at risk on every deployed market -------------------------------
    function test_measure_marketExposure() public view {
        string[17] memory keys = ["NVDA","SPY","AAPL","TSLA","ETH","HIMS","SPCX","PONS","CASHCAT","MSFT","GOOGL","AMZN","META","QQQ","SGOV","NVDA-SHORT","TSLA-SHORT"];
        bytes32[17] memory ids = [
            bytes32(0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826),
            0xf95832e36d9d8baf35eb78ce80cbed92d20198ba639659b3f9a2ab00ced0a0c1,
            0x349f46c4c49ff76074e27a21fe49fd86511b06c764a6d46589ced02a40dc40d2,
            0xf7e15b56bbb99e7b600032a4285e34b59953cbc42361367407f3c5966fd54478,
            0x6722f53f25a8d6e73493893c4f7f80ddc535cf97c4a93116fd55296e714216ae,
            0xf9566d437f9ad34df3084aea5866d2765d5afb519b619ec3b9b2c2c4c1221bc8,
            0xba5b95d86b3220d2ac264d30575e53d647472629d8febc117f4155666961b40c,
            0x802aecb45c6701afc9dc8bfc46c94fdf113f96bf220444907155b1bdaa80c7b3,
            0xb32df78a9ad7f3d6dfe451833567288493a8d6d1551fec18b0554a0759b253f8,
            0x7460c76e24436a2a187be2c584cdc84c01b6014e7704fb414744e4ce0456ca9d,
            0x35bc0628f10ba7e29cda1787ad9af465092b112ef409ab0dad857c4f53341c61,
            0x7e375e21ade5caf251eef3e820bf8eda0e08f1378fe4aaedad7ead437be3e0e1,
            0x52a696df717bed55532a0cb16490cbe45b23f44e0bf4a4761968c9aa43fc4377,
            0xdcb03716ad496e58390fb5c5d8b1f0a196f0b923482f17a3c231390a39e9fb67,
            0xb416b784f4925f4885ca1fa7d4a1469a10f300d6525bbe23411d62f711d991cc,
            0xfa02b9d58bb338ea1ac14d89c2586683bf7c209b60073662a7c0dfaa72078be1,
            0xdfc64ba716c6b04aed5d182b87f218da60908bf17129cabef0ffc9bffe65acc2
        ];
        console2.log("vault totalAssets (USDG raw)", IVault(VAULT).totalAssets());
        for (uint256 i; i < 17; ++i) {
            Id id = Id.wrap(ids[i]);
            Market memory m = MORPHO.market(id);
            (uint184 cap, bool enabled,) = IVault(VAULT).config(id);
            console2.log(keys[i]);
            console2.log("   supplyAssets", m.totalSupplyAssets);
            console2.log("   borrowAssets", m.totalBorrowAssets);
            console2.log("   vaultCap", uint256(cap));
            console2.log("   vaultEnabled", enabled);
        }
    }

    // ---- F1: how hard is it really to roll these rings? ----------------------------------
    function test_measure_twapPools() public view {
        address[3] memory pools = [
            0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64,
            0x7A192E71564ec66eE0763e328a3Ac274942dE4e1,
            0x4B0c312fFbB068F6a0bEa128759E35d94B94D0E1
        ];
        string[3] memory names = ["HIMS", "PONS", "CASHCAT"];
        for (uint256 i; i < 3; ++i) {
            IUniswapV3PoolMinimal p = IUniswapV3PoolMinimal(pools[i]);
            (uint160 sq,, uint16 idx, uint16 card, uint16 cardNext,,) = p.slot0();
            (uint32 oldest,,, bool init) = IObs(pools[i]).observations((idx + 1) % card);
            if (!init) (oldest,,,) = IObs(pools[i]).observations(0);
            uint256 span = block.timestamp - oldest;
            uint128 L = p.liquidity();
            console2.log(names[i]);
            console2.log("   fee", p.fee());
            console2.log("   cardinality / next", card, cardNext);
            console2.log("   buffered history (s)", span);
            console2.log("   avg s per observation x1000", (span * 1000) / card);
            console2.log("   liquidity", uint256(L));
            console2.log("   sqrtPriceX96", uint256(sq));
            // notional (token1 raw) to move sqrtP by 1 tick == 0.005%: L * sqrtP * 5e-5 / 2^96
            uint256 amt1 = (uint256(L) * uint256(sq) / (1 << 96)) / 20000;
            console2.log("   token1 raw in to move 1 tick", amt1);
            console2.log("   fee paid on that swap (token1 raw)", amt1 * p.fee() / 1e6);
            console2.log("   token0", p.token0());
            console2.log("   token1", p.token1());
        }
    }

    // Can the buffer be grown permissionlessly, without recreating the market?
    function test_measure_cardinalityCanBeGrown() public {
        address pool = 0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64;
        address anyone = makeAddr("anyone");
        vm.startPrank(anyone);
        uint256 g0 = gasleft();
        IUniswapV3PoolMinimal(pool).increaseObservationCardinalityNext(18000);
        console2.log("gas to grow HIMS ring 360 -> 18000", g0 - gasleft());
        vm.stopPrank();
        (,,,, uint16 next,,) = IUniswapV3PoolMinimal(pool).slot0();
        console2.log("cardinalityNext now", next);
    }

    // ---- F4: do the TSLA/USDG tiers the keeper and the config point at both exist? --------
    function test_measure_tslaPools() public view {
        uint24[4] memory fees = [uint24(100), 500, 3000, 10000];
        for (uint256 i; i < 4; ++i) {
            address pool = IFactory(FACTORY).getPool(TSLA, USDG, fees[i]);
            console2.log("fee", fees[i]);
            console2.log("   pool", pool);
            if (pool != address(0)) console2.log("   liquidity", uint256(IUniswapV3PoolMinimal(pool).liquidity()));
        }
    }

    // ---- block time, measured, not assumed ------------------------------------------------
    function test_measure_blockTime() public view {
        console2.log("block.number", block.number);
        console2.log("block.timestamp", block.timestamp);
    }

    // ---- which oracle does HIMS actually use, and with what window? -----------------------
    function test_measure_himsOracle() public view {
        address o = 0x13Ed9699E98B15a1AEA6B09B043b29D3C89457Cd;
        console2.log("HIMS market oracle price", IOracle(o).price());
        (bool ok, bytes memory d) = o.staticcall(abi.encodeWithSignature("window()"));
        console2.log("has window()", ok);
        if (ok) console2.log("   window", abi.decode(d, (uint32)));
        (bool ok2, bytes memory d2) = o.staticcall(abi.encodeWithSignature("pool()"));
        if (ok2) console2.log("   pool", abi.decode(d2, (address)));
    }
}
