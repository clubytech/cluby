import { getProtocolStats } from "@/lib/markets";
import { pct } from "@/lib/format";
import { Card, SectionHeading } from "@/components/ui";

export const revalidate = 300;
export const metadata = { title: "Builders — Cluby" };

export default async function BuildersPage() {
  const stats = await getProtocolStats();

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Build on the markets, keep half the fee." />
          <p className="mt-4 max-w-2xl text-white/70">
            An app that routes deposits or loans through Cluby earns{" "}
            {pct(stats.economics.builderShare, 0)} of the performance fee on the volume it brought. The
            attribution is on chain, and the accounting is a public table, not an invoice you have to
            chase.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-padding section-y grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[
            {
              t: "1 — Take an address",
              d: "Register a payout address. It becomes the referrer tag your integration passes with each transaction.",
            },
            {
              t: "2 — Route volume",
              d: "Use the SDK or call Morpho directly with the tag. Supply, borrow and Multiply all count.",
            },
            {
              t: "3 — Get paid",
              d: `Your share of the fee accrues per epoch and is claimed from the same Merkle distributor the rebates use.`,
            },
          ].map((s) => (
            <Card key={s.t}>
              <p className="num text-[11px] uppercase tracking-widest text-text-soft">{s.t}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">{s.d}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-6">
          <Card className="bg-white">
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Free flash loans</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              Morpho lends any asset it holds for the length of one transaction at zero fee. Liquidators,
              arbitrage bots and leverage routers all run on it, including ours. Call{" "}
              <code className="num rounded bg-bg-weak px-1.5 py-0.5 text-xs">
                flashLoan(token, assets, data)
              </code>{" "}
              on {stats.contracts.morphoBlue} and repay inside the callback.
            </p>
          </Card>
          <Card className="bg-white">
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">An MCP server</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              The same SDK the site uses is exposed over MCP, so an agent can read markets and
              positions and build transactions without a browser. It ships alongside the public API.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
