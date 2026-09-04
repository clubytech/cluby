// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IOracle} from "../interfaces/IMorpho.sol";

/// @title MinOracle
/// @notice Takes the lower of two prices for the same collateral — in practice a Chainlink feed and
/// a pool TWAP.
///
/// @dev For collateral, low is safe and high is dangerous: an overstated collateral price lets
/// someone borrow more than their position is worth, and the protocol eats the difference. So the
/// pair is combined with min(), never max().
///
/// This is the opposite of what a short-lending protocol wants for the same two sources, and the
/// mistake is easy to carry over from one codebase to another: max(feed, twap) protects a lender of
/// *shares*, min(feed, twap) protects a lender of *cash*. Cluby lends cash against shares.
///
/// It also handles the weekend honestly. A stock feed on this chain updates 24/5 and stands still
/// from Friday close to Monday open — around 65 hours — so a staleness check tight enough to catch
/// a broken feed would reject every weekend. Instead the feed is allowed to be old, and the TWAP,
/// which keeps moving because the DEX never closes, is what pulls the price down if the market
/// gaps while the feed is asleep.
contract MinOracle is IOracle {
    IOracle public immutable feedOracle;
    IOracle public immutable twapOracle;

    error PriceZero();

    constructor(address _feedOracle, address _twapOracle) {
        feedOracle = IOracle(_feedOracle);
        twapOracle = IOracle(_twapOracle);
    }

    function price() external view returns (uint256) {
        uint256 a = feedOracle.price();
        uint256 b = twapOracle.price();
        uint256 p = a < b ? a : b;
        if (p == 0) revert PriceZero();
        return p;
    }

    /// @notice Both legs, for a watchdog that wants to alert on divergence rather than act on it.
    function prices() external view returns (uint256 feedPrice, uint256 twapPrice) {
        return (feedOracle.price(), twapOracle.price());
    }
}
