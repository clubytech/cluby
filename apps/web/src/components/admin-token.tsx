"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { getBytecode, readContract } from "wagmi/actions";
import { encodeFunctionData, formatUnits, getAddress, isAddress, type Abi } from "viem";
import { deployments } from "@cluby/config";
import { tokenRegistryAbi } from "@cluby/abi";
import { Card } from "@/components/ui";
import { ConnectButton } from "@/components/connect-button";
import { useTx } from "@/lib/use-tx";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Just enough of a Safe to ask who owns it and to make it do one thing. */
const safeAbi = [
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "execTransaction",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

type Listing = { token: `0x${string}`; pool: `0x${string}`; listedAt: bigint; symbol: string; decimals: number; supply: bigint };
type Preview =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "bad"; why: string }
  | { state: "ok"; symbol: string; decimals: number; supply: bigint };

/**
 * How this page is allowed to write.
 *
 * `direct`  — the connected wallet is the registry's owner.
 * `safe`    — the owner is a 1-of-1 Safe and the connected wallet is its owner, so the write goes
 *             through `execTransaction` with a PRE-VALIDATED signature: 65 bytes of
 *             (r = the owner, s = 0, v = 1), which the Safe accepts because msg.sender is that
 *             owner. No EIP-712 payload to assemble in a browser, no second signing step.
 * `none`    — read-only. The page still shows the exact calldata, because someone holding a
 *             hardware wallet in a different UI needs that and nothing else.
 */
type Route = { kind: "loading" } | { kind: "direct" } | { kind: "safe"; safe: `0x${string}` } | { kind: "none"; owner: `0x${string}` | null };

export function AdminToken() {
  const registry = deployments.tokenRegistry;
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { run, busy } = useTx();

  const [listing, setListing] = useState<Listing | null>(null);
  const [route, setRoute] = useState<Route>({ kind: "loading" });
  const [tokenIn, setTokenIn] = useState("");
  const [poolIn, setPoolIn] = useState("");
  const [preview, setPreview] = useState<Preview>({ state: "idle" });
  const [nonce, setNonce] = useState(0);

  const tokenOk = isAddress(tokenIn.trim());
  const poolOk = poolIn.trim() === "" || isAddress(poolIn.trim());
  const token = tokenOk ? getAddress(tokenIn.trim()) : null;
  const pool = poolIn.trim() === "" ? ZERO : poolOk ? getAddress(poolIn.trim()) : null;

  // Current state of the registry, re-read after every write.
  useEffect(() => {
    if (!registry) return;
    let live = true;
    readContract(config, { address: registry, abi: tokenRegistryAbi as Abi, functionName: "listing" })
      .then((r) => {
        if (!live) return;
        const [t, p, at, sym, dec, sup] = r as [`0x${string}`, `0x${string}`, bigint, string, number, bigint];
        setListing({ token: t, pool: p, listedAt: at, symbol: sym, decimals: dec, supply: sup });
      })
      .catch(() => setListing(null));
    return () => {
      live = false;
    };
  }, [config, registry, nonce]);

  // Who this wallet is allowed to be.
  useEffect(() => {
    if (!registry || !address) return setRoute({ kind: "none", owner: null });
    let live = true;
    (async () => {
      const owner = (await readContract(config, {
        address: registry,
        abi: tokenRegistryAbi as Abi,
        functionName: "owner",
      }).catch(() => null)) as `0x${string}` | null;
      if (!live) return;
      if (!owner) return setRoute({ kind: "none", owner: null });
      if (owner.toLowerCase() === address.toLowerCase()) return setRoute({ kind: "direct" });

      // The owner is not this wallet. It may still be a Safe this wallet can drive alone.
      const owners = (await readContract(config, { address: owner, abi: safeAbi as Abi, functionName: "getOwners" }).catch(
        () => null,
      )) as readonly `0x${string}`[] | null;
      const threshold = (await readContract(config, {
        address: owner,
        abi: safeAbi as Abi,
        functionName: "getThreshold",
      }).catch(() => null)) as bigint | null;
      if (!live) return;
      const mine = owners?.some((o) => o.toLowerCase() === address.toLowerCase());
      if (mine && threshold === 1n) return setRoute({ kind: "safe", safe: owner });
      setRoute({ kind: "none", owner });
    })();
    return () => {
      live = false;
    };
  }, [config, registry, address]);

  /**
   * Read the pasted contract before it is published, not after.
   *
   * The registry refuses an address with no code, which stops the worst mistake; it cannot tell a
   * token from any other contract. Showing the symbol, the decimals and the supply that the address
   * actually reports is what turns "trust the paste" into "read it back".
   */
  useEffect(() => {
    if (!token) return setPreview({ state: "idle" });
    let live = true;
    setPreview({ state: "checking" });
    (async () => {
      const code = await getBytecode(config, { address: token }).catch(() => undefined);
      if (!live) return;
      if (!code || code === "0x") return setPreview({ state: "bad", why: "No contract at this address on Robinhood Chain." });

      const [sym, dec, sup] = await Promise.all([
        readContract(config, { address: token, abi: erc20Abi as Abi, functionName: "symbol" }).catch(() => ""),
        readContract(config, { address: token, abi: erc20Abi as Abi, functionName: "decimals" }).catch(() => 0),
        readContract(config, { address: token, abi: erc20Abi as Abi, functionName: "totalSupply" }).catch(() => 0n),
      ]);
      if (!live) return;
      setPreview({ state: "ok", symbol: sym as string, decimals: Number(dec), supply: sup as bigint });
    })();
    return () => {
      live = false;
    };
  }, [config, token]);

  const calldata = useMemo(
    () => (token && pool ? encodeFunctionData({ abi: tokenRegistryAbi, functionName: "setToken", args: [token, pool] }) : null),
    [token, pool],
  );

  if (!registry) {
    return (
      <Card>
        <p className="text-sm text-text-soft">No token registry is deployed on this chain.</p>
      </Card>
    );
  }

  /**
   * One call on the registry, routed by whatever this wallet is permitted to do.
   *
   * The direct path and the Safe path carry the SAME calldata — the Safe route only wraps it — so
   * there is one description of the action and no second place for the arguments to drift.
   */
  async function send(fn: "setToken" | "clear", label: string) {
    const data =
      fn === "clear"
        ? encodeFunctionData({ abi: tokenRegistryAbi, functionName: "clear" })
        : encodeFunctionData({ abi: tokenRegistryAbi, functionName: "setToken", args: [token!, pool!] });

    let ok = false;
    if (route.kind === "direct") {
      ok = await run(label, [
        {
          address: registry!,
          abi: tokenRegistryAbi as Abi,
          functionName: fn,
          args: fn === "clear" ? [] : [token!, pool!],
        },
      ]);
    } else if (route.kind === "safe" && address) {
      // 65 bytes: r = the owner left-padded, s = 0, v = 1. The Safe accepts it because msg.sender
      // is that owner, which is what makes this one signature instead of two.
      const sig = `0x${address.slice(2).padStart(64, "0")}${"0".repeat(64)}01` as `0x${string}`;
      ok = await run(label, [
        {
          address: route.safe,
          abi: safeAbi as Abi,
          functionName: "execTransaction",
          args: [registry!, 0n, data, 0, 0n, 0n, 0n, ZERO, ZERO, sig],
        },
      ]);
    }
    if (ok) setNonce((n) => n + 1);
  }

  const live = listing && listing.token !== ZERO;

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------------------------------------------- */}
      {/* What is published right now                                       */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Published right now</p>
        {live ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-2xl font-bold tracking-tight text-text-strong">
              {listing.symbol ? `$${listing.symbol}` : "(the contract reports no symbol)"}
            </p>
            <p className="num break-all text-sm text-text-strong">{listing.token}</p>
            <p className="text-sm text-text-soft">
              {listing.decimals} decimals · supply{" "}
              {Number(formatUnits(listing.supply, listing.decimals || 18)).toLocaleString("en-US")} · published{" "}
              {new Date(Number(listing.listedAt) * 1000).toLocaleString()}
            </p>
            {listing.pool !== ZERO && <p className="num break-all text-sm text-text-soft">pool {listing.pool}</p>}
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-soft">
            Nothing. The site says there is no token yet, because there is no token yet — that is the
            same sentence, and it comes from this contract rather than from anyone&apos;s word.
          </p>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Publish                                                           */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Publish the contract address</p>

        <label className="mt-5 block text-sm font-semibold text-text-strong" htmlFor="ca">
          Token contract (CA)
        </label>
        <input
          id="ca"
          value={tokenIn}
          onChange={(e) => setTokenIn(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          className="num mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-text-strong outline-none transition-colors focus:border-brand"
        />
        {tokenIn.trim() !== "" && !tokenOk && <p className="mt-2 text-sm text-danger">That is not an address.</p>}

        <label className="mt-5 block text-sm font-semibold text-text-strong" htmlFor="pool">
          Uniswap pool <span className="font-normal text-text-soft">— optional, for a price</span>
        </label>
        <input
          id="pool"
          value={poolIn}
          onChange={(e) => setPoolIn(e.target.value)}
          placeholder="0x… (leave empty if there is no pool yet)"
          spellCheck={false}
          autoComplete="off"
          className="num mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-text-strong outline-none transition-colors focus:border-brand"
        />
        {!poolOk && <p className="mt-2 text-sm text-danger">That is not an address.</p>}

        {/* Read the contract back before publishing it. */}
        {preview.state === "checking" && <p className="mt-5 text-sm text-text-soft">Reading the contract…</p>}
        {preview.state === "bad" && <p className="mt-5 text-sm text-danger">{preview.why}</p>}
        {preview.state === "ok" && (
          <div className="mt-5 rounded-xl border border-line bg-bg-soft px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">This contract says</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-text-strong">
              {preview.symbol ? `$${preview.symbol}` : "no symbol"}
            </p>
            <p className="mt-1 text-sm text-text-soft">
              {preview.decimals} decimals · supply{" "}
              {Number(formatUnits(preview.supply, preview.decimals || 18)).toLocaleString("en-US")}
            </p>
            <p className="mt-3 text-sm text-text-soft">
              The site shows this symbol, read from the contract — it is not typed in here, so the
              label on the page cannot disagree with the address next to it.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!isConnected ? (
            <ConnectButton />
          ) : route.kind === "loading" ? (
            <p className="text-sm text-text-soft">Checking what this wallet may do…</p>
          ) : route.kind === "none" ? (
            <p className="text-sm text-text-soft">
              This wallet cannot publish. The registry is owned by{" "}
              <span className="num break-all">{route.owner ?? "an address this page could not read"}</span>.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void send("setToken", "Publishing the token address")}
                disabled={busy || !token || !pool || preview.state === "bad"}
                className="rounded-full bg-bg-strong px-6 py-3 text-sm font-medium text-white hover:bg-bg-mid disabled:cursor-not-allowed disabled:bg-bg-soft disabled:text-text-soft"
              >
                {busy ? "Publishing…" : "Publish"}
              </button>
              {live && (
                <button
                  type="button"
                  onClick={() => void send("clear", "Withdrawing the announcement")}
                  disabled={busy}
                  className="rounded-full border border-line px-6 py-3 text-sm font-medium text-text-strong transition-colors hover:border-text-soft disabled:cursor-not-allowed disabled:text-text-soft"
                >
                  Withdraw
                </button>
              )}
              <span className="text-sm text-text-soft">
                {route.kind === "safe" ? "One transaction, signed through the Safe." : "Signed directly as the owner."}
              </span>
            </>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* The escape hatch                                                  */}
      {/* ---------------------------------------------------------------- */}
      {calldata && (
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Or send it yourself</p>
          <p className="mt-3 text-sm text-text-soft">
            The same call, for a hardware wallet, the Safe UI, or the terminal. This page is a
            convenience; the registry is the thing.
          </p>
          <p className="mt-4 text-sm font-semibold text-text-strong">to</p>
          <p className="num break-all text-sm text-text-strong">{registry}</p>
          <p className="mt-3 text-sm font-semibold text-text-strong">data</p>
          <p className="num break-all text-sm text-text-strong">{calldata}</p>
          <p className="mt-4 text-sm font-semibold text-text-strong">terminal</p>
          <p className="num break-all text-sm text-text-soft">
            ./scripts/safe-exec.sh {registry} {calldata}
          </p>
        </Card>
      )}
    </div>
  );
}
