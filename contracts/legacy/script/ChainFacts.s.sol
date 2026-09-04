// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Addresses as A} from "../src/Addresses.sol";
import {IAggregatorV3, IStockToken, IUniswapV3Factory, IUniswapV3PoolMinimal} from "../src/interfaces/IExternal.sol";

/// @notice M0 discovery: answers the "verify first on the fork" list from the plan.
/// Run: forge script script/ChainFacts.s.sol --rpc-url robinhood -vv
contract ChainFacts is Script {
    struct Stock {
        string sym;
        address token;
        address feed;
    }

    function run() external view {
        console2.log("block", block.number, "ts", block.timestamp);

        // 1. USDG / WETH metadata
        _erc20("USDG", A.USDG);
        _erc20("WETH", A.WETH);

        Stock[5] memory stocks = [
            Stock("NVDA", A.NVDA, A.FEED_NVDA),
            Stock("TSLA", A.TSLA, A.FEED_TSLA),
            Stock("SPY", A.SPY, A.FEED_SPY),
            Stock("AAPL", A.AAPL, A.FEED_AAPL),
            Stock("HIMS", A.HIMS, address(0))
        ];

        for (uint256 i = 0; i < stocks.length; i++) {
            Stock memory s = stocks[i];
            console2.log("==============", s.sym);
            _erc20(s.sym, s.token);
            _stockExtras(s.token);
            if (s.feed != address(0)) _feed(s.sym, s.feed);
            _pools(s.token);
        }

        console2.log("============== ETH/USD feed");
        _feed("ETH", A.FEED_ETH);

        console2.log("============== v3 factory code size", A.UNI_V3_FACTORY.code.length);
        console2.log("USDG/WETH pools:");
        _poolsPair(A.USDG, A.WETH);
    }

    function _erc20(string memory sym, address t) internal view {
        IERC20Metadata m = IERC20Metadata(t);
        console2.log(sym, "decimals", m.decimals());
        console2.log(sym, "totalSupply", m.totalSupply());
        console2.log(sym, "symbol", m.symbol());
    }

    function _stockExtras(address t) internal view {
        (bool ok, bytes memory d) = t.staticcall(abi.encodeWithSelector(IStockToken.uiMultiplier.selector));
        if (ok && d.length >= 32) console2.log("uiMultiplier", abi.decode(d, (uint256)));
        else console2.log("uiMultiplier: call failed");
        (ok, d) = t.staticcall(abi.encodeWithSelector(IStockToken.oraclePaused.selector));
        if (ok && d.length >= 32) console2.log("oraclePaused", abi.decode(d, (bool)));
        else console2.log("oraclePaused: call failed");
        (ok, d) = t.staticcall(abi.encodeWithSelector(IStockToken.newUIMultiplier.selector));
        if (ok && d.length >= 32) console2.log("newUIMultiplier", abi.decode(d, (uint256)));
        (ok, d) = t.staticcall(abi.encodeWithSelector(IStockToken.effectiveAt.selector));
        if (ok && d.length >= 32) console2.log("effectiveAt", abi.decode(d, (uint256)));
    }

    function _feed(string memory sym, address f) internal view {
        IAggregatorV3 feed = IAggregatorV3(f);
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        console2.log(sym, "feed decimals", feed.decimals());
        console2.log(sym, "feed answer", uint256(answer));
        console2.log(sym, "feed updatedAt", updatedAt);
        console2.log(sym, "feed age (s)", block.timestamp - updatedAt);
        (bool ok, bytes memory d) = f.staticcall(abi.encodeWithSelector(IAggregatorV3.aggregator.selector));
        if (ok && d.length >= 32) console2.log(sym, "feed aggregator", abi.decode(d, (address)));
        (ok, d) = f.staticcall(abi.encodeWithSelector(IAggregatorV3.description.selector));
        if (ok) console2.log(sym, "feed description", abi.decode(d, (string)));
    }

    function _pools(address t) internal view {
        console2.log("pools vs WETH:");
        _poolsPair(t, A.WETH);
        console2.log("pools vs USDG:");
        _poolsPair(t, A.USDG);
    }

    function _poolsPair(address a, address b) internal view {
        if (A.UNI_V3_FACTORY.code.length == 0) {
            console2.log("  (no v3 factory code)");
            return;
        }
        uint24[4] memory fees = [uint24(100), 500, 3000, 10000];
        for (uint256 i = 0; i < fees.length; i++) {
            (bool ok, bytes memory d) = A.UNI_V3_FACTORY.staticcall(
                abi.encodeWithSelector(IUniswapV3Factory.getPool.selector, a, b, fees[i])
            );
            if (!ok || d.length < 32) {
                console2.log("  fee", fees[i], "getPool failed");
                continue;
            }
            address p = abi.decode(d, (address));
            if (p == address(0)) continue;
            IUniswapV3PoolMinimal pool = IUniswapV3PoolMinimal(p);
            (,,, uint16 card, uint16 cardNext,,) = pool.slot0();
            console2.log("  fee", fees[i], "pool", p);
            console2.log("    liquidity", pool.liquidity());
            console2.log("    obsCardinality", card, "next", cardNext);
        }
    }
}
