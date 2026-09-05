import Link from "next/link";
import { deployments, marketCatalog, morpho, robinhoodChain } from "@cluby/config";
import { getReceipts } from "@/lib/series";
import { Badge, Card, SectionHeading } from "@/components/ui";

export const revalidate = 15;
export const metadata = { title: "Activity — Cluby" };

const EXPLORER = robinhoodChain.blockExplorers.default.url;

/** Market id → the key a human reads. Built once; the catalogue is static. */
const keyOfMarket = new Map<string, string>(
  Object.entries(deployments.markets).map(([key, m]) => [String(m.id).toLowerCase(), key]),
);

const label: Record<string, { text: string; tone: "in" | "out" | "debt" }> = {
  supply: { text: "Supplied", tone: "in" },
  withdraw: { text: "Withdrew", tone: "out" },
  supplyCollateral: { text: "Posted collateral", tone: "in" },
  withdrawCollateral: { text: "Took collateral back", tone: "out" },
  borrow: { text: "Borrowed", tone: "debt" },
  repay: { text: "Repaid", tone: "debt" },
  liquidate: { text: "Liquidated", tone: "out" },
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function when(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/**
 * Decimals for the amount on a row. Collateral moves in the collateral token, everything else in the
 * loan token, and on this chain the loan token is always the 6-decimal USDG except on the shorts.
 */
function unitsOf(marketKey: string | undefined, kind: string) {
  const def = marketKey ? marketCatalog.find((m) => m.key === marketKey) : undefined;
  const isCollateral = kind === "supplyCollateral" || kind === "withdrawCollateral";
  if (!def) return { decimals: 6, symbol: "USDG" };
  if (isCollateral) {
    return def.side === "short"
      ? { decimals: 6, symbol: "USDG" }
      : { decimals: 18, symbol: def.collateral };
  }
  return def.side === "short" ? { decimals: 18, symbol: def.loan } : { decimals: 6, symbol: "USDG" };
}

function amount(raw: bigint, decimals: number) {
  const n = Number(raw) / 10 ** decimals;
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });
}

export default async function ActivityPage() {
  const receipts = await getReceipts(200);

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-16 pt-10">
          <SectionHeading align="left" title="Every position, as it happened." />
          <p className="mt-4 max-w-2xl text-white/70">
            Not a dashboard of our own numbers — the log of what Morpho Blue actually emitted, read
            back off chain. Deposits, borrows, repayments, withdrawals and liquidations, newest
            first, each one a transaction you can open in the explorer and check against us.
          </p>
        </div>
      </section>

      <section className="bg-bg-weak/60">
        <div className="container-padding section-y flex flex-col gap-6">
          {receipts === null ? (
            <Card>
              <p className="text-sm text-text-soft">
                The indexer is not answering right now, so this page has nothing to show. It is a
                reader, not a source — the events themselves are on chain either way, and{" "}
                <a className="underline" href={`${EXPLORER}/address/${morpho.blue.address}`} target="_blank" rel="noreferrer">
                  the Morpho contract
                </a>{" "}
                has all of them.
              </p>
            </Card>
          ) : receipts.length === 0 ? (
            <Card>
              <p className="text-sm text-text-soft">Nothing has happened yet. The first row will be someone&apos;s deposit.</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    {["What", "Amount", "Market", "Account", "When", ""].map((h) => (
                      <th key={h} className="px-5 py-4 text-[11px] font-normal uppercase tracking-widest text-text-soft">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => {
                    const marketKey = keyOfMarket.get(r.marketId.toLowerCase());
                    const l = label[r.kind] ?? { text: r.kind, tone: "in" as const };
                    const u = unitsOf(marketKey, r.kind);
                    return (
                      <tr key={r.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-4">
                          <Badge tone={l.tone === "debt" ? "pending" : l.tone === "in" ? "live" : "neutral"}>{l.text}</Badge>
                        </td>
                        <td className="num px-5 py-4 text-text-strong">
                          {amount(r.assets, u.decimals)} {u.symbol}
                        </td>
                        <td className="px-5 py-4">
                          {marketKey ? (
                            <Link className="underline decoration-line underline-offset-4" href={`/borrow/${marketKey.toLowerCase()}`}>
                              {marketKey}
                            </Link>
                          ) : (
                            <span className="num text-text-soft">{short(r.marketId)}</span>
                          )}
                        </td>
                        <td className="num px-5 py-4 text-text-soft">{short(r.user)}</td>
                        <td className="px-5 py-4 text-text-soft">{when(r.timestamp)}</td>
                        <td className="px-5 py-4 text-right">
                          <a
                            className="text-text-soft underline decoration-line underline-offset-4 hover:text-text-strong"
                            href={`${EXPLORER}/tx/${r.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            tx
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          <Card>
            <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px] font-semibold">Why this page exists</h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-soft">
              A young protocol asks you to believe numbers it prints about itself. This is the cheapest
              way out of that: the same events, unaggregated, with the transaction hash next to each
              one. If a row here disagrees with the explorer, the explorer is right and we have a bug.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
