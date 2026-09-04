// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {
    IMorpho,
    IMorphoFlashLoanCallback,
    IMorphoLiquidateCallback,
    MarketParams
} from "../interfaces/IMorpho.sol";
import {ISwapRouter02} from "../interfaces/IExternal.sol";

/// @title FlashLiquidator
/// @notice Liquidates an unhealthy Morpho position without any capital of its own: borrow the debt
/// from Morpho for the length of the transaction, repay the borrower's loan, take their collateral,
/// sell it, return the flash loan, keep the difference.
///
/// @dev Two properties matter more than the flow itself.
///
/// The contract holds nothing between transactions. Every path ends with the profit swept to the
/// owner, so there is no balance for a bug in it to lose. That is what lets it be small.
///
/// And it is not the only liquidator. Morpho's liquidation is open to anyone, and it must stay
/// that way — this contract exists so that liquidations happen promptly at a good price, not so
/// that they happen exclusively here. If it is broken or offline, the market still clears.
contract FlashLiquidator is IMorphoFlashLoanCallback, IMorphoLiquidateCallback, Ownable2Step {
    using SafeERC20 for IERC20;

    IMorpho public immutable morpho;
    ISwapRouter02 public immutable router;

    /// @dev Addresses allowed to trigger a liquidation. The profit always goes to the owner, so a
    /// keeper key that leaks cannot steal — but it could burn gas, so it is still gated.
    mapping(address => bool) public keepers;

    struct LiquidateParams {
        MarketParams marketParams;
        address borrower;
        uint256 seizedAssets;
        uint256 repaidShares;
        /// @dev Pool fee tier for the collateral → loan-token swap.
        uint24 swapFee;
        /// @dev Floor on the swap output. Derived from the oracle price by the caller, so a pool
        /// that has been pushed away from the market makes this revert instead of selling into it.
        uint256 minAmountOut;
    }

    event Liquidated(
        address indexed borrower, address indexed collateral, uint256 seizedAssets, uint256 repaidAssets, uint256 profit
    );
    event KeeperSet(address indexed keeper, bool allowed);

    error NotKeeper();
    error NotMorpho();
    error NoProfit(uint256 received, uint256 owed);

    constructor(address _morpho, address _router, address _owner) Ownable(_owner) {
        morpho = IMorpho(_morpho);
        router = ISwapRouter02(_router);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        keepers[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    /// @notice Liquidate `borrower`, funding the repayment with a Morpho flash loan.
    /// @dev `seizedAssets` and `repaidShares` are exclusive in Morpho: pass one, leave the other 0.
    function liquidate(LiquidateParams calldata p) external {
        if (!keepers[msg.sender] && msg.sender != owner()) revert NotKeeper();

        // The flash loan has to cover the repayment. Seizing by collateral amount means the debt
        // repaid is only known inside the callback, so borrow against the seized value at the
        // oracle price and return whatever is left in the same transaction.
        uint256 loanAmount = p.minAmountOut;
        morpho.flashLoan(p.marketParams.loanToken, loanAmount, abi.encode(p, loanAmount));
    }

    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external {
        if (msg.sender != address(morpho)) revert NotMorpho();
        (LiquidateParams memory p,) = abi.decode(data, (LiquidateParams, uint256));

        IERC20 loanToken = IERC20(p.marketParams.loanToken);
        IERC20 collateral = IERC20(p.marketParams.collateralToken);

        loanToken.forceApprove(address(morpho), type(uint256).max);
        (uint256 seized, uint256 repaid) =
            morpho.liquidate(p.marketParams, p.borrower, p.seizedAssets, p.repaidShares, "");

        // Sell the seized collateral for the loan token. The floor comes from the oracle, so a
        // pool that has moved away from the market reverts the whole liquidation rather than
        // completing it at a price that hands the difference to whoever moved it.
        collateral.forceApprove(address(router), seized);
        uint256 received = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(collateral),
                tokenOut: address(loanToken),
                fee: p.swapFee,
                recipient: address(this),
                amountIn: seized,
                amountOutMinimum: p.minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        if (received < assets) revert NoProfit(received, assets);

        // Morpho pulls the flash loan back from this contract's balance after the callback.
        loanToken.forceApprove(address(morpho), assets);

        uint256 profit = loanToken.balanceOf(address(this)) - assets;
        if (profit > 0) loanToken.safeTransfer(owner(), profit);

        emit Liquidated(p.borrower, address(collateral), seized, repaid, profit);
    }

    /// @dev Unused: liquidation is funded by the flash loan, so no callback repayment is needed.
    /// Declared because Morpho will call it if `data` is non-empty, and a silent fallback would
    /// hide that.
    function onMorphoLiquidate(uint256, bytes calldata) external view {
        if (msg.sender != address(morpho)) revert NotMorpho();
    }

    /// @notice Sweep anything that lands here. Nothing should, and that is the point of having it.
    function sweep(address token) external onlyOwner {
        IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
    }
}
