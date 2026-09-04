import { getProtocolStats } from "@/lib/markets";
import { pct } from "@/lib/format";
import { Card, SectionHeading } from "@/components/ui";

export const revalidate = 60;
export const metadata = { title: "Stake — Cluby" };

export default async function StakePage() {
  const stats = await getProtocolStats();
  const e = stats.economics;

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Stake the token, get paid in USDG." />
          <p className="mt-4 max-w-2xl text-white/70">
            Rewards stream by the second out of fees the protocol actually collected. No lock, no
            emissions schedule, nothing minted to pay you.
          </p>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-6">
          <Card className="border border-line bg-white">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[26px]">Staking</h2>
                <p className="mt-2 max-w-md text-sm text-text-soft">
                  Deposit the protocol token, claim USDG whenever you like. Withdrawals are immediate.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
                {[
                  ["Reward APR", "—"],
                  ["Staked", "—"],
                  ["Your claimable", "—"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-[11px] uppercase tracking-widest text-text-soft">{l}</p>
                    <p className="num mt-1 text-lg">{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {["Stake", "Unstake", "Claim"].map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-full bg-bg-soft px-6 py-3 text-sm text-text-soft sm:w-auto sm:px-10"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-text-soft">
              The staking contract is deployed after the first markets have run a full fee cycle —
              paying rewards before there are fees to pay them from is how protocols end up printing.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px]">Where the rewards come from</h3>
              <div className="mt-5 flex flex-col gap-3 text-sm">
                {[
                  ["Performance fee on vault interest", pct(e.performanceFee, 0)],
                  ["Of that fee, to stakers", "75%"],
                  ["Of that fee, to treasury", "25%"],
                  ["Token trading fee routed to stakers", "5%"],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between border-b border-line pb-3 last:border-0">
                    <span className="text-text-soft">{l}</span>
                    <span className="num">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-relaxed text-text-soft">
                A keeper converts the vault&apos;s fee shares to USDG once a day and tops the reward
                stream up. If the protocol earns nothing in a day, nothing is added — the rate falls to
                zero rather than being faked.
              </p>
            </Card>

            <Card>
              <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px]">Borrower rebates</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Borrowers get {pct(e.borrowRebate, 0)} of the interest they paid back through a weekly
                Merkle epoch. You claim it yourself; unclaimed amounts roll into the next epoch. It is
                paid out of the treasury, so it is a cost we chose, not a promise the protocol has to
                inflate to keep.
              </p>
              <p className="mt-4 text-xs text-text-soft">
                Epoch roots are published by the keeper. The claim contract is the standard Merkle
                distributor — the same shape that has been audited in the wild for years.
              </p>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
