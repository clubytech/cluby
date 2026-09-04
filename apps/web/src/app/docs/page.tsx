import Link from "next/link";
import { Card, SectionHeading } from "@/components/ui";
import { getProtocolStats } from "@/lib/markets";

export const metadata = { title: "Docs — Cluby" };
export const revalidate = 300;

const shipped = [
  ["Earn", "Core USDG vault: deposit, withdraw, withdrawable-now."],
  ["Borrow", "Four isolated markets — NVDA, SPY, AAPL, ETH — with USDG as the loan asset."],
  ["Liquidations", "Flash-loan liquidator plus a keeper that watches every open position."],
  ["Lens", "Health factor, liquidation price, safe borrow cap, live rates."],
  ["Indexer", "Markets, vault, positions, events and five-minute snapshots."],
  ["Oracle alert", "Telegram alert when the feed and the DEX price disagree; caps are cut by hand."],
];

const deferred = [
  ["Shorting stocks", "Inverse oracle and a short router exist in prototype; they arrive after mainnet is quiet."],
  ["TWAP markets", "Long-tail tickers without a Chainlink feed. Our own oracle is a risk we are not taking on day one."],
  ["Automatic watchdog", "Caps go to zero by hand first, automatically later."],
  ["Multiply, pre-liquidation, staking, rebates, points, builders", "Not core, or they require paying out of a treasury we do not have."],
];

export default async function DocsPage() {
  const stats = await getProtocolStats();
  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="How Cluby works, and what it does not do yet." />
          <p className="mt-4 max-w-2xl text-white/70">
            The short version: Morpho Blue holds the money, Cluby chooses the markets, and the list of
            things we have deliberately not built is public.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-padding section-y grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Live</h2>
            <ul className="mt-5 flex flex-col gap-4">
              {shipped.map(([t, d]) => (
                <li key={t} className="border-b border-line pb-4 last:border-0">
                  <p className="text-sm font-medium">{t}</p>
                  <p className="mt-1 text-sm text-text-soft">{d}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Deferred, on purpose</h2>
            <ul className="mt-5 flex flex-col gap-4">
              {deferred.map(([t, d]) => (
                <li key={t} className="border-b border-line pb-4 last:border-0">
                  <p className="text-sm font-medium">{t}</p>
                  <p className="mt-1 text-sm text-text-soft">{d}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-6">
          <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[28px]">Withdrawals</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-text-soft">
            A deposit can be withdrawn as long as it is not lent out. When a market is fully used the
            rate climbs, which pulls in supply and pushes borrowers to repay — but until it does, part
            of your deposit is genuinely unavailable. The vault card shows &quot;withdrawable now&quot;
            for that reason, and it is the number to trust.
          </p>

          <h2 className="mt-6 font-[family-name:var(--font-ibm-plex-serif)] text-[28px]">Risk</h2>
          <ul className="flex list-disc flex-col gap-3 pl-5 text-sm leading-relaxed text-text-soft">
            <li>
              Stock feeds do not update overnight or at weekends. A gap at Monday&apos;s open is the
              main way a position goes bad, and the {Math.round(stats.lltvTiers.stock * 100)}% LLTV is
              sized for it.
            </li>
            <li>Caps are small on purpose: total exposure is capped at {Math.round(stats.capUsd)} USDG to start.</li>
            <li>Markets are immutable. A parameter we get wrong cannot be edited — only a new market replaces it.</li>
            <li>Our contracts hold nothing between transactions, so a bug in them cannot drain a balance.</li>
          </ul>

          <h2 className="mt-6 font-[family-name:var(--font-ibm-plex-serif)] text-[28px]">Flash loans</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-text-soft">
            Morpho lends any asset it holds for the length of one transaction at no fee. Cluby&apos;s
            own liquidator is built on it. Call{" "}
            <code className="num rounded bg-white px-1.5 py-0.5 text-xs">flashLoan(token, assets, data)</code>{" "}
            on {stats.contracts.morphoBlue} and repay inside the callback.
          </p>

          <p className="mt-4 text-sm text-text-soft">
            Questions about a specific market? Each one has its parameters listed on its own page —{" "}
            <Link href="/borrow" className="text-brand underline underline-offset-4">
              start here
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
