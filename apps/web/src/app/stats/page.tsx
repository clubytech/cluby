import { getMarkets, getProtocolStats } from "@/lib/markets";
import { age, pct, usd } from "@/lib/format";
import { SectionHeading, Card } from "@/components/ui";

export const revalidate = 30;
export const metadata = { title: "Stats — Cluby" };

export default async function StatsPage() {
  const [stats, markets] = await Promise.all([getProtocolStats(), getMarkets()]);
  const shorts = markets.filter((m) => m.side === "short");

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Everything, measured." />
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-line-dark pt-6 lg:grid-cols-5">
            {[
              ["Supplied", usd(stats.totalSupplyUsd)],
              ["Borrowed", usd(stats.totalBorrowUsd)],
              ["Idle liquidity", usd(stats.liquidityUsd)],
              ["Utilization", pct(stats.utilization, 1)],
              ["Short interest", usd(stats.shortInterestUsd)],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-[11px] uppercase tracking-widest text-white/50">{l}</p>
                <p className="num mt-2 text-2xl font-medium">{v}</p>
              </div>
            ))}
          </div>
          <p className="num mt-6 text-xs text-white/50">
            {stats.listedCount} markets live · {stats.plannedCount} specified · {stats.blockedCount}{" "}
            blocked · {stats.feedsAnswering}/{stats.marketCount} feeds answering
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-8">
          <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[28px] font-semibold">Oracle feeds</h2>
          <div className="overflow-x-auto rounded-[28px] border border-line">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-widest text-text-soft">
                  <th className="px-6 py-4 font-normal">Asset</th>
                  <th className="px-6 py-4 font-normal">Price</th>
                  <th className="px-6 py-4 font-normal">Last movement</th>
                  <th className="px-6 py-4 font-normal">Source</th>
                  <th className="px-6 py-4 font-normal">Feed</th>
                </tr>
              </thead>
              <tbody>
                {[...new Map(markets.map((m) => [m.subject, m])).values()].map((m) => (
                  <tr key={m.subject} className="border-b border-line/70 last:border-0">
                    <td className="px-6 py-4 text-sm font-medium">{m.subject}</td>
                    <td className="num px-6 py-4 text-sm">{m.price === null ? "—" : `$${m.price.toFixed(2)}`}</td>
                    <td className="num px-6 py-4 text-sm">
                      {age(m.priceAge)}
                      {m.priceStale && <span className="ml-2 text-warn">stale</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-soft">
                      {m.oracle === "twap" ? "Uniswap v3 TWAP" : m.oracle === "inverse" ? "Inverse feed" : "Chainlink"}
                    </td>
                    <td className="num px-6 py-4 text-xs text-text-soft">{m.feed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-text-soft">
            Stock feeds move only while the market is open, so a two-day reading over a weekend is
            expected rather than a fault. The stock LTV sits at {pct(stats.lltvTiers.stock, 1)} precisely
            because Monday can open away from Friday&apos;s close.
          </p>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="bg-white">
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px] font-semibold">Risk tiers</h2>
            <div className="mt-6 flex flex-col gap-3 text-sm">
              {Object.entries(stats.lltvTiers).map(([tier, value]) => (
                <div key={tier} className="flex justify-between border-b border-line pb-3 last:border-0">
                  <span className="capitalize text-text-soft">{tier.replace(/([A-Z])/g, " $1")}</span>
                  <span className="num">{pct(value, 1)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-white">
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px] font-semibold">Short interest</h2>
            {shorts.length === 0 ? (
              <p className="mt-4 text-sm text-text-soft">No short markets yet.</p>
            ) : (
              <div className="mt-6 flex flex-col gap-3 text-sm">
                {shorts.map((m) => (
                  <div key={m.key} className="flex justify-between border-b border-line pb-3 last:border-0">
                    <span className="text-text-soft">{m.subject}</span>
                    <span className="num">
                      {m.status === "listed" ? usd(m.totalBorrowUsd) : "not created"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-5 text-sm leading-relaxed text-text-soft">
              Borrowed shares are shares someone lent out and someone else sold. The number is the
              honest measure of how much of the float is working against the price.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
