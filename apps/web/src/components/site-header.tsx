"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "./connect-button";

const nav: { href: string; label: string; soon?: boolean }[] = [
  { href: "/earn", label: "Earn" },
  { href: "/borrow", label: "Borrow" },
  { href: "/stake", label: "Stake" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/stats", label: "Stats" },
  { href: "/activity", label: "Activity" },
  { href: "/docs", label: "Docs" },
  { href: "/builders", label: "Builders" },
  { href: "/launchpad", label: "Launchpad", soon: true },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 left-0 right-0 z-50 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-6xl gap-3">
        <div className="mx-auto w-full rounded-full bg-bg-strong p-3 shadow-[0_10px_40px_-20px_rgba(0,43,56,0.8)]">
          <div className="relative flex h-9 items-center justify-between px-2">
            <Link href="/" className="flex items-center gap-2 text-text-white">
              <Image src="/cluby-mark.png" alt="" width={26} height={26} className="h-6 w-6" priority />
              <span className="text-[17px] font-semibold tracking-tight">Cluby</span>
            </Link>

            <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 xl:flex">
              {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-3.5 py-2 text-sm transition-colors ${
                      active
                        ? "bg-white/10 text-text-white"
                        : "text-text-faint hover:bg-white/5 hover:text-text-white"
                    }`}
                  >
                    {item.label}
                    {item.soon && (
                      <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-text-faint">
                        soon
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden items-center gap-3 xl:flex">
              <span className="num rounded-full border border-line-dark px-3 py-1.5 text-[11px] uppercase tracking-widest text-text-faint">
                Robinhood Chain
              </span>
              <ConnectButton compact />
            </div>

            <button
              type="button"
              aria-label="Menu"
              onClick={() => setOpen((v) => !v)}
              className="flex h-6 w-6 flex-col justify-center gap-1.5 xl:hidden"
            >
              <span className="block h-px w-6 bg-white" />
              <span className="block h-px w-6 bg-white" />
            </button>
          </div>

          {open && (
            <nav className="flex flex-col gap-1 px-2 pb-2 pt-4 xl:hidden">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-2xl px-4 py-3 text-sm text-text-white hover:bg-white/5"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 flex justify-center">
                <ConnectButton />
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
