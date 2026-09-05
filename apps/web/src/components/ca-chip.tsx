"use client";

import { useState } from "react";

/**
 * The contract address, compressed to what fits in a header.
 *
 * "CA: soon" and nothing else until there is one. The strip exists before the address does on
 * purpose: the reliable way to be phished is to meet a token's address for the first time in a
 * message from a stranger, with nothing to check it against. Someone who has already seen this chip
 * say "soon" knows where the real one will appear, and knows that anything arriving before it is
 * not it.
 *
 * The value comes from a registry contract owned by the protocol's multisig, so what this copies is
 * what the owner published on chain — not a string an editor changed.
 */
export function CaChip({
  address,
  symbol,
  className = "",
}: {
  address: string | null;
  symbol: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return (
      <span
        className={`num inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[11px] tracking-wider text-white/55 ${className}`}
        title={`No ${symbol} token yet. The address will appear here when there is one.`}
      >
        CA: <span className="text-white/40">soon</span>
      </span>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // A refused clipboard is not worth an error state: the address is on screen and selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={address}
      className={`num inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-bright/40 bg-brand-bright/10 px-3 py-1.5 text-[11px] tracking-wider text-white transition-colors hover:border-brand-bright hover:bg-brand-bright/20 ${className}`}
    >
      CA: <span className="text-brand-bright">{copied ? "copied" : `${address.slice(0, 6)}…${address.slice(-4)}`}</span>
    </button>
  );
}
