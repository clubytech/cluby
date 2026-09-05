import Link from "next/link";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { getProtocolStats } from "@/lib/markets";
import { pct, usd } from "@/lib/format";

export const revalidate = 300;
export const metadata = {
  title: "Token — Cluby",
  description:
    "Where the Cluby token's value comes from, what it will and will not control, and what is still undecided.",
};

/** One fact and its consequence, side by side. */
function Row({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-5 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <p className="w-full shrink-0 text-sm text-text-strong sm:w-56">{k}</p>
      <p className="num w-full shrink-0 text-sm text-text-strong sm:w-28">{v}</p>
      <p className="text-sm leading-relaxed text-text-soft">{note}</p>
    </div>
  );
}

export default async function TokenPage() {
  const stats = await getProtocolStats();
  const e = stats.economics;

  const stakerShare = e.feeSplit.stakers;
  const treasuryShare = e.feeSplit.treasury;

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <div className="flex flex-wrap items-center gap-4">
            <SectionHeading align="left" title="The token is a claim on fees that already exist." />
            <Badge tone="pending">Soon</Badge>
          </div>
          <p className="mt-4 max-w-2xl text-white/70">
            There is no token yet. When there is one, it will not be paid for by inflation — every
            mechanism below is running on this chain today, taking a real fee out of real interest.
            What is undecided is said so, plainly, further down.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Where the money comes from                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-10">
          <SectionHeading
            align="left"
            title="Where the money comes from"
            lead="A lending protocol has exactly one honest revenue line: a share of the interest borrowers pay lenders. Everything else is a story."
          />

          <Card className="border border-line">
            <Row
              k="Performance fee"
              v={pct(e.performanceFee, 0)}
              note="Taken from the interest the vault earns, never from the deposit. A lender who deposits a dollar can always withdraw a dollar; the fee only ever touches yield that was produced."
            />
            <Row
              k="Today's fee"
              v={pct(e.introFee, 0)}
              note={`Zero for the first ${e.introDays} days. A curator with no track record charging a full fee is asking to be paid for a service nobody has seen work yet.`}
            />
            <Row
              k="To stakers"
              v={pct(stakerShare, 0)}
              note="Of whatever fee is collected. Streamed by the second in USDG, not in newly minted tokens — a reward paid in the thing being minted is not a reward."
            />
            <Row
              k="To treasury"
              v={pct(treasuryShare, 0)}
              note="Audits, oracle coverage, keeper gas and the liquidity that makes a new market usable on day one."
            />
            <Row
              k="Creator fee"
              v={pct(e.creatorFeeToStakers, 0)}
              note="On trading of the protocol token itself, routed to stakers rather than to us. It exists because the fee is collected whether or not anyone directs it, and stakers are the better recipient."
            />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="group border border-line transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_20px_50px_-30px_rgba(0,43,56,0.5)]">
              <p className="num text-[11px] uppercase tracking-widest text-text-soft">Borrower rebate</p>
              <p className="num mt-3 text-3xl font-medium">{pct(e.borrowRebate, 0)}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Of the interest a borrower pays comes back to them weekly, through a Merkle epoch,
                weighted by an off-chain credit score. The score can move what you are paid. It can
                never move what you are allowed to borrow — that is the oracle&apos;s job and the
                LLTV&apos;s, and handing it to a score would make a spreadsheet into a risk
                parameter.
              </p>
            </Card>

            <Card className="group border border-line transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_20px_50px_-30px_rgba(0,43,56,0.5)]">
              <p className="num text-[11px] uppercase tracking-widest text-text-soft">Builder share</p>
              <p className="num mt-3 text-3xl font-medium">{pct(e.builderShare, 0)}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Of the performance fee on volume a builder referred goes to that builder. Attribution
                rides in a calldata suffix, so an integrator needs no permission and no contract of
                ours to be credited.{" "}
                <Link href="/builders" className="text-brand underline-offset-4 hover:underline">
                  How it works
                </Link>
                .
              </p>
            </Card>

            <Card className="group border border-line transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_20px_50px_-30px_rgba(0,43,56,0.5)]">
              <p className="num text-[11px] uppercase tracking-widest text-text-soft">Flash loan fee</p>
              <p className="num mt-3 text-3xl font-medium">{pct(e.flashLoanFee, 0)}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Morpho charges nothing for a flash loan and neither do we. It is what makes a
                liquidation possible with no capital, which is what keeps liquidations prompt and
                competitive rather than reserved for whoever is already rich.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* What it controls                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-10">
          <SectionHeading
            align="left"
            title="What it will control, and what it will never touch"
            lead="Most of this protocol is deliberately outside anyone's reach, including ours. A token that could change those parts would be a liability, not a feature."
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="bg-white">
              <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px] font-semibold">Governable</h3>
              <ul className="mt-5 flex flex-col gap-4 text-sm leading-relaxed text-text-soft">
                <li>
                  <span className="text-text-strong">Which markets a vault may lend into,</span> and
                  the cap on each. This is the whole job of a curator and the one place a mistake by
                  us can cost a depositor money.
                </li>
                <li>
                  <span className="text-text-strong">The performance fee,</span> between zero and the
                  ceiling the vault was deployed with.
                </li>
                <li>
                  <span className="text-text-strong">The split</span> between stakers and treasury,
                  and the size of the borrower rebate.
                </li>
                <li>
                  <span className="text-text-strong">Who holds the guardian role</span> — the address
                  that can veto a pending cap change inside the timelock window.
                </li>
              </ul>
            </Card>

            <Card className="bg-white">
              <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px] font-semibold">Not governable, by construction</h3>
              <ul className="mt-5 flex flex-col gap-4 text-sm leading-relaxed text-text-soft">
                <li>
                  <span className="text-text-strong">Your deposit and your collateral.</span> They sit
                  in Morpho Blue, which is immutable. No vote reaches them, and no key of ours does
                  either.
                </li>
                <li>
                  <span className="text-text-strong">A market&apos;s LLTV, oracle or interest model.</span>{" "}
                  Fixed at creation, forever. Changing risk means opening a different market and
                  letting people move, not editing the one they are already in.
                </li>
                <li>
                  <span className="text-text-strong">Liquidation.</span> Open to anyone, permissionless,
                  priced by the same oracle for every participant.
                </li>
                <li>
                  <span className="text-text-strong">Withdrawal.</span> There is no lock and no
                  emergency pause on getting your money out. What limits a withdrawal is utilisation
                  and nothing else.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Undecided                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-8">
          <SectionHeading
            align="left"
            title="What is not decided yet"
            lead="Written down rather than left vague, because a number invented for a page becomes a promise the moment somebody screenshots it."
          />

          <Card className="border border-line">
            {[
              ["Total supply", "No figure has been set. There will not be one here until it is fixed on chain."],
              [
                "Distribution",
                "No allocation table, no percentages, no vesting schedule. The parts that are decided — that rewards are paid in USDG out of collected fees, and that nothing is minted to pay them — are above.",
              ],
              [
                "Launch date",
                "Not set. The protocol works without a token today; a token launched to create momentum rather than to distribute a fee stream is the failure mode this page exists to avoid.",
              ],
              [
                "Airdrop",
                "Season One points are being counted now, from real supply and borrow size held over real time. Whether and how they convert is not decided. Points are a record of what you did, not a promise about what you get.",
              ],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 border-b border-line py-5 last:border-0 sm:flex-row sm:gap-6">
                <p className="w-full shrink-0 text-sm text-text-strong sm:w-44">{k}</p>
                <p className="text-sm leading-relaxed text-text-soft">{v}</p>
              </div>
            ))}
          </Card>

          <Card className="bg-bg-weak">
            <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px] font-semibold">
              What a fee actually looks like at today&apos;s size
            </h3>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-text-soft">
              {stats.totalSupplyUsd > 0 ? (
                <>
                  {usd(stats.totalSupplyUsd)} is supplied across {stats.marketCount} markets right
                  now, and {usd(stats.totalBorrowUsd)} of it is borrowed. At the current fee of{" "}
                  {pct(e.introFee, 0)} the protocol is collecting nothing, on purpose, and the
                  page will not pretend otherwise. When the fee turns on, {pct(stakerShare, 0)} of
                  it goes to stakers.
                </>
              ) : (
                <>
                  Nothing is borrowed yet, so nothing is being collected — and the token has no
                  cash flow to point at. That is the honest state of it today.
                </>
              )}
            </p>
            <p className="mt-4 text-sm text-text-soft">
              Watch the real numbers on{" "}
              <Link href="/stats" className="text-brand underline-offset-4 hover:underline">
                Stats
              </Link>{" "}
              and the transactions behind them on{" "}
              <Link href="/activity" className="text-brand underline-offset-4 hover:underline">
                Activity
              </Link>
              .
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
