import Link from "next/link";
import { Card, SectionHeading } from "@/components/ui";
import { getProtocolStats } from "@/lib/markets";
import { pct, usd } from "@/lib/format";

export const metadata = { title: "Docs — Cluby" };
export const revalidate = 300;

const sections = [
  ["overview", "Overview"],
  ["withdrawals", "Withdrawals"],
  ["risk", "Risk framework"],
  ["oracles", "Oracles"],
  ["liquidations", "Liquidations"],
  ["multiply", "Multiply"],
  ["credit-scores", "Credit scores"],
  ["flash-loans", "Flash loans"],
  ["mcp", "MCP and API"],
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
          <nav className="lg:sticky lg:top-32 lg:h-fit lg:w-56 lg:shrink-0">
            <p className="text-[11px] uppercase tracking-widest text-text-soft">On this page</p>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-2">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-sm text-text-soft hover:text-text-strong">
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
