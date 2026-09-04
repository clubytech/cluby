import {
  LLTV,
  deployments,
  economics,
  marketCatalog,
  morpho,
  vaultCatalog,
  type MarketDef,
} from "@cluby/config";
import {
  decimalsOf,
  feedOf,
  getMarketParams,
  getMarketState,
  getPosition,
  getRates,
  getVaultState,
  healthFactorWad,
  leveragePlan,
  liquidationPriceWad,
  maxAgeOf,
  poolOf,
  readFeed,
  readTwap,
  safeLtvOf,
  subjectOf,
  tokenAddressOf,
  debtOf,
} from "@cluby/sdk";
import { publicClient } from "./chain.ts";

const USDG_DECIMALS = 6;
const TWAP_WINDOW = 1800;
const WAD = 10n ** 18n;
const ORACLE_SCALE = 10n ** 36n;

export async function priceOf(subject: string) {
  const feed = feedOf(subject);
  if (feed) {
    const read = await readFeed(publicClient, feed);
    if (read) return { price: read.price, ageSeconds: read.ageSeconds, source: "chainlink" as const };
  }
  const pool = poolOf(subject);
  const token = tokenAddressOf(subject);
  if (pool && token) {
    const twap = await readTwap(publicClient, pool.address as `0x${string}`, token, "0x", {
      windowSeconds: TWAP_WINDOW,
      tokenDecimals: decimalsOf(subject),
      quoteDecimals: USDG_DECIMALS,
    });
    if (twap) return { price: twap.price, ageSeconds: TWAP_WINDOW, source: "twap" as const };
  }
  return { price: null, ageSeconds: null, source: null };
}

export async function describeMarket(def: MarketDef) {
  const subject = subjectOf(def);
  const { price, ageSeconds, source } = await priceOf(subject);
  const deployed = deployments.markets[def.key];
  const lltv = Number(LLTV[def.tier]) / 1e18;
  const safeLtv = safeLtvOf(def);

  const base = {
    key: def.key,
    side: def.side,
    subject,
    collateral: def.collateral,
    loan: def.loan,
    category: def.category,
    status: deployed ? ("live" as const) : def.status,
    marketId: deployed?.id ?? null,
    oracle: deployed?.oracle ?? null,
    oracleKind: def.oracle,
    priceUsd: price,
    priceSource: source,
    priceAgeSeconds: ageSeconds,
    priceStale: source === "chainlink" && ageSeconds !== null && ageSeconds > maxAgeOf(def),
    liquidationLtv: lltv,
    maxLtvInApp: safeLtv,
    maxLeverage: safeLtv >= 1 ? null : 1 / (1 - safeLtv),
    supplyCapUsd: def.supplyCapUsd,
    note: def.note ?? null,
  };

  if (!deployed) return { ...base, supplied: 0, borrowed: 0, liquidity: 0, utilization: 0, borrowApy: null, supplyApy: null };

  const [params, state] = await Promise.all([
    getMarketParams(publicClient, deployed.id),
    getMarketState(publicClient, deployed.id),
  ]);
  const rates = await getRates(publicClient, params, state).catch(() => null);
  const unit = 10 ** (def.loan === "USDG" ? USDG_DECIMALS : 18);

  return {
    ...base,
    supplied: Number(state.totalSupplyAssets) / unit,
    borrowed: Number(state.totalBorrowAssets) / unit,
    liquidity: Number(state.totalSupplyAssets - state.totalBorrowAssets) / unit,
    utilization: rates?.utilization ?? 0,
    borrowApy: rates?.borrowApy ?? null,
    supplyApy: rates?.supplyApy ?? null,
  };
}

export const listMarketDefs = () => marketCatalog;

export async function describePosition(marketKey: string, user: `0x${string}`) {
  const def = marketCatalog.find((m) => m.key.toLowerCase() === marketKey.toLowerCase());
  if (!def) throw new Error(`no market called ${marketKey}`);
  const deployed = deployments.markets[def.key];
  if (!deployed) throw new Error(`${def.key} is not created on chain yet`);

  const [params, state, position] = await Promise.all([
    getMarketParams(publicClient, deployed.id),
    getMarketState(publicClient, deployed.id),
    getPosition(publicClient, deployed.id, user),
  ]);

  const price = await publicClient.readContract({
    address: params.oracle,
    abi: [{ type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }],
    functionName: "price",
  });

  const debt = debtOf(position, state);
  const hf = healthFactorWad(position.collateral, debt, price, params.lltv);
  const liq = liquidationPriceWad(position.collateral, debt, params.lltv);
  const loanUnit = 10 ** (def.loan === "USDG" ? USDG_DECIMALS : 18);

  return {
    market: def.key,
    user,
    collateral: Number(position.collateral) / 1e18,
    debt: Number(debt) / loanUnit,
    healthFactor: hf === null ? null : Number(hf) / 1e18,
    /** The collateral price at which this position becomes liquidatable. */
    liquidationPriceUsd: liq === null ? null : Number(liq) / 1e24,
    liquidatable: hf !== null && hf < WAD,
  };
}

/** What a borrow would do to a position, before anyone signs anything. */
export async function quoteBorrow(marketKey: string, collateralAmount: number, borrowAmount: number) {
  const def = marketCatalog.find((m) => m.key.toLowerCase() === marketKey.toLowerCase());
  if (!def) throw new Error(`no market called ${marketKey}`);

  const { price } = await priceOf(subjectOf(def));
  if (price === null) throw new Error(`no price for ${subjectOf(def)}`);

  const lltv = LLTV[def.tier];
  const collateralValue = collateralAmount * price;
  const maxBorrow = collateralValue * (Number(lltv) / 1e18);
  const safeBorrow = collateralValue * safeLtvOf(def);
  const hf = borrowAmount === 0 ? null : maxBorrow / borrowAmount;

  return {
    market: def.key,
    collateralAmount,
    collateralValueUsd: collateralValue,
    borrowAmount,
    maxBorrowAtLiquidationLtv: maxBorrow,
    maxBorrowInApp: safeBorrow,
    exceedsSafeCap: borrowAmount > safeBorrow,
    healthFactor: hf,
    liquidationPriceUsd:
      borrowAmount === 0 || collateralAmount === 0
        ? null
        : borrowAmount / (collateralAmount * (Number(lltv) / 1e18)),
    priceUsd: price,
  };
}

export async function quoteMultiply(marketKey: string, equityUsd: number, leverage: number) {
  const def = marketCatalog.find((m) => m.key.toLowerCase() === marketKey.toLowerCase());
  if (!def) throw new Error(`no market called ${marketKey}`);
  const { price } = await priceOf(subjectOf(def));
  const lltv = LLTV[def.tier];

  const plan = leveragePlan(BigInt(Math.round(equityUsd * 1e6)), leverage, lltv);
  const maxLeverage = 1 / (1 - safeLtvOf(def));

  return {
    market: def.key,
    equityUsd,
    leverage,
    maxLeverageInApp: maxLeverage,
    exceedsMaxLeverage: leverage > maxLeverage,
    exposureUsd: Number(plan.exposure) / 1e6,
    debtUsd: Number(plan.debt) / 1e6,
    resultingLtv: Number(plan.ltvWad) / 1e18,
    healthFactor: plan.healthFactorWad === null ? null : Number(plan.healthFactorWad) / 1e18,
    liquidationPriceUsd: price === null ? null : price * (Number(plan.liquidationDropWad) / 1e18),
    flashLoanUsd: Number(plan.flashLoan) / 1e6,
  };
}

export async function describeVaults() {
  return Promise.all(
    vaultCatalog.map(async (v) => {
      const address = deployments.vaults[v.key];
      if (!address) {
        return { key: v.key, name: v.name, asset: v.asset, status: v.status, address: null, totalAssets: 0, fee: 0, timelockSeconds: 0 };
      }
      const state = await getVaultState(publicClient, address).catch(() => null);
      return {
        key: v.key,
        name: v.name,
        asset: v.asset,
        status: "live" as const,
        address,
        totalAssets: state ? Number(state.totalAssets) / 1e6 : 0,
        fee: state ? Number(state.fee) / 1e18 : 0,
        timelockSeconds: state ? Number(state.timelock) : 0,
      };
    }),
  );
}

export function protocolFacts() {
  return {
    chainId: 4663,
    chain: "Robinhood Chain",
    contracts: {
      morphoBlue: morpho.blue.address,
      irm: morpho.adaptiveCurveIrm.address,
      chainlinkOracleFactory: morpho.chainlinkOracleV2Factory.address,
      metaMorphoFactory: deployments.metaMorphoFactory ?? null,
      lens: deployments.lens ?? null,
      flashLiquidator: deployments.flashLiquidator ?? null,
      leverageRouter: deployments.leverageRouter ?? null,
    },
    economics: {
      performanceFee: Number(economics.performanceFeeWad) / 1e18,
      introFee: Number(economics.introFeeWad) / 1e18,
      introDays: economics.introDays,
      borrowRebate: economics.borrowRebate,
      flashLoanFee: economics.flashLoanFee,
    },
    lltvTiers: Object.fromEntries(Object.entries(LLTV).map(([k, v]) => [k, Number(v) / 1e18])),
    /** Flash loans are Morpho's, free, and need nothing from us. */
    flashLoans: {
      contract: morpho.blue.address,
      call: "flashLoan(address token, uint256 assets, bytes data)",
      callback: "onMorphoFlashLoan(uint256 assets, bytes data)",
      fee: 0,
    },
  };
}

export { ORACLE_SCALE };
