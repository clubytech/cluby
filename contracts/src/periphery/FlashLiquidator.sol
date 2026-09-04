// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {Market} from "../Market.sol";
import {Id, MarketParams, IMarketLiquidateCallback} from "../interfaces/IMarket.sol";
import {ISwapRouter02} from "../interfaces/IExternal.sol";

/// @title FlashLiquidator
/// @notice Liquidates without inventory: receives the seized collateral first, buys the exact
/// amount of stock on Uniswap v3 inside the callback, repays, keeps the difference.
contract FlashLiquidator is IMarketLiquidateCallback, Ownable2Step {
    using SafeERC20 for IERC20;

    Market public immutable market;
    ISwapRouter02 public immutable swapRouter;

    /// @dev set for the duration of one liquidation
    MarketParams internal _active;
    uint24 internal _activeFee;

    event Liquidated(Id indexed id, address indexed borrower, uint256 repaid, uint256 seized, uint256 profit);

    error NotMarket();
    error ProfitBelowMin(uint256 profit, uint256 minProfit);

    constructor(Market market_, ISwapRouter02 swapRouter_, address owner_) Ownable(owner_) {
        market = market_;
        swapRouter = swapRouter_;
    }

    function liquidate(Id id, address borrower, uint256 repayShares, uint24 poolFee, uint256 minProfit)
        external
        onlyOwner
        returns (uint256 profit)
    {
        _active = market.idToParams(id);
        _activeFee = poolFee;
        uint256 before = IERC20(_active.collateral).balanceOf(address(this));
        (uint256 seized, uint256 repaid) = market.liquidate(id, borrower, repayShares, 0, abi.encode(poolFee));
        uint256 after_ = IERC20(_active.collateral).balanceOf(address(this));
        profit = after_ > before ? after_ - before : 0;
        if (profit < minProfit) revert ProfitBelowMin(profit, minProfit);
        delete _active;
        emit Liquidated(id, borrower, repaid, seized, profit);
    }

    /// @inheritdoc IMarketLiquidateCallback
    function onMarketLiquidate(uint256 repaidAssets, bytes calldata) external {
        if (msg.sender != address(market)) revert NotMarket();
        MarketParams memory p = _active;
        uint256 budget = IERC20(p.collateral).balanceOf(address(this));
        IERC20(p.collateral).forceApprove(address(swapRouter), budget);
        swapRouter.exactOutputSingle(
            ISwapRouter02.ExactOutputSingleParams({
                tokenIn: p.collateral,
                tokenOut: p.stock,
                fee: _activeFee,
                recipient: address(this),
                amountOut: repaidAssets,
                amountInMaximum: budget,
                sqrtPriceLimitX96: 0
            })
        );
        IERC20(p.collateral).forceApprove(address(swapRouter), 0);
        IERC20(p.stock).forceApprove(address(market), repaidAssets);
    }

    function sweep(address token, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
    }
}
