// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IMorpho, IMorphoFlashLoanCallback, MarketParams} from "../interfaces/IMorpho.sol";
import {ISwapRouter02} from "../interfaces/IExternal.sol";

/// @title LeverageRouter
/// @notice Opens and closes a leveraged position in one transaction, on a Morpho flash loan.
///
/// @dev Open: borrow the loan asset, swap it into collateral, supply the lot, borrow against it,
/// repay the flash loan. Close: borrow enough to clear the debt, repay, withdraw the collateral,
/// sell what is needed, return the flash loan, hand the rest back.
///
/// Three properties this contract is built around.
///
/// It holds nothing between transactions. Every path ends with the balance swept to the user, so
/// there is no float for a bug here to lose — the same reason the liquidator can be small.
///
/// It acts on the user's behalf through Morpho's own authorisation, not by holding their position.
/// The user calls `morpho.setAuthorization(router, true)` once; the collateral and the debt are
/// theirs throughout, and revoking that authorisation is enough to lock this contract out.
///
/// The swap floor comes from the caller, derived from the oracle. A pool that has been pushed away
/// from the market makes the whole transaction revert rather than opening a position at a price
/// somebody else chose.
contract LeverageRouter is IMorphoFlashLoanCallback {
    using SafeERC20 for IERC20;

    IMorpho public immutable morpho;
    ISwapRouter02 public immutable router;

    enum Action {
        Open,
        Close
    }

    struct OpenParams {
        MarketParams marketParams;
        /// @dev Collateral the user puts in themselves. Pulled from them, not from this contract.
        uint256 equityCollateral;
        /// @dev Loan asset to flash-borrow and convert into more collateral.
        uint256 flashAmount;
        uint24 swapFee;
        /// @dev Minimum collateral the swap must return. Derived from the oracle by the caller.
        uint256 minCollateralOut;
        address onBehalf;
    }

    struct CloseParams {
        MarketParams marketParams;
        /// @dev Debt to repay. Pass the full debt in assets to close the position outright.
        uint256 repayAmount;
        /// @dev Collateral to withdraw and sell to fund the repayment.
        uint256 collateralToSell;
        uint24 swapFee;
        /// @dev Minimum loan asset the sale must return.
        uint256 minLoanOut;
        address onBehalf;
    }

    event Opened(address indexed user, uint256 equity, uint256 exposure, uint256 debt);
    event Closed(address indexed user, uint256 repaid, uint256 collateralSold, uint256 returned);

    error NotMorpho();
    error NotAuthorized();
    error SwapShortfall(uint256 received, uint256 needed);

    constructor(address _morpho, address _router) {
        morpho = IMorpho(_morpho);
        router = ISwapRouter02(_router);
    }

    /// @notice Open a leveraged position. `msg.sender` must have authorised this router on Morpho
    /// and approved it for `equityCollateral` of the collateral token.
    function open(OpenParams calldata p) external {
        if (p.onBehalf != msg.sender) revert NotAuthorized();
        if (!morpho.isAuthorized(msg.sender, address(this))) revert NotAuthorized();

        IERC20(p.marketParams.collateralToken).safeTransferFrom(msg.sender, address(this), p.equityCollateral);
        morpho.flashLoan(p.marketParams.loanToken, p.flashAmount, abi.encode(Action.Open, abi.encode(p)));
    }

    /// @notice Unwind a position: repay debt out of collateral, keep whatever is left over.
    function close(CloseParams calldata p) external {
        if (p.onBehalf != msg.sender) revert NotAuthorized();
        if (!morpho.isAuthorized(msg.sender, address(this))) revert NotAuthorized();

        morpho.flashLoan(p.marketParams.loanToken, p.repayAmount, abi.encode(Action.Close, abi.encode(p)));
    }

    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external {
        if (msg.sender != address(morpho)) revert NotMorpho();
        (Action action, bytes memory inner) = abi.decode(data, (Action, bytes));

        if (action == Action.Open) {
            _open(abi.decode(inner, (OpenParams)), assets);
        } else {
            _close(abi.decode(inner, (CloseParams)), assets);
        }
    }

    function _open(OpenParams memory p, uint256 assets) internal {
        IERC20 loanToken = IERC20(p.marketParams.loanToken);
        IERC20 collateral = IERC20(p.marketParams.collateralToken);

        loanToken.forceApprove(address(router), assets);
        uint256 bought = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(loanToken),
                tokenOut: address(collateral),
                fee: p.swapFee,
                recipient: address(this),
                amountIn: assets,
                amountOutMinimum: p.minCollateralOut,
                sqrtPriceLimitX96: 0
            })
        );

        uint256 exposure = p.equityCollateral + bought;
        collateral.forceApprove(address(morpho), exposure);
        morpho.supplyCollateral(p.marketParams, exposure, p.onBehalf, "");

        // Borrow exactly what the flash loan costs — Morpho charges no fee, so the debt is the
        // amount borrowed and nothing more.
        morpho.borrow(p.marketParams, assets, 0, p.onBehalf, address(this));
        loanToken.forceApprove(address(morpho), assets);

        _sweep(loanToken, p.onBehalf, assets);
        _sweep(collateral, p.onBehalf, 0);

        emit Opened(p.onBehalf, p.equityCollateral, exposure, assets);
    }

    function _close(CloseParams memory p, uint256 assets) internal {
        IERC20 loanToken = IERC20(p.marketParams.loanToken);
        IERC20 collateral = IERC20(p.marketParams.collateralToken);

        loanToken.forceApprove(address(morpho), type(uint256).max);
        morpho.repay(p.marketParams, assets, 0, p.onBehalf, "");
        morpho.withdrawCollateral(p.marketParams, p.collateralToSell, p.onBehalf, address(this));

        collateral.forceApprove(address(router), p.collateralToSell);
        uint256 received = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(collateral),
                tokenOut: address(loanToken),
                fee: p.swapFee,
                recipient: address(this),
                amountIn: p.collateralToSell,
                amountOutMinimum: p.minLoanOut,
                sqrtPriceLimitX96: 0
            })
        );
        if (received < assets) revert SwapShortfall(received, assets);

        loanToken.forceApprove(address(morpho), assets);

        uint256 returned = loanToken.balanceOf(address(this)) - assets;
        _sweep(loanToken, p.onBehalf, assets);
        _sweep(collateral, p.onBehalf, 0);

        emit Closed(p.onBehalf, assets, p.collateralToSell, returned);
    }

    /// @dev Anything above `keep` goes back to the user in the same transaction. `keep` is what
    /// Morpho is about to pull for the flash loan.
    function _sweep(IERC20 token, address to, uint256 keep) internal {
        uint256 balance = token.balanceOf(address(this));
        if (balance > keep) token.safeTransfer(to, balance - keep);
    }
}
