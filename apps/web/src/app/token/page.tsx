import Link from "next/link";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { deployments } from "@cluby/config";
import { getProtocolStats } from "@/lib/markets";
import { getTokenListing } from "@/lib/token-listing";
import { getIncentives } from "@/lib/incentives";
import { pct } from "@/lib/format";

/**
 * Thirty seconds, not five minutes.
 *
 * This page is one transaction away from being a different page: the minute the token registry has
 * an address in it, the ticker and the contract belong at the top rather than a line saying there
 * is no token. `revalidate` is the whole delay between the owner signing and a reader seeing it, so
 * it is set to what a launch can tolerate rather than to what a static page would prefer.
 */
export const revalidate = 30;

export const metadata = {
  title: "Token — Cluby",
  description:
    "Where Cluby's fees come from, how they are split, and what the token will do with them. No supply, no date, and no price — those are not decided.",
};

/** A value that failed to read renders as this, never as zero. */
const UNREAD = "could not read";

/**
 * One leg of the fee split, drawn at its own weight.
 *
 * A split written as a list of sentences is four facts a reader has to hold at once. Drawn as bars
 * whose widths are the percentages, it is one picture, and a leg that is much bigger than the others
 * is visibly much bigger rather than merely written down as a larger number.
 */
function Leg({
  share,
  label,
  note,
  tone = "brand",
}: {
  share: number;
  label: string;
  note: string;
  tone?: "brand" | "muted";
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-5 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-bold text-text-strong">{label}</p>
        <p className="num text-2xl font-bold tracking-tight text-text-strong">
          {Math.round(share * 100)}%
        </p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-soft">
        <div
          className={`h-full rounded-full ${tone === "brand" ? "bg-brand" : "bg-text-soft/40"}`}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <p className="text-sm leading-relaxed text-text-soft">{note}</p>
    </div>
  );
}

/** A single token fact: a label, a value, and the caveat that makes the value honest. */
function Fact({ k, v, note }: { k: string; v: React.ReactNode; note: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{k}</p>
      <p className="num mt-1 break-all text-lg font-bold tracking-tight text-text-strong">{v}</p>
      <p className="mt-1 text-sm leading-relaxed text-text-soft">{note}</p>
    </div>
  );
}

/** One step of the sequence, numbered, with its state said out loud. */
function Step({
  n,
  title,
  body,
  state,
}: {
  n: string;
  title: string;
  body: string;
  state: "done" | "next" | "later";
}) {
  const label = state === "done" ? "Live" : state === "next" ? "Next" : "Later";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white px-5 py-6">
      <div className="flex items-center justify-between">
        <p className="num text-xs font-bold tracking-[0.2em] text-text-soft">{n}</p>
        <Badge tone={state === "done" ? "live" : "pending"}>{label}</Badge>
      </div>
      <p className="text-base font-bold text-text-strong">{title}</p>
      <p className="text-sm leading-relaxed text-text-soft">{body}</p>
    </div>
  );
}

/**
 * A number that came off the chain, with the address it came from underneath it.
 *
 * The address is the point. Every protocol's token page has numbers on it, almost none of them can
 * be checked, and a reader who has been rugged before knows that. Printing the contract next to the
 * figure turns "trust us" into "go and look" — and it commits us, because the page and the chain now
 * have to agree in public.
 */
function Onchain({
  label,
  value,
  address,
  note,
}: {
  label: string;
  value: string;
  address?: string | null;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-6 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{label}</p>
        <p className="num text-2xl font-bold tracking-tight text-text-strong">{value}</p>
      </div>
      <p className="text-sm leading-relaxed text-text-soft">{note}</p>
      {address && <p className="num mt-1 break-all text-xs text-text-soft/80">{address}</p>}
    </div>
  );
}

export default async function TokenPage() {
  const [stats, listing, chain] = await Promise.all([
    getProtocolStats(),
    getTokenListing(),
    getIncentives(),
  ]);
  const e = stats.economics;

  // Markets CREATED ON CHAIN, not rows in the catalogue. `marketCount` counts the catalogue, which
  // includes everything planned, and a launch page that quotes the plan as though it were the chain
  // is the exact overclaim a reader can check in one call and then never trust us again about.
  const liveMarkets = Object.keys(deployments.markets).length;

  // The ticker is whatever the published contract calls itself, never a string kept here. A page
  // that hard-codes a ticker next to an address is a page that one bad paste can make lie.
  const live = listing.token !== null;
  const ticker = listing.symbol ? `$${listing.symbol}` : "$CLUBY";

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
            Protocol token
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <h1 className="font-serif text-5xl font-bold tracking-tight sm:text-6xl">{ticker}</h1>
            <Badge tone={live ? "live" : "pending"}>{live ? "Live" : "Soon"}</Badge>
          </div>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
            Cluby runs <span className="font-bold text-white">{liveMarkets} isolated markets</span>{" "}
            on Robinhood Chain, lending USDG against tokenized equities, index ETFs, commodities,
            treasuries and pre-IPO — and lending the shares themselves to shorts.{" "}
            {ticker} is how that activity reaches the people who use and secure it.
          </p>

          {live ? (
            <div className="mt-8 rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                Contract address
              </p>
              <p className="num mt-2 break-all text-lg font-bold tracking-tight text-white">
                {listing.token}
              </p>
              <p className="mt-3 text-sm text-white/60">
                Published on chain by the protocol&apos;s owner, and read from there by this page.
                Verify it against the chain before you trade — including against this page.
              </p>
            </div>
          ) : (
            <div className="mt-8 max-w-2xl rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-5">
              <p className="text-sm font-bold text-white">There is no token yet.</p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                No supply, no date, no price, no allocation, and no contract address — because none
                of it has been decided, and a page that invents them to look finished is the first
                thing that should make you leave. Everything below the fold is the part that is
                already running: real fees, from real interest, in contracts you can read today.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                When there is an address, it appears here within thirty seconds of the transaction
                that publishes it. It will not arrive in a Telegram message, and anything claiming to
                be it before this page says so is not it.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Where the fees go                                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-10">
          <SectionHeading
            align="left"
            title="Where the fees go"
            lead="A lending protocol has exactly one honest revenue line: a share of the interest borrowers pay lenders. Everything else is a story, and stories do not survive a bad month."
          />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.15fr]">
            <Card className="border border-line">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
                Protocol fees
              </p>
              <p className="mt-3 text-4xl font-bold tracking-tight text-text-strong">
                {pct(e.performanceFee, 0)}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                of the interest the vault earns — never of the deposit. A lender who puts in a dollar
                can always take a dollar back out; the fee only ever touches yield that was already
                produced.
              </p>
              <p className="mt-4 rounded-xl bg-bg-soft px-4 py-3 text-sm leading-relaxed text-text-soft">
                <span className="font-bold text-text-strong">
                  Today it is {pct(e.introFee, 0)}, for the first {e.introDays} days.
                </span>{" "}
                A curator with no track record charging a full fee is asking to be paid for a service
                nobody has watched work yet. Which also means every split on this page is currently a
                share of nothing, and this page says so rather than letting you assume otherwise.
              </p>
            </Card>

            <Card className="border border-line">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
                Split of whatever is collected
              </p>
              <div className="mt-4">
                <Leg
                  share={e.feeSplit.stakers}
                  label="Stakers"
                  note="Streamed by the second in USDG, not in newly minted tokens. A reward paid in the thing being minted is not a reward, it is dilution with a nicer label — and it is why most staking yields fall the moment anyone tries to leave."
                />
                <Leg
                  share={e.feeSplit.treasury}
                  label="Treasury"
                  tone="muted"
                  note="Audits, oracle coverage, keeper gas, and the liquidity that makes a new market usable on the day it opens rather than a month later."
                />
              </div>
              <p className="mt-5 text-sm leading-relaxed text-text-soft">
                Two legs, not four. There is no buyback line here because a buyback funded by a fee
                that is currently zero is a press release, and no burn line because burning a supply
                nobody has been issued yet would be theatre.
              </p>
            </Card>
          </div>

          {/* Paid out of the same fee, to the two groups that generate it. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="group border border-line transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_20px_50px_-30px_rgba(0,43,56,0.5)]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
                Borrower rebate
              </p>
              <p className="num mt-3 text-3xl font-bold tracking-tight">{pct(e.borrowRebate, 0)}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                of the interest a borrower pays comes back to them weekly, in USDG, through a Merkle
                epoch weighted by an on-chain credit score. The score can move what you are{" "}
                <span className="font-bold text-text-strong">paid</span>. It can never move what you
                are <span className="font-bold text-text-strong">allowed to borrow</span> — that is
                the oracle&apos;s job and the liquidation threshold&apos;s, and handing it to a score
                would turn a spreadsheet into a risk parameter.
              </p>
            </Card>

            <Card className="group border border-line transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_20px_50px_-30px_rgba(0,43,56,0.5)]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
                Builder share
              </p>
              <p className="num mt-3 text-3xl font-bold tracking-tight">{pct(e.builderShare, 0)}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                of the fee on volume a builder referred goes to that builder, permanently, and they
                may charge their own on top and keep all of it. Attribution rides in a calldata
                suffix, so an integrator needs no permission and no contract of ours.{" "}
                <Link href="/builders" className="text-brand underline-offset-4 hover:underline">
                  How it works
                </Link>
                .
              </p>
            </Card>

            <Card className="group border border-line transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_20px_50px_-30px_rgba(0,43,56,0.5)]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
                Flash loan fee
              </p>
              <p className="num mt-3 text-3xl font-bold tracking-tight">{pct(e.flashLoanFee, 0)}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Morpho charges nothing for a flash loan and neither do we. It is what lets a
                liquidation happen with no capital, which keeps liquidations prompt and competitive
                instead of reserved for whoever is already rich.
              </p>
            </Card>
          </div>

          {/* The token's own trading fee, kept separate because it is a separate thing. */}
          <Card className="border border-line">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
              The token&apos;s own trading fee
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              A token launched on this chain collects a creator fee on its own trading whether or not
              anyone directs it anywhere.{" "}
              <span className="font-bold text-text-strong">
                {pct(e.creatorFeeToStakers, 0)} of it is routed to stakers rather than to us
              </span>{" "}
              — not because we are generous, but because the fee gets collected regardless and
              stakers are the better recipient. This one is genuinely not decided beyond that
              sentence, and it will be fixed on chain before it is described as anything more.
            </p>
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* What the token does                                               */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-10">
          <SectionHeading
            align="left"
            title={`What ${ticker} will do`}
            lead="Three things, all of them paid in USDG out of fees that already have a source. None of it is a yield conjured from emissions, and none of it is a guarantee — it scales with borrowing, and borrowing varies."
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border border-line">
              <p className="text-lg font-bold text-text-strong">Stake</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Staked {ticker} earns {pct(e.feeSplit.stakers, 0)} of protocol fees plus{" "}
                {pct(e.creatorFeeToStakers, 0)} of the token&apos;s trading fee, both in USDG,
                streamed by the second. No lock: staking and unstaking are immediate, and unclaimed
                rewards survive both. The contract can only ever promise what has already been sent
                to it.
              </p>
            </Card>

            <Card className="border border-line">
              <p className="text-lg font-bold text-text-strong">Cheaper credit</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Holding {ticker} raises your weight in the weekly rebate, so a borrower who holds it
                pays less net interest on the same position. It changes the price of credit, never
                the terms of it — your liquidation threshold is identical either way.
              </p>
            </Card>

            <Card className="border border-line">
              <p className="text-lg font-bold text-text-strong">Supply boost</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Holding {ticker} raises the share of vault yield you keep. Same deposit, same risk,
                same withdrawal rights — the boost moves the fee, not the capital, and it cannot
                affect what any other depositor is owed.
              </p>
            </Card>
          </div>

          <p className="text-sm leading-relaxed text-text-soft">
            Rewards depend on protocol revenue, which varies with borrowing activity. Nothing here is
            a guarantee of a return, an offer, a price indication, or investment advice.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The facts, including the ones we do not have                      */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-8">
          <SectionHeading
            align="left"
            title="The token itself"
            lead="Four questions everyone asks first. Where the answer is not decided, it says not decided — and every one of these becomes a real value on this page the moment it is fixed on chain, without a redeploy."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact
              k="Contract"
              v={live ? `${listing.token!.slice(0, 6)}…${listing.token!.slice(-4)}` : "Not yet"}
              note={
                live
                  ? "Read from the token registry on chain. Verify before you trade."
                  : "There is no address. Anything presented as one today is not ours."
              }
            />
            <Fact
              k="Total supply"
              v={
                live && listing.totalSupply > 0n
                  ? Number(
                      listing.totalSupply / 10n ** BigInt(listing.decimals || 18),
                    ).toLocaleString("en-US")
                  : "Not decided"
              }
              note={
                live
                  ? "Read from the token contract itself, not typed onto this page."
                  : "No figure has been set. There will not be one until it is fixed on chain, and this line will show it when there is."
              }
            />
            <Fact
              k="Venue"
              v={live ? "Uniswap" : "Not decided"}
              note={
                live
                  ? "The pool published alongside the token."
                  : "No pool, no pair, no seed size. A launch venue announced before a launch is a target for whoever gets there first."
              }
            />
            <Fact
              k="Allocation"
              v="Not decided"
              note="No team share, no investor share, no unlock schedule — none of it exists, and inventing one to fill this box is exactly the thing this box is here to refuse."
            />
          </div>

          <div className="rounded-2xl border border-line bg-bg-soft px-5 py-5">
            <p className="text-sm leading-relaxed text-text-soft">
              <span className="font-bold text-text-strong">
                The address will be published from a contract, not from a website.
              </span>{" "}
              A registry owned by the protocol&apos;s multisig holds it, and this page reads it from
              there. That means the most impersonatable string on this site — the one people paste
              into a wallet and send money to — changes only when the owner signs a transaction, and
              never because someone with a login says so. The ticker shown next to it is read from
              the token&apos;s own contract, so the label and the address cannot disagree.
            </p>
            {deployments.tokenRegistry && (
              <p className="num mt-3 break-all text-xs text-text-soft/80">
                {deployments.tokenRegistry}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The machinery, read off the chain                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-10">
          <SectionHeading
            align="left"
            title="The machinery is already deployed. Here is what it holds."
            lead="Every number in this section is read from a contract when this page is built, not typed into it. The addresses are printed so you can fetch the same values yourself and catch us if they ever disagree."
          />

          <Card className="border border-line">
            <Onchain
              label="Rebates are paid by"
              value={
                chain.epochsPublished === null
                  ? UNREAD
                  : `${chain.epochsPublished} epoch${chain.epochsPublished === 1 ? "" : "s"}`
              }
              address={chain.distributor}
              note="A Merkle distributor holding USDG. It refuses to publish an epoch its own balance cannot cover, so a published week is money already sitting in the contract — not an IOU, and not a race between whoever claims first and whoever was asleep. Nothing has been published yet, and this line will say so until something has."
            />
            <Onchain
              label="Waiting to be claimed"
              value={
                chain.fundedUsdg === null
                  ? UNREAD
                  : `$${chain.fundedUsdg.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              }
              note="USDG held by that contract right now. Until the performance fee is switched on there is nothing to fund it with, so this reads zero. That is the honest number and it is the one we show."
            />
            <Onchain
              label="Paid out so far"
              value={
                chain.distributedUsdg === null
                  ? UNREAD
                  : `$${chain.distributedUsdg.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              }
              note="Summed across every epoch's claim total. It moves the moment the first borrower claims, and no sooner."
            />
            <Onchain
              label="Performance fee today"
              value={
                chain.vaultFeeWad === null
                  ? UNREAD
                  : `${(Number(chain.vaultFeeWad) / 1e16).toFixed(0)}%`
              }
              address={chain.vaultOwner ?? chain.vault}
              note="Read from the vault itself. It is zero, so there is no revenue to split yet — and a page that shows a split without showing that the numerator is zero is lying by arrangement. Raising it is a call only the address above can make, and that address is a multisig, not a person's wallet."
            />
            <Onchain
              label="Notice before any change takes effect"
              value={
                chain.timelockSeconds === null
                  ? UNREAD
                  : chain.timelockSeconds >= 3600
                    ? `${Math.round(chain.timelockSeconds / 3600)} hours`
                    : `${chain.timelockSeconds} seconds`
              }
              note="The vault's timelock, on chain. A fee rise, a new market, a cap increase — each is submitted in public and cannot execute until this has elapsed, which is long enough for anyone who dislikes it to withdraw first."
            />
            <Onchain
              label="Scores are recorded in"
              value="0–1000"
              address={chain.registry}
              note="The credit registry. The keeper publishes scores hourly; the contract stores the value and the moment it was written, so anyone reading it can see how stale it is and refuse to act on an old one."
            />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border border-line">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
                How a rebate is worked out
              </p>
              <ol className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-text-soft">
                <li>
                  <span className="font-bold text-text-strong">1.</span> The week&apos;s interest is
                  totalled per borrower from the chain&apos;s own events — not from our database.
                  Anyone with an RPC endpoint can reproduce the input.
                </li>
                <li>
                  <span className="font-bold text-text-strong">2.</span> Each borrower&apos;s share
                  is scaled by their score, which rises with debt repaid and time without a
                  liquidation, and falls when a position is liquidated.
                </li>
                <li>
                  <span className="font-bold text-text-strong">3.</span> The USDG goes into the
                  distributor <em>first</em>. Then the week is published. The contract will not
                  accept it in the other order.
                </li>
                <li>
                  <span className="font-bold text-text-strong">4.</span> You claim your own share.
                  Unclaimed money stays claimable for ninety days before it can be swept, so being
                  slow costs you nothing.
                </li>
              </ol>
            </Card>

            <Card className="border border-line">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
                What a score is not allowed to do
              </p>
              <p className="mt-4 text-sm leading-relaxed text-text-soft">
                It cannot change what you may borrow. Not by a basis point. The registry is read when
                a rebate is computed and at no other moment — the threshold that decides your
                liquidation is fixed in the market when the market is created, and cannot be edited
                by us, by a score, or by anyone.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-text-soft">
                That line is what keeps an off-chain number from becoming a risk parameter. A score
                that could raise your leverage would be a spreadsheet standing between a lender and
                their money. The worst a broken score can do here is send someone the wrong rebate,
                and that is fixed by publishing the next week rather than unwinding the last one.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Sequence                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-8">
          <SectionHeading
            align="left"
            title="The order it happens in"
            lead="Written down so it can be held against us. Each step is either done or it is not, and this page says which."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Step
              n="01"
              state="done"
              title="Markets and fees"
              body={`${liveMarkets} isolated markets are live on chain, with the contracts that collect and distribute a fee already deployed and owned by the multisig.`}
            />
            <Step
              n="02"
              state="next"
              title="The fee switches on"
              body={`The performance fee moves off zero after the first ${e.introDays} days, in public, behind the timelock. That is the first moment any of the splits above is a share of something.`}
            />
            <Step
              n="03"
              state="later"
              title="The token"
              body="Supply, venue and allocation get fixed on chain, and the address appears on this page from the registry within thirty seconds of the transaction that publishes it."
            />
            <Step
              n="04"
              state="later"
              title="Staking and governance"
              body="Staking opens against the published token; stakers get a say in new markets, caps and risk parameters — never in an existing market's threshold, which nothing can change."
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* What it will never touch                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-bg-strong text-white">
        <div className="container-padding section-y flex flex-col gap-8">
          <SectionHeading
            align="left"
            title="What the token will never control"
            lead="The list matters more than the one above it. A governance token whose limits are unwritten is a governance token that will eventually be pointed at your collateral."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              [
                "Your deposit and your collateral.",
                "They sit in Morpho Blue, which is immutable and which we cannot upgrade or reach into. There is no vote that moves them, because there is no function that moves them.",
              ],
              [
                "A live market's threshold, oracle or interest model.",
                "These are part of a market's identity, not its storage. Changing one does not edit a market — it names a different market that does not exist.",
              ],
              [
                "Liquidation.",
                "It happens when the arithmetic says so, to anyone who calls it, at an incentive the protocol sets from the threshold itself. There is no allowlist and no discretion.",
              ],
              [
                "Withdrawal.",
                "Vault shares are ERC-4626 and redeemable against available liquidity. No vote can pause it, and no timelock stands between you and your own money.",
              ],
            ].map(([t, b]) => (
              <div key={t} className="rounded-2xl border border-white/12 bg-white/[0.03] px-5 py-5">
                <p className="text-sm font-bold text-white">{t}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{b}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="press inline-flex items-center rounded-full bg-brand-bright px-6 py-3 text-sm font-medium text-bg-deep transition-colors hover:bg-white"
            >
              Read the docs
            </Link>
            <Link
              href="/stats"
              className="press inline-flex items-center rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/50 hover:bg-white/10"
            >
              See every market live
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
