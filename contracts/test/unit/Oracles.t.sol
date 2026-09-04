// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TwapOracle} from "../../src/oracles/TwapOracle.sol";
import {InverseOracle} from "../../src/oracles/InverseOracle.sol";
import {MinOracle} from "../../src/oracles/MinOracle.sol";
import {MockERC20, MockV3Pool, MockOracle} from "../mocks/Mocks.sol";

contract OraclesTest is Test {
    MockERC20 stock; // 18 decimals, the collateral
    MockERC20 usdg; // 6 decimals, the loan token
    MockV3Pool stockFirstPool; // stock = token0, the PONS/CASHCAT ordering
    MockV3Pool usdgFirstPool; // usdg = token0, the HIMS ordering
    TwapOracle oracle; // reads stockFirstPool

    uint32 constant WINDOW = 1800;

    function setUp() public {
        stock = new MockERC20("Stock", "STK", 18);
        usdg = new MockERC20("USDG", "USDG", 6);
        // Real pools order by address; the mock lets each ordering be tested directly, because
        // getting the inversion wrong is silent — the number still looks like a price.
        stockFirstPool = new MockV3Pool(address(stock), address(usdg));
        usdgFirstPool = new MockV3Pool(address(usdg), address(stock));
        oracle = new TwapOracle(address(stockFirstPool), address(stock), address(usdg), WINDOW);
    }

    /// Tick 0 is one raw token1 per raw token0. Morpho's price is defined on raw amounts, so that
    /// is exactly 1e36 — no decimal factor enters.
    function test_priceAtTickZero() public {
        stockFirstPool.setMeanTick(0, WINDOW);
        assertEq(oracle.price(), 1e36);
    }

    /// HIMS on the live chain: USDG is token0 and the pool's mean tick is +243140, which is
    /// $27.58 a share. On the 1e36 raw scale that is 27.58 · 1e6/1e18 · 1e36 ≈ 2.76e25.
    function test_priceWhenCollateralIsToken1() public {
        usdgFirstPool.setMeanTick(243140, WINDOW);
        TwapOracle o = new TwapOracle(address(usdgFirstPool), address(stock), address(usdg), WINDOW);
        assertApproxEqRel(o.price(), uint256(2.76e25), 0.01e18);
    }

    /// PONS: the token is token0 and the tick is negative. Same $0.75 answer from the other side.
    function test_priceWhenCollateralIsToken0() public {
        stockFirstPool.setMeanTick(-279159, WINDOW);
        assertApproxEqRel(oracle.price(), uint256(7.53e23), 0.02e18);
    }

    /// The two orderings are mirror images: a pool quoting the same market with the tokens swapped
    /// and the tick negated must report the same collateral price.
    function test_bothOrderingsAgree() public {
        stockFirstPool.setMeanTick(-243140, WINDOW);
        usdgFirstPool.setMeanTick(243140, WINDOW);
        TwapOracle a = oracle;
        TwapOracle b = new TwapOracle(address(usdgFirstPool), address(stock), address(usdg), WINDOW);
        assertApproxEqRel(a.price(), b.price(), 0.0001e18);
    }

    function test_rejectsShortWindow() public {
        vm.expectRevert(TwapOracle.WindowTooShort.selector);
        new TwapOracle(address(stockFirstPool), address(stock), address(usdg), 60);
    }

    function test_rejectsTokenNotInPool() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.expectRevert(TwapOracle.TokenNotInPool.selector);
        new TwapOracle(address(stockFirstPool), address(other), address(usdg), WINDOW);
    }

    /// A short market prices USDG in shares: the inverse of the long market's price.
    function test_inverseIsReciprocal() public {
        MockOracle source = new MockOracle(2.76e25);
        InverseOracle inverse = new InverseOracle(address(source));
        uint256 p = inverse.price();
        assertApproxEqRel(p, uint256(1e72) / uint256(2.76e25), 0.0001e18);
        // Inverting twice returns to where it started.
        MockOracle back = new MockOracle(p);
        assertApproxEqRel(new InverseOracle(address(back)).price(), uint256(2.76e25), 0.0001e18);
    }

    /// Collateral must take the LOWER of the two sources. Taking the higher would let a borrower
    /// draw more than the position is worth whenever one source lags.
    function test_minOracleTakesTheLowerPrice() public {
        MockOracle feed = new MockOracle(100e24);
        MockOracle twap = new MockOracle(80e24);
        MinOracle min = new MinOracle(address(feed), address(twap));
        assertEq(min.price(), 80e24);

        // Feed frozen high over a weekend while the DEX marks the gap down: the TWAP wins.
        twap.set(60e24);
        assertEq(min.price(), 60e24);

        // And when the feed is the lower of the two, it wins instead.
        feed.set(50e24);
        assertEq(min.price(), 50e24);
    }

    /// A short market's oracle prices USDG in shares. Pinning the magnitude matters because the
    /// wrong decimals give a number that is still shaped like a price: building the inner oracle
    /// with the short market's own decimals instead of the long ordering lands on 4.3e21 rather
    /// than 4.3e45, and nothing about it looks wrong until a position is opened against it.
    function test_shortOracleMagnitude() public {
        // NVDA at $231.4583: the long oracle on Morpho's raw scale, 18-decimal base, 6-decimal quote.
        MockOracle long = new MockOracle(231_458_300_000_000_000_000_000_000);
        uint256 shortPrice = new InverseOracle(address(long)).price();

        // One raw USDG (1e-6 USDG) buys 1e-6/231.4583 shares = 4.32e-9 shares = 4.32e9 raw NVDA,
        // so the price on the 1e36 scale is 4.32e45.
        assertApproxEqRel(shortPrice, uint256(4.32e45), 0.001e18);
    }

    function test_minOracleExposesBothLegs() public {
        MinOracle min = new MinOracle(address(new MockOracle(100e24)), address(new MockOracle(80e24)));
        (uint256 feedPrice, uint256 twapPrice) = min.prices();
        assertEq(feedPrice, 100e24);
        assertEq(twapPrice, 80e24);
    }
}
