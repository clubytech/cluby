// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IMorpho, IOracle, IIrm, Id, MarketParams, Market, Position, MarketParamsLib} from "../interfaces/IMorpho.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {SharesMath} from "../libraries/SharesMath.sol";

/// @title Lens
/// @notice Every number the site, the keeper and the indexer read, computed the way Morpho computes
/// it — including interest that has accrued since the last touch but has not been written yet.
///
/// @dev Morpho only accrues on interaction, so a market read straight from storage understates the
/// debt of every borrower between transactions. A health factor computed from that stale debt is
/// too generous, which is precisely the direction that gets a liquidator's simulation to disagree
/// with the transaction it then sends. So this contract applies pending interest first, and every
/// view here is what the next transaction will see rather than what the last one left behind.
contract Lens {
    using MathLib for uint256;
    using SharesMath for uint256;
    using MarketParamsLib for MarketParams;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant ORACLE_PRICE_SCALE = 1e36;

    IMorpho public immutable morpho;

    struct MarketView {
        Id id;
        MarketParams params;
        Market state; // with pending interest applied
        uint256 utilizationWad;
        uint256 borrowRatePerSecond;
        uint256 borrowApyWad;
        uint256 supplyApyWad;
        uint256 liquidityAssets;
        uint256 price;
    }

    struct UserView {
        uint256 collateral;
        uint256 collateralValue; // in loan-token units
        uint256 supplyAssets;
        uint256 borrowAssets;
        uint256 maxBorrowAssets; // at LLTV
        uint256 safeBorrowAssets; // at LLTV minus the UI margin
        uint256 healthFactorWad; // type(uint256).max when there is no debt
        uint256 liquidationPrice; // oracle scale, 0 when there is no debt
        bool liquidatable;
    }

    constructor(address _morpho) {
        morpho = IMorpho(_morpho);
    }

    function marketView(MarketParams memory params) public view returns (MarketView memory v) {
        v.id = params.id();
        v.params = params;
        v.state = _accrued(params, v.id);

        v.utilizationWad = v.state.totalSupplyAssets == 0
            ? 0
            : uint256(v.state.totalBorrowAssets).wDivDown(uint256(v.state.totalSupplyAssets));

        v.borrowRatePerSecond = IIrm(params.irm).borrowRateView(params, v.state);
        // Morpho compounds continuously; the Taylor form is what the contract itself uses.
        v.borrowApyWad = v.borrowRatePerSecond.wTaylorCompounded(365 days);
        uint256 feeShare = WAD - uint256(v.state.fee);
        v.supplyApyWad = v.borrowApyWad.wMulDown(v.utilizationWad).wMulDown(feeShare);

        v.liquidityAssets = v.state.totalSupplyAssets > v.state.totalBorrowAssets
            ? uint256(v.state.totalSupplyAssets) - uint256(v.state.totalBorrowAssets)
            : 0;
        v.price = IOracle(params.oracle).price();
    }

    /// @param safeMarginWad How far inside LLTV the app is willing to let a position open, in WAD
    /// (0.05e18 = five percentage points).
    function userView(MarketParams memory params, address user, uint256 safeMarginWad)
        public
        view
        returns (UserView memory u)
    {
        Id id = params.id();
        Market memory m = _accrued(params, id);
        Position memory p = morpho.position(id, user);
        uint256 price = IOracle(params.oracle).price();

        u.collateral = p.collateral;
        u.collateralValue = uint256(p.collateral).mulDivDown(price, ORACLE_PRICE_SCALE);
        u.supplyAssets = uint256(p.supplyShares).toAssetsDown(m.totalSupplyAssets, m.totalSupplyShares);
        // Debt rounds up against the borrower, the same way Morpho rounds it.
        u.borrowAssets = uint256(p.borrowShares).toAssetsUp(m.totalBorrowAssets, m.totalBorrowShares);

        u.maxBorrowAssets = u.collateralValue.wMulDown(params.lltv);
        uint256 safeLltv = params.lltv > safeMarginWad ? params.lltv - safeMarginWad : 0;
        u.safeBorrowAssets = u.collateralValue.wMulDown(safeLltv);

        if (u.borrowAssets == 0) {
            u.healthFactorWad = type(uint256).max;
            u.liquidationPrice = 0;
            u.liquidatable = false;
        } else {
            u.healthFactorWad = u.maxBorrowAssets.wDivDown(u.borrowAssets);
            u.liquidatable = u.healthFactorWad < WAD;
            u.liquidationPrice = p.collateral == 0
                ? type(uint256).max
                : u.borrowAssets.mulDivUp(ORACLE_PRICE_SCALE, uint256(p.collateral).wMulDown(params.lltv));
        }
    }

    /// @notice What a position would look like after a borrow — the preview a wallet signs against.
    function previewBorrow(MarketParams memory params, address user, uint256 addCollateral, uint256 addBorrow)
        external
        view
        returns (UserView memory u)
    {
        u = userView(params, user, 0);

        uint256 price = IOracle(params.oracle).price();
        uint256 collateral = u.collateral + addCollateral;
        uint256 borrowAssets = u.borrowAssets + addBorrow;

        u.collateral = collateral;
        u.collateralValue = collateral.mulDivDown(price, ORACLE_PRICE_SCALE);
        u.borrowAssets = borrowAssets;
        u.maxBorrowAssets = u.collateralValue.wMulDown(params.lltv);

        if (borrowAssets == 0) {
            u.healthFactorWad = type(uint256).max;
            u.liquidationPrice = 0;
            u.liquidatable = false;
        } else {
            u.healthFactorWad = u.maxBorrowAssets.wDivDown(borrowAssets);
            u.liquidatable = u.healthFactorWad < WAD;
            u.liquidationPrice = collateral == 0
                ? type(uint256).max
                : borrowAssets.mulDivUp(ORACLE_PRICE_SCALE, collateral.wMulDown(params.lltv));
        }
    }

    function marketViews(MarketParams[] calldata paramsList) external view returns (MarketView[] memory out) {
        out = new MarketView[](paramsList.length);
        for (uint256 i; i < paramsList.length; ++i) {
            out[i] = marketView(paramsList[i]);
        }
    }

    /// @notice Health factors for a batch of borrowers: the keeper's hot path.
    function healthFactors(MarketParams memory params, address[] calldata users)
        external
        view
        returns (uint256[] memory hfs)
    {
        hfs = new uint256[](users.length);
        for (uint256 i; i < users.length; ++i) {
            hfs[i] = userView(params, users[i], 0).healthFactorWad;
        }
    }

    /// @dev Morpho's own interest accrual, replayed in memory so no state is touched.
    function _accrued(MarketParams memory params, Id id) internal view returns (Market memory m) {
        m = morpho.market(id);
        uint256 elapsed = block.timestamp - uint256(m.lastUpdate);
        if (elapsed == 0 || m.totalBorrowAssets == 0) return m;

        uint256 borrowRate = IIrm(params.irm).borrowRateView(params, m);
        uint256 interest = uint256(m.totalBorrowAssets).wMulDown(borrowRate.wTaylorCompounded(elapsed));

        m.totalBorrowAssets += uint128(interest);
        m.totalSupplyAssets += uint128(interest);

        if (m.fee != 0) {
            uint256 feeAmount = interest.wMulDown(uint256(m.fee));
            // Fee shares are minted against supply excluding the fee itself, as Morpho does.
            uint256 feeShares = feeAmount.toSharesDown(
                uint256(m.totalSupplyAssets) - feeAmount, uint256(m.totalSupplyShares)
            );
            m.totalSupplyShares += uint128(feeShares);
        }
    }
}
