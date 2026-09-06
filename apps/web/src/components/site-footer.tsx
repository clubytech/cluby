import Image from "next/image";
import Link from "next/link";
import { XLink } from "./social";

const columns = [
  {
    title: "Protocol",
    links: [
      { href: "/earn", label: "Earn" },
      { href: "/borrow", label: "Borrow" },
      { href: "/stake", label: "Stake" },
      { href: "/stats", label: "Stats" },
      { href: "/portfolio", label: "Portfolio" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/docs", label: "Overview" },
      { href: "/docs#risk", label: "Risk framework" },
      { href: "/docs#withdrawals", label: "Withdrawals" },
      { href: "/docs#flash-loans", label: "Flash loans" },
      { href: "/builders", label: "Builders" },
      { href: "/launchpad", label: "Launchpad — soon" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-bg-deep text-text-white">
      <div className="container-padding section-y">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <Image src="/cluby-mark.png" alt="" width={28} height={28} className="h-7 w-7" />
              <span className="text-lg font-semibold tracking-tight">Cluby</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-text-faint">
              A curation layer on Morpho Blue: isolated markets that let tokenized stocks back a USDG
              loan. Cluby holds no user funds — deposits and collateral live in Morpho.
            </p>
            <XLink
              label
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition-colors hover:border-white/40 hover:bg-white/5 hover:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="text-[11px] uppercase tracking-widest text-text-faint">{col.title}</p>
                <ul className="mt-4 flex flex-col gap-1 sm:gap-3">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      {/* The padding is the target: bare text in a list is a 17px-tall thing to
                          hit, and a footer is where someone is already squinting. */}
                      <Link
                        href={l.href}
                        className="-mx-2 block rounded-lg px-2 py-2 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white sm:mx-0 sm:px-0 sm:py-0 sm:hover:bg-transparent"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line-dark pt-6 text-xs text-text-faint sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-2">
            <span className="num rounded-full border border-line-dark px-2.5 py-1 text-[10px] uppercase tracking-widest text-text-faint">
              Robinhood Chain · 4663
            </span>
            Markets are immutable once created.
          </p>
          <p className="num">Not investment advice. Positions can be liquidated.</p>
        </div>
      </div>
    </footer>
  );
}
