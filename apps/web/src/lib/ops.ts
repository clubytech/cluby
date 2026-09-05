import { deployments } from "@cluby/config";
import { publicClient } from "./chain";
import { parseAbiItem, type Log } from "viem";

const INDEXER = process.env.CLUBY_INDEXER_URL ?? "";

export type TxEvent = {
  id: string;
  marketId: string;
  kind: string;
  user: string;
  caller: string;
  assets: string;
  shares: string;
  txHash: string;
  blockNumber: string;
  timestamp: number;
};

/**
 * Every action anyone took, newest first.
 *
 * Read through the server so the indexer's URL never reaches a browser — it is an operator's
 * endpoint, not a public one, and the admin page is the only place that asks for the whole feed
 * rather than one account's slice.
 */
export async function getEvents(limit = 120): Promise<TxEvent[] | null> {
  if (!INDEXER) return null;
  try {
    const r = await fetch(`${INDEXER}/events?limit=${limit}`, { next: { revalidate: 10 } });
    if (!r.ok) return null;
    const body = (await r.json()) as { data?: TxEvent[] } | TxEvent[];
    return Array.isArray(body) ? body : (body.data ?? null);
  } catch {
    return null;
  }
}

export type AdminAction = {
  what: string;
  detail: string;
  txHash: string;
  blockNumber: bigint;
  contract: string;
};

/**
 * Administrative actions, read from the chain rather than from a log file.
 *
 * The point of this list is that it is not ours to edit. Everything an operator can do to this
 * protocol — publish the token's address, authorise a score writer, open a rebate week, hand a
 * contract to a different owner — emits an event, and an event cannot be quietly removed from a
 * page that is reading the chain for it. If we ever do something and this list does not show it,
 * the list is broken; there is no third possibility where we did it invisibly.
 */
export async function getAdminActions(): Promise<AdminAction[] | null> {
  const watched: { address: `0x${string}` | undefined; label: string }[] = [
    { address: deployments.tokenRegistry, label: "Token registry" },
    { address: deployments.merkleDistributor, label: "Rebate distributor" },
    { address: deployments.creditRegistry, label: "Credit registry" },
    { address: deployments.flashLiquidator, label: "Liquidator" },
  ];

  const events = [
    parseAbiItem("event TokenSet(address indexed token, address indexed pool, uint64 at)"),
    parseAbiItem("event EpochPublished(uint256 indexed epoch, bytes32 root, uint256 total)"),
    parseAbiItem("event Claimed(uint256 indexed epoch, address indexed account, uint256 amount)"),
    parseAbiItem("event UpdaterSet(address indexed updater, bool allowed)"),
    parseAbiItem("event KeeperSet(address indexed keeper, bool allowed)"),
    parseAbiItem("event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"),
  ];

  const from = BigInt(deployments.startBlock ?? 0);
  const addresses = watched.map((w) => w.address).filter(Boolean) as `0x${string}`[];
  if (addresses.length === 0) return [];

  try {
    const logs = await publicClient.getLogs({ address: addresses, events, fromBlock: from, toBlock: "latest" });
    const labelOf = (a: string) =>
      watched.find((w) => w.address?.toLowerCase() === a.toLowerCase())?.label ?? a;

    return logs
      .map((l) => describe(l as Log & { eventName?: string; args?: Record<string, unknown> }, labelOf))
      .filter((x): x is AdminAction => x !== null)
      .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));
  } catch {
    return null;
  }
}

function describe(
  l: Log & { eventName?: string; args?: Record<string, unknown> },
  labelOf: (a: string) => string,
): AdminAction | null {
  const a = l.args ?? {};
  const base = {
    txHash: l.transactionHash ?? "",
    blockNumber: l.blockNumber ?? 0n,
    contract: labelOf(l.address),
  };
  switch (l.eventName) {
    case "TokenSet":
      return {
        ...base,
        what: a.token === "0x0000000000000000000000000000000000000000" ? "Token address withdrawn" : "Token address published",
        detail: String(a.token ?? ""),
      };
    case "EpochPublished":
      return {
        ...base,
        what: `Rebate week ${String(a.epoch)} opened`,
        detail: `${(Number(a.total ?? 0n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDG funded`,
      };
    case "Claimed":
      return {
        ...base,
        what: `Rebate claimed, week ${String(a.epoch)}`,
        detail: `${(Number(a.amount ?? 0n) / 1e6).toFixed(2)} USDG to ${String(a.account ?? "")}`,
      };
    case "UpdaterSet":
      return {
        ...base,
        what: a.allowed ? "Score writer authorised" : "Score writer revoked",
        detail: String(a.updater ?? ""),
      };
    case "KeeperSet":
      return {
        ...base,
        what: a.allowed ? "Keeper authorised" : "Keeper revoked",
        detail: String(a.keeper ?? ""),
      };
    case "OwnershipTransferred":
      return { ...base, what: "Ownership transferred", detail: `to ${String(a.newOwner ?? "")}` };
    default:
      return null;
  }
}
