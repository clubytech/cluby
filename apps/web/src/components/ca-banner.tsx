"use client";

import { useState } from "react";

/**
 * The contract address, with one button that copies it.
 *
 * It exists in the "soon" state on purpose rather than appearing at launch. The moment a token is
 * announced, every surface that could carry its address becomes a target — and the reliable way to
 * be phished is to meet the address for the first time in a Telegram message, with nothing to
 * compare it against. A reader who has already seen this strip say "no address yet" knows where the
 * real one will appear, and knows that anything arriving before it does is not it.
 *
 * The value comes from a registry contract owned by the protocol's multisig, so what is copied here
 * is what the owner published on chain — not a string an editor can change.
 */
export function CaBanner({ address, symbol }: { address: string | null; symbol: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // A clipboard the browser refuses is not an error worth showing: the address is on screen and
      // selectable, which is the fallback every user already knows.
    }
  }

  if (!address) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-4 text-center sm:flex-row sm:gap-4 sm:text-left">
        <span className="num rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/70">
          Soon
        </span>
        <div>
          <p className="text-sm font-bold text-white">${symbol} contract address</p>
          <p className="mt-0.5 text-sm text-white/60">
            No token yet. When there is one, the address appears here — read from a contract, not
            posted by a person. Anything circulating before then is not it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand-bright/40 bg-brand-bright/[0.08] px-5 py-4 sm:flex-row sm:gap-4">
      <span className="num rounded-full bg-brand-bright px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-bg-deep">
        ${symbol}
      </span>
      <p className="num flex-1 break-all text-center text-sm font-bold text-white sm:text-left">
        {address}
      </p>
      <button
        type="button"
        onClick={copy}
        className="press shrink-0 rounded-full bg-white px-4 py-2 text-xs font-bold text-bg-deep transition-colors hover:bg-brand-bright"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
