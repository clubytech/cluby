"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MarketView } from "@/lib/markets";
import { pct, usd } from "@/lib/format";
import { Badge } from "./ui";
import { MarketLogo } from "./market-logo";
import { Pill, useSlidingPill } from "./sliding-pill";

const statusTone = { listed: "live", planned: "pending", blocked: "neutral" } as const;
const statusLabel = { listed: "Live", planned: "Listing", blocked: "Blocked" } as const;

export function MarketTable({ markets, showFilters = true }: { markets: MarketView[]; showFilters?: boolean }) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [category, setCategory] = useState<string>("All");
  const sideToggle = useSlidingPill<HTMLDivElement>([side]);
  const categoryBar = useSlidingPill<HTMLDivElement>([category, side]);

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
          <div ref={sideToggle.ref} className="relative flex w-fit rounded-full border border-line p-1">
            <Pill pill={sideToggle.pill} className="my-1 bg-bg-strong" />
            {(["long", "short"] as const).map((s) => (
              <button
                key={s}
                type="button"
                data-active={side === s ? "true" : undefined}
                onClick={() => {
                  setSide(s);
                  setCategory("All");
                }}
                className={`relative z-10 rounded-full px-5 py-2 text-sm capitalize transition-colors duration-300 ${
                  side === s ? "text-white" : "text-text-soft hover:text-text-strong"
                }`}
              >
                {s === "long" ? "Borrow against" : "Short a stock"}
              </button>
            ))}
          </div>
          <div ref={categoryBar.ref} className="relative flex flex-wrap gap-2">
            {/* Only travels while the row stays on one line; once it wraps the pill would have to
                jump a row, which reads worse than not moving. */}
            <Pill pill={categoryBar.pill} className="hidden border border-brand bg-brand/10 sm:block" />
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                data-active={category === c ? "true" : undefined}
                onClick={() => setCategory(c)}
                /* py-2.5 on a phone and back to py-1.5 from `sm` up: these are the control someone
                   taps most on this page, and thirty pixels is a miss waiting to happen. */
                className={`relative z-10 rounded-full border px-4 py-2.5 text-xs transition-colors duration-300 sm:py-1.5 ${
                  category === c
                    ? "border-transparent text-brand sm:border-transparent"
                    : "border-line text-text-soft hover:border-text-soft hover:text-text-strong"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cards below lg, the table above it.
          A 900px-wide table inside a horizontal scroller is not a phone layout — it is a desktop
          layout the reader has to drag. The card carries the same seven figures in the order they
          matter on a small screen: what it is, what it costs, what is there to take. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {rows.map((m) => (
          <div key={m.key} className="group rounded-3xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <MarketLogo subject={m.subject} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-strong">
                    {m.side === "long" ? `${m.collateralSymbol} / ${m.loanSymbol}` : `Short ${m.subject}`}
                  </p>
                  <p className="truncate text-xs text-text-soft">
                    {m.category} · {m.oracle === "twap" ? "TWAP" : m.oracle === "inverse" ? "inverse oracle" : "Chainlink"}
                  </p>
                </div>
              </div>
              <p className="num shrink-0 text-sm font-medium text-text-strong">
                {m.price === null ? "—" : `$${m.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                {m.priceStale && <span className="ml-1.5 text-[10px] text-warn">stale</span>}
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {[
                ["Liq. LTV", pct(m.lltv, 1)],
                ["Available", m.status === "listed" ? usd(m.liquidityUsd) : "—"],
                ["Borrow APR", pct(m.borrowApr)],
                ["Cap", usd(m.supplyCapUsd, 0)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] uppercase tracking-widest text-text-soft">{k}</dt>
                  <dd className="num mt-0.5 text-sm text-text-strong">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4">
              {m.status === "blocked" ? (
                <Badge tone="neutral">Blocked</Badge>
              ) : (
                <Link
                  href={`/borrow/${m.key.toLowerCase()}`}
                  className={`block rounded-full px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                    m.status === "listed"
                      ? "bg-bg-strong text-white active:bg-brand"
                      : "border border-line text-text-soft"
                  }`}
                >
                  {m.status === "listed" ? (m.side === "long" ? "Borrow" : "Short") : "Details"}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-[28px] border border-line bg-white lg:block">
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
              <tr
                key={m.key}
                className="group border-b border-line/70 transition-colors duration-200 last:border-0 hover:bg-bg-weak/60"
              >
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <MarketLogo subject={m.subject} />
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
                      className={`press inline-block rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 ${
                        m.status === "listed"
                          ? "bg-bg-strong text-white group-hover:bg-brand group-hover:shadow-[0_10px_24px_-14px_rgba(3,146,107,0.9)]"
                          : "border border-line text-text-soft group-hover:border-text-soft group-hover:text-text-strong"
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
