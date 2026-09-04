// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IOracle} from "../interfaces/IMorpho.sol";

/// @title InverseOracle
/// @notice Prices the short side: a market where USDG is the collateral and a stock is the asset
/// being borrowed needs "USDG per share" — the inverse of the long market's "shares per USDG".
///
/// @dev Morpho's scale is 1e36, so inverting means 1e72 / price. The oracle it wraps must already
/// be conservative for its own side; inverting a price makes the rounding cut the other way, which
/// is why this contract rounds the result DOWN: on a short, understating the collateral's worth is
/// the safe direction, exactly as understating it is on a long.
contract InverseOracle is IOracle {
    uint256 internal constant PRICE_SCALE = 1e36;

    IOracle public immutable source;

    error SourcePriceZero();

    constructor(address _source) {
        source = IOracle(_source);
    }

    function price() external view returns (uint256) {
        uint256 p = source.price();
        if (p == 0) revert SourcePriceZero();
        return (PRICE_SCALE * PRICE_SCALE) / p;
    }
}
