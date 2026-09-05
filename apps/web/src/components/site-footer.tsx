import Image from "next/image";
import Link from "next/link";

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
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="text-[11px] uppercase tracking-widest text-text-faint">{col.title}</p>
                <ul className="mt-4 flex flex-col gap-3">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-sm text-white/80 hover:text-white">
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
