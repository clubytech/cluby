// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {Lens} from "../../src/periphery/Lens.sol";
import {FlashLiquidator} from "../../src/periphery/FlashLiquidator.sol";
import {MarketParams, Market, Position, Id, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {MockMorpho, MockRouter, MockERC20, MockOracle, MockIrm} from "../mocks/Mocks.sol";

/// @notice LOGIC proofs: state a view reports that the transaction will not produce, and a profit
/// gate written against the wrong quantity.
contract ProofLogicTest is Test {
    using MarketParamsLib for MarketParams;

    MockMorpho morpho;
    MockOracle oracle;
    MockIrm irm;
    Lens lens;
    MarketParams params;

    address constant BORROWER = address(0xB0B);
    uint256 constant PRICE = 231_460_000_000_000_000_000_000_000; // $231.46 on Morpho's 1e36 scale
    uint256 constant LLTV = 0.625e18;

    function setUp() public {
        morpho = new MockMorpho();
        oracle = new MockOracle(PRICE);
        irm = new MockIrm(0);
        lens = new Lens(address(morpho));

        params = MarketParams({
            loanToken: address(new MockERC20("USDG", "USDG", 6)),
            collateralToken: address(new MockERC20("NVDA", "NVDA", 18)),
            oracle: address(oracle),
            irm: address(irm),
            lltv: LLTV
        });
        morpho.setMarket(
            params,
            Market({
                totalSupplyAssets: 100_000e6,
                totalSupplyShares: 100_000e6 * 1e6,
                totalBorrowAssets: 40_000e6,
                totalBorrowShares: 40_000e6 * 1e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );
        morpho.setPosition(params, BORROWER, Position({supplyShares: 0, borrowShares: 0, collateral: 0}));
    }

    /// CLAIM: previewBorrow rewrites every field of the view from the post-transaction position
    /// except safeBorrowAssets, which keeps the value computed from the collateral the user has
    /// BEFORE the transaction. For a first position that is zero, while maxBorrowAssets is not.
    function test_proof_previewBorrowLeavesSafeBorrowStale() public view {
        Lens.UserView memory u = lens.previewBorrow(params, BORROWER, 10e18, 0);

        console2.log("collateralValue ", u.collateralValue);
        console2.log("maxBorrowAssets ", u.maxBorrowAssets);
        console2.log("safeBorrowAssets", u.safeBorrowAssets);

        assertGt(u.maxBorrowAssets, 0, "the preview does credit the new collateral");
        assertGt(u.safeBorrowAssets, 0, "safeBorrowAssets should reflect the same position");
    }

    /// CLAIM: the liquidator's profit gate compares the swap proceeds against the flash-loan size,
    /// a number the caller picks, instead of against what Morpho actually pulled to repay the
    /// borrower. Size the loan with a margin — which the contract's own comment tells the keeper to
    /// do — and a liquidation that clears a real profit reverts.
    function test_proof_profitableLiquidationRevertsOnFlashMargin() public {
        MockERC20 usdg = new MockERC20("USDG", "USDG", 6);
        MockERC20 nvda = new MockERC20("NVDA", "NVDA", 18);
        MockRouter router = new MockRouter(100e6);
        MockMorpho m = new MockMorpho();
        FlashLiquidator liq = new FlashLiquidator(address(m), address(router), address(this));

        MarketParams memory p = MarketParams({
            loanToken: address(usdg),
            collateralToken: address(nvda),
            oracle: address(new MockOracle(1e36)),
            irm: address(new MockIrm(0)),
            lltv: LLTV
        });
        usdg.mint(address(m), 1_000_000e6);
        nvda.mint(address(m), 1_000e18);
        usdg.mint(address(router), 1_000_000e6);
        m.setMarket(
            p,
            Market({
                totalSupplyAssets: 100_000e6,
                totalSupplyShares: 100_000e6,
                totalBorrowAssets: 50_000e6,
                totalBorrowShares: 50_000e6,
                lastUpdate: uint128(block.timestamp),
                fee: 0
            })
        );
        m.setPosition(p, BORROWER, Position({supplyShares: 0, borrowShares: 0, collateral: 100e18}));

        // Seizing 10 collateral repays 500 USDG (the mock's 50e6 per unit).
        // The pool pays 50.2 per unit, so the sale returns 502 USDG: 2 USDG of real profit.
        router.set(50.2e6);
        uint256 repaid = 500e6;
        uint256 received = 502e6;
        // The keeper cannot know `repaid` before the call, so it borrows with a margin.
        uint256 flashAmount = (repaid * 101) / 100; // 505 USDG

        assertGt(received, repaid, "the liquidation is profitable on the money that actually moved");

        liq.liquidate(
            FlashLiquidator.LiquidateParams({
                marketParams: p,
                borrower: BORROWER,
                seizedAssets: 10e18,
                repaidShares: 0,
                swapFee: 500,
                flashAmount: flashAmount,
                minAmountOut: 0
            })
        );
        assertEq(usdg.balanceOf(address(this)), received - repaid, "profit should reach the owner");
    }
}
