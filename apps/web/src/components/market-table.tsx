"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MarketView } from "@/lib/markets";
import { pct, usd } from "@/lib/format";
import { Badge } from "./ui";

const statusTone = { listed: "live", planned: "pending", blocked: "neutral" } as const;
const statusLabel = { listed: "Live", planned: "Listing", blocked: "Blocked" } as const;

export function MarketTable({ markets, showFilters = true }: { markets: MarketView[]; showFilters?: boolean }) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [category, setCategory] = useState<string>("All");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(markets.filter((m) => m.side === side).map((m) => m.category)))],
    [markets, side],
  );

  const rows = markets.filter(
    (m) => (!showFilters || m.side === side) && (category === "All" || m.category === category),
  );

  return (
    <div className="flex flex-col gap-5">
      {showFilters && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-full border border-line p-1">
            {(["long", "short"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSide(s);
                  setCategory("All");
                }}
                className={`rounded-full px-5 py-2 text-sm capitalize transition-colors ${
                  side === s ? "bg-bg-strong text-white" : "text-text-soft hover:text-text-strong"
                }`}
              >
                {s === "long" ? "Borrow against" : "Short a stock"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                  category === c
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-line text-text-soft hover:border-text-soft"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-[28px] border border-line bg-white">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-widest text-text-soft">
              <th className="px-6 py-4 font-normal">{side === "long" ? "Collateral" : "Borrow"}</th>
              <th className="px-6 py-4 font-normal">Price</th>
              <th className="px-6 py-4 font-normal">Liq. LTV</th>
              <th className="px-6 py-4 font-normal">Available</th>
              <th className="px-6 py-4 font-normal">Borrow APR</th>
              <th className="px-6 py-4 font-normal">Utilization</th>
              <th className="px-6 py-4 font-normal">Cap</th>
              <th className="px-6 py-4 font-normal" />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.key} className="border-b border-line/70 last:border-0 hover:bg-bg-weak/60">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <span className="num flex h-9 w-9 items-center justify-center rounded-full bg-bg-strong text-[11px] text-white">
                      {m.subject.slice(0, 4)}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-text-strong">
                        {m.side === "long" ? `${m.collateralSymbol} / ${m.loanSymbol}` : `Short ${m.subject}`}
                      </p>
                      <p className="text-xs text-text-soft">
                        {m.category} · {m.oracle === "twap" ? "TWAP" : m.oracle === "inverse" ? "inverse oracle" : "Chainlink"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="num px-6 py-5 text-sm">
                  {m.price === null ? "—" : `$${m.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                  {m.priceStale && <span className="ml-2 text-xs text-warn">stale</span>}
                </td>
                <td className="num px-6 py-5 text-sm">{pct(m.lltv, 1)}</td>
                <td className="num px-6 py-5 text-sm">{m.status === "listed" ? usd(m.liquidityUsd) : "—"}</td>
                <td className="num px-6 py-5 text-sm">{pct(m.borrowApr)}</td>
                <td className="num px-6 py-5 text-sm">{m.status === "listed" ? pct(m.utilization, 1) : "—"}</td>
                <td className="num px-6 py-5 text-sm text-text-soft">{usd(m.supplyCapUsd, 0)}</td>
                <td className="px-6 py-5 text-right">
                  {m.status === "blocked" ? (
                    <Badge tone="neutral">Blocked</Badge>
                  ) : (
                    <Link
                      href={`/borrow/${m.key.toLowerCase()}`}
                      className={`rounded-full px-4 py-2 text-xs font-medium ${
                        m.status === "listed"
                          ? "bg-bg-strong text-white hover:bg-bg-mid"
                          : "border border-line text-text-soft hover:border-text-soft"
                      }`}
                    >
                      {m.status === "listed" ? (m.side === "long" ? "Borrow" : "Short") : "Details"}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-soft">
        {rows.filter((r) => r.status === "listed").length} live ·{" "}
        {rows.filter((r) => r.status === "planned").length} specified and awaiting creation ·{" "}
        {rows.filter((r) => r.status === "blocked").length} blocked on an unconfirmed address.
      </p>
    </div>
  );
}

export { statusTone, statusLabel };
