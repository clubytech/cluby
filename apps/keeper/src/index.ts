/**
 * Keeper: liquidations, cap updates, corporate-action flags, alerts.
 * Env: RPC_URL, KEEPER_PK, PONDER_URL, MARKET_ADDR, LENS_ADDR, FLASH_LIQ_ADDR,
 *      TELEGRAM_TOKEN, TELEGRAM_CHAT (optional), RH_API_URL (optional), POLL_MS (default 2000)
 */
import { createPublicClient, createWalletClient, http, formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain, stocks, external } from "@cluby/config";
import { marketAbi, lensAbi, flashLiquidatorAbi, stockTokenAbi } from "@cluby/abi";

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`missing env ${k}`);
  return v;
};

const RPC = env("RPC_URL");
const MARKET = env("MARKET_ADDR") as Hex;
const LENS = env("LENS_ADDR") as Hex;
const FLASH = env("FLASH_LIQ_ADDR") as Hex;
const PONDER = env("PONDER_URL", "http://127.0.0.1:42069");
const POLL_MS = Number(env("POLL_MS", "2000"));
const RH_API = env("RH_API_URL", external.robinhoodApi);

const account = privateKeyToAccount(env("KEEPER_PK") as Hex);
const chain = { ...robinhoodChain, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ chain, transport: http(RPC), account });

const WAD = 10n ** 18n;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function telegram(text: string) {
  const token = process.env.TELEGRAM_TOKEN;
  const chat = process.env.TELEGRAM_CHAT;
  log("ALERT", text);
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  }).catch((e) => log("telegram failed", e));
}

type OpenPosition = { marketId: Hex; user: Hex; borrowShares: string };

async function openPositions(): Promise<OpenPosition[]> {
  const r = await fetch(`${PONDER}/positions/open`);
  if (!r.ok) throw new Error(`ponder ${r.status}`);
  return (await r.json()) as OpenPosition[];
}

const poolFeeOf = new Map<string, number>(
  Object.values(stocks).map((s) => [s.address.toLowerCase(), s.usdgPool.fee]),
);

// ------------------------------------------------------------------ liquidator
const warned = new Set<string>();

async function liquidationPass() {
  const positions = await openPositions();
  for (const p of positions) {
    const u = await pub.readContract({ abi: lensAbi, address: LENS, functionName: "userView", args: [p.marketId, p.user] });
    const hf = u.healthFactorWad;
    const key = `${p.marketId}-${p.user}`;
    if (hf === (2n ** 256n - 1n) || u.borrowAssets === 0n) continue;
    if (hf < (115n * WAD) / 100n && !warned.has(key)) {
      warned.add(key);
      await telegram(`HF ${formatUnits(hf, 18)} for ${p.user} on market ${p.marketId.slice(0, 10)}`);
    }
    if (hf >= WAD) {
      if (hf >= (12n * WAD) / 10n) warned.delete(key);
      continue;
    }
    const m = await pub.readContract({ abi: marketAbi, address: MARKET, functionName: "idToParams", args: [p.marketId] });
    const fee = poolFeeOf.get(m.stock.toLowerCase()) ?? 500;
    try {
      const { request, result } = await pub.simulateContract({
        abi: flashLiquidatorAbi,
        address: FLASH,
        functionName: "liquidate",
        args: [p.marketId, p.user, BigInt(p.borrowShares), fee, 0n],
        account,
      });
      const gas = await pub.estimateGas({ ...request } as any).catch(() => 800_000n);
      const gasPrice = await pub.getGasPrice();
      const gasCostWei = gas * gasPrice;
      // profit is USDG (6 dec); require it beats gas at a rough 1 ETH = 3000 USDG
      const gasCostUsdg = (gasCostWei * 3000n * 10n ** 6n) / WAD;
      if (result <= gasCostUsdg) {
        log("skip: profit", formatUnits(result, 6), "<= gas", formatUnits(gasCostUsdg, 6));
        continue;
      }
      const hash = await wallet.writeContract(request);
      const rc = await pub.waitForTransactionReceipt({ hash });
      await telegram(`Liquidated ${p.user} (HF ${formatUnits(hf, 18)}) profit ${formatUnits(result, 6)} USDG tx ${hash} ${rc.status}`);
    } catch (e: any) {
      log("liquidation failed", key, e.shortMessage ?? e.message);
    }
  }
}

// ------------------------------------------------------------- cap updater
/** Weekly: cap = 30% of on-chain float, bounded by the contract's 90%-of-supply rule. */
async function capPass() {
  const r = await fetch(`${PONDER}/board`);
  if (!r.ok) return;
  const board = (await r.json()) as { market: { id: Hex; stock: Hex; symbol: string; borrowCap: string; totalSupplyAssets: string } }[];
  for (const { market: m } of board) {
    const float = await pub.readContract({ abi: stockTokenAbi, address: m.stock, functionName: "totalSupply" });
    const target = (float * 30n) / 100n;
    const maxByRule = (BigInt(m.totalSupplyAssets) * 90n) / 100n;
    const cap = target < maxByRule ? target : maxByRule;
    if (cap === BigInt(m.borrowCap)) continue;
    try {
      const hash = await wallet.writeContract({ abi: marketAbi, address: MARKET, functionName: "setBorrowCap", args: [m.id, cap] });
      log("cap", m.symbol, "->", formatUnits(cap, 18), hash);
    } catch (e: any) {
      log("cap update failed", m.symbol, e.shortMessage ?? e.message);
    }
  }
}

// --------------------------------------------------- corporate-action flags
const BORROW_PAUSED = 1;
const LIQ_PAUSED = 2;

async function corporateActionPass() {
  const r = await fetch(`${PONDER}/board`);
  if (!r.ok) return;
  const board = (await r.json()) as { market: { id: Hex; stock: Hex; symbol: string; flags: number } }[];
  for (const { market: m } of board) {
    const paused = await pub.readContract({ abi: stockTokenAbi, address: m.stock, functionName: "oraclePaused" }).catch(() => false);
    const want = paused ? BORROW_PAUSED | LIQ_PAUSED : 0;
    if ((m.flags & (BORROW_PAUSED | LIQ_PAUSED)) === want) continue;
    try {
      const hash = await wallet.writeContract({ abi: marketAbi, address: MARKET, functionName: "setFlags", args: [m.id, want] });
      await telegram(`${m.symbol}: corporate action ${paused ? "started" : "ended"}, flags=${want} tx ${hash}`);
    } catch (e: any) {
      log("flags failed (keeper may lack GUARDIAN_ROLE)", m.symbol, e.shortMessage ?? e.message);
    }
  }
  // informational: upcoming actions from the issuer API
  try {
    const ca = await fetch(`${RH_API}/corporate-actions`).then((x) => x.json());
    const n = Array.isArray(ca) ? ca.length : ca?.results?.length ?? 0;
    log("corporate actions listed by issuer:", n);
  } catch {}
}

// -------------------------------------------------------------- board alerts
const boardState = new Map<string, { htb: boolean; weekend: boolean }>();

async function boardAlertPass() {
  const r = await fetch(`${PONDER}/board`);
  if (!r.ok) return;
  const board = (await r.json()) as { market: { id: Hex; symbol: string }; snapshot: any }[];
  for (const { market: m, snapshot: s } of board) {
    if (!s) continue;
    const prev = boardState.get(m.id) ?? { htb: false, weekend: false };
    const cur = { htb: !!s.hardToBorrow, weekend: !!s.weekendMode };
    if (cur.htb !== prev.htb) {
      await telegram(`${m.symbol} is now ${cur.htb ? "HARD TO BORROW" : "easy to borrow"}: utilization ${(Number(s.utilizationWad) / 1e16).toFixed(1)}%, borrow APR ${(Number(s.borrowAprWad) / 1e16).toFixed(1)}%, premium ${(s.premiumBps / 100).toFixed(2)}%`);
    }
    if (cur.weekend !== prev.weekend) {
      await telegram(`${m.symbol}: ${cur.weekend ? "weekend mode ON (feed stale, TWAP drives price)" : "feed live again"}`);
    }
    boardState.set(m.id, cur);
  }
}

// -------------------------------------------------------------------- main
async function main() {
  log("keeper", account.address, "rpc", RPC, "ponder", PONDER);
  let tick = 0;
  for (;;) {
    try {
      await liquidationPass();
      if (tick % 30 === 0) await boardAlertPass(); // ~1 min
      if (tick % 300 === 0) await corporateActionPass(); // ~10 min
      if (tick % (7 * 24 * 1800) === 0) await capPass(); // weekly at 2s polls
    } catch (e: any) {
      log("pass failed", e.shortMessage ?? e.message);
    }
    tick++;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
