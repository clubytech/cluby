import { getMarkets } from "@/lib/markets";
import { MarketTable } from "@/components/market-table";
import { SectionHeading } from "@/components/ui";
import { pct, usd } from "@/lib/format";

export const revalidate = 30;
export const metadata = { title: "Borrow — Cluby" };

export default async function BorrowPage() {
  const markets = await getMarkets();
  const totalLiquidity = markets.reduce((a, m) => a + m.liquidityUsd, 0);

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10 md:pb-20">
          <SectionHeading align="left" title="Borrow USDG against collateral you keep." />
          <p className="mt-4 max-w-2xl text-white/70">
            Every market is isolated: a bad debt in one cannot touch another. Liquidation LTV and the
            oracle are fixed when the market is created and can never be changed.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Markets", `${markets.length}`, "every one isolated from the others"],
              ["Available to borrow", usd(totalLiquidity), "across all of them, right now"],
              ["Stock LLTV", pct(0.625, 1), "liquidation threshold on equities"],
              ["ETH LLTV", pct(0.77, 0), "higher, because the exit is deeper"],
            ].map(([l, v, note]) => (
              <div
                key={l}
                className="shine-dark group rounded-2xl border border-line-dark bg-white/[0.03] p-5 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.06]"
              >
                <p className="text-[11px] uppercase tracking-widest text-white/50 transition-colors duration-300 group-hover:text-brand-bright">
                  {l}
                </p>
                <p className="num mt-2 text-2xl font-medium transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
                  {v}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-white/40">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y">
          <MarketTable markets={markets} />
          <p className="mt-6 text-sm text-text-soft">
            Markets marked <span className="text-warn">Not live</span> have their parameters fixed but
            have not been created on chain yet. Prices shown for them come straight from the Chainlink
            feed, so you can see what the market will price against.
          </p>
        </div>
      </section>
    </>
  );
}
