// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Known Robinhood Chain (4663) mainnet addresses. Source: docs.robinhood.com/chain,
/// api.robinhood.com/rhj/assets, Chainlink feed directory, Uniswap deployments page.
/// Used by scripts and fork tests only; production contracts take addresses as constructor args.
library Addresses {
    uint256 internal constant CHAIN_ID = 4663;

    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    // Stock tokens (ERC-20, 18 decimals, ERC-8056 uiMultiplier)
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address internal constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address internal constant SPY = 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C;
    address internal constant HIMS = 0xCceE82fE024c36fA15E1005edE3E9e4787e23D09;
    address internal constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;

    // Chainlink feeds (AggregatorV3, 8 decimals, 24h heartbeat, price includes multiplier)
    address internal constant FEED_NVDA = 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15;
    address internal constant FEED_TSLA = 0x4A1166a659A55625345e9515b32adECea5547C38;
    address internal constant FEED_SPY = 0x319724394D3A0e3669269846abE664Cd621f9f6A;
    address internal constant FEED_AAPL = 0x6B22A786bAa607d76728168703a39Ea9C99f2cD0;
    address internal constant FEED_ETH = 0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9;

    // Uniswap
    address internal constant UNI_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984; // unconfirmed
    address internal constant UNI_V3_SWAP_ROUTER02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address internal constant UNI_V4_POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address internal constant UNI_V4_UNIVERSAL_ROUTER = 0x8876789976dEcBfCbBbe364623C63652db8C0904;
    address internal constant UNI_V4_QUOTER = 0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94;
    address internal constant UNI_V4_STATE_VIEW = 0xF3334192D15450CdD385c8B70e03f9A6bD9E673b;

    // Misc
    address internal constant ONEINCH_V6 = 0x111111125421cA6dc452d289314280a0f8842A65;
    address internal constant MULTICALL3 = 0xcA11bde05977b3631167028862bE2a173976CA11;
    address internal constant MORPHO_BLUE = 0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010;
    address internal constant ARB_SYS = 0x0000000000000000000000000000000000000064;
}
