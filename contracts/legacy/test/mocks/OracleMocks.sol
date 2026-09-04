// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockFeed {
    uint8 public decimals;
    int256 public answer;
    uint256 public updatedAt;
    bool public shouldRevert;

    constructor(uint8 d) {
        decimals = d;
    }

    function set(int256 a, uint256 t) external {
        answer = a;
        updatedAt = t;
    }

    function setRevert(bool v) external {
        shouldRevert = v;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        require(!shouldRevert, "feed down");
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

/// @dev Minimal v3 pool: constant tick over the whole window.
contract MockV3Pool {
    address public token0;
    address public token1;
    uint128 public liquidity = 1;
    int24 public tick;
    bool public observeReverts;

    constructor(address t0, address t1) {
        token0 = t0;
        token1 = t1;
    }

    function setTick(int24 t) external {
        tick = t;
    }

    function setLiquidity(uint128 l) external {
        liquidity = l;
    }

    function setObserveReverts(bool v) external {
        observeReverts = v;
    }

    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory c, uint160[] memory s) {
        require(!observeReverts, "OLD");
        c = new int56[](secondsAgos.length);
        s = new uint160[](secondsAgos.length);
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            // cumulative = tick * (now - secondsAgo)
            c[i] = int56(tick) * int56(int256(block.timestamp) - int256(uint256(secondsAgos[i])));
        }
    }
}
