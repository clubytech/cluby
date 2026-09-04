"use client";

import { useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import type { Abi } from "viem";
import { useToasts } from "@/components/tx-toast";

type Call = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

/**
 * Simulate, sign, wait, report. Every write goes through here so nothing reaches a wallet that was
 * not simulated first: a transaction that would revert costs gas and tells the user nothing, and a
 * simulation is free.
 */
export function useTx() {
  const config = useConfig();
  const { address } = useAccount();
  const { push, resolve } = useToasts();
  const [busy, setBusy] = useState(false);

  async function run(label: string, calls: Call[]) {
    if (!address) return false;
    setBusy(true);
    const id = push({ text: `${label}…`, tone: "pending" });

    try {
      for (const call of calls) {
        const { request } = await simulateContract(config, { ...call, account: address });
        const hash = await writeContract(config, request);
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success") {
          resolve(id, { text: `${label} reverted on chain.`, hash, tone: "error" });
          return false;
        }
        resolve(id, { text: `${label} — done.`, hash, tone: "done" });
      }
      return true;
    } catch (e) {
      const message = (e as Error).message ?? "";
      // A rejected signature is a decision, not a failure; say it plainly instead of dumping the
      // wallet's stack trace at someone.
      const rejected = /User rejected|denied transaction/i.test(message);
      resolve(id, {
        text: rejected ? `${label} cancelled.` : `${label} failed: ${message.split("\n")[0].slice(0, 160)}`,
        tone: rejected ? "done" : "error",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, address };
}
