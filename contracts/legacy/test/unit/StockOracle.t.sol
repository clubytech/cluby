// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {StockOracle} from "../../src/StockOracle.sol";
import {IAggregatorV3} from "../../src/interfaces/IExternal.sol";
import {MockERC20} from "../mocks/Mocks.sol";
import {MockFeed, MockV3Pool} from "../mocks/OracleMocks.sol";

contract StockOracleTest is Test {
    StockOracle oracle;
    MockERC20 stock;
    MockERC20 usdg;
    MockFeed feed;
    MockV3Pool pool;

    uint32 constant SOFT = 2 hours;
    uint32 constant HARD = 5 days;

    function setUp() public {
        vm.warp(10 days);
        oracle = new StockOracle(address(this));
        stock = new MockERC20("NVDA", "NVDA", 18);
        usdg = new MockERC20("USDG", "USDG", 6);
        feed = new MockFeed(8);
        // make stock token0 deterministically
        (address t0, address t1) = address(stock) < address(usdg) ? (address(stock), address(usdg)) : (address(usdg), address(stock));
        pool = new MockV3Pool(t0, t1);
        _configure(address(feed), address(pool));
    }

    function _configure(address f, address p) internal {
        oracle.setConfig(
            address(stock),
            address(usdg),
            StockOracle.Cfg({
                feed: IAggregatorV3(f),
                softAge: SOFT,
                hardAge: HARD,
                v3Pool: p,
                twapWindow: 30 minutes,
                multiplierGuard: true,
                feedScale: 0
            })
        );
    }

    /// @dev tick for a given USD price when stock is token0 and usdg token1 (6 dec):
    /// ratio = price * 1e6 / 1e18; we pick ticks and compute expectations from the same ratio instead.
    function test_feedScale_and_price() public {
        // $200.00 -> 1e36 scaled USDG-wei per stock-wei = 200e6*1e36/1e18 = 200e24
        feed.set(200e8, block.timestamp);
        pool.setLiquidity(0); // twap unavailable
        assertEq(oracle.config(address(stock)).feedScale, 1e16);
        assertEq(oracle.price(address(stock)), 200e24);
    }

    function test_twap_tickZero_isOne() public {
        feed.setRevert(true);
        pool.setTick(0);
        // token1 per token0 == 1 => 1e36 regardless of orientation
        assertEq(oracle.price(address(stock)), 1e36);
    }

    function test_twap_knownTick() public {
        feed.setRevert(true);
        // tick -276324 ~ ratio 1e-12  (1.0001^-276324)
        pool.setTick(-276324);
        uint256 p = oracle.price(address(stock));
        bool stockIs0 = pool.token0() == address(stock);
        uint256 expected = stockIs0 ? 1e24 : 1e48; // 1e-12 * 1e36 or its inverse
        assertApproxEqRel(p, expected, 2e15); // 0.2%
    }

    function test_maxRule() public {
        feed.set(200e8, block.timestamp);
        pool.setTick(0); // 1e36 >> 200e24
        assertEq(oracle.price(address(stock)), 1e36);
        pool.setLiquidity(0);
        assertEq(oracle.price(address(stock)), 200e24);
    }

    function test_feedStale_softVsHard() public {
        pool.setLiquidity(0);
        feed.set(200e8, block.timestamp - SOFT - 1);
        StockOracle.Quote memory q = oracle.quote(address(stock));
        assertFalse(q.feedFresh);
        assertTrue(q.feedValid);
        assertEq(oracle.price(address(stock)), 200e24);

        feed.set(200e8, block.timestamp - HARD - 1);
        q = oracle.quote(address(stock));
        assertFalse(q.feedValid);
        vm.expectRevert(abi.encodeWithSelector(StockOracle.NoPrice.selector, address(stock)));
        oracle.price(address(stock));
    }

    function test_feedStale_twapTakesOver() public {
        feed.set(200e8, block.timestamp - HARD - 1);
        pool.setTick(0);
        assertEq(oracle.price(address(stock)), 1e36);
    }

    function test_twapUnavailable_whenObserveReverts() public {
        feed.set(200e8, block.timestamp);
        pool.setObserveReverts(true);
        StockOracle.Quote memory q = oracle.quote(address(stock));
        assertFalse(q.twapValid);
        assertEq(oracle.price(address(stock)), 200e24);
    }

    function test_bothDead_reverts() public {
        feed.setRevert(true);
        pool.setLiquidity(0);
        vm.expectRevert(abi.encodeWithSelector(StockOracle.NoPrice.selector, address(stock)));
        oracle.price(address(stock));
    }

    function test_negativeAnswer_ignored() public {
        feed.set(-1, block.timestamp);
        pool.setTick(0);
        assertEq(oracle.price(address(stock)), 1e36);
    }

    function test_multiplierGuard() public {
        feed.set(200e8, block.timestamp);
        stock.setOraclePaused(true);
        vm.expectRevert(abi.encodeWithSelector(StockOracle.CorporateAction.selector, address(stock)));
        oracle.price(address(stock));
        // quote() still works for the UI
        oracle.quote(address(stock));
    }

    function test_sequencerDown() public {
        feed.set(200e8, block.timestamp);
        pool.setLiquidity(0);
        MockFeed seq = new MockFeed(0);
        oracle.setSequencerFeed(address(seq), 1 hours);
        seq.set(1, block.timestamp - 2 hours); // down
        vm.expectRevert(StockOracle.SequencerDown.selector);
        oracle.price(address(stock));
        seq.set(0, block.timestamp - 10 minutes); // up but inside grace
        vm.expectRevert(StockOracle.SequencerDown.selector);
        oracle.price(address(stock));
        seq.set(0, block.timestamp - 2 hours);
        assertEq(oracle.price(address(stock)), 200e24);
    }

    function test_notConfigured() public {
        vm.expectRevert(abi.encodeWithSelector(StockOracle.NotConfigured.selector, address(1)));
        oracle.price(address(1));
    }

    function test_badConfig() public {
        StockOracle.Cfg memory c = oracle.config(address(stock));
        c.hardAge = 0;
        vm.expectRevert(StockOracle.BadConfig.selector);
        oracle.setConfig(address(stock), address(usdg), c);
        c.hardAge = HARD;
        c.twapWindow = 1;
        vm.expectRevert(StockOracle.BadConfig.selector);
        oracle.setConfig(address(stock), address(usdg), c);
    }

    function test_poolMismatch() public {
        MockV3Pool other = new MockV3Pool(address(1), address(2));
        StockOracle.Cfg memory c = oracle.config(address(stock));
        c.v3Pool = address(other);
        vm.expectRevert(StockOracle.PoolMismatch.selector);
        oracle.setConfig(address(stock), address(usdg), c);
    }
}
