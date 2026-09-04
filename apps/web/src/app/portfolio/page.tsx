import { SectionHeading, Card } from "@/components/ui";

export const metadata = { title: "Portfolio — Cluby" };

export default function PortfolioPage() {
  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Your positions" />
          <p className="mt-4 max-w-2xl text-white/70">
            Deposits, loans, health factor and the exact price at which each position is liquidated.
          </p>
        </div>
      </section>
      <section className="bg-bg-weak/60">
        <div className="container-padding section-y">
          <Card className="border border-line bg-white text-center">
            <h2 className="font-[family-name:var(--font-ibm-plex-serif)] text-[24px]">No wallet connected</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-text-soft">
              Wallet connection ships with the mainnet canary, together with the indexer that serves
              position history. Until then this page has nothing truthful to show.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
