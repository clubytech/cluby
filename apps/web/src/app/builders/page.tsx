import { getProtocolStats } from "@/lib/markets";
import { getBuilders } from "@/lib/series";
import { pct, usd } from "@/lib/format";
import { Card, SectionHeading } from "@/components/ui";

export const revalidate = 300;
export const metadata = { title: "Builders — Cluby" };

export default async function BuildersPage() {
  const [stats, builders] = await Promise.all([getProtocolStats(), getBuilders()]);

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
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px] font-semibold">Attribution</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              A builder&apos;s address rides along as twenty bytes appended to the call. Solidity
              ignores bytes past the arguments it expects, so it reaches the chain, costs only
              calldata gas, and changes nothing about how the transaction executes. The alternative —
              a referrer argument — would put a contract of ours in the path of every deposit and
              loan to collect a marketing statistic.
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              A suffix is a claim, not a proof: anyone can append any address to their own
              transaction. What is paid is settled against the registered list.
            </p>

            {builders === null ? (
              <p className="num mt-6 text-xs text-text-soft">Indexer offline — no attribution to show.</p>
            ) : builders.length === 0 ? (
              <p className="num mt-6 text-xs text-text-soft">No routed volume yet.</p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-widest text-text-soft">
                      <th className="py-3 font-normal">Builder</th>
                      <th className="py-3 font-normal">Routed volume</th>
                      <th className="py-3 font-normal">Fee earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builders.map((b) => (
                      <tr key={b.id} className="border-b border-line/70 last:border-0">
                        <td className="num py-3 text-xs">{b.label ?? b.id}</td>
                        <td className="num py-3 text-sm">{usd(b.referredVolume)}</td>
                        <td className="num py-3 text-sm">{usd(b.feeEarned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="bg-white">
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px] font-semibold">Free flash loans</h2>
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
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px] font-semibold">An MCP server</h2>
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
