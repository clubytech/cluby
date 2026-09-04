import { getMarkets, getProtocolStats } from "@/lib/markets";
import { age, pct, usd } from "@/lib/format";
import { SectionHeading } from "@/components/ui";

export const revalidate = 30;
export const metadata = { title: "Stats — Cluby" };

export default async function StatsPage() {
  const [stats, markets] = await Promise.all([getProtocolStats(), getMarkets()]);

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Everything, measured." />
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-line-dark pt-6 lg:grid-cols-4">
            {[
              ["Supplied", usd(stats.totalSupplyUsd)],
              ["Borrowed", usd(stats.totalBorrowUsd)],
              ["Idle liquidity", usd(stats.liquidityUsd)],
              ["Total caps", usd(stats.capUsd, 0)],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-[11px] uppercase tracking-widest text-white/50">{l}</p>
                <p className="num mt-2 text-2xl">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-8">
          <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[28px]">Oracle feeds</h2>
          <div className="overflow-x-auto rounded-[28px] border border-line">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-widest text-text-soft">
                  <th className="px-6 py-4 font-normal">Asset</th>
                  <th className="px-6 py-4 font-normal">Price</th>
                  <th className="px-6 py-4 font-normal">Last movement</th>
                  <th className="px-6 py-4 font-normal">Feed</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => (
                  <tr key={m.symbol} className="border-b border-line/70 last:border-0">
                    <td className="px-6 py-4 text-sm font-medium">{m.symbol}</td>
                    <td className="num px-6 py-4 text-sm">
                      {m.price === null ? "—" : `$${m.price.toFixed(2)}`}
                    </td>
                    <td className="num px-6 py-4 text-sm">
                      {age(m.priceAge)}
                      {m.priceStale && <span className="ml-2 text-warn">stale</span>}
                    </td>
                    <td className="num px-6 py-4 text-xs text-text-soft">{m.feed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-text-soft">
            Stock feeds move only while the market is open, so a weekend reading of two days is
            expected, not a fault. Liquidation LTV sits at {pct(stats.lltvTiers.stock, 1)} precisely
            because Monday can open away from Friday&apos;s close.
          </p>
        </div>
      </section>
    </>
  );
}
