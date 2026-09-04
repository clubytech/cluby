import { notFound } from "next/navigation";
import { getMarkets } from "@/lib/markets";
import { age, pct, usd } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { PositionPanel } from "@/components/position-panel";
import { SeriesChart } from "@/components/series-chart";
import { getMarketSeries } from "@/lib/series";

export const revalidate = 30;

export async function generateStaticParams() {
  const markets = await getMarkets();
  return markets.map((m) => ({ key: m.key.toLowerCase() }));
}

export default async function MarketPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const markets = await getMarkets();
  const market = markets.find((m) => m.key.toLowerCase() === key.toLowerCase());
  if (!market) notFound();

  const series = market.status === "listed" ? await getMarketSeries(market.key) : null;

  const isShort = market.side === "short";
  const oracleLabel =
    market.oracle === "twap"
      ? "Uniswap v3 TWAP, 30–60 minute window"
      : market.oracle === "chainlinkTwapMin"
        ? "min(Chainlink, TWAP) — the conservative of the two"
        : market.oracle === "inverse"
          ? "Inverse of the Chainlink feed (1e72 / price)"
          : "Chainlink feed";

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-14 pt-10">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="font-[family-name:var(--font-ibm-plex-serif)] text-[36px] md:text-[48px]">
              {isShort ? `Short ${market.subject}` : `${market.collateralSymbol} / ${market.loanSymbol}`}
            </h1>
            <Badge tone={market.status === "listed" ? "live" : market.status === "planned" ? "pending" : "neutral"}>
              {market.status === "listed" ? "Live" : market.status === "planned" ? "Awaiting creation" : "Blocked"}
            </Badge>
          </div>
          <p className="mt-3 text-white/60">
            {market.category} · {oracleLabel} · liquidation LTV {pct(market.lltv, 1)}
          </p>
          {market.note && <p className="mt-3 max-w-2xl text-sm text-warn/90">{market.note}</p>}

          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-line-dark pt-6 lg:grid-cols-6">
            {[
              ["Oracle price", market.price === null ? "—" : `$${market.price.toFixed(2)}`],
              ["Last update", age(market.priceAge)],
              ["Available", market.status === "listed" ? usd(market.liquidityUsd) : "—"],
              ["Borrow APR", pct(market.borrowApr)],
              ["Max leverage", `${market.maxLeverage.toFixed(1)}×`],
              ["Supply cap", usd(market.supplyCapUsd, 0)],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-[11px] uppercase tracking-widest text-white/50">{l}</p>
                <p className="num mt-2 text-xl">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-padding section-y grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            {series && series.length > 1 && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <SeriesChart
                  label={`${market.subject} price`}
                  points={series.map((s) => ({ x: s.timestamp, y: s.price }))}
                  format={(v) => `$${v.toFixed(2)}`}
                />
                <SeriesChart
                  label="Borrow APY"
                  points={series.map((s) => ({ x: s.timestamp, y: s.borrowApy }))}
                  format={(v) => `${(v * 100).toFixed(2)}%`}
                  accent="var(--color-brand-bright)"
                />
                <SeriesChart
                  label="Supplied"
                  points={series.map((s) => ({ x: s.timestamp, y: s.supplyAssets }))}
                  format={(v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                />
                <SeriesChart
                  label="Utilization"
                  points={series.map((s) => ({ x: s.timestamp, y: s.utilization }))}
                  format={(v) => `${(v * 100).toFixed(1)}%`}
                  accent="var(--color-brand-bright)"
                />
              </div>
            )}

            <Card className="bg-bg-weak">
              <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Info &amp; risk</h2>
              <dl className="mt-6 flex flex-col gap-4 text-sm">
                {[
                  ["Collateral", isShort ? `${market.collateralSymbol} (you post cash)` : market.collateralSymbol],
                  ["Borrowed asset", market.loanSymbol],
                  ["Token", market.collateralAddress ?? "not confirmed on this chain"],
                  ["Price source", market.feed ?? "no Chainlink feed — TWAP"],
                  ["Liquidation LTV", pct(market.lltv, 1)],
                  ["Highest LTV in this app", `${pct(market.safeLtv, 1)} — a margin below liquidation`],
                  [
                    "Oracle behaviour",
                    market.category === "Crypto"
                      ? "Updates around the clock."
                      : "Stock feeds run 24/5. The price stands still from Friday close to Monday open; that pause is normal, and the LTV is sized for the Monday gap rather than for a staleness check.",
                  ],
                  [
                    "Soft liquidation",
                    market.preLiquidation
                      ? `${market.preLiquidation} — opt in, and between ${pct(market.lltv - 0.05, 1)} and ${pct(market.lltv, 1)} LTV the position is trimmed at a 2–4% penalty instead of the full ~12.7% incentive.`
                      : "Not deployed on this market yet. It costs a deploy and takes nothing away from anyone, so it follows the liquidity.",
                  ],
                ].map(([l, v]) => (
                  <div key={l} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 sm:flex-row sm:justify-between sm:gap-8">
                    <dt className="shrink-0 text-text-soft">{l}</dt>
                    <dd className="num break-all text-left text-text-strong sm:text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card className="bg-bg-weak">
              <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">
                {isShort ? "How a short works here" : "What liquidation means here"}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-text-soft">
                {isShort
                  ? `You post USDG, borrow ${market.subject} itself and sell it. Profit comes from buying it back cheaper; the lender on the other side keeps the exposure and earns the borrow rate. Your position is liquidated if ${market.subject} rallies far enough that your cash no longer covers ${pct(market.lltv, 1)} of the debt.`
                  : `If the debt rises above ${pct(market.lltv, 1)} of collateral value, anyone may repay part of it and take collateral at a bonus. Cluby runs its own liquidator on a Morpho flash loan so this happens promptly rather than at the worst spread — but it stays open to anyone, which is what makes it reliable.`}
              </p>
            </Card>
          </div>

          <PositionPanel
            side={market.side}
            subject={market.subject}
            loanSymbol={market.loanSymbol}
            price={market.price}
            lltv={market.lltv}
            safeLtv={market.safeLtv}
            maxLeverage={market.maxLeverage}
            status={market.status}
            marketId={market.marketId}
            collateralAddress={market.collateralAddress}
            collateralDecimals={market.collateralSymbol === "USDG" ? 6 : 18}
            loanDecimals={market.loanSymbol === "USDG" ? 6 : 18}
          />
        </div>
      </section>
    </>
  );
}
