import Link from "next/link";
import { deployments, morpho, robinhoodChain, LLTV, SAFE_CAP_MARGIN, FEED_MAX_AGE, preLiquidation, stockTokenIdentity } from "@cluby/config";
import { Card, SectionHeading } from "@/components/ui";
import { getProtocolStats } from "@/lib/markets";
import { pct, usd } from "@/lib/format";

const EXPLORER = robinhoodChain.blockExplorers.default.url;

/** An address that goes somewhere, because an address you cannot check is decoration. */
function Addr({ label, address, note }: { label: string; address?: string; note?: string }) {
  if (!address) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <p className="w-full shrink-0 text-sm text-text-strong sm:w-52">{label}</p>
      <a
        href={`${EXPLORER}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        className="num sweep w-fit break-all text-xs text-brand"
      >
        {address}
      </a>
      {note && <p className="text-xs text-text-soft sm:ml-auto sm:text-right">{note}</p>}
    </div>
  );
}

/** A term and what it actually means here, not what it means in general. */
function Term({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-4 last:border-0">
      <p className="num text-xs uppercase tracking-widest text-text-strong">{t}</p>
      <p className="mt-2 text-sm leading-relaxed text-text-soft">{children}</p>
    </div>
  );
}

export const metadata = { title: "Docs — Cluby" };
export const revalidate = 300;

const sections: [string, string][] = [
  ["overview", "Overview"],
  ["start", "Getting started"],
  ["markets", "How a market gets listed"],
  ["rates", "Interest rates"],
  ["vaults", "Vaults"],
  ["withdrawals", "Withdrawals"],
  ["risk", "Risk framework"],
  ["oracles", "Oracles"],
  ["shorts", "Short markets"],
  ["liquidations", "Liquidations"],
  ["preliq", "Pre-liquidation"],
  ["keeper", "The keeper"],
  ["multiply", "Multiply"],
  ["credit-scores", "Credit scores"],
  ["points", "Points"],
  ["builders", "Builders"],
  ["flash-loans", "Flash loans"],
  ["mcp", "MCP and API"],
  ["security", "Security"],
  ["addresses", "Addresses"],
  ["glossary", "Glossary"],
  ["faq", "FAQ"],
];

export default async function DocsPage() {
  const stats = await getProtocolStats();
  const e = stats.economics;

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="How Cluby works." />
          <p className="mt-4 max-w-2xl text-white/70">
            Morpho Blue holds the money. Cluby chooses which markets exist, how they are priced and how
            much may be lent into each. Everything below is what that means in practice.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-10 lg:flex-row">
          <nav className="lg:sticky lg:top-32 lg:h-fit lg:max-h-[calc(100vh-10rem)] lg:w-56 lg:shrink-0 lg:overflow-y-auto">
            <p className="text-[11px] uppercase tracking-widest text-text-soft">On this page</p>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-1">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="group flex items-center gap-2 rounded-lg py-1 text-sm text-text-soft transition-colors hover:text-text-strong lg:px-2 lg:hover:bg-bg-weak"
                  >
                    <span className="h-3 w-px shrink-0 bg-line transition-all duration-200 group-hover:h-4 group-hover:bg-brand" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex max-w-3xl flex-col gap-12">
            <Doc id="overview" title="Overview">
              <p>
                Cluby is a curation layer, not a lending protocol. Markets, interest, collateral and
                liquidations are Morpho Blue — immutable, audited many times over, and holding every
                deposit. What we add is the choice of markets, the oracle behind each, the caps a vault
                lends under, and the machinery that keeps bad positions from becoming bad debt.
              </p>
              <p>
                Two contracts of our own touch money and neither can hold it: a liquidator that works
                on a flash loan, and a router that opens a leveraged position in a single transaction.
                Between transactions their balance is zero by construction.
              </p>
            </Doc>


            <Doc id="start" title="Getting started">
              <p>
                Five steps, and the third is the only one that costs anything to get wrong.
              </p>
              <ol className="ml-4 flex list-decimal flex-col gap-3">
                <li>
                  <span className="text-text-strong">Connect a wallet</span> on Robinhood Chain, id{" "}
                  {robinhoodChain.id}. Nothing on this site can move a token without a signature from
                  you, and the connect step reads balances only.
                </li>
                <li>
                  <span className="text-text-strong">Post collateral.</span> On a market page, set the
                  LTV slider to zero and the button becomes <em>Post collateral</em>. This works even
                  when the market has no liquidity at all — collateral never touches the lending pool —
                  so you can take your place before there is anything to borrow, owe nothing while you
                  wait, and withdraw again whenever you like.
                </li>
                <li>
                  <span className="text-text-strong">Borrow.</span> The slider shows the health factor
                  and the liquidation price BEFORE you sign, and it refuses to go past the safe cap by
                  default. That cap sits {SAFE_CAP_MARGIN.stock} percentage points inside the LLTV on a
                  stock market, {SAFE_CAP_MARGIN.longTail} on a long-tail one — the gap is deliberately
                  wider where the price moves harder.
                </li>
                <li>
                  <span className="text-text-strong">Watch the health factor.</span> Below 1.0 the
                  position can be liquidated by anyone. The number that matters is not today&apos;s
                  price but the liquidation price, and the position page shows it in the same units as
                  the ticker.
                </li>
                <li>
                  <span className="text-text-strong">Repay and withdraw.</span> Repayment goes by
                  SHARES, not by an amount, on purpose: debt accrues every second, so an amount quoted
                  in one block is short in the next and leaves dust that keeps your collateral locked.
                </li>
              </ol>
              <p>
                Everything above is a direct call to Morpho Blue. There is no Cluby contract between
                you and your money at any point in that list.
              </p>
            </Doc>

            <Doc id="markets" title="How a market gets listed">
              <p>
                A market is four immutable choices — collateral, loan asset, oracle, LLTV — plus a cap
                the vault sets and can change. Getting the first four wrong cannot be fixed; the market
                has to be abandoned and a new one opened. So the listing checklist is deliberately
                paranoid.
              </p>
              <p>
                <span className="text-text-strong">The token address is proved, never looked up.</span>{" "}
                Ticker symbols on this chain prove nothing: the explorer returns thirty-odd tokens for a
                popular ticker, and at least one fake has been found sitting on a real name. A genuine
                tokenized stock answers <code className="num">uiMultiplier()</code> — selector{" "}
                <code className="num">{stockTokenIdentity.marker}</code> — and the impostors revert on
                it. Every address in our catalogue was checked that way and against the issuer&apos;s
                deployer.
              </p>
              <p>
                <span className="text-text-strong">The price source comes second.</span> A Chainlink
                feed where one exists; otherwise a Uniswap v3 arithmetic-mean-tick TWAP over the token&apos;s
                USDG pool. A TWAP market cannot be created until the pool&apos;s observation ring is at
                least as long as the window in seconds — the oracle refuses to be constructed
                otherwise — because a window the pool cannot reach back over is not a long window, it is
                an oracle that stops answering.
              </p>
              <p>
                <span className="text-text-strong">The LLTV is a tier, not a judgement call.</span>{" "}
                Treasuries {pct(Number(LLTV.tbills) / 1e18, 1)}, ETH {pct(Number(LLTV.eth) / 1e18, 1)},
                ordinary stocks {pct(Number(LLTV.stock) / 1e18, 1)}, long-tail{" "}
                {pct(Number(LLTV.longTail) / 1e18, 1)}. Morpho only permits a fixed set of values, and
                two of the tiers we wanted — 70% for megacap TWAPs and 66.7% for shorts — are not among
                them, so both sit one step lower rather than one step higher. Rounding toward the
                conservative side is the only rounding available.
              </p>
              <p>
                <span className="text-text-strong">The cap is sized off measured exit depth,</span> not
                off ambition. A cap is the most a liquidator would have to sell into that pool in one
                move; if the pool cannot absorb it without moving the price past the liquidation
                premium, the cap is too high whatever the collateral is worth.
              </p>
            </Doc>

            <Doc id="rates" title="Interest rates">
              <p>
                The rate is set by Morpho&apos;s adaptive-curve model, not by us and not by a vote. It
                moves with utilisation — the share of supplied assets currently borrowed — and it moves
                in two ways at once.
              </p>
              <p>
                <span className="text-text-strong">Along the curve, instantly.</span> Borrow more and the
                rate rises immediately; repay and it falls. The curve is steep near full utilisation,
                which is what makes the last dollar of liquidity expensive enough that somebody repays
                rather than the lender simply being unable to withdraw.
              </p>
              <p>
                <span className="text-text-strong">And the curve itself drifts.</span> If utilisation
                sits above target the whole curve adapts upward over hours and days, and below target it
                adapts down. That is why a market can show a rate that looks high for its utilisation:
                it has been busy for a while.
              </p>
              <p>
                Interest accrues continuously and is only written to storage when someone touches the
                market. A quiet market therefore shows totals that are behind — every number this site
                displays is replayed forward to now before it is shown, which is what the Lens contract
                is for.
              </p>
              <p>
                The lender&apos;s rate is the borrower&apos;s rate times utilisation, less the
                performance fee. A market at 50% utilisation pays its lenders roughly half what its
                borrowers pay, because half the pool is idle.
              </p>
            </Doc>

            <Doc id="vaults" title="Vaults">
              <p>
                A vault is an ERC-4626 that spreads one asset across several markets under caps. You
                deposit USDG, you get shares, the shares appreciate. You are not picking markets; the
                curator is, and the caps are the whole of that decision.
              </p>
              <p>
                <span className="text-text-strong">A cap can only be raised slowly.</span> Raising one
                is submitted, then waits out the vault&apos;s timelock — 24 hours — before it can be
                accepted. Lowering a cap is immediate, because the safe direction should never be the
                slow one.
              </p>
              <p>
                <span className="text-text-strong">A guardian can veto during that window.</span> The
                point of a timelock is that somebody independent can act inside it; without a guardian
                the only address that can revoke a pending change is the one that submitted it, which
                makes the delay a formality rather than a control.
              </p>
              <p>
                <span className="text-text-strong">A vault cannot invent a market.</span> It can only
                allocate into markets that already exist on Morpho, and every one of them is visible on
                the market list with its own oracle, LLTV and cap.
              </p>
              <p>
                The performance fee is {pct(e.performanceFee, 0)} of interest earned, currently waived
                — {pct(e.introFee, 0)} for the first {e.introDays} days. It is charged on yield, never
                on principal.
              </p>
            </Doc>

            <Doc id="withdrawals" title="Withdrawals">
              <p>
                A deposit can be withdrawn as long as it is not lent out. When a market is fully used
                the rate climbs, which pulls in supply and pushes borrowers to repay — but until that
                works, part of your deposit is genuinely unavailable.
              </p>
              <p>
                That is why every vault card shows <strong>withdrawable now</strong> next to total
                assets. It is the number to trust; the other one is what you own, not what you can take
                out this minute.
              </p>
            </Doc>

            <Doc id="risk" title="Risk framework">
              <p>
                Each market carries a liquidation LTV fixed at creation:{" "}
                {pct(stats.lltvTiers.tbills, 0)} for T-bills, {pct(stats.lltvTiers.eth, 0)} for ETH,{" "}
                {pct(stats.lltvTiers.stock, 1)} for megacaps and index ETFs, and{" "}
                {pct(stats.lltvTiers.longTail, 1)} for anything long-tail or priced by TWAP.
              </p>
              <p>
                The dangerous moment for a stock market is Monday&apos;s open, not the weekend itself.
                Nothing trades while the feed is still, so the LTV has to survive the gap when it moves
                again. Caps do the rest of the work: total exposure starts at {usd(stats.capUsd, 0)} and
                only rises against measured exit depth.
              </p>
            </Doc>

            <Doc id="oracles" title="Oracles">
              <p>
                Stocks and ETFs are priced by Chainlink through Morpho&apos;s own oracle factory, so
                there is no oracle code of ours in the path. Those feeds run 24/5: they hold their last
                print from Friday close to Monday open, roughly 65 hours, which is normal and not a
                fault to alarm on.
              </p>
              <p>
                Long-tail tickers with no feed are priced by a Uniswap v3 TWAP over a 30–60 minute
                window, on a pool whose observation cardinality we raise first. Where both exist, the
                collateral takes the lower of the two — a borrower should never be flattered by the
                more generous source.
              </p>
            </Doc>


            <Doc id="shorts" title="Short markets">
              <p>
                A short market inverts the usual pair: you post USDG as collateral and borrow the stock
                itself, then sell it. If the stock falls you buy it back cheaper and keep the
                difference. The debt is denominated in shares, so it grows when the stock rises — which
                is exactly the exposure a short is supposed to have.
              </p>
              <p>
                The oracle is the long market&apos;s oracle turned upside down: one over the price, on
                the same 1e36 scale Morpho expects. That inversion is exact to the last digit — the
                token decimals cancel identically — and the one raw unit it rounds off goes to the
                protocol rather than to the borrower.
              </p>
              <p>
                Shorts run at {pct(Number(LLTV.stock) / 1e18, 1)} rather than the 66.7% the risk model
                asked for, because 66.7% is not one of the values Morpho permits. That means 160%
                coverage instead of 150% — more conservative than intended, not less.
              </p>
              <p>
                The practical limit on a short is not the LLTV but the borrow side: you can only short
                what somebody has supplied. A short market with no stock supplied has nothing to lend
                you, however much collateral you post.
              </p>
            </Doc>

            <Doc id="liquidations" title="Liquidations">
              <p>
                Above the liquidation LTV, anyone may repay part of a debt and seize collateral at a
                bonus set by Morpho&apos;s formula — around 12.7% at the {pct(stats.lltvTiers.stock, 1)}{" "}
                tier. Our keeper does this on a flash loan and sells the collateral through the deepest
                route it can simulate, so the position closes near the market rather than into it.
              </p>
              <p>
                Before that, there is a softer option. A borrower can authorise pre-liquidation: a
                partial unwind between {pct(stats.lltvTiers.stock - 0.05, 1)} and{" "}
                {pct(stats.lltvTiers.stock, 1)} at a 2–4% penalty instead of the full incentive. It
                turns a Monday gap into a trimmed position rather than a closed one.
              </p>
            </Doc>


            <Doc id="preliq" title="Pre-liquidation">
              <p>
                A hard liquidation takes a fixed premium out of the collateral the moment health falls
                below 1.0. Pre-liquidation is a softer path that starts earlier and takes less: it opens{" "}
                {preLiquidation.lltvOffsetPp} percentage points before the LLTV, closes a growing share
                of the position as health deteriorates — from {pct(preLiquidation.closeFactor.start, 0)}{" "}
                up to {pct(preLiquidation.closeFactor.end, 0)} — at a premium that climbs from{" "}
                {pct(preLiquidation.incentiveFactor.start - 1, 0)} to{" "}
                {pct(preLiquidation.incentiveFactor.end - 1, 0)}.
              </p>
              <p>
                It is opt-in per position and it does not replace liquidation; it gives a position a
                chance to be trimmed gently before the blunt instrument applies. A borrower who never
                opts in is treated exactly as before.
              </p>
            </Doc>

            <Doc id="keeper" title="The keeper">
              <p>
                A liquidation that nobody performs is bad debt for the lenders. Morpho makes
                liquidation permissionless so anyone can do it, and on an established chain that is
                enough — searchers compete for the premium. On a new chain there may be nobody watching,
                so we run a keeper.
              </p>
              <p>
                It reads every watched borrower&apos;s health directly from the chain on a loop,
                sizes the liquidation from the market&apos;s own oracle and premium, simulates it, and
                only then signs. A liquidation that would revert never leaves the machine, and a sale
                below the oracle floor is refused by the contract itself even if the keeper asked for it.
              </p>
              <p>
                <span className="text-text-strong">It is not the only liquidator and must not be.</span>{" "}
                If it is offline, broken, or out of gas, the market still clears through anyone else who
                wants the premium. The failure mode is a slower liquidation, not an impossible one.
              </p>
              <p>
                It reads an indexer for convenience but never depends on it: the chain scan runs every
                pass regardless, because an indexer that is behind answers cheerfully with a short list
                and a keeper that trusted it would report nothing to do.
              </p>
            </Doc>

            <Doc id="multiply" title="Multiply">
              <p>
                Leverage in one transaction: flash-loan the loan asset, swap it into collateral, supply,
                borrow, repay the flash loan. The health factor and the liquidation price are computed
                before you sign, and the swap reverts if the pool has moved far enough from the oracle
                that the position would open at a bad price.
              </p>
            </Doc>

            <Doc id="credit-scores" title="Credit scores">
              <p>
                Behaviour is scored off chain from what the indexer already sees: how long positions
                stay healthy, whether they are topped up before trouble, how often they get liquidated.
                A good score buys a better rebate — never a higher LTV, because the LTV is what protects
                the lenders.
              </p>
            </Doc>

            <Doc id="points" title="Points">
              <p>
                Season One counts size multiplied by time: a hundred dollars supplied for ten days
                and a thousand for one day are worth the same. They accrue while you do nothing, and
                they are counted off chain by the indexer.
              </p>
              <p>
                There is no promised conversion rate, and that is deliberate. A season that names a
                price before there are earnings to pay it is making a promise out of money the
                protocol does not have yet.
              </p>
            </Doc>

            <Doc id="builders" title="Builders">
              <p>
                An app that routes volume here appends its address as twenty bytes at the end of the
                call. Solidity ignores bytes past the arguments it expects, so it costs only calldata
                gas and changes nothing about how the transaction runs — no contract of ours sits in
                the path of your users&apos; deposits to collect a statistic.
              </p>
              <p>
                A suffix is a claim, not a proof: anyone can append any address to their own
                transaction. What is paid is settled against the registered list.
              </p>
            </Doc>

            <Doc id="flash-loans" title="Flash loans">
              <p>
                Morpho lends any asset it holds for the length of one transaction at zero fee. Call{" "}
                <code className="num rounded bg-bg-weak px-1.5 py-0.5 text-xs">
                  flashLoan(token, assets, data)
                </code>{" "}
                on <span className="num">{stats.contracts.morphoBlue}</span> and repay inside{" "}
                <code className="num rounded bg-bg-weak px-1.5 py-0.5 text-xs">onMorphoFlashLoan</code>.
                There is nothing to ask us for and no allowance to grant.
              </p>
            </Doc>

            <Doc id="mcp" title="MCP and API">
              <p>
                The SDK that the site runs on is published as a package and exposed over MCP, so an
                agent can read markets and positions and build a transaction without driving a browser.
                Public endpoints: <code className="num">/api/markets</code>,{" "}
                <code className="num">/api/vaults</code>, <code className="num">/api/stats</code>.
              </p>
            </Doc>


            <Doc id="security" title="Security">
              <p>
                <span className="text-text-strong">What holds the money is not ours.</span> Deposits,
                collateral, debt and liquidation all live in Morpho Blue, which is immutable and has
                been audited many times over. Our contracts are periphery: they hold nothing between
                transactions, and every path ends with the balance swept out. That is not a claim, it
                is the property that lets them be small enough to read.
              </p>
              <p>
                <span className="text-text-strong">What we can do.</span> Choose which markets a vault
                lends into and the cap on each, set the performance fee up to the ceiling the vault was
                deployed with, and publish credit scores that change what a borrower is REBATED. None of
                those can move a deposit, and none of them can change what a borrower is allowed to
                borrow.
              </p>
              <p>
                <span className="text-text-strong">What nobody can do.</span> Change a market&apos;s
                LLTV, oracle or interest model — they are fixed at creation. Pause withdrawals. Reach
                into a position. There is no upgrade path to these contracts because there is no proxy.
              </p>
              <p>
                <span className="text-text-strong">Review.</span> The money path — the liquidator, the
                leverage router, the reader and the three oracles — has been through an adversarial
                review in which every finding had to be proved with a failing test or a precise
                mechanism, and every finding then had to survive an attempt to refute it. Fourteen
                defects were found and fixed; five claimed defects were refuted and are recorded as
                such. The report and what was done about each item are in the repository rather than
                summarised here, including the items still open.
              </p>
              <p>
                <span className="text-text-strong">Known open.</span> Three long-tail markets are priced
                by TWAPs whose pools carry fewer observation slots than their window needs. All three
                are capped at zero with nothing supplied or borrowed, and the oracle now refuses to be
                constructed against a ring that short — but the existing three were created before that
                check, and growing their rings is a bill that has not been paid yet.
              </p>
            </Doc>

            <Doc id="addresses" title="Addresses">
              <p>Everything below is on Robinhood Chain, id {robinhoodChain.id}. Click through and check.</p>
              <Card className="border border-line bg-white">
                <Addr label="Morpho Blue" address={morpho.blue.address} note="holds every deposit" />
                <Addr label="Adaptive Curve IRM" address={morpho.adaptiveCurveIrm.address} note="sets the rate" />
                <Addr label="MetaMorpho factory" address={deployments.metaMorphoFactory} note="deployed by us, unmodified" />
                <Addr label="Core USDG vault" address={deployments.vaults?.["core-usdg"]} />
                <Addr label="Lens" address={deployments.lens} note="reads only" />
                <Addr label="FlashLiquidator" address={deployments.flashLiquidator} note="holds nothing" />
                <Addr label="LeverageRouter" address={deployments.leverageRouter} note="holds nothing" />
                <Addr label="CreditRegistry" address={deployments.creditRegistry} note="scores, rebates only" />
                <Addr label="PreLiquidationFactory" address={deployments.preLiquidationFactory} />
                <Addr label="Owner (Safe)" address={deployments.safe} />
              </Card>
              <p>
                The Lens, liquidator and router have each been replaced more than once. They are
                abandoned rather than upgraded when they change, precisely because none of them holds
                anything — replacing one costs a deployment and nothing else, and there is no proxy for
                anyone to seize.
              </p>
            </Doc>

            <Doc id="glossary" title="Glossary">
              <Card className="border border-line bg-white">
                <Term t="LLTV">
                  Liquidation loan-to-value. The ratio of debt to collateral value above which anyone
                  may liquidate you. Fixed at market creation and never changed.
                </Term>
                <Term t="Health factor">
                  Your maximum borrow divided by what you owe. Above 1.0 you are safe; at 1.0 you are
                  liquidatable. It falls when the price falls and, slowly, as interest accrues.
                </Term>
                <Term t="Liquidation price">
                  The collateral price at which your health factor reaches 1.0. More useful than the
                  health factor itself, because it is in the same units as the ticker you are watching.
                </Term>
                <Term t="Liquidation premium">
                  What a liquidator keeps for doing the work — larger on riskier markets, because a
                  thin premium means nobody bothers and the debt goes bad instead.
                </Term>
                <Term t="Utilisation">
                  Borrowed divided by supplied. It sets the rate and it is the only thing that can
                  limit a withdrawal.
                </Term>
                <Term t="Shares vs assets">
                  Debt and deposits are tracked in shares, which do not change, while the assets they
                  represent grow with interest. Repaying by shares is exact; repaying by amount is a
                  guess about which block you land in.
                </Term>
                <Term t="TWAP">
                  Time-weighted average price. An average over a window — thirty minutes here — which
                  cannot be moved inside a single transaction the way a spot price can.
                </Term>
                <Term t="Observation cardinality">
                  How many past price points a Uniswap pool stores. If it holds fewer seconds than the
                  TWAP window asks for, the oracle stops answering. Anyone can pay to grow it.
                </Term>
                <Term t="Stale feed">
                  A Chainlink answer older than we are willing to trust — {FEED_MAX_AGE.stock / 3600}{" "}
                  hours for a stock, {FEED_MAX_AGE.crypto / 3600} for crypto. Stock feeds legitimately
                  go quiet over a weekend, which is why the two limits differ.
                </Term>
                <Term t="Flash loan">
                  Borrowing and repaying inside one transaction. It costs nothing here, and it is what
                  lets a liquidation happen without the liquidator owning any capital.
                </Term>
              </Card>
            </Doc>

            <Doc id="faq" title="FAQ">
              <p>
                <strong>Who holds my collateral?</strong> Morpho Blue. Cluby cannot move it.
              </p>
              <p>
                <strong>What does Cluby earn?</strong> A {pct(e.performanceFee, 0)} performance fee on
                interest, waived for the first {e.introDays} days of a vault. Borrowers get{" "}
                {pct(e.borrowRebate, 0)} of the interest they paid back through a weekly epoch.
              </p>
              <p>
                <strong>Can a market be changed?</strong> No. LLTV, oracle and assets are fixed at
                creation. A better parameter means a new market, not an edit.
              </p>
              <p>
                <strong>What is not built yet?</strong> Whatever the market pages mark as awaiting
                creation, plus staking and rebate contracts, which deploy after the first fee cycle.
              </p>
            </Doc>

            <p className="text-sm text-text-soft">
              Parameters for a specific market are on its own page —{" "}
              <Link href="/borrow" className="text-brand underline underline-offset-4">
                the market list
              </Link>{" "}
              links to each.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[28px]">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 text-sm leading-relaxed text-text-soft">{children}</div>
    </section>
  );
}
