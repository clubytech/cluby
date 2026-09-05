import { notFound } from "next/navigation";
import { AdminToken } from "@/components/admin-token";
import { SectionHeading } from "@/components/ui";
import { deployments, marketCatalog } from "@cluby/config";
import { getEvents, getAdminActions } from "@/lib/ops";
import { getIncentives } from "@/lib/incentives";

/**
 * This route does not exist unless the deployment is the admin deployment.
 *
 * `cluby.cash/admin` was a guessable path on the public site, and while nothing here can *do*
 * anything a wallet could not already do — every button ends in a transaction the Safe signs — a
 * page that looks like a protocol's control panel is a gift to whoever wants to screenshot one for
 * a phishing post, and the activity feed is an operator's view rather than a visitor's.
 *
 * So the page is compiled into every build and served by exactly one of them: the build that was
 * given ADMIN_SURFACE. Everywhere else this is a 404 before a single byte of operator data is
 * fetched — not a redirect, not a login wall that confirms the path is real, a 404 that is
 * indistinguishable from a path that was never there.
 *
 * The obscure hostname is worth something and it is worth exactly what it is: it keeps the page out
 * of casual sight. It is not the lock. The lock is that writes need the Safe, and the second lock
 * is the deployment protection on the host.
 */
export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

const marketName = (id: string) =>
  Object.entries(deployments.markets).find(([, m]) => m.id.toLowerCase() === id.toLowerCase())?.[0] ??
  `${id.slice(0, 8)}…`;

const decimalsFor = (key: string) => {
  const m = marketCatalog.find((x) => x.key === key);
  // Loan-side amounts are what these events carry, and USDG is six decimals; a stock loan is 18.
  return m && m.side === "short" ? 18 : 6;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (ts: number) => new Date(ts * 1000).toLocaleString();

/**
 * What each event kind is, in a word an operator reads rather than an event name.
 *
 * Keyed lowercase because the indexer stores the kind lowercase; matching on the event's own
 * capitalisation silently fell through to the raw string and the table read "borrow" instead of
 * "Borrowed". Harmless, and exactly the kind of thing that stays wrong forever because it still
 * technically renders.
 */
const KIND: Record<string, { label: string; tone: string }> = {
  supply: { label: "Supplied", tone: "text-brand" },
  withdraw: { label: "Withdrew", tone: "text-text-soft" },
  borrow: { label: "Borrowed", tone: "text-warn" },
  repay: { label: "Repaid", tone: "text-brand" },
  supplycollateral: { label: "Posted collateral", tone: "text-brand" },
  withdrawcollateral: { label: "Took collateral", tone: "text-text-soft" },
  liquidate: { label: "Liquidated", tone: "text-danger" },
};

export default async function AdminPage() {
  // Checked before anything is read, so a 404 costs a stranger nothing and tells them nothing.
  if (!process.env.ADMIN_SURFACE) notFound();

  const [events, admin, chain] = await Promise.all([getEvents(150), getAdminActions(), getIncentives()]);

  return (
    <>
      <section className="bg-bg-strong text-white">
        <div className="container-padding pb-14 pt-10">
          <SectionHeading align="left" title="Operations" />
          <p className="mt-4 max-w-2xl text-white/70">
            Everything that happened, and the one control that changes what the site says. Both are
            read from the chain, so this page cannot show you a version of events that the chain
            disagrees with.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Publish the token                                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-bg-soft">
        <div className="container-padding py-12">
          <div className="mx-auto max-w-2xl">
            <AdminToken />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Administrative actions — what WE did                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-white">
        <div className="container-padding py-12 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text-strong">
              Administrative actions
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-soft">
              Every privileged thing anyone has done to this protocol — publishing the token address,
              authorising a score writer, opening a rebate week, handing a contract to a new owner.
              Read from chain events, so nothing can be done here without appearing here.
            </p>
          </div>

          {admin === null ? (
            <p className="text-sm text-text-soft">Could not read the chain for this list.</p>
          ) : admin.length === 0 ? (
            <p className="text-sm text-text-soft">Nothing yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-bg-soft text-left text-xs uppercase tracking-wider text-text-soft">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Action</th>
                    <th className="px-4 py-3 font-semibold">Detail</th>
                    <th className="px-4 py-3 font-semibold">Contract</th>
                    <th className="px-4 py-3 font-semibold">Block</th>
                  </tr>
                </thead>
                <tbody>
                  {admin.map((a) => (
                    <tr key={`${a.txHash}-${a.what}-${a.detail}`} className="border-t border-line">
                      <td className="px-4 py-3 font-semibold text-text-strong">{a.what}</td>
                      <td className="num px-4 py-3 break-all text-text-soft">{a.detail}</td>
                      <td className="px-4 py-3 text-text-soft">{a.contract}</td>
                      <td className="num px-4 py-3 text-text-soft">{a.blockNumber.toString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Protocol activity — what USERS did                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-bg-weak/60">
        <div className="container-padding py-12 flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-text-strong">Protocol activity</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-soft">
                Who did what, in which market, and when. Unfiltered and in the order it happened.
              </p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-soft">Rebate weeks</p>
                <p className="num text-2xl font-bold text-text-strong">
                  {chain.epochsPublished ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-text-soft">Claimable now</p>
                <p className="num text-2xl font-bold text-text-strong">
                  {chain.fundedUsdg === null ? "—" : `$${chain.fundedUsdg.toFixed(2)}`}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-text-soft">Paid out</p>
                <p className="num text-2xl font-bold text-text-strong">
                  {chain.distributedUsdg === null ? "—" : `$${chain.distributedUsdg.toFixed(2)}`}
                </p>
              </div>
            </div>
          </div>

          {events === null ? (
            <p className="text-sm text-text-soft">
              The indexer did not answer. Activity is unavailable until it does; nothing about the
              protocol depends on this page.
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-text-soft">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-white">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-bg-soft text-left text-xs uppercase tracking-wider text-text-soft">
                  <tr>
                    <th className="px-4 py-3 font-semibold">When</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                    <th className="px-4 py-3 font-semibold">Market</th>
                    <th className="px-4 py-3 font-semibold">Who</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount</th>
                    <th className="px-4 py-3 font-semibold">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const key = marketName(e.marketId);
                    const k = KIND[e.kind.toLowerCase()] ?? { label: e.kind, tone: "text-text-soft" };
                    const amount = Number(e.assets) / 10 ** decimalsFor(key);
                    return (
                      <tr key={e.id} className="border-t border-line">
                        <td className="px-4 py-3 whitespace-nowrap text-text-soft">{when(e.timestamp)}</td>
                        <td className={`px-4 py-3 font-semibold ${k.tone}`}>{k.label}</td>
                        <td className="px-4 py-3 font-semibold text-text-strong">{key}</td>
                        <td className="num px-4 py-3 text-text-soft">
                          {short(e.user)}
                          {e.caller.toLowerCase() !== e.user.toLowerCase() && (
                            <span className="text-text-soft/70"> via {short(e.caller)}</span>
                          )}
                        </td>
                        <td className="num px-4 py-3 text-right text-text-strong">
                          {amount === 0
                            ? "—"
                            : amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                        </td>
                        <td className="num px-4 py-3 text-text-soft">{short(e.txHash)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
