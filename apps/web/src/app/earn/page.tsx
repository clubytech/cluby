import { getVaults, getMarkets } from "@/lib/markets";
import { pct, usd } from "@/lib/format";
import { Badge, Card, SectionHeading } from "@/components/ui";

export const revalidate = 30;
export const metadata = { title: "Earn — Cluby" };

export default async function EarnPage() {
  const [vaults, markets] = await Promise.all([getVaults(), getMarkets()]);

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Earn on USDG, from borrowers who post stock." />
          <p className="mt-4 max-w-2xl text-white/70">
            One vault to start. It lends into the four markets under caps, keeps nothing back as a fee,
            and lets you withdraw whatever is not currently borrowed.
          </p>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-6">
          {vaults.map((v) => (
            <Card key={v.symbol} className="border border-line bg-white">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[28px]">{v.name}</h2>
                    <Badge tone={v.status === "live" ? "live" : "pending"}>
                      {v.status === "live" ? "Live" : "Not deployed"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-text-soft">
                    Deposit {v.asset}, receive {v.symbol}. Allocated across {v.markets.join(", ")}.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
                  {[
                    ["APY", pct(v.apy)],
                    ["Total assets", usd(v.totalAssetsUsd)],
                    ["Withdrawable now", usd(v.withdrawableUsd)],
                    ["Performance fee", pct(v.performanceFee, 0)],
                  ].map(([l, val]) => (
                    <div key={l}>
                      <p className="text-[11px] uppercase tracking-widest text-text-soft">{l}</p>
                      <p className="num mt-1 text-lg">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled
                className="mt-8 w-full cursor-not-allowed rounded-full bg-bg-soft px-6 py-3 text-sm text-text-soft lg:w-auto lg:px-10"
              >
                Deposit — opens with the canary
              </button>
            </Card>
          ))}

          <Card>
            <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px]">Where the yield comes from</h3>
            <p className="mt-3 text-sm leading-relaxed text-text-soft">
              Borrowers pay a rate set by Morpho&apos;s adaptive curve, which climbs as the market gets
              used up and falls when it is idle. Suppliers receive that interest in proportion to how
              much of the pool is lent out. Nothing is subsidised, and there is no emissions programme
              propping the number up.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {markets.map((m) => (
                <div key={m.symbol} className="rounded-2xl border border-line bg-white p-4">
                  <p className="text-sm font-medium">{m.symbol}</p>
                  <p className="num mt-1 text-xs text-text-soft">
                    cap {usd(m.supplyCapUsd, 0)} · LLTV {pct(m.lltv, 1)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}
