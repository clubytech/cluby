import { getMarkets, getVaults } from "@/lib/markets";
import { getWaitingDemand } from "@/lib/series";
import { pct, usd } from "@/lib/format";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { VaultPanel } from "@/components/vault-panel";
import { tokens } from "@cluby/config";

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
  const [vaults, markets, waiting] = await Promise.all([getVaults(), getMarkets(), getWaitingDemand()]);

  // Collateral already posted by accounts carrying no debt: borrowers who are standing in the market
  // waiting for something to borrow. It is the honest answer to "will anyone use my deposit".
  const waitingByKey = (waiting ?? []).flatMap((w) => {
    const m = markets.find((x) => x.marketId?.toLowerCase() === w.marketId.toLowerCase());
    if (!m || m.price === null) return [];
    const decimals = m.collateralSymbol === "USDG" ? 6 : 18;
    const usdValue = (Number(w.collateral) / 10 ** decimals) * (m.side === "short" ? 1 : m.price);
    return [{ key: m.key, usd: usdValue, accounts: w.accounts }];
  });
  const waitingUsd = waitingByKey.reduce((a, b) => a + b.usd, 0);
  const waitingAccounts = waitingByKey.reduce((a, b) => a + b.accounts, 0);
  const totalWithdrawable = vaults.reduce((a, v) => a + v.withdrawableUsd, 0);
  const totalAssets = vaults.reduce((a, v) => a + v.totalAssetsUsd, 0);

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
          {/* The two questions a first depositor actually has: can I get out, and is anyone waiting
              to borrow this. Both are answered from live state rather than from a promise. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border border-line bg-white">
              <div className="flex items-center gap-3">
                <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px]">The exit is not locked</h3>
                <Badge tone="live">No lockup</Badge>
              </div>
              <p className="num mt-4 text-3xl">{usd(totalWithdrawable)}</p>
              <p className="mt-1 text-sm text-text-soft">
                withdrawable this second, out of {usd(totalAssets)} supplied
              </p>
              <p className="mt-4 text-sm leading-relaxed text-text-soft">
                There is no lock, no notice period and no epoch. What limits a withdrawal is only how
                much of the pool is borrowed at that moment — the rest is yours on demand, and the
                rate climbs steeply as the pool empties, which is what pulls borrowers into repaying.
                Everything above is read from the vault, not from a policy we wrote down.
              </p>
            </Card>

            <Card className="border border-line bg-white">
              <div className="flex items-center gap-3">
                <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px]">Demand already at the door</h3>
                {waiting === null && <Badge>Indexer offline</Badge>}
              </div>
              <p className="num mt-4 text-3xl">{waiting === null ? "—" : usd(waitingUsd)}</p>
              <p className="mt-1 text-sm text-text-soft">
                {waiting === null
                  ? "unavailable right now"
                  : `${waitingAccounts} account${waitingAccounts === 1 ? "" : "s"} holding collateral with nothing borrowed against it`}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-text-soft">
                A borrower does not have to wait for liquidity to arrive before acting. Posting
                collateral needs no liquidity at all, so they can be in position first and borrow in
                the same second the money appears. That is what this number is: demand that has
                already paid the cost of showing up.
              </p>
              {waitingByKey.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {waitingByKey.map((w) => (
                    <span key={w.key} className="num rounded-full border border-line px-3 py-1 text-xs text-text-soft">
                      {w.key} · {usd(w.usd)}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </div>

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

              {v.status === "listed" && v.address ? (
                <VaultPanel
                  vault={v.address}
                  asset={v.asset}
                  assetAddress={tokens[v.asset as keyof typeof tokens].address as `0x${string}`}
                  assetDecimals={tokens[v.asset as keyof typeof tokens].decimals}
                />
              ) : (
                <button
                  type="button"
                  disabled
                  className="mt-8 w-full cursor-not-allowed rounded-full bg-bg-soft px-6 py-3 text-sm text-text-soft lg:w-auto lg:px-10"
                >
                  Opens when the vault is deployed
                </button>
              )}
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
