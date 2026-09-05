// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {
    IMorpho,
    IMorphoFlashLoanCallback,
    IMorphoLiquidateCallback,
    IOracle,
    MarketParams
} from "../interfaces/IMorpho.sol";
import {ISwapRouter02} from "../interfaces/IExternal.sol";
import {MathLib} from "../libraries/MathLib.sol";

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
    using MathLib for uint256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant ORACLE_PRICE_SCALE = 1e36;

    IMorpho public immutable morpho;
    ISwapRouter02 public immutable router;

    /// @dev Addresses allowed to trigger a liquidation. A leaked keeper key cannot take the profit
    /// — it goes to the owner on every path — but it can choose the price the collateral sells at,
    /// which is why `maxSlippageWad` exists and why this gate is still here.
    mapping(address => bool) public keepers;

    /// @notice How far below the market oracle the seized collateral may be sold, in WAD.
    /// @dev The caller supplies `minAmountOut`, so without this the only floor on the sale would be
    /// one the caller chose for itself. This one is set by the owner and read from the market's own
    /// oracle inside the callback, which is the same price Morpho just used to decide the position
    /// was liquidatable. It has to leave room for the swap fee and real pool depth, not only for
    /// the liquidation premium.
    uint256 public maxSlippageWad = 0.08e18;

    struct LiquidateParams {
        MarketParams marketParams;
        address borrower;
        uint256 seizedAssets;
        uint256 repaidShares;
        /// @dev Pool fee tier for the collateral → loan-token swap.
        uint24 swapFee;
        /// @dev How much of the loan token to flash-borrow. It must cover what Morpho will pull to
        /// repay the borrower's debt, so the keeper sizes it from the debt plus a margin.
        uint256 flashAmount;
        /// @dev Floor on the swap output. Derived from the oracle price by the caller, so a pool
        /// that has been pushed away from the market makes this revert instead of selling into it.
        ///
        /// Kept separate from `flashAmount` deliberately: one is what we must repay, the other is
        /// what the collateral must fetch. Collapsing them into a single number works right up
        /// until the debt exceeds the floor, and then the liquidation reverts for want of balance
        /// with nothing in the revert to say why.
        uint256 minAmountOut;
    }

    event Liquidated(
        address indexed borrower, address indexed collateral, uint256 seizedAssets, uint256 repaidAssets, uint256 profit
    );
    event KeeperSet(address indexed keeper, bool allowed);
    event MaxSlippageSet(uint256 maxSlippageWad);

    error NotKeeper();
    error NotMorpho();
    error NoProfit(uint256 received, uint256 owed);
    error BelowOracleFloor(uint256 received, uint256 floor);
    error SlippageTooHigh();

    constructor(address _morpho, address _router, address _owner) Ownable(_owner) {
        morpho = IMorpho(_morpho);
        router = ISwapRouter02(_router);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        keepers[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    /// @notice Set the floor, relative to the market oracle, under which a sale is refused.
    /// @dev Capped at 20%: past the liquidation premium plus a fee plus honest depth, a number this
    /// large stops being a safety margin and becomes permission to sell anywhere.
    function setMaxSlippage(uint256 newMaxSlippageWad) external onlyOwner {
        if (newMaxSlippageWad > 0.2e18) revert SlippageTooHigh();
        maxSlippageWad = newMaxSlippageWad;
        emit MaxSlippageSet(newMaxSlippageWad);
    }

    /// @notice Liquidate `borrower`, funding the repayment with a Morpho flash loan.
    /// @dev `seizedAssets` and `repaidShares` are exclusive in Morpho: pass one, leave the other 0.
    function liquidate(LiquidateParams calldata p) external {
        if (!keepers[msg.sender] && msg.sender != owner()) revert NotKeeper();

        // Seizing by collateral amount means the exact repayment is only known inside the
        // callback, so the keeper borrows enough to cover it and the surplus goes back in the same
        // transaction.
        morpho.flashLoan(p.marketParams.loanToken, p.flashAmount, abi.encode(p));
    }

    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external {
        if (msg.sender != address(morpho)) revert NotMorpho();
        LiquidateParams memory p = abi.decode(data, (LiquidateParams));

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

        // The caller picked `minAmountOut`, so the contract asks the market's own oracle — the same
        // one Morpho priced the liquidation with — what the seized collateral was worth, and
        // refuses a sale more than `maxSlippageWad` below it. Without this the only floor on the
        // price is the one the caller set for itself, which is not a floor.
        uint256 oracleValue = seized.mulDivDown(IOracle(p.marketParams.oracle).price(), ORACLE_PRICE_SCALE);
        uint256 floor = oracleValue.wMulDown(WAD - maxSlippageWad);
        if (received < floor) revert BelowOracleFloor(received, floor);

        // Solvency is `received >= repaid`, not `received >= assets`: the flash loan lent `assets`,
        // Morpho took `repaid` out of it, and the rest never left. Comparing against the size of
        // the loan rejects profitable liquidations whenever the keeper borrowed a margin — which it
        // always does, because seizing by collateral amount only reveals the repayment in here.
        if (received < repaid) revert NoProfit(received, repaid);

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
