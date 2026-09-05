// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3PoolMinimal, ISwapRouter02} from "../../src/interfaces/IExternal.sol";

/// @notice Adversarial check on F1's arithmetic. Uniswap v3 dedupes observation writes on
/// `uint32(block.timestamp)` — SECONDS — not on block number. If that is so, the ring can be rolled
/// at most one slot per SECOND no matter how fast the chain produces blocks, and the slots a
/// `window`-second TWAP needs is `window`, not `window / blockTime`.
contract EconRefuteRingForkTest is Test {
    address constant ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant HIMS = 0xCceE82fE024c36fA15E1005edE3E9e4787e23D09;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    IUniswapV3PoolMinimal constant POOL = IUniswapV3PoolMinimal(0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64);

    address attacker = makeAddr("ring-attacker");

    function setUp() public {
        vm.skip(bytes(vm.envOr("ROBINHOOD_RPC_URL", string(""))).length == 0);
    }

    function _swap(address tin, address tout, uint256 amt) internal returns (uint256) {
        vm.startPrank(attacker);
        IERC20(tin).approve(ROUTER, type(uint256).max);
        uint256 out = ISwapRouter02(ROUTER).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tin, tokenOut: tout, fee: POOL.fee(), recipient: attacker,
                amountIn: amt, amountOutMinimum: 0, sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();
        return out;
    }

    /// A ring slot costs one SECOND, not one block: two tick-moving swaps in two different blocks
    /// that share a timestamp advance the ring by one slot, not two.
    function test_ringAdvancesOncePerSecondNotOncePerBlock() public {
        deal(HIMS, attacker, 100_000e18);
        deal(USDG, attacker, 5_000_000e6);

        (, int24 t0,, uint16 card,,,) = POOL.slot0();
        (,, uint16 i0,,,,) = POOL.slot0();
        console2.log("cardinality", card);
        console2.log("start index", i0);

        _swap(HIMS, USDG, 2_000e18);
        (, int24 t1, uint16 i1,,,,) = POOL.slot0();
        console2.log("after swap 1: index", i1);
        console2.log("   tick moved", t0 != t1);

        // A brand-new block. Same second.
        vm.roll(block.number + 1);
        _swap(HIMS, USDG, 2_000e18);
        (, int24 t2, uint16 i2,,,,) = POOL.slot0();
        console2.log("after swap 2 (new block, same second): index", i2);
        console2.log("   tick moved again", t1 != t2);

        // A new second.
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);
        _swap(HIMS, USDG, 2_000e18);
        (,, uint16 i3,,,,) = POOL.slot0();
        console2.log("after swap 3 (new second): index", i3);

        assertEq(i2, i1, "ring advanced twice inside one second -- F1's block-rate arithmetic would stand");
        assertEq(i3, (i1 + 1) % card, "ring did not advance on a new second");
    }

    function probe(address pool, address tok, uint256 amt) external returns (bool) {
        (, int24 before,,,,,) = IUniswapV3PoolMinimal(pool).slot0();
        vm.startPrank(attacker);
        IERC20(USDG).approve(ROUTER, type(uint256).max);
        ISwapRouter02(ROUTER).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: USDG, tokenOut: tok, fee: IUniswapV3PoolMinimal(pool).fee(), recipient: attacker,
                amountIn: amt, amountOutMinimum: 0, sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();
        (, int24 aft,,,,,) = IUniswapV3PoolMinimal(pool).slot0();
        return before != aft;
    }
}
