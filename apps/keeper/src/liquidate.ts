import type { Hex } from "viem";
import { formatUnits } from "viem";
import { lensAbi, flashLiquidatorAbi } from "@cluby/abi";
import { marketCatalog, stocks, nativeTokens } from "@cluby/config";
import { getMarketParams } from "@cluby/sdk";
import { alert } from "./alerts.ts";
import { LENS, LIQUIDATOR, MARKETS, MIN_PROFIT, WARN_HF, account, log, pub, wallet } from "./env.ts";

const WAD = 10n ** 18n;
const ORACLE_SCALE = 10n ** 36n;
/** Morpho's liquidation curve, mirrored so the flash loan can be sized before the call is made. */
const LIQUIDATION_CURSOR = 3n * 10n ** 17n; // 0.3
const MAX_LIF = 115n * 10n ** 16n; // 1.15

/** LIF = min(1.15, 1 / (1 − 0.3·(1 − LLTV))). At 62.5% that is 1.1268. */
export function liquidationIncentiveFactor(lltv: bigint): bigint {
  const factor = (WAD * WAD) / (WAD - (LIQUIDATION_CURSOR * (WAD - lltv)) / WAD);
  return factor < MAX_LIF ? factor : MAX_LIF;
}

const poolFeeOf = (token: string): number => {
  const t = token.toLowerCase();
  for (const s of Object.values(stocks)) if (s.address.toLowerCase() === t) return s.usdgPool.fee;
  for (const n of Object.values(nativeTokens)) if (n.address.toLowerCase() === t) return n.usdgPool.fee;
  return 500;
};

const keyOfId = (id: string) =>
  Object.entries(MARKETS).find(([, m]) => m.id.toLowerCase() === id.toLowerCase())?.[0] ?? id;

type Candidate = {
  key: string;
  marketId: Hex;
  user: Hex;
  healthFactor: bigint;
  collateral: bigint;
  debt: bigint;
};

/** Health of every watched borrower, worst first. */
export async function scanHealth(watch: Map<string, Set<string>>): Promise<Candidate[]> {
  const out: Candidate[] = [];

  for (const [id, users] of watch) {
    if (users.size === 0) continue;
    const params = await getMarketParams(pub, id as Hex);

    const views = await Promise.all(
      [...users].map(async (user) => {
        const v = await pub.readContract({
          address: LENS,
          abi: lensAbi,
          functionName: "userView",
          args: [params, user as Hex, 0n],
        });
        return { user: user as Hex, v };
      }),
    );

    for (const { user, v } of views) {
      if (v.borrowAssets === 0n) continue;
      out.push({
        key: keyOfId(id),
        marketId: id as Hex,
        user,
        healthFactor: v.healthFactorWad,
        collateral: v.collateral,
        debt: v.borrowAssets,
      });
    }
  }

  return out.sort((a, b) => (a.healthFactor < b.healthFactor ? -1 : 1));
}

/**
 * Try to clear one position. Everything is simulated first: a liquidation that would revert costs
 * gas and tells the world our position, and a liquidation that would lose money is worse than none.
 */
export async function tryLiquidate(c: Candidate) {
  const params = await getMarketParams(pub, c.marketId);
  const price = await pub.readContract({
    address: params.oracle,
    abi: [{ type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }],
    functionName: "price",
  });

  const lif = liquidationIncentiveFactor(params.lltv);

  // Seize the most that clears the whole debt, capped by what the borrower actually posted.
  const seizeForFullDebt = (((c.debt * lif) / WAD) * ORACLE_SCALE) / price;
  const seized = seizeForFullDebt < c.collateral ? seizeForFullDebt : c.collateral;
  if (seized === 0n) return;

  // What Morpho will pull for that collateral, and the floor the swap must clear. The floor is set
  // from the ORACLE, not from the pool: if the pool has moved away from the oracle, the swap should
  // revert rather than hand the difference to whoever moved it.
  const repaid = (((seized * price) / ORACLE_SCALE) * WAD) / lif;
  const flashAmount = (repaid * 101n) / 100n;
  const minAmountOut = (((seized * price) / ORACLE_SCALE) * 92n) / 100n;

  if (minAmountOut <= flashAmount) {
    log("skip", c.key, c.user, "swap floor below the flash loan — nothing to gain");
    return;
  }

  const args = [
    {
      marketParams: params,
      borrower: c.user,
      seizedAssets: seized,
      repaidShares: 0n,
      swapFee: poolFeeOf(params.collateralToken),
      flashAmount,
      minAmountOut,
    },
  ] as const;

  try {
    await pub.simulateContract({
      address: LIQUIDATOR,
      abi: flashLiquidatorAbi,
      functionName: "liquidate",
      args,
      account: account ?? undefined,
    });
  } catch (e) {
    // Reverting here is the normal case for a position that is only just underwater: the swap
    // cannot yet cover the loan. Log it, do not alert on it.
    log("simulation reverted", c.key, c.user, (e as Error).message.split("\n")[0]);
    return;
  }

  const expectedProfit = minAmountOut - flashAmount;
  if (expectedProfit < MIN_PROFIT) {
    log("skip", c.key, c.user, `profit ${formatUnits(expectedProfit, 6)} below the floor`);
    return;
  }

  if (!wallet || !account) {
    await alert(
      `would-liquidate:${c.marketId}:${c.user}`,
      `Would liquidate ${c.user} on ${c.key}: HF ${formatUnits(c.healthFactor, 18)}, profit about ${formatUnits(expectedProfit, 6)} USDG. No keeper key loaded, so nothing was sent.`,
    );
    return;
  }

  const hash = await wallet.writeContract({
    address: LIQUIDATOR,
    abi: flashLiquidatorAbi,
    functionName: "liquidate",
    args,
    chain: wallet.chain,
    account,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });

  await alert(
    `liquidated:${c.marketId}:${c.user}:${hash}`,
    `Liquidated ${c.user} on ${c.key}. HF was ${formatUnits(c.healthFactor, 18)}, seized ${formatUnits(seized, 18)}, repaid about ${formatUnits(repaid, 6)} USDG, status ${receipt.status}. ${hash}`,
  );
}

/** A position that is merely close should reach a human before it reaches the liquidator. */
export async function warnIfClose(c: Candidate) {
  if (c.healthFactor >= WARN_HF || c.healthFactor < WAD) return;
  await alert(
    `close:${c.marketId}:${c.user}`,
    `${c.user} on ${c.key} is at HF ${formatUnits(c.healthFactor, 18)} with ${formatUnits(c.debt, 6)} USDG of debt.`,
  );
}

export const marketKeys = marketCatalog.map((m) => m.key);
