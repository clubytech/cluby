import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain, deployments, morpho } from "@cluby/config";

const need = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`missing env ${k}`);
  return v;
};

export const RPC = need("RPC_URL");
export const LENS = (process.env.LENS_ADDR ?? deployments.lens) as Hex;
export const LIQUIDATOR = (process.env.FLASH_LIQ_ADDR ?? deployments.flashLiquidator) as Hex;
export const MORPHO_BLUE = morpho.blue.address as Hex;
export const START_BLOCK = BigInt(process.env.START_BLOCK ?? deployments.startBlock ?? 0);

/**
 * Markets to watch. Defaults to what the deploy recorded in @cluby/config; MARKETS_JSON overrides
 * it with `{"KEY":{"id":"0x…","oracle":"0x…"}}`, which is how a fork run watches markets that only
 * exist on that fork.
 */
export const MARKETS: Record<string, { id: Hex; oracle: Hex }> = process.env.MARKETS_JSON
  ? JSON.parse(process.env.MARKETS_JSON)
  : (deployments.markets as Record<string, { id: Hex; oracle: Hex }>);

/** How often to re-check health. Blocks are ~214 ms here, so two seconds is a few blocks. */
export const POLL_MS = Number(process.env.POLL_MS ?? 2000);
/** Oracle-versus-pool check. Cheap, so it runs far more often than a human could watch it. */
export const WATCHDOG_MS = Number(process.env.WATCHDOG_MS ?? 15 * 60 * 1000);
/** Alert when the feed and the pool disagree by more than this. */
export const DIVERGENCE_BPS = Number(process.env.DIVERGENCE_BPS ?? 500);
/**
 * Below this a liquidation is not worth the gas, in WHOLE loan-token units — dollars for a USDG
 * market, shares for a short one. It used to be a raw amount, 1_000_000, which reads as $1 against
 * six-decimal USDG and as 1e-12 of a share against an eighteen-decimal short market: a floor set a
 * trillion times too low on exactly the markets where the gas is least likely to be covered.
 * Scaling by the market's own decimals at the point of use is the only way one constant can mean
 * the same thing on both sides.
 */
export const MIN_PROFIT_USD = BigInt(process.env.MIN_PROFIT_USD ?? 1);

/** How far above the repayment the sale must land before a liquidation is worth sending, in bps. */
export const PROFIT_MARGIN_BPS = Number(process.env.PROFIT_MARGIN_BPS ?? 50);

/** Alert when a signing key falls below this many wei of gas. Default 0.005 ETH. */
export const GAS_FLOOR = BigInt(process.env.GAS_FLOOR ?? 5_000_000_000_000_000n);
/** Warn when a position gets close, so a human sees it coming rather than reading about it after. */
export const WARN_HF = BigInt(process.env.WARN_HF ?? 1_050_000_000_000_000_000n);

/** Optional. When the indexer is up its borrower list is used; otherwise the keeper scans logs. */
export const PONDER_URL = process.env.PONDER_URL ?? "";

/**
 * Blocks per eth_getLogs request. Alchemy's free tier allows TEN and refuses anything wider, which
 * kills a scan that assumed thousands. Raise it on a paid plan.
 */
export const LOG_CHUNK = BigInt(process.env.LOG_CHUNK ?? 10);

/** How long one pass may spend catching up before it yields to the health checks. */
export const CATCHUP_MS = Number(process.env.CATCHUP_MS ?? 1500);

if (!LENS || !LIQUIDATOR) throw new Error("no Lens or FlashLiquidator address — deploy first");

const chain = { ...robinhoodChain, rpcUrls: { default: { http: [RPC] } } };
const transport = http(RPC, {
  // The public node 403s eth_call without a User-Agent; harmless to send on any endpoint.
  fetchOptions: { headers: { "user-agent": "cluby-keeper/1.0" } },
  retryCount: 3,
  timeout: 15_000,
});

export const pub = createPublicClient({ chain, transport });

/**
 * The wallet is optional: without a key the keeper still watches and alerts, which is the mode to
 * run in when a human wants to see what it would have done before letting it act.
 */
const pk = process.env.KEEPER_PK as Hex | undefined;
export const account = pk ? privateKeyToAccount(pk) : null;
export const wallet = account ? createWalletClient({ chain, transport, account }) : null;

/**
 * RPC errors quote the request URL in full, and the URL carries the API key. Anything printed —
 * or forwarded to Telegram — goes through here first.
 *
 * Only the URL is scrubbed, and deliberately only the URL. A pass over 64-hex strings was proposed
 * and is refused: every such string the keeper prints is a transaction hash or a market id, and
 * blanking those would cut the hash out of the one alert an operator actually needs to follow. The
 * keeper's own key never reaches a string — it is consumed by `privateKeyToAccount` above and
 * never interpolated into anything.
 */
export function redact(text: string): string {
  return text.replace(
    /https:\/\/[^\s"']*(?:\/v[23]\/[A-Za-z0-9_-]{16,}|[?&](?:api[-_]?key|apikey|token)=[A-Za-z0-9_-]+)/gi,
    "https://<rpc>/<redacted>",
  );
}

export const log = (...a: unknown[]) =>
  console.log(
    new Date().toISOString(),
    ...a.map((x) => (typeof x === "string" ? redact(x) : x instanceof Error ? redact(x.message) : x)),
  );
