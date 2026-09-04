"use client";

import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { erc20Abi, vaultAbi } from "@cluby/sdk";
import { usd } from "@/lib/format";
import { useTx } from "@/lib/use-tx";
import { ConnectButton } from "./connect-button";

/**
 * Deposit and withdraw for one vault. Withdrawals are capped at maxWithdraw, which is what the
 * markets have not lent out — the number the vault itself will honour, rather than the balance a
 * depositor thinks they have.
 */
export function VaultPanel({
  vault,
  asset,
  assetAddress,
  assetDecimals = 6,
}: {
  vault: `0x${string}`;
  asset: string;
  assetAddress: `0x${string}`;
  assetDecimals?: number;
}) {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const { address, isConnected } = useAccount();
  const { run, busy } = useTx();

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: assetAddress, abi: erc20Abi, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"] },
      { address: assetAddress, abi: erc20Abi, functionName: "allowance", args: [address ?? "0x0000000000000000000000000000000000000000", vault] },
      { address: vault, abi: vaultAbi, functionName: "maxWithdraw", args: [address ?? "0x0000000000000000000000000000000000000000"] },
      { address: vault, abi: vaultAbi, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"] },
    ],
    query: { enabled: Boolean(address) },
  });

  const walletBalance = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const allowance = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const withdrawable = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const shares = (data?.[3]?.result as bigint | undefined) ?? 0n;

  const units = BigInt(Math.round((Number(amount) || 0) * 10 ** assetDecimals));
  const max = mode === "deposit" ? walletBalance : withdrawable;
  const overMax = units > max;

  async function submit() {
    if (!address || units === 0n) return;

    const calls =
      mode === "deposit"
        ? [
            ...(allowance < units
              ? [{ address: assetAddress, abi: erc20Abi, functionName: "approve", args: [vault, units] }]
              : []),
            { address: vault, abi: vaultAbi, functionName: "deposit", args: [units, address] },
          ]
        : [{ address: vault, abi: vaultAbi, functionName: "withdraw", args: [units, address, address] }];

    const ok = await run(
      `${mode === "deposit" ? "Deposit" : "Withdraw"} ${amount} ${asset}`,
      calls as never,
    );
    if (ok) {
      setAmount("");
      void refetch();
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-line p-5">
      <div className="flex rounded-full border border-line p-1">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-full px-4 py-2 text-sm capitalize transition-colors ${
              mode === m ? "bg-bg-strong text-white" : "text-text-soft hover:text-text-strong"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-widest text-text-soft">{asset}</span>
            {isConnected && (
              <button
                type="button"
                onClick={() => setAmount((Number(max) / 10 ** assetDecimals).toString())}
                className="num text-[11px] text-brand hover:underline"
              >
                {mode === "deposit" ? "wallet" : "withdrawable"} {usd(Number(max) / 10 ** assetDecimals)}
              </button>
            )}
          </div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            inputMode="decimal"
            className="num mt-1 w-full rounded-2xl border border-line px-4 py-3 text-lg outline-none focus:border-brand"
          />
        </div>

        {!isConnected ? (
          <ConnectButton />
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy || units === 0n || overMax}
            className="rounded-full bg-brand-bright px-8 py-3 text-sm font-medium text-bg-deep hover:bg-brand hover:text-white disabled:cursor-not-allowed disabled:bg-bg-soft disabled:text-text-soft"
          >
            {busy ? "Signing…" : overMax ? "More than available" : mode === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        )}
      </div>

      {isConnected && shares > 0n && (
        <p className="num mt-3 text-xs text-text-soft">
          You hold {(Number(shares) / 1e18).toFixed(6)} shares · {usd(Number(withdrawable) / 10 ** assetDecimals)}{" "}
          withdrawable right now.
        </p>
      )}
    </div>
  );
}
