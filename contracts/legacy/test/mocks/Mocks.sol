// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Id, IIrm, IStockOracle, IMarketLiquidateCallback} from "../../src/interfaces/IMarket.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is ERC20 {
    uint8 internal immutable _dec;
    bool public oraclePaused;
    uint256 public uiMultiplier = 1e18;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function setOraclePaused(bool v) external {
        oraclePaused = v;
    }
}

contract MockOracle is IStockOracle {
    mapping(address => uint256) public prices;
    bool public shouldRevert;

    function set(address stock, uint256 p) external {
        prices[stock] = p;
    }

    function setRevert(bool v) external {
        shouldRevert = v;
    }

    function price(address stock) external view returns (uint256) {
        require(!shouldRevert, "oracle down");
        return prices[stock];
    }
}

/// @dev Fixed per-second rate regardless of utilization, for exact accrual math in tests.
contract MockIrm is IIrm {
    uint256 public rate;

    function set(uint256 r) external {
        rate = r;
    }

    function borrowRate(Id, uint256) external view returns (uint256) {
        return rate;
    }
}

/// @dev Liquidator that uses the callback to source the stock only after receiving collateral.
contract MockFlashLiquidator is IMarketLiquidateCallback {
    address public market;
    IERC20 public stock;
    address public stockSource;

    constructor(address market_, address stock_, address source) {
        market = market_;
        stock = IERC20(stock_);
        stockSource = source;
        IERC20(stock_).approve(market_, type(uint256).max);
    }

    function onMarketLiquidate(uint256 repaidAssets, bytes calldata) external {
        require(msg.sender == market, "not market");
        // "buy" the stock: pull from the pre-approved source
        stock.transferFrom(stockSource, address(this), repaidAssets);
    }
}
