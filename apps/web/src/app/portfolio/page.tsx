import { SectionHeading, Card } from "@/components/ui";
import { getProtocolStats } from "@/lib/markets";
import { pct } from "@/lib/format";

export const metadata = { title: "Portfolio — Cluby" };
export const revalidate = 300;

export default async function PortfolioPage() {
  const stats = await getProtocolStats();

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Your positions" />
          <p className="mt-4 max-w-2xl text-white/70">
            Deposits, loans, health factor, the exact price each position liquidates at, your rebate
            for the epoch and the score behind it.
          </p>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-6">
          <Card className="border border-line bg-white text-center">
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">No wallet connected</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-text-soft">
              Connect once the first markets are created. Until a position can exist, this page has
              nothing truthful to put in it.
            </p>
            <button
              type="button"
              disabled
              className="mt-6 cursor-not-allowed rounded-full bg-bg-soft px-8 py-3 text-sm text-text-soft"
            >
              Connect wallet
            </button>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {[
              {
                t: "Supplied",
                d: "Vault shares, what they are worth now, and how much of it is withdrawable this minute rather than lent out.",
              },
              {
                t: "Borrowed",
                d: `Debt per market with the health factor and liquidation price, plus the soft-liquidation line ${pct(stats.lltvTiers.stock - 0.05, 1)} below the hard one.`,
              },
              {
                t: "Rebates and score",
                d: `${pct(stats.economics.borrowRebate, 0)} of interest paid comes back each weekly epoch; the score is built from how your positions behaved, and it moves the rebate, never the LTV.`,
              },
            ].map((c) => (
              <Card key={c.t}>
                <p className="num text-[11px] uppercase tracking-widest text-text-soft">{c.t}</p>
                <p className="mt-3 text-sm leading-relaxed text-text-soft">{c.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
