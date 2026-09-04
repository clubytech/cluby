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
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-line-dark pt-6 md:grid-cols-4">
            {[
              ["Markets", `${markets.length}`],
              ["Available to borrow", usd(totalLiquidity)],
              ["Stock LLTV", pct(0.625, 1)],
              ["ETH LLTV", pct(0.77, 0)],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-[11px] uppercase tracking-widest text-white/50">{l}</p>
                <p className="num mt-2 text-2xl">{v}</p>
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
