import { SectionHeading, Card, Badge } from "@/components/ui";
import { getProtocolStats } from "@/lib/markets";
import { getPortfolio } from "@/lib/portfolio";
import { getPoints } from "@/lib/series";
import { pct, usd } from "@/lib/format";
import { AddressForm } from "@/components/address-form";
import { MarketLogo } from "@/components/market-logo";

export const metadata = { title: "Portfolio — Cluby" };
export const revalidate = 30;

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;
  const valid = address && /^0x[a-fA-F0-9]{40}$/.test(address) ? (address as `0x${string}`) : null;

  const [stats, portfolio, points] = await Promise.all([
    getProtocolStats(),
    valid ? getPortfolio(valid) : Promise.resolve(null),
    valid ? getPoints(valid) : Promise.resolve(null),
  ]);

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Your positions" />
          <p className="mt-4 max-w-2xl text-white/70">
            Deposits, loans, health factor and the exact price each position is liquidated at — read
            from the chain, so it is the same number a liquidator sees.
          </p>
          <div className="mt-8 max-w-xl">
            <AddressForm defaultValue={valid ?? ""} />
          </div>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-6">
          {!valid && (
            <Card className="border border-line bg-white text-center">
              <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">
                Paste an address, or connect a wallet later
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-text-soft">
                Any address works — positions are public. Wallet connection arrives with the app; it
                will not show you anything this page cannot.
              </p>
            </Card>
          )}

          {portfolio && portfolio.vaults.length === 0 && portfolio.positions.length === 0 && (
            <Card className="border border-line bg-white text-center">
              <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Nothing here yet</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-text-soft">
                This address has no deposit and no loan on any Cluby market.
              </p>
            </Card>
          )}

          {portfolio && portfolio.vaults.length > 0 && (
            <Card className="border border-line bg-white">
              <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Deposits</h2>
              <div data-lenis-prevent className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-widest text-text-soft">
                      <th className="py-3 font-normal">Vault</th>
                      <th className="py-3 font-normal">Shares</th>
                      <th className="py-3 font-normal">Value</th>
                      <th className="py-3 font-normal">Withdrawable now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.vaults.map((v) => (
                      <tr key={v.key} className="border-b border-line/70 last:border-0">
                        <td className="py-4 text-sm font-medium">{v.name}</td>
                        <td className="num py-4 text-sm">{v.shares.toFixed(6)}</td>
                        <td className="num py-4 text-sm">{usd(v.valueUsd)}</td>
                        <td className="num py-4 text-sm">{usd(v.withdrawableUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {portfolio && portfolio.positions.length > 0 && (
            <Card className="border border-line bg-white">
              <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Loans</h2>
              <div className="mt-6 flex flex-col gap-4">
                {portfolio.positions.map((p) => (
                  <div key={p.market} className="rounded-2xl border border-line p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <MarketLogo subject={p.subject} />
                        <p className="text-sm font-medium">{p.market}</p>
                      </div>
                      {p.debtUsd > 0 &&
                        (p.liquidatable ? (
                          <Badge tone="pending">Liquidatable</Badge>
                        ) : (
                          <Badge tone="live">Healthy</Badge>
                        ))}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-5">
                      {[
                        ["Collateral", `${p.collateral.toFixed(4)} ${p.subject}`],
                        ["Collateral value", usd(p.collateralValueUsd)],
                        ["Debt", usd(p.debtUsd)],
                        ["Health factor", p.healthFactor === null ? "—" : p.healthFactor.toFixed(2)],
                        [
                          "Liquidation price",
                          p.liquidationPriceUsd === null ? "—" : `$${p.liquidationPriceUsd.toFixed(2)}`,
                        ],
                      ].map(([l, v]) => (
                        <div key={l}>
                          <p className="text-[11px] uppercase tracking-widest text-text-soft">{l}</p>
                          <p className="num mt-1 text-sm">{v}</p>
                        </div>
                      ))}
                    </div>

                    {p.debtUsd > 0 && p.liquidationPriceUsd !== null && (
                      <p className="mt-4 text-xs text-text-soft">
                        {p.subject} is ${p.priceUsd.toFixed(2)} — a fall of{" "}
                        {pct(1 - p.liquidationPriceUsd / p.priceUsd, 1)} would put this position at the{" "}
                        {pct(p.lltv, 1)} liquidation line.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <p className="num text-[11px] uppercase tracking-widest text-text-soft">Season One points</p>
              {points ? (
                <>
                  <div className="mt-3 flex gap-8">
                    <div>
                      <p className="num text-2xl">{points.supplyPoints.toFixed(2)}</p>
                      <p className="text-xs text-text-soft">supplying</p>
                    </div>
                    <div>
                      <p className="num text-2xl">{points.borrowPoints.toFixed(2)}</p>
                      <p className="text-xs text-text-soft">borrowing</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-text-soft">
                    Size multiplied by time held. They accrue while you do nothing, and there is no
                    promised conversion rate — a season that quietly names a price before it has
                    earnings to pay it is making a promise out of someone else&apos;s money.
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-text-soft">
                  Size multiplied by time held, counted off chain. Nothing to show for this address yet.
                </p>
              )}
            </Card>
            <Card>
              <p className="num text-[11px] uppercase tracking-widest text-text-soft">Rebates</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                {pct(stats.economics.borrowRebate, 0)} of the interest a borrower pays comes back each
                weekly epoch. The distributor deploys once there is interest to distribute.
              </p>
            </Card>
            <Card>
              <p className="num text-[11px] uppercase tracking-widest text-text-soft">Credit score</p>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Built from how positions behaved — how long they stayed healthy, whether they were
                topped up before trouble. It moves the rebate, never the LTV, because the LTV is what
                protects the lenders.
              </p>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
