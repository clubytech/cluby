import { cache } from "react";
import { deployments, tokens } from "@cluby/config";
import { merkleDistributorAbi } from "@cluby/abi";
import { publicClient } from "./chain";

const erc20 = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const vaultBits = [
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint96" }] },
  { type: "function", name: "feeRecipient", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "timelock", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

/**
 * `null` means "we could not read it", and it is a different thing from zero.
 *
 * The distinction is the whole point of the section this feeds. The public node rate-limits during
 * a build — every market on the site is read in the same few seconds — and a failed read that
 * defaults to zero would have this page announce a 0% fee and a 0-second timelock while the vault
 * on chain says 0% and TWENTY-FOUR HOURS. One of those zeros is true and the other is a lie, and
 * they are indistinguishable once a failure has been rounded down into a number. So a failure stays
 * null all the way to the screen, where it renders as "could not read" next to the address, and the
 * reader can go and fetch it themselves.
 */
export type Incentives = {
  distributor: `0x${string}` | null;
  epochsPublished: number | null;
  fundedUsdg: number | null;
  distributedUsdg: number | null;
  registry: `0x${string}` | null;
  vault: `0x${string}` | null;
  vaultFeeWad: bigint | null;
  vaultFeeRecipient: `0x${string}` | null;
  timelockSeconds: number | null;
  vaultOwner: `0x${string}` | null;
};

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export const getIncentives = cache(async function getIncentives(): Promise<Incentives> {
  const distributor = (deployments.merkleDistributor ?? null) as `0x${string}` | null;
  const registry = (deployments.creditRegistry ?? null) as `0x${string}` | null;
  const vault = (Object.values(deployments.vaults)[0] ?? null) as `0x${string}` | null;
  const usdg = tokens.USDG.address as `0x${string}`;

  const base: Incentives = {
    distributor,
    epochsPublished: null,
    fundedUsdg: null,
    distributedUsdg: null,
    registry,
    vault,
    vaultFeeWad: null,
    vaultFeeRecipient: null,
    timelockSeconds: null,
    vaultOwner: null,
  };
  if (!distributor || !vault) return base;

  const contracts = [
    { address: distributor, abi: merkleDistributorAbi, functionName: "latestEpoch" },
    { address: usdg, abi: erc20, functionName: "balanceOf", args: [distributor] },
    { address: vault, abi: vaultBits, functionName: "fee" },
    { address: vault, abi: vaultBits, functionName: "feeRecipient" },
    { address: vault, abi: vaultBits, functionName: "timelock" },
    { address: vault, abi: vaultBits, functionName: "owner" },
  ] as const;

  /**
   * Three attempts, widening. A build reads every market on the site inside a few seconds and the
   * free node answers some of that with 429 — one retry a second later almost always clears it, and
   * three is the point past which the failure is real rather than crowding.
   */
  let out: { status: "success" | "failure"; result?: unknown }[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out = (await publicClient.multicall({ contracts: contracts as any, allowFailure: true })) as typeof out;
    } catch {
      out = [];
    }
    if (out.length === contracts.length && out.every((o) => o.status === "success")) break;
  }

  const at = <T,>(i: number): T | null => (out[i]?.status === "success" ? (out[i]!.result as T) : null);

  const latestEpoch = at<bigint>(0);
  const funded = at<bigint>(1);
  const feeRecipient = at<`0x${string}`>(3);
  const owner = at<`0x${string}`>(5);
  const timelock = at<bigint>(4);

  // What has actually been paid out: the sum of every epoch's claim total. With no epochs it is
  // zero without a single extra call, which is today's case and should not cost a round trip.
  let distributed: number | null = latestEpoch === null ? null : 0;
  if (latestEpoch !== null && latestEpoch > 0n) {
    try {
      const rows = await publicClient.multicall({
        contracts: Array.from({ length: Number(latestEpoch) }, (_, i) => ({
          address: distributor,
          abi: merkleDistributorAbi,
          functionName: "epochs" as const,
          args: [BigInt(i + 1)],
        })),
        allowFailure: true,
      });
      let sum = 0;
      for (const r of rows) {
        if (r.status !== "success") {
          sum = NaN;
          break;
        }
        sum += Number((r.result as readonly [`0x${string}`, bigint, bigint, bigint])[2]) / 1e6;
      }
      distributed = Number.isNaN(sum) ? null : sum;
    } catch {
      distributed = null;
    }
  }

  return {
    ...base,
    epochsPublished: latestEpoch === null ? null : Number(latestEpoch),
    fundedUsdg: funded === null ? null : Number(funded) / 1e6,
    distributedUsdg: distributed,
    vaultFeeWad: at<bigint>(2),
    vaultFeeRecipient: feeRecipient === null || feeRecipient === ZERO_ADDR ? null : feeRecipient,
    timelockSeconds: timelock === null ? null : Number(timelock),
    vaultOwner: owner === null || owner === ZERO_ADDR ? null : owner,
  };
});
