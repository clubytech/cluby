import type { Hex } from "viem";
import { formatUnits } from "viem";
import { lensAbi, flashLiquidatorAbi } from "@cluby/abi";
import { marketCatalog } from "@cluby/config";
import { getMarketParams } from "@cluby/sdk";
import { alert } from "./alerts.ts";
import { factsFor } from "./facts.ts";
import { revertReason } from "./revert.ts";
import { LENS, LIQUIDATOR, MARKETS, MIN_PROFIT_USD, PROFIT_MARGIN_BPS, WARN_HF, account, log, pub, wallet } from "./env.ts";

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
    const key = keyOfId(id);

    // Per market, and it matters: a market whose oracle is down, or whose Lens read reverts for any
    // reason at all, used to reject out of `Promise.all` and take the entire pass with it — every
    // other market included. The pass would then be swallowed upstream and logged as ordinary, so
    // the protocol could stop liquidating on all seventeen markets without a single alert.
    try {
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
          key,
          marketId: id as Hex,
          user,
          healthFactor: v.healthFactorWad,
          collateral: v.collateral,
          debt: v.borrowAssets,
        });
      }
    } catch (e) {
      await alert(
        `unreadable-market:${id}`,
        `Cannot read health on ${key} (${users.size} watched borrower(s)): ${revertReason(e)}. Liquidations on this market are blind until this clears.`,
      );
    }
  }

  return out.sort((a, b) => (a.healthFactor < b.healthFactor ? -1 : 1));
}

/**
 * Try to clear one position. Everything is simulated first: a liquidation that would revert costs
 * gas and tells the world our position, and a liquidation that would lose money is worse than none.
 */
export async function tryLiquidate(c: Candidate) {
  const f = factsFor(c.key);
  const loan = (x: bigint) => formatUnits(x, f.loanDecimals);
  const coll = (x: bigint) => formatUnits(x, f.collateralDecimals);

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

  const seizedValue = (seized * price) / ORACLE_SCALE;
  // What Morpho will pull for that collateral.
  const repaid = (seizedValue * WAD) / lif;

  // The floor the sale must clear, and the number this whole function used to get wrong. It was a
  // flat 92% of the collateral's oracle value, which only clears the repayment while the
  // liquidation premium exceeds 8% — that is LLTV below 70.3%. On ETH at 77% the premium is 7.41%,
  // so the floor sat BELOW the repayment, the guard fired on every single position, and the keeper
  // said nothing louder than a log line. Derive it from the repayment instead, and the market's
  // LLTV stops deciding whether the keeper works at all.
  const wantedProfit = (repaid * BigInt(PROFIT_MARGIN_BPS)) / 10_000n;
  let minAmountOut = repaid + wantedProfit;

  // Never sit below the floor the contract enforces for itself: a sale the contract will refuse is
  // a transaction that should not be built. Read from the contract so the two cannot drift apart.
  const maxSlippageWad = await pub
    .readContract({ address: LIQUIDATOR, abi: flashLiquidatorAbi, functionName: "maxSlippageWad" })
    .catch(() => 0n);
  const contractFloor = (seizedValue * (WAD - (maxSlippageWad as bigint))) / WAD;
  if (contractFloor > minAmountOut) minAmountOut = contractFloor;

  // Unfillable: we would be demanding more for the collateral than the oracle says it is worth.
  if (minAmountOut > seizedValue) {
    await alert(
      `unfillable:${c.marketId}:${c.user}`,
      `Cannot size a liquidation for ${c.user} on ${c.key}: the floor the sale must clear (${loan(minAmountOut)}) is above the collateral's oracle value (${loan(seizedValue)}). Premium at LLTV ${formatUnits(params.lltv, 16)}% is too thin for the slippage budget. Nothing was sent.`,
    );
    return;
  }

  // The flash loan only has to cover the repayment; it is repaid out of the same balance, and the
  // contract measures solvency against `repaid`, not against this number.
  const flashAmount = (repaid * 101n) / 100n;

  const args = [
    {
      marketParams: params,
      borrower: c.user,
      seizedAssets: seized,
      repaidShares: 0n,
      swapFee: f.poolFee,
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
    // A position only just underwater legitimately fails here: the sale cannot yet cover the
    // repayment. But this is also where a broken keeper looks exactly like a quiet one, so it
    // alerts — deduplicated by market and borrower, so a position that stays underwater for an hour
    // produces one message, not one per poll.
    await alert(
      `sim-reverted:${c.marketId}:${c.user}`,
      `Liquidation simulation reverted for ${c.user} on ${c.key} (HF ${formatUnits(c.healthFactor, 18)}): ${revertReason(e)}. Seizing ${coll(seized)} against ${loan(c.debt)} of debt.`,
    );
    return;
  }

  // Profit is the sale minus the repayment. It was the sale minus the FLASH LOAN, which is a
  // different and smaller number by exactly the margin added above.
  const expectedProfit = minAmountOut - repaid;
  const minProfit = MIN_PROFIT_USD * 10n ** BigInt(f.loanDecimals);
  if (expectedProfit < minProfit) {
    log("skip", c.key, c.user, `profit ${loan(expectedProfit)} below the ${loan(minProfit)} floor`);
    return;
  }

  if (!wallet || !account) {
    await alert(
      `would-liquidate:${c.marketId}:${c.user}`,
      `Would liquidate ${c.user} on ${c.key}: HF ${formatUnits(c.healthFactor, 18)}, profit about ${loan(expectedProfit)}. No keeper key loaded, so nothing was sent.`,
    );
    return;
  }

  let hash: Hex;
  try {
    hash = await wallet.writeContract({
      address: LIQUIDATOR,
      abi: flashLiquidatorAbi,
      functionName: "liquidate",
      args,
      chain: wallet.chain,
      account,
    });
  } catch (e) {
    await alert(
      `send-failed:${c.marketId}:${c.user}`,
      `Could not SEND the liquidation for ${c.user} on ${c.key}: ${revertReason(e)}. It simulated clean, so this is the node or the key, not the position.`,
    );
    return;
  }

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    await alert(
      `reverted-onchain:${c.marketId}:${c.user}:${hash}`,
      `Liquidation of ${c.user} on ${c.key} was mined and REVERTED. ${hash}`,
    );
    return;
  }

  await alert(
    `liquidated:${c.marketId}:${c.user}:${hash}`,
    `Liquidated ${c.user} on ${c.key}. HF was ${formatUnits(c.healthFactor, 18)}, seized ${coll(seized)}, repaid about ${loan(repaid)}. ${hash}`,
  );
}

/** A position that is merely close should reach a human before it reaches the liquidator. */
export async function warnIfClose(c: Candidate) {
  if (c.healthFactor >= WARN_HF || c.healthFactor < WAD) return;
  await alert(
    `close:${c.marketId}:${c.user}`,
    `${c.user} on ${c.key} is at HF ${formatUnits(c.healthFactor, 18)} with ${formatUnits(c.debt, factsFor(c.key).loanDecimals)} of debt.`,
  );
}

export const marketKeys = marketCatalog.map((m) => m.key);
