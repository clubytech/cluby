// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

type Id is bytes32;

struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

struct Market {
    uint128 totalSupplyAssets;
    uint128 totalSupplyShares;
    uint128 totalBorrowAssets;
    uint128 totalBorrowShares;
    uint128 lastUpdate;
    uint128 fee;
}

struct Position {
    uint256 supplyShares;
    uint128 borrowShares;
    uint128 collateral;
}

struct Authorization {
    address authorizer;
    address authorized;
    bool isAuthorized;
    uint256 nonce;
    uint256 deadline;
}

/// @notice The slice of Morpho Blue that Cluby's periphery uses. Morpho itself is immutable and
/// already deployed; nothing here is ours to change, so the interface stays minimal on purpose.
interface IMorpho {
    function createMarket(MarketParams memory marketParams) external;

    function supply(MarketParams memory marketParams, uint256 assets, uint256 shares, address onBehalf, bytes memory data)
        external
        returns (uint256 assetsSupplied, uint256 sharesSupplied);

    function withdraw(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn);

    function borrow(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

    function repay(MarketParams memory marketParams, uint256 assets, uint256 shares, address onBehalf, bytes memory data)
        external
        returns (uint256 assetsRepaid, uint256 sharesRepaid);

    function supplyCollateral(MarketParams memory marketParams, uint256 assets, address onBehalf, bytes memory data)
        external;

    function withdrawCollateral(MarketParams memory marketParams, uint256 assets, address onBehalf, address receiver)
        external;

    function liquidate(
        MarketParams memory marketParams,
        address borrower,
        uint256 seizedAssets,
        uint256 repaidShares,
        bytes memory data
    ) external returns (uint256, uint256);

    /// @dev Free on Morpho: the fee is zero, so liquidations and leverage need no capital of ours.
    function flashLoan(address token, uint256 assets, bytes calldata data) external;

    function accrueInterest(MarketParams memory marketParams) external;

    function setAuthorization(address authorized, bool newIsAuthorized) external;

    function market(Id id) external view returns (Market memory);
    function position(Id id, address user) external view returns (Position memory);
    function idToMarketParams(Id id) external view returns (MarketParams memory);
    function isAuthorized(address authorizer, address authorized) external view returns (bool);
}

interface IMorphoLiquidateCallback {
    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external;
}

interface IMorphoFlashLoanCallback {
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external;
}

interface IMorphoSupplyCollateralCallback {
    function onMorphoSupplyCollateral(uint256 assets, bytes calldata data) external;
}

interface IMorphoRepayCallback {
    function onMorphoRepay(uint256 assets, bytes calldata data) external;
}

/// @notice Morpho's oracle contract: collateral price quoted in loan tokens, scaled by 1e36
/// adjusted for both tokens' decimals.
interface IOracle {
    function price() external view returns (uint256);
}

interface IIrm {
    function borrowRate(MarketParams memory marketParams, Market memory market) external returns (uint256);
    function borrowRateView(MarketParams memory marketParams, Market memory market) external view returns (uint256);
}

/// @notice Morpho's factory for Chainlink-backed oracles. Using it means no oracle code of ours
/// sits in the price path for a feed-priced market.
interface IChainlinkOracleV2Factory {
    function createMorphoChainlinkOracleV2(
        address baseVault,
        uint256 baseVaultConversionSample,
        address baseFeed1,
        address baseFeed2,
        uint256 baseTokenDecimals,
        address quoteVault,
        uint256 quoteVaultConversionSample,
        address quoteFeed1,
        address quoteFeed2,
        uint256 quoteTokenDecimals,
        bytes32 salt
    ) external returns (address oracle);
}

library MarketParamsLib {
    /// @dev Morpho's own id derivation: the keccak of the abi-encoded struct. Deterministic, so a
    /// market's id is known before it exists.
    function id(MarketParams memory marketParams) internal pure returns (Id marketParamsId) {
        assembly ("memory-safe") {
            marketParamsId := keccak256(marketParams, 160)
        }
    }
}
