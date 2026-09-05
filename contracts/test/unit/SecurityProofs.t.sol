// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {LeverageRouter} from "../../src/periphery/LeverageRouter.sol";
import {IMorpho, MarketParams, Market, Position, Id, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {ISwapRouter02} from "../../src/interfaces/IExternal.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";

/// Security review proofs. Test files only; no production source is touched.
contract SecurityProofsTest is Test {
    MockMorpho morpho;
    MockRouter router;
    MockERC20 usdg;
    MockERC20 nvda;
    FlashLiquidator liquidator;
    MarketParams params;

    address constant OWNER = address(0xA11CE);
    address constant KEEPER = address(0xCEE9E4);
    address constant BORROWER = address(0xB0B);

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        router = new MockRouter(100e6); // honest pool: 1 NVDA = 100 USDG

        liquidator = new FlashLiquidator(address(morpho), address(router), OWNER);
        vm.prank(OWNER);
        liquidator.setKeeper(KEEPER, true);

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(100e24)),
            irm: address(new MockIrm(0)),
            lltv: 0.625e18
        });

        usdg.mint(address(morpho), 1_000_000e6);
        nvda.mint(address(morpho), 1_000e18);
        usdg.mint(address(router), 1_000_000e6);

        morpho.setMarket(
            params,
            Market({
                totalSupplyAssets: 100_000e6,
                totalSupplyShares: 100_000e6,
                totalBorrowAssets: 50_000e6,
                totalBorrowShares: 50_000e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 0, collateral: 100e18}));
    }

    /// CLAIM UNDER TEST (FlashLiquidator.sol:35-36): "a keeper key that leaks cannot steal — but it
    /// could burn gas, so it is still gated."
    ///
    /// The contract's ONLY on-chain price invariant is `received >= assets` (line 116), and BOTH
    /// sides of that comparison are chosen by the same caller: `assets` is the keeper's own
    /// `flashAmount`, `minAmountOut` is the keeper's own floor. So the keeper certifies its own
    /// price. Here the same liquidation that honestly pays the owner 500 USDG is executed by a
    /// keeper who sets minAmountOut = 1 and dumps the collateral at half price. It succeeds.
    function test_keeperCannotRouteLiquidationProfitAwayFromOwner() public {
        // Honest execution, for the baseline.
        uint256 snap = vm.snapshotState();
        vm.prank(KEEPER);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 500e6,
                minAmountOut: 920e6 // the keeper's real formula: 92% of oracle value
            })
        );
        uint256 honestProfit = usdg.balanceOf(OWNER);
        assertEq(honestProfit, 500e6, "baseline");
        vm.revertToState(snap);

        // Same position, same seizure. The keeper pushes the pool to half price (a sandwich it
        // placed itself, or one it lets a searcher place) and removes its own floor. The interest
        // it is diverting is the owner's liquidation premium, so the owner is the one who has to be
        // able to bound it — which is what `maxSlippageWad` is.
        router.set(50.5e6);

        vm.prank(KEEPER);
        vm.expectRevert(abi.encodeWithSelector(FlashLiquidator.BelowOracleFloor.selector, 505e6, 920e6));
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 500e6,
                minAmountOut: 1 // the caller's own price defence, set to nothing
            })
        );
        assertEq(usdg.balanceOf(OWNER), 0, "nothing moved");

        // The bound is the owner's to set, and only the owner's. A keeper cannot widen it.
        vm.prank(KEEPER);
        vm.expectRevert();
        liquidator.setMaxSlippage(0.6e18);

        // Nor can the owner widen it past the point where it stops being a bound.
        vm.prank(OWNER);
        vm.expectRevert(FlashLiquidator.SlippageTooHigh.selector);
        liquidator.setMaxSlippage(0.5e18);

        // Widened to the maximum the contract allows, the same half-price sale is still refused:
        // 505 against a floor of 800. Honest depth is what this covers, not a sandwich.
        vm.prank(OWNER);
        liquidator.setMaxSlippage(0.2e18);
        vm.prank(KEEPER);
        vm.expectRevert(abi.encodeWithSelector(FlashLiquidator.BelowOracleFloor.selector, 505e6, 800e6));
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 500e6,
                minAmountOut: 1
            })
        );
        assertEq(honestProfit, 500e6, "the honest baseline is unaffected");
        assertEq(usdg.balanceOf(address(liquidator)), 0, "and the contract still holds nothing");
    }

    /// The same hole, without any key compromise: the contract accepts a swap at ANY price so long
    /// as it clears the flash loan. `minAmountOut` is the only floor and it is off-chain data.
    function test_contractEnforcesItsOwnPriceFloorFromTheMarketOracle() public {
        MockOracle oracle = MockOracle(params.oracle);
        // Oracle says 1 NVDA = 100 USDG, on Morpho's 1e36 scale with 18/6 decimals folded in.
        assertEq(oracle.price(), 100e24);

        router.set(50.1e6); // pool at half the oracle
        vm.prank(KEEPER);
        // `minAmountOut: 1` is the caller waiving its own floor entirely — which is exactly why the
        // contract must not rely on it. It reads the market's oracle and refuses the sale itself.
        vm.expectRevert(abi.encodeWithSelector(FlashLiquidator.BelowOracleFloor.selector, 501e6, 920e6));
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 500e6,
                minAmountOut: 1
            })
        );
        assertEq(usdg.balanceOf(OWNER), 0, "nothing was sold");
    }
}

// ---------------------------------------------------------------------------------------------
// LeverageRouter: enough of Morpho to open a position.
// ---------------------------------------------------------------------------------------------

contract MorphoForLeverage {
    using MarketParamsLib for MarketParams;

    mapping(bytes32 => mapping(address => Position)) public positions;
    mapping(address => mapping(address => bool)) public auth;

    function setAuthorization(address authorized, bool v) external {
        auth[msg.sender][authorized] = v;
    }

    function isAuthorized(address a, address b) external view returns (bool) {
        return auth[a][b];
    }

    function supplyCollateral(MarketParams memory p, uint256 assets, address onBehalf, bytes memory) external {
        IERC20(p.collateralToken).transferFrom(msg.sender, address(this), assets);
        positions[Id.unwrap(p.id())][onBehalf].collateral += uint128(assets);
    }

    function borrow(MarketParams memory p, uint256 assets, uint256, address onBehalf, address receiver)
        external
        returns (uint256, uint256)
    {
        require(auth[onBehalf][msg.sender] || onBehalf == msg.sender, "unauthorized");
        positions[Id.unwrap(p.id())][onBehalf].borrowShares += uint128(assets);
        IERC20(p.loanToken).transfer(receiver, assets);
        return (assets, assets);
    }

    function flashLoan(address token, uint256 assets, bytes calldata data) external {
        IERC20(token).transfer(msg.sender, assets);
        IFlash(msg.sender).onMorphoFlashLoan(assets, data);
        IERC20(token).transferFrom(msg.sender, address(this), assets);
    }
}

interface IFlash {
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external;
}

/// @dev Swaps loan token -> collateral at a fixed rate, the direction `_open` needs.
contract RouterToCollateral {
    uint256 public immutable rate; // collateral out per 1e6 loan token in, 18 decimals

    constructor(uint256 _rate) {
        rate = _rate;
    }

    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata p) external returns (uint256) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        uint256 out = (p.amountIn * rate) / 1e6;
        require(out >= p.amountOutMinimum, "slippage");
        IERC20(p.tokenOut).transfer(p.recipient, out);
        return out;
    }
}

contract LeverageRouterSweepTest is Test {
    using MarketParamsLib for MarketParams;

    MorphoForLeverage morpho;
    RouterToCollateral swap;
    MockERC20 usdg;
    MockERC20 nvda;
    LeverageRouter lev;
    MarketParams params;

    address constant VICTIM = address(0x1C71);
    address constant ATTACKER = address(0xBAD);

    function setUp() public {
        morpho = new MorphoForLeverage();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        swap = new RouterToCollateral(0.01e18); // 100 USDG -> 1 NVDA
        lev = new LeverageRouter(address(morpho), address(swap));

        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(100e24)),
            irm: address(new MockIrm(0)),
            lltv: 0.625e18
        });

        usdg.mint(address(morpho), 1_000_000e6);
        nvda.mint(address(swap), 10_000e18);
    }

    /// CLAIM UNDER TEST (LeverageRouter.sol:19-20): "It holds nothing between transactions. Every
    /// path ends with the balance swept to the user, so there is no float for a bug here to lose."
    ///
    /// True as an intent, unenforced as a mechanism. `_sweep` (line 170) sends the router's WHOLE
    /// balance of a token named by the caller's own `marketParams` to the caller's own `onBehalf`,
    /// and `marketParams` is unvalidated. So any balance the router does hold — a user's mistaken
    /// transfer, an airdrop, dust from a rounding token — belongs to whoever calls `open` next.
    /// There is no owner and no rescue function on this contract, so this is the only way out.
    function test_proof_anyoneSweepsStuckTokensOutOfLeverageRouter() public {
        // A user fat-fingers a transfer to the router instead of approving it.
        usdg.mint(VICTIM, 25_000e6);
        vm.prank(VICTIM);
        usdg.transfer(address(lev), 25_000e6);
        assertEq(usdg.balanceOf(address(lev)), 25_000e6);

        // An unrelated address opens the smallest possible position on a real market.
        nvda.mint(ATTACKER, 1e18);
        vm.startPrank(ATTACKER);
        nvda.approve(address(lev), type(uint256).max);
        morpho.setAuthorization(address(lev), true);
        lev.open(
            LeverageRouter.OpenParams({
                marketParams: params,
                equityCollateral: 1e18,
                flashAmount: 100e6,
                swapFee: 500,
                minCollateralOut: 0,
                onBehalf: ATTACKER
            })
        );
        vm.stopPrank();

        assertEq(usdg.balanceOf(ATTACKER), 25_000e6, "the victim's 25,000 USDG went to the attacker");
        assertEq(usdg.balanceOf(address(lev)), 0);
    }
}

/// Hypotheses about the callback surface that this review tried to break and could NOT.
contract CallbackSurfaceTest is Test {
    MockMorpho morpho;
    MockRouter router;
    MockERC20 usdg;
    MockERC20 nvda;
    FlashLiquidator liquidator;
    LeverageRouter lev;
    MorphoForLeverage morphoLev;
    MarketParams params;

    address constant OWNER = address(0xA11CE);
    address constant OUTSIDER = address(0xBEEF);
    address constant VICTIM = address(0x1C71);

    function setUp() public {
        morpho = new MockMorpho();
        morphoLev = new MorphoForLeverage();
        router = new MockRouter(100e6);
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        liquidator = new FlashLiquidator(address(morpho), address(router), OWNER);
        lev = new LeverageRouter(address(morphoLev), address(router));
        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(100e24)),
            irm: address(new MockIrm(0)),
            lltv: 0.625e18
        });
    }

    /// REFUTED: an outsider cannot drive either callback directly. Morpho only ever calls back the
    /// address that initiated the flash loan, and both contracts additionally pin msg.sender.
    function test_proof_outsiderCannotCallCallbacks() public {
        vm.startPrank(OUTSIDER);
        vm.expectRevert(FlashLiquidator.NotMorpho.selector);
        liquidator.onMorphoFlashLoan(1e6, abi.encode(uint256(0)));

        vm.expectRevert(FlashLiquidator.NotMorpho.selector);
        liquidator.onMorphoLiquidate(1e6, "");

        vm.expectRevert(LeverageRouter.NotMorpho.selector);
        lev.onMorphoFlashLoan(1e6, abi.encode(uint256(0), bytes("")));
        vm.stopPrank();
    }

    /// REFUTED: a user's standing Morpho authorisation of LeverageRouter cannot be used by anyone
    /// but that user — `onBehalf` is pinned to msg.sender on both entry points.
    function test_proof_authorisationCannotBeBorrowedByAThirdParty() public {
        vm.prank(VICTIM);
        morphoLev.setAuthorization(address(lev), true);

        vm.startPrank(OUTSIDER);
        vm.expectRevert(LeverageRouter.NotAuthorized.selector);
        lev.open(
            LeverageRouter.OpenParams({
                marketParams: params,
                equityCollateral: 0,
                flashAmount: 1e6,
                swapFee: 500,
                minCollateralOut: 0,
                onBehalf: VICTIM
            })
        );

        vm.expectRevert(LeverageRouter.NotAuthorized.selector);
        lev.close(
            LeverageRouter.CloseParams({
                marketParams: params,
                repayAmount: 1e6,
                repayShares: 0,
                collateralToSell: 1e18,
                swapFee: 500,
                minLoanOut: 0,
                onBehalf: VICTIM,
                flashAmount: 1e6
            })
        );
        vm.stopPrank();
    }

    /// REFUTED: an outsider cannot trigger a liquidation at all — the keeper gate holds.
    function test_proof_liquidateIsGated() public {
        vm.prank(OUTSIDER);
        vm.expectRevert(FlashLiquidator.NotKeeper.selector);
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: OUTSIDER,
                seizedAssets: 1e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 1e6,
                minAmountOut: 1
            })
        );
    }
}

/// The two confirmed findings, written the other way round: each test asserts the invariant the
/// code is documented to hold, and each one FAILS. Run with
///   forge test --match-contract InvariantsThatDoNotHold --skip 'Operability.proof.t.sol'
contract InvariantsThatDoNotHold is Test {
    MockMorpho morpho;
    MockRouter router;
    MockERC20 usdg;
    MockERC20 nvda;
    FlashLiquidator liquidator;
    MarketParams params;

    address constant OWNER = address(0xA11CE);
    address constant KEEPER = address(0xCEE9E4);
    address constant BORROWER = address(0xB0B);

    function setUp() public {
        morpho = new MockMorpho();
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        router = new MockRouter(100e6);
        liquidator = new FlashLiquidator(address(morpho), address(router), OWNER);
        vm.prank(OWNER);
        liquidator.setKeeper(KEEPER, true);
        params = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(100e24)),
            irm: address(new MockIrm(0)),
            lltv: 0.625e18
        });
        usdg.mint(address(morpho), 1_000_000e6);
        nvda.mint(address(morpho), 1_000e18);
        usdg.mint(address(router), 1_000_000e6);
        morpho.setMarket(
            params,
            Market({
                totalSupplyAssets: 100_000e6,
                totalSupplyShares: 100_000e6,
                totalBorrowAssets: 50_000e6,
                totalBorrowShares: 50_000e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 0, collateral: 100e18}));
    }

    /// "A keeper key that leaks cannot steal" (FlashLiquidator.sol:36). If that held, a liquidation
    /// that sells oracle-priced collateral into the pool at half price would revert on chain,
    /// whatever the keeper passed for minAmountOut. It does not.
    function test_proof_liquidationCannotSellFarBelowOracle() public {
        router.set(50.5e6); // pool at half the oracle's 100
        vm.prank(KEEPER);
        vm.expectRevert(); // FAILS: nothing in the contract compares the swap to params.oracle
        liquidator.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: params,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: 500e6,
                minAmountOut: 1
            })
        );
    }
}
