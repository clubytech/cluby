import { Card, SectionHeading, Badge } from "@/components/ui";
import { getProtocolStats } from "@/lib/markets";
import { pct, usd } from "@/lib/format";

export const metadata = { title: "Launchpad — Cluby" };
export const revalidate = 300;

export default async function LaunchpadPage() {
  const stats = await getProtocolStats();

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <div className="flex flex-wrap items-center gap-4">
            <SectionHeading align="left" title="Launch a token that can be borrowed from day one." />
            <Badge tone="pending">Soon</Badge>
          </div>
          <p className="mt-4 max-w-2xl text-white/70">
            A token becomes useful when someone will lend against it. Today that takes a curator, an
            oracle and a vault with a cap — weeks of asking. The launchpad makes it part of the
            launch.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-padding section-y grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[
            {
              t: "Launch",
              d: "Issue the token, seed a Uniswap pool, and raise its observation cardinality in the same transaction — the step everyone forgets until the TWAP oracle will not build.",
            },
            {
              t: "List",
              d: "A market opens against it at the long-tail LLTV, priced by a TWAP over that pool, with a cap sized to the pool's own depth.",
            },
            {
              t: "Fund",
              d: "A partner vault holds the liquidity the issuer brings. Their depositors, their cap, their yield — Cluby only curates which market it may lend into.",
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
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">What is already here</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              Nothing about the launchpad needs new lending machinery — the parts it would use are
              running. Markets on pool-priced tokens exist today: PONS and CASHCAT are live at{" "}
              {pct(stats.lltvTiers.longTail, 1)}, priced by a 30-minute TWAP rather than a feed.
              Partner vaults are a script. What is missing is the issuance step and the interface
              around it.
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              The honest constraint is depth, not code. A market can only lend what someone deposits,
              and a cap larger than the pool behind it is a promise the exit cannot keep — which is
              why the caps here start between {usd(500, 0)} and {usd(5000, 0)} and move only against
              measured liquidity.
            </p>
          </Card>

          <Card>
            <p className="num text-[11px] uppercase tracking-widest text-text-soft">Interested?</p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              A partner vault can be deployed today, without waiting for the launchpad: one market,
              your cap, your liquidity, ownership handed to you in the transaction that creates it.
              That is the same thing the launchpad will automate.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
