import { getVaults } from "@/lib/markets";
import { pct, usd } from "@/lib/format";
import { Badge, Card, SectionHeading } from "@/components/ui";

export const revalidate = 30;
export const metadata = { title: "Earn — Cluby" };

const kindLabel: Record<string, string> = {
  core: "Core",
  frontier: "Frontier",
  eth: "ETH",
  stockLending: "Stock lending",
  partner: "Partner",
};

export default async function EarnPage() {
  const vaults = await getVaults();

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Lend into the book you choose." />
          <p className="mt-4 max-w-2xl text-white/70">
            Each vault is an ERC-4626 share: you deposit an asset, it lends into a fixed list of
            markets under caps, and you withdraw whatever is not borrowed at that moment. Risk is the
            list of markets, and the list is public.
          </p>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-6">
          {vaults.map((v) => (
            <Card key={v.key} className="border border-line bg-white">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-lg">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[26px]">{v.name}</h2>
                    <Badge tone={v.status === "listed" ? "live" : "pending"}>
                      {v.status === "listed" ? "Live" : "Not deployed"}
                    </Badge>
                    <Badge>{kindLabel[v.kind] ?? v.kind}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-text-soft">{v.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {v.markets.length === 0 ? (
                      <span className="text-xs text-text-soft">Market list opens with the vault.</span>
                    ) : (
                      v.markets.map((m) => {
                        const cap = v.caps.find((c) => c.key === m.key);
                        return (
                          <span
                            key={m.key}
                            className="num rounded-full border border-line px-3 py-1 text-xs text-text-soft"
                          >
                            {m.key} · {pct(m.lltv, 1)}
                            {cap && cap.enabled ? ` · cap ${usd(cap.capUsd, 0)}` : ""}
                          </span>
                        );
                      })
                    )}
                  </div>
                  {v.address && (
                    <p className="num mt-4 break-all text-xs text-text-soft">
                      {v.address}
                      {v.timelockSeconds === 0
                        ? " · no timelock yet"
                        : ` · ${Math.round(v.timelockSeconds / 3600)}h timelock`}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
                  {[
                    ["APY", pct(v.apy)],
                    ["Total assets", usd(v.totalAssetsUsd)],
                    ["Withdrawable now", usd(v.withdrawableUsd)],
                    ["Performance fee", `${pct(v.performanceFee, 0)} · ${v.introFeeDays}d`],
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
                disabled={v.status !== "listed"}
                className={`mt-8 w-full rounded-full px-6 py-3 text-sm lg:w-auto lg:px-10 ${
                  v.status === "listed"
                    ? "bg-brand-bright font-medium text-bg-deep hover:bg-brand hover:text-white"
                    : "cursor-not-allowed bg-bg-soft text-text-soft"
                }`}
              >
                {v.status === "listed" ? `Deposit ${v.asset}` : "Opens when the vault is deployed"}
              </button>
            </Card>
          ))}

          <Card>
            <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px]">Partner vaults</h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              A project that wants its own token to be borrowable can have a vault of its own: one
              market, a cap it sets, and liquidity it deposits. The borrow demand is then its users&apos;,
              and the rate is theirs to keep. Ask for one and it is a deployment, not a negotiation.
            </p>
          </Card>

          <Card>
            <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px]">Where the yield comes from</h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              Borrowers pay a rate set by Morpho&apos;s adaptive curve, which climbs as a market is used
              up and falls when it sits idle. Suppliers receive that interest in proportion to how much
              of the pool is lent out. Nothing is subsidised — there is no emission propping the number
              up, which is also why it will look modest early on.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
