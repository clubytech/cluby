import { deployments, marketCatalog, vaultCatalog } from "@cluby/config";
import {
  debtOf,
  getMarketParams,
  getMarketState,
  getPosition,
  getOraclePrice,
  getVaultState,
  healthFactorWad,
  liquidationPriceWad,
  safeLtvOf,
  subjectOf,
} from "@cluby/sdk";
import { publicClient } from "./chain";
import { vaultAbi } from "@cluby/sdk";

export type PositionRow = {
  market: string;
  subject: string;
  collateral: number;
  collateralValueUsd: number;
  debtUsd: number;
  healthFactor: number | null;
  liquidationPriceUsd: number | null;
  priceUsd: number;
  lltv: number;
  safeLtv: number;
  liquidatable: boolean;
};

export type VaultRow = {
  key: string;
  name: string;
  address: `0x${string}`;
  shares: number;
  valueUsd: number;
  withdrawableUsd: number;
};

/**
 * Everything one address holds, read straight from the chain.
 *
 * Deliberately not routed through the indexer: a portfolio that goes blank because a service is
 * down is worse than no portfolio page, and the numbers that matter — collateral, debt, health —
 * are three contract reads away.
 */
export async function getPortfolio(address: `0x${string}`) {
  const positions: PositionRow[] = [];

  for (const def of marketCatalog) {
    const deployed = deployments.markets[def.key];
    if (!deployed) continue;

    const [params, state, position] = await Promise.all([
      getMarketParams(publicClient, deployed.id),
      getMarketState(publicClient, deployed.id),
      getPosition(publicClient, deployed.id, address),
    ]);

    if (position.collateral === 0n && position.borrowShares === 0n && position.supplyShares === 0n) continue;

    const price = await getOraclePrice(publicClient, params.oracle);
    const debt = debtOf(position, state);
    const hf = healthFactorWad(position.collateral, debt, price, params.lltv);
    const liq = liquidationPriceWad(position.collateral, debt, params.lltv);
    const loanDecimals = def.loan === "USDG" ? 6 : 18;

    positions.push({
      market: def.key,
      subject: subjectOf(def),
      collateral: Number(position.collateral) / 1e18,
      // Morpho's price is raw-to-raw on a 1e36 scale; for 18-decimal collateral in 6-decimal USDG
      // the human price is that divided by 1e24.
      collateralValueUsd: (Number(position.collateral) / 1e18) * (Number(price) / 1e24),
      debtUsd: Number(debt) / 10 ** loanDecimals,
      healthFactor: hf === null ? null : Number(hf) / 1e18,
      liquidationPriceUsd: liq === null ? null : Number(liq) / 1e24,
      priceUsd: Number(price) / 1e24,
      lltv: Number(params.lltv) / 1e18,
      safeLtv: safeLtvOf(def),
      liquidatable: hf !== null && hf < 10n ** 18n,
    });
  }

  const vaults: VaultRow[] = [];
  for (const v of vaultCatalog) {
    const address_ = deployments.vaults[v.key];
    if (!address_) continue;

    const [shares, state, withdrawable] = await Promise.all([
      publicClient.readContract({ address: address_, abi: vaultAbi, functionName: "balanceOf", args: [address] }),
      getVaultState(publicClient, address_),
      publicClient
        .readContract({ address: address_, abi: vaultAbi, functionName: "maxWithdraw", args: [address] })
        .catch(() => 0n),
    ]);
    if (shares === 0n) continue;

    const value =
      state.totalSupply === 0n ? 0n : (shares * state.totalAssets) / state.totalSupply;

    vaults.push({
      key: v.key,
      name: v.name,
      address: address_,
      shares: Number(shares) / 1e18,
      valueUsd: Number(value) / 1e6,
      withdrawableUsd: Number(withdrawable) / 1e6,
    });
  }

  return { address, positions, vaults };
}
