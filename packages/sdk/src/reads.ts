import type { Address, PublicClient } from "viem";
import { ORACLE_PRICE_SCALE, morpho } from "@cluby/config";
import {
  chainlinkFeedAbi,
  erc20Abi,
  irmAbi,
  morphoBlueAbi,
  oracleAbi,
  stockTokenAbi,
  uniswapV3PoolAbi,
  vaultAbi,
} from "./abi.ts";
import { rateToApy, toAssetsDown } from "./math.ts";
import type { MarketParams } from "./market-id.ts";

const BLUE = morpho.blue.address as Address;
const IRM = morpho.adaptiveCurveIrm.address as Address;

export type MarketState = {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
};

export async function getMarketParams(client: PublicClient, id: `0x${string}`): Promise<MarketParams> {
  const p = await client.readContract({ address: BLUE, abi: morphoBlueAbi, functionName: "idToMarketParams", args: [id] });
  return { loanToken: p[0], collateralToken: p[1], oracle: p[2], irm: p[3], lltv: p[4] };
}

export async function getMarketState(client: PublicClient, id: `0x${string}`): Promise<MarketState> {
  const s = await client.readContract({ address: BLUE, abi: morphoBlueAbi, functionName: "market", args: [id] });
  return {
    totalSupplyAssets: s[0],
    totalSupplyShares: s[1],
    totalBorrowAssets: s[2],
    totalBorrowShares: s[3],
    lastUpdate: s[4],
    fee: s[5],
  };
}

/** Borrow rate the market charges right now, compounded to a yearly figure. */
export async function getRates(client: PublicClient, params: MarketParams, state: MarketState) {
  const perSecond = await client.readContract({
    address: (params.irm === "0x0000000000000000000000000000000000000000" ? IRM : params.irm) as Address,
    abi: irmAbi,
    functionName: "borrowRateView",
    args: [params, state],
  });
  const borrowApy = rateToApy(perSecond);
  const utilization =
    state.totalSupplyAssets === 0n ? 0 : Number(state.totalBorrowAssets) / Number(state.totalSupplyAssets);
  const feeShare = 1 - Number(state.fee) / 1e18;
  return { perSecond, borrowApy, utilization, supplyApy: borrowApy * utilization * feeShare };
}

export type PositionState = { supplyShares: bigint; borrowShares: bigint; collateral: bigint };

export async function getPosition(
  client: PublicClient,
  id: `0x${string}`,
  user: Address,
): Promise<PositionState> {
  const p = await client.readContract({ address: BLUE, abi: morphoBlueAbi, functionName: "position", args: [id, user] });
  return { supplyShares: p[0], borrowShares: p[1], collateral: p[2] };
}

/** Debt in loan-token units, rounded the way Morpho rounds it against the borrower. */
export function debtOf(position: PositionState, state: MarketState) {
  return toAssetsDown(position.borrowShares, state.totalBorrowAssets, state.totalBorrowShares);
}

export const getOraclePrice = (client: PublicClient, oracle: Address) =>
  client.readContract({ address: oracle, abi: oracleAbi, functionName: "price" });

export type FeedRead = { price: number; scaled: bigint; updatedAt: number; ageSeconds: number };

/**
 * A Chainlink read, returned both as a display number and on Morpho's 1e36 scale so it can be
 * compared with what an oracle contract would report for the same pair.
 */
export async function readFeed(
  client: PublicClient,
  feed: Address,
  { collateralDecimals = 18, loanDecimals = 6 } = {},
): Promise<FeedRead | null> {
  try {
    const [round, decimals] = await Promise.all([
      client.readContract({ address: feed, abi: chainlinkFeedAbi, functionName: "latestRoundData" }),
      client.readContract({ address: feed, abi: chainlinkFeedAbi, functionName: "decimals" }),
    ]);
    const answer = round[1];
    if (answer <= 0n) return null;
    const price = Number(answer) / 10 ** Number(decimals);
    // Morpho scale: 1e36 · (loan units per collateral unit), decimals folded in.
    const scaled =
      (BigInt(answer) * ORACLE_PRICE_SCALE * 10n ** BigInt(loanDecimals)) /
      (10n ** BigInt(decimals) * 10n ** BigInt(collateralDecimals));
    const updatedAt = Number(round[3]);
    return { price, scaled, updatedAt, ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - updatedAt) };
  } catch {
    return null;
  }
}

/**
 * Arithmetic-mean-tick TWAP over `windowSeconds`, the price a TWAP oracle would report.
 * Reverts inside the pool if the window is longer than the stored observations, which is exactly
 * the check that tells you cardinality still needs raising.
 */
export async function readTwap(
  client: PublicClient,
  pool: Address,
  token: Address,
  quote: Address,
  { windowSeconds = 1800, tokenDecimals = 18, quoteDecimals = 6 } = {},
): Promise<{ price: number; tick: number; windowSeconds: number } | null> {
  try {
    const [observed, token0] = await Promise.all([
      client.readContract({
        address: pool,
        abi: uniswapV3PoolAbi,
        functionName: "observe",
        args: [[windowSeconds, 0]],
      }),
      client.readContract({ address: pool, abi: uniswapV3PoolAbi, functionName: "token0" }),
    ]);
    const [start, end] = observed[0];
    const delta = end - start;
    const window = BigInt(windowSeconds);
    // Solidity truncates toward zero; Uniswap rounds the mean tick down for negatives.
    let tick = delta / window;
    if (delta < 0n && delta % window !== 0n) tick -= 1n;

    // 1.0001^tick is token1 per token0 in RAW units; the decimal gap is folded in afterwards.
    // Whichever side the token sits on, the same 10^(tokenDecimals − quoteDecimals) factor applies:
    // once as a scale-up for token0, once inside the inversion for token1.
    const raw = 1.0001 ** Number(tick);
    const tokenIsZero = token0.toLowerCase() === token.toLowerCase();
    const decimalFactor = 10 ** (tokenDecimals - quoteDecimals);
    const price = tokenIsZero ? raw * decimalFactor : decimalFactor / raw;
    return { price, tick: Number(tick), windowSeconds };
  } catch {
    return null;
  }
}

/** Cardinality tells you whether a TWAP of a given length is even possible yet. */
export async function readPoolHealth(client: PublicClient, pool: Address) {
  const [slot0, liquidity] = await Promise.all([
    client.readContract({ address: pool, abi: uniswapV3PoolAbi, functionName: "slot0" }),
    client.readContract({ address: pool, abi: uniswapV3PoolAbi, functionName: "liquidity" }),
  ]);
  return {
    tick: slot0[1],
    observationCardinality: slot0[3],
    observationCardinalityNext: slot0[4],
    liquidity,
  };
}

/**
 * Is this the real tokenized stock, or a memecoin squatting the ticker? The real ones answer
 * `uiMultiplier()`; the squatters revert. Symbol proves nothing on this chain.
 */
export async function isTokenizedStock(client: PublicClient, token: Address) {
  try {
    const multiplier = await client.readContract({
      address: token,
      abi: stockTokenAbi,
      functionName: "uiMultiplier",
    });
    return { real: true, uiMultiplier: multiplier };
  } catch {
    return { real: false, uiMultiplier: null };
  }
}

export async function getVaultState(client: PublicClient, vault: Address) {
  const [totalAssets, totalSupply, asset, fee, timelock, owner] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: "totalAssets" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "totalSupply" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "asset" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "fee" }).catch(() => 0n),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "timelock" }).catch(() => 0n),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "owner" }).catch(() => null),
  ]);
  return { totalAssets, totalSupply, asset, fee, timelock, owner };
}

/** The cap a vault may lend into one market, and whether that market is enabled at all. */
export async function getVaultMarketConfig(client: PublicClient, vault: Address, marketId: `0x${string}`) {
  const c = await client.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "config",
    args: [marketId],
  });
  return { cap: c[0], enabled: c[1], removableAt: c[2] };
}

export const getBalance = (client: PublicClient, token: Address, owner: Address) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

export const getAllowance = (client: PublicClient, token: Address, owner: Address, spender: Address) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
