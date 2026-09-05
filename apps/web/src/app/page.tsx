import { getMarkets, getProtocolStats } from "@/lib/markets";
import { usd, pct } from "@/lib/format";
import { Button, Card, SectionHeading, Stat } from "@/components/ui";
import { MarketTable } from "@/components/market-table";
import { HeroField } from "@/components/hero-field";
import { IconScale, IconSwap, IconVault } from "@/components/icons";

export const revalidate = 30;

export default async function Home() {
  const [markets, stats] = await Promise.all([getMarkets(), getProtocolStats()]);
  const priced = markets.filter((m) => m.price !== null);
  const longs = markets.filter((m) => m.side === "long");

  return (
    <>
      {/* Hero */}
      <section className="relative -mt-[108px] flex min-h-screen max-h-[calc(880px+108px)] flex-col pt-[108px]">
        <HeroField />

        <div className="relative flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className="num mb-6 rounded-full border border-white/20 px-4 py-1.5 text-[11px] uppercase tracking-widest text-white/80">
            Curated on Morpho Blue · Robinhood Chain
          </p>
          <h1 className="font-[family-name:var(--font-ibm-plex-serif)] text-[42px] leading-[1.05] tracking-tight text-white md:text-[56px] xl:text-[84px]">
            Your stocks stay yours.
            <br />
            The liquidity is new.
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/85 md:text-lg">
            Post tokenized NVDA, SPY, AAPL or ETH as collateral and borrow USDG against it. Isolated
            markets, Chainlink pricing, and no performance fee while we are small.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <Button href="/borrow">Borrow against stocks</Button>
            <Button href="/earn" variant="ghost">
              Earn on USDG
            </Button>
          </div>
        </div>

        {/* Stat strip that overlaps the fold, like the reference layout */}
        <div className="relative mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="rounded-t-2xl border border-b-0 border-white/50 bg-white">
            <div className="flex flex-col divide-y divide-black/[0.06] sm:flex-row sm:divide-x sm:divide-y-0">
              <Stat label="Markets" value={`${stats.listedCount}/${stats.marketCount}`} sub="live / planned" />
              <Stat label="Supplied" value={usd(stats.totalSupplyUsd)} sub="USDG in Morpho" />
              <Stat label="Borrowed" value={usd(stats.totalBorrowUsd)} sub="against stock collateral" />
              <Stat label="Performance fee" value="0%" sub="for the first markets" />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white">
        <div className="container-padding section-y flex flex-col gap-8">
          <SectionHeading
            title="A loan against stock, without selling the stock."
            lead="Cluby curates isolated markets on Morpho Blue. Deposits earn from borrowers, borrowers keep their exposure, and every position is priced by the same Chainlink feed the market makers use."
          />
          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
            <Card interactive className="shine group border border-line bg-white">
              <IconVault />
              <p className="num mt-5 text-[11px] uppercase tracking-widest text-text-soft">01 — Supply</p>
              <h3 className="mt-3 font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Lend USDG</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Deposit into the Core vault. It spreads liquidity across the four markets under caps
                you can read on chain, and you withdraw whatever is not currently borrowed.
              </p>
            </Card>
            <Card interactive className="shine group border border-line bg-white">
              <IconScale />
              <p className="num mt-5 text-[11px] uppercase tracking-widest text-text-soft">02 — Collateralise</p>
              <h3 className="mt-3 font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Post your shares</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Tokenized NVDA, SPY, AAPL and ETH are accepted. Collateral never leaves Morpho Blue —
                Cluby has no contract that can hold it between transactions.
              </p>
            </Card>
            <Card interactive className="shine group border border-line bg-white">
              <IconSwap />
              <p className="num mt-5 text-[11px] uppercase tracking-widest text-text-soft">03 — Borrow</p>
              <h3 className="mt-3 font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">Take USDG out</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">
                Up to {pct(0.575, 1)} of collateral value on stock markets, with the liquidation price
                shown before you sign. Repay any time; interest accrues by the second.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Markets */}
      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <SectionHeading align="left" title="Markets" lead="Isolated and immutable: LLTV and oracle are fixed when a market is created and can never be edited." />
            <p className="num text-xs text-text-soft">
              {priced.length} of {markets.length} feeds answering
            </p>
          </div>
          <MarketTable markets={longs} showFilters={false} />
          <div className="flex justify-center">
            <Button href="/borrow" variant="dark">
              See all markets
            </Button>
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="bg-bg-strong text-white">
        <div className="container-padding section-y flex flex-col gap-10 lg:flex-row lg:gap-16">
          <div className="lg:flex-1">
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[32px] leading-tight md:text-[40px]">
              We did not write a lending protocol.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75">
              Deposits, collateral, interest and liquidations are Morpho Blue — immutable and audited
              many times over. Cluby only curates: which markets exist, which oracle prices them, and
              how much the vault may lend into each. Two small contracts of our own, neither of which
              can hold your money.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              {[
                ["Morpho Blue", stats.contracts.morphoBlue],
                ["Adaptive Curve IRM", stats.contracts.irm],
                ["Chainlink oracle factory", stats.contracts.oracleFactory],
              ].map(([label, addr]) => (
                <div key={label} className="flex flex-col gap-1 border-b border-line-dark pb-3 sm:flex-row sm:justify-between">
                  <span className="text-sm text-white/70">{label}</span>
                  <span className="num text-xs text-white/50">{addr}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              ["Liquidation LTV", `${pct(stats.lltvTiers.stock, 1)} stocks · ${pct(stats.lltvTiers.tbills, 0)} T-bills`],
              ["Supply caps", `${usd(stats.capUsd, 0)} total, raised by hand`],
              ["Oracles", "Chainlink feeds, 24/5, watched off chain"],
              ["Vault fee", `${pct(stats.economics.introFee, 0)} for the first ${stats.economics.introDays} days`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[28px] border border-line-dark p-6">
                <p className="text-[11px] uppercase tracking-widest text-white/50">{label}</p>
                <p className="mt-3 text-lg leading-snug">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white">
        <div className="container-padding section-y flex flex-col items-center gap-6 text-center">
          <SectionHeading
            title="Start small, on purpose."
            lead="Caps are a few hundred dollars per market while the canary runs. Read exactly what is live, what is deferred, and what can go wrong."
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href="/docs" variant="dark">
              Read the docs
            </Button>
            <Button href="/earn">Open the vault</Button>
          </div>
        </div>
      </section>
    </>
  );
}
