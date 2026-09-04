// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Market} from "../Market.sol";
import {StockOracle} from "../StockOracle.sol";
import {Id, MarketParams, MarketState, RiskParams, Position, IIrm} from "../interfaces/IMarket.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {SharesMath} from "../libraries/SharesMath.sol";

/// @title Lens
/// @notice Read-only aggregation for the UI, keeper and indexer. All numbers include interest
/// accrued up to the current block (simulated, no state change).
contract Lens {
    using MathLib for uint256;
    using SharesMath for uint256;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant SCALE = 1e36;

    struct MarketView {
        MarketParams params;
        MarketState state; // with pending interest applied
        RiskParams risk;
        uint256 utilizationWad;
        uint256 borrowAprWad;
        uint256 supplyAprWad; // after protocol fee
        uint256 price; // 0 if oracle reverts
        bool priceOk;
        StockOracle.Quote quote; // zeroed if oracle is not a StockOracle
        bool weekendMode; // feed not fresh
        uint256 availableToBorrow; // min(liquidity, cap headroom)
    }

    struct UserView {
        Position pos;
        uint256 supplyAssets;
        uint256 borrowAssets;
        uint256 debtValue; // in collateral units
        uint256 healthFactorWad; // collateral*BPS / (debtValue*liqThreshold); type(uint256).max if no debt
        uint256 liquidationPrice; // 1e36 scale price at which HF == 1; 0 if no debt
        uint256 maxBorrowAssets; // additional stock the user could borrow now
        uint256 withdrawableCollateral;
    }

    Market public immutable market;

    constructor(Market market_) {
        market = market_;
    }

    function marketView(Id id) public view returns (MarketView memory v) {
        v.params = market.idToParams(id);
        v.risk = market.risk(id);
        v.state = _accrued(id);
        MarketState memory s = v.state;
        if (s.totalSupplyAssets > 0) v.utilizationWad = uint256(s.totalBorrowAssets).wDivDown(s.totalSupplyAssets);
        uint256 ratePerSec = IIrm(v.params.irm).borrowRate(id, v.utilizationWad);
        v.borrowAprWad = ratePerSec * 365 days;
        v.supplyAprWad = v.borrowAprWad.wMulDown(v.utilizationWad).mulDivDown(BPS - s.feeBps, BPS);

        (v.price, v.priceOk) = _price(v.params);
        (v.quote, v.weekendMode) = _quote(v.params);

        uint256 liquidity = s.totalSupplyAssets > s.totalBorrowAssets ? s.totalSupplyAssets - s.totalBorrowAssets : 0;
        uint256 capRoom = v.risk.borrowCap > s.totalBorrowAssets ? v.risk.borrowCap - s.totalBorrowAssets : 0;
        v.availableToBorrow = MathLib.min(liquidity, capRoom);
    }

    function userView(Id id, address user) external view returns (UserView memory u) {
        MarketView memory m = marketView(id);
        MarketState memory s = m.state;
        u.pos = market.position(id, user);
        u.supplyAssets = uint256(u.pos.supplyShares).toAssetsDown(s.totalSupplyAssets, s.totalSupplyShares);
        u.borrowAssets = uint256(u.pos.borrowShares).toAssetsUp(s.totalBorrowAssets, s.totalBorrowShares);
        if (!m.priceOk) {
            u.healthFactorWad = u.borrowAssets == 0 ? type(uint256).max : 0;
            return u;
        }
        u.debtValue = u.borrowAssets.mulDivUp(m.price, SCALE);
        uint256 collateral = u.pos.collateral;
        if (u.borrowAssets == 0) {
            u.healthFactorWad = type(uint256).max;
            u.withdrawableCollateral = collateral;
        } else {
            uint256 denom = u.debtValue.mulDivUp(m.risk.liqThresholdBps, BPS);
            u.healthFactorWad = denom == 0 ? type(uint256).max : (collateral * 1e18) / denom;
            // liquidation price: collateral*BPS = borrowAssets*P/SCALE*liqThreshold
            u.liquidationPrice = (collateral * BPS).mulDivDown(SCALE, u.borrowAssets * m.risk.liqThresholdBps);
            uint256 required = u.debtValue.mulDivUp(m.risk.initialMarginBps, BPS);
            u.withdrawableCollateral = collateral > required ? collateral - required : 0;
        }
        // max additional borrow under initial margin: (collateral*BPS/im) is the max debt value
        uint256 maxDebtValue = (collateral * BPS) / m.risk.initialMarginBps;
        uint256 maxDebtAssets = maxDebtValue.mulDivDown(SCALE, m.price);
        uint256 room = maxDebtAssets > u.borrowAssets ? maxDebtAssets - u.borrowAssets : 0;
        u.maxBorrowAssets = MathLib.min(room, m.availableToBorrow);
    }

    /// @notice Same math as Market.accrueInterest, without writing state.
    function _accrued(Id id) internal view returns (MarketState memory s) {
        s = market.state(id);
        uint256 elapsed = block.timestamp - s.lastUpdate;
        if (elapsed == 0 || s.totalBorrowAssets == 0) return s;
        MarketParams memory p = market.idToParams(id);
        uint256 utilization = uint256(s.totalBorrowAssets).wDivDown(s.totalSupplyAssets);
        uint256 rate = IIrm(p.irm).borrowRate(id, utilization);
        uint256 interest = uint256(s.totalBorrowAssets).wMulDown(rate.wTaylorCompounded(elapsed));
        s.totalBorrowAssets += uint128(interest);
        s.totalSupplyAssets += uint128(interest);
        if (s.feeBps != 0) {
            uint256 feeAmount = interest.mulDivDown(s.feeBps, BPS);
            uint256 feeShares = feeAmount.toSharesDown(s.totalSupplyAssets - feeAmount, s.totalSupplyShares);
            s.totalSupplyShares += uint128(feeShares);
        }
    }

    function _price(MarketParams memory p) internal view returns (uint256, bool) {
        try StockOracle(p.oracle).price(p.stock) returns (uint256 px) {
            return (px, true);
        } catch {
            return (0, false);
        }
    }

    function _quote(MarketParams memory p) internal view returns (StockOracle.Quote memory q, bool weekend) {
        try StockOracle(p.oracle).quote(p.stock) returns (StockOracle.Quote memory qq) {
            q = qq;
            weekend = !qq.feedFresh;
        } catch {}
    }
}
