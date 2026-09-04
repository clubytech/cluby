import Link from "next/link";
import type { MarketView } from "@/lib/markets";
import { pct, usd } from "@/lib/format";
import { Badge } from "./ui";

export function MarketTable({ markets }: { markets: MarketView[] }) {
  return (
    <div className="overflow-x-auto rounded-[28px] border border-line bg-white">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-widest text-text-soft">
            <th className="px-6 py-4 font-normal">Collateral</th>
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
          {markets.map((m) => (
            <tr key={m.symbol} className="border-b border-line/70 last:border-0 hover:bg-bg-weak/60">
              <td className="px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="num flex h-9 w-9 items-center justify-center rounded-full bg-bg-strong text-[11px] text-white">
                    {m.symbol.slice(0, 4)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-text-strong">{m.symbol} / USDG</p>
                    <p className="text-xs text-text-soft">{m.category}</p>
                  </div>
                </div>
              </td>
              <td className="num px-6 py-5 text-sm">
                {m.price === null ? "—" : `$${m.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                {m.priceStale && <span className="ml-2 text-xs text-warn">stale</span>}
              </td>
              <td className="num px-6 py-5 text-sm">{pct(m.lltv, 1)}</td>
              <td className="num px-6 py-5 text-sm">{m.status === "live" ? usd(m.liquidityUsd) : "—"}</td>
              <td className="num px-6 py-5 text-sm">{pct(m.borrowApr)}</td>
              <td className="num px-6 py-5 text-sm">{m.status === "live" ? pct(m.utilization, 1) : "—"}</td>
              <td className="num px-6 py-5 text-sm text-text-soft">{usd(m.supplyCapUsd, 0)}</td>
              <td className="px-6 py-5 text-right">
                {m.status === "live" ? (
                  <Link
                    href={`/borrow/${m.symbol.toLowerCase()}`}
                    className="rounded-full bg-bg-strong px-4 py-2 text-xs font-medium text-white hover:bg-bg-mid"
                  >
                    Borrow
                  </Link>
                ) : (
                  <Badge tone="pending">Not live</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
