// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, stdError} from "forge-std/Test.sol";
import {LeverageRouter} from "../../src/periphery/LeverageRouter.sol";
import {MarketParams, Position, Id, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {SharesMath} from "../../src/libraries/SharesMath.sol";
import {MockERC20, MockRouter} from "../mocks/Mocks.sol";

interface IFlashCallback {
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external;
}

/// @dev Enough of Morpho Blue to close a position, with the one property that matters here: shares
/// and assets drift apart as interest accrues, so "the full debt in assets" is a number that is only
/// correct for the block it was quoted in.
contract MorphoWithInterest {
    using MarketParamsLib for MarketParams;
    using SharesMath for uint256;

    mapping(bytes32 => mapping(address => Position)) public positions;
    mapping(address => mapping(address => bool)) public auth;

    uint256 public totalBorrowAssets;
    uint256 public totalBorrowShares;

    function setAuthorization(address authorized, bool v) external {
        auth[msg.sender][authorized] = v;
    }

    function isAuthorized(address a, address b) external view returns (bool) {
        return auth[a][b];
    }

    function seed(MarketParams memory p, address user, uint128 collateral, uint256 assets) external {
        bytes32 id = Id.unwrap(p.id());
        uint256 shares = assets * SharesMath.VIRTUAL_SHARES;
        positions[id][user] = Position({supplyShares: 0, borrowShares: uint128(shares), collateral: collateral});
        totalBorrowAssets = assets;
        totalBorrowShares = shares;
    }

    /// @notice Add interest without minting shares — which is exactly what accrual does.
    function accrue(uint256 interest) external {
        totalBorrowAssets += interest;
    }

    function borrowSharesOf(MarketParams memory p, address user) external view returns (uint256) {
        return positions[Id.unwrap(p.id())][user].borrowShares;
    }

    function collateralOf(MarketParams memory p, address user) external view returns (uint256) {
        return positions[Id.unwrap(p.id())][user].collateral;
    }

    /// Morpho's own rule: pass assets or shares, never both, never neither.
    function repay(MarketParams memory p, uint256 assets, uint256 shares, address onBehalf, bytes memory)
        external
        returns (uint256, uint256)
    {
        require((assets == 0) != (shares == 0), "inconsistent input");
        if (assets > 0) {
            shares = assets.toSharesDown(totalBorrowAssets, totalBorrowShares);
        } else {
            assets = shares.toAssetsUp(totalBorrowAssets, totalBorrowShares);
        }

        bytes32 id = Id.unwrap(p.id());
        // Unchecked-free subtraction, as in Morpho: burning more shares than exist panics 0x11.
        positions[id][onBehalf].borrowShares -= uint128(shares);
        totalBorrowShares -= shares;
        totalBorrowAssets -= assets > totalBorrowAssets ? totalBorrowAssets : assets;

        MockERC20(p.loanToken).transferFrom(msg.sender, address(this), assets);
        return (assets, shares);
    }

    /// @dev Collateral is priced at a flat 100 loan units a token, which is what MockRouter pays,
    /// so the health check here is the same one Morpho makes: what is left must still cover what is
    /// still owed at the market's LLTV. With the debt at zero any withdrawal passes; with a single
    /// share left behind, the LAST of the collateral cannot come out.
    uint256 internal constant MOCK_PRICE = 100e6;

    function withdrawCollateral(MarketParams memory p, uint256 assets, address onBehalf, address receiver) external {
        require(auth[onBehalf][msg.sender] || onBehalf == msg.sender, "unauthorized");
        bytes32 id = Id.unwrap(p.id());
        positions[id][onBehalf].collateral -= uint128(assets);

        uint256 owed = uint256(positions[id][onBehalf].borrowShares).toAssetsUp(totalBorrowAssets, totalBorrowShares);
        if (owed > 0) {
            uint256 value = (uint256(positions[id][onBehalf].collateral) * MOCK_PRICE) / 1e18;
            require((value * p.lltv) / 1e18 >= owed, "insufficient collateral");
        }
        MockERC20(p.collateralToken).transfer(receiver, assets);
    }

    function flashLoan(address token, uint256 assets, bytes calldata data) external {
        MockERC20(token).transfer(msg.sender, assets);
        IFlashCallback(msg.sender).onMorphoFlashLoan(assets, data);
        MockERC20(token).transferFrom(msg.sender, address(this), assets);
    }
}

/// `LeverageRouter` had no unit tests at all, and its one economic guard — `SwapShortfall` — was
/// only ever exercised through a mock router's own floor, so removing it from the contract changed
/// nothing that anything checked.
contract LeverageRouterTest is Test {
    using MarketParamsLib for MarketParams;

    MorphoWithInterest morpho;
    MockRouter swap;
    MockERC20 usdg;
    MockERC20 nvda;
    LeverageRouter router;
    MarketParams params;

    address constant USER = address(0xB0B);

    function setUp() public {
        morpho = new MorphoWithInterest();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        swap = new MockRouter(100e6); // 1 NVDA sells for 100 USDG
        router = new LeverageRouter(address(morpho), address(swap));

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(0),
            irm: address(0),
            lltv: 0.625e18
        });

        usdg.mint(address(morpho), 1_000_000e6);
        usdg.mint(address(swap), 1_000_000e6);
        nvda.mint(address(morpho), 1_000e18);

        vm.prank(USER);
        morpho.setAuthorization(address(router), true);
    }

    function _close(uint256 repayAmount, uint256 repayShares, uint256 collateralToSell, uint256 flashAmount)
        internal
        view
        returns (LeverageRouter.CloseParams memory)
    {
        return LeverageRouter.CloseParams({
            marketParams: params,
            repayAmount: repayAmount,
            repayShares: repayShares,
            collateralToSell: collateralToSell,
            swapFee: 500,
            minLoanOut: 0,
            onBehalf: USER,
            flashAmount: flashAmount
        });
    }

    /* ----------------------------------------------------------------- */
    /* Closing outright: only shares can do it                            */
    /* ----------------------------------------------------------------- */

    /// The debt was 1,000 USDG when it was quoted. One second of interest later it is 1,001, and
    /// repaying the quoted number leaves shares behind — so Morpho refuses to hand the collateral
    /// back and the whole close reverts, for a reason that says nothing about the actual cause.
    function test_repayingAQuotedAmountCannotCloseThePosition() public {
        morpho.seed(params, USER, 20e18, 1_000e6);
        morpho.accrue(1e6);

        vm.prank(USER);
        vm.expectRevert(bytes("insufficient collateral"));
        router.close(_close(1_000e6, 0, 20e18, 1_010e6));

        // Take less collateral and the transaction goes through — leaving a position that is open,
        // worth nothing, and now short of the collateral that used to back it.
        vm.prank(USER);
        router.close(_close(1_000e6, 0, 11e18, 1_010e6));
        assertGt(morpho.borrowSharesOf(params, USER), 0, "quoting in assets leaves the debt open");
        assertGt(morpho.collateralOf(params, USER), 0, "and the rest of the collateral locked");
    }

    /// And padding the amount to be safe — the obvious next move — burns more shares than exist and
    /// panics inside Morpho, with nothing in the revert to say what happened.
    function test_overpayingInAssetsPanicsInsideMorpho() public {
        morpho.seed(params, USER, 20e18, 1_000e6);
        morpho.accrue(1e6);

        vm.prank(USER);
        vm.expectRevert(stdError.arithmeticError);
        router.close(_close(1_100e6, 0, 20e18, 1_110e6));
    }

    /// Shares are exact at any timestamp. This is the only formulation that lands on zero without
    /// the caller having to predict which block their transaction is mined in.
    function test_closingByShareCountLandsOnZeroDebt() public {
        morpho.seed(params, USER, 20e18, 1_000e6);
        morpho.accrue(1e6);

        uint256 shares = morpho.borrowSharesOf(params, USER);
        vm.prank(USER);
        // The flash loan is an upper bound: what Morpho will actually pull is only known in here.
        router.close(_close(0, shares, 20e18, 1_100e6));

        assertEq(morpho.borrowSharesOf(params, USER), 0, "the position is closed");
        assertEq(morpho.collateralOf(params, USER), 0, "and the collateral came back");
        assertGt(nvda.balanceOf(USER) + usdg.balanceOf(USER), 0, "the user got the remainder");
        assertEq(usdg.balanceOf(address(router)), 0, "the router keeps nothing");
        assertEq(nvda.balanceOf(address(router)), 0);
    }

    /// An oversized flash loan is the normal case when closing by shares, so it must not be what
    /// decides whether the close is allowed. `SwapShortfall` measures the sale against what Morpho
    /// took, exactly as `NoProfit` does in the liquidator.
    function test_anOversizedFlashLoanDoesNotBlockTheClose() public {
        morpho.seed(params, USER, 20e18, 1_000e6);
        uint256 shares = morpho.borrowSharesOf(params, USER);

        // Sell 11 NVDA for 1,100 USDG against a 1,000 debt, while flash-borrowing 1,050.
        vm.prank(USER);
        router.close(_close(0, shares, 11e18, 1_050e6));
        assertEq(morpho.borrowSharesOf(params, USER), 0);
    }

    /* ----------------------------------------------------------------- */
    /* The guard itself                                                   */
    /* ----------------------------------------------------------------- */

    /// Removing `SwapShortfall` from the contract used to change nothing any test could see: the
    /// only failure came from the mock router's own floor. This one comes from the contract, with
    /// the router's floor set to zero so it cannot be the thing reverting.
    function test_swapShortfallRevertsWhenTheSaleCannotCoverTheRepayment() public {
        morpho.seed(params, USER, 20e18, 1_000e6);
        uint256 shares = morpho.borrowSharesOf(params, USER);

        // Nine NVDA at 100 is 900 against a 1,000 debt. The router's own floor is 0.
        vm.prank(USER);
        vm.expectRevert(abi.encodeWithSelector(LeverageRouter.SwapShortfall.selector, uint256(900e6), uint256(1_000e6)));
        router.close(_close(0, shares, 9e18, 1_050e6));
    }

    /* ----------------------------------------------------------------- */
    /* Input the caller can get wrong                                     */
    /* ----------------------------------------------------------------- */

    function test_bothOrNeitherRepayFieldsIsRejectedByName() public {
        morpho.seed(params, USER, 20e18, 1_000e6);

        vm.prank(USER);
        vm.expectRevert(LeverageRouter.InconsistentInput.selector);
        router.close(_close(1_000e6, 1_000e6 * 1e6, 20e18, 1_100e6));

        vm.prank(USER);
        vm.expectRevert(LeverageRouter.InconsistentInput.selector);
        router.close(_close(0, 0, 20e18, 1_100e6));
    }

    function test_aFlashLoanSmallerThanTheRepaymentIsRejectedUpFront() public {
        morpho.seed(params, USER, 20e18, 1_000e6);

        vm.prank(USER);
        vm.expectRevert(LeverageRouter.InconsistentInput.selector);
        router.close(_close(1_000e6, 0, 20e18, 900e6));
    }

    /// The standing authorisation is the router's whole permission model, so the check that it
    /// cannot be borrowed by a third party belongs next to the code, not only in a review.
    function test_aThirdPartyCannotCloseSomeoneElsesPosition() public {
        morpho.seed(params, USER, 20e18, 1_000e6);
        uint256 shares = morpho.borrowSharesOf(params, USER);

        vm.prank(address(0xBAD));
        vm.expectRevert(LeverageRouter.NotAuthorized.selector);
        router.close(_close(0, shares, 20e18, 1_100e6));
    }

    function test_theCallbackCannotBeInvokedFromOutside() public {
        vm.expectRevert(LeverageRouter.NotMorpho.selector);
        router.onMorphoFlashLoan(1, "");
    }
}
