import { notFound } from "next/navigation";
import { getMarkets } from "@/lib/markets";
import { age, pct, usd } from "@/lib/format";
import { Badge, Card } from "@/components/ui";

export const revalidate = 30;

export async function generateStaticParams() {
  const markets = await getMarkets();
  return markets.map((m) => ({ symbol: m.symbol.toLowerCase() }));
}

export default async function MarketPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const markets = await getMarkets();
  const market = markets.find((m) => m.symbol.toLowerCase() === symbol.toLowerCase());
  if (!market) notFound();

  const maxLoanPer1k = market.price === null ? null : 1000 * market.safeLtv;

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-14 pt-10">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="font-[family-name:var(--font-ibm-plex-serif)] text-[36px] md:text-[48px]">
              {market.symbol} / USDG
            </h1>
            <Badge tone={market.status === "live" ? "live" : "pending"}>
              {market.status === "live" ? "Live" : "Not created yet"}
            </Badge>
          </div>
          <p className="mt-3 text-white/60">
            {market.category} collateral · Chainlink oracle · liquidation LTV {pct(market.lltv, 1)}
          </p>

          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-line-dark pt-6 lg:grid-cols-5">
            {[
              ["Oracle price", market.price === null ? "—" : `$${market.price.toFixed(2)}`],
              ["Last update", age(market.priceAge)],
              ["Available", market.status === "live" ? usd(market.liquidityUsd) : "—"],
              ["Borrow APR", pct(market.borrowApr)],
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
            <Card className="bg-bg-weak">
              <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Info &amp; risk</h2>
              <dl className="mt-6 flex flex-col gap-4 text-sm">
                {[
                  ["Collateral token", market.collateralAddress],
                  ["Price feed", market.feed ?? "—"],
                  ["Liquidation LTV", pct(market.lltv, 1)],
                  ["Max LTV in this app", `${pct(market.safeLtv, 1)} — a margin below liquidation`],
                  [
                    "Oracle behaviour",
                    market.category === "Crypto"
                      ? "Updates around the clock."
                      : "Stock feeds are 24/5. The price stands still from Friday close to Monday open — that pause is normal, and the low LTV is what covers the Monday gap.",
                  ],
                ].map(([l, v]) => (
                  <div key={l} className="flex flex-col gap-1 border-b border-line pb-3 sm:flex-row sm:justify-between sm:gap-8">
                    <dt className="text-text-soft">{l}</dt>
                    <dd className="num break-all text-right text-text-strong">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card className="bg-bg-weak">
              <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">What liquidation means here</h2>
              <p className="mt-4 text-sm leading-relaxed text-text-soft">
                If your debt rises above {pct(market.lltv, 1)} of collateral value, anyone may repay part
                of it and take collateral at a bonus. Cluby runs a liquidator of its own so this happens
                promptly rather than at the worst possible spread — but it is open to anyone, which is
                the point.
              </p>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card className="border border-line bg-white">
              <h2 className="text-lg font-medium">Borrow</h2>
              <p className="mt-2 text-sm text-text-soft">
                {market.status === "live"
                  ? "Connect a wallet to open a position."
                  : "This market is not on chain yet. Parameters below are final; the create-market script deploys the oracle and the market together."}
              </p>
              <div className="mt-6 flex flex-col gap-3 text-sm">
                <div className="flex justify-between border-b border-line pb-3">
                  <span className="text-text-soft">Per $1,000 of collateral</span>
                  <span className="num">{maxLoanPer1k === null ? "—" : usd(maxLoanPer1k)}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-3">
                  <span className="text-text-soft">Liquidation at</span>
                  <span className="num">{pct(market.lltv, 1)} LTV</span>
                </div>
              </div>
              <button
                type="button"
                disabled
                className="mt-6 w-full cursor-not-allowed rounded-full bg-bg-soft px-6 py-3 text-sm text-text-soft"
              >
                Connect wallet — coming with the canary
              </button>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
