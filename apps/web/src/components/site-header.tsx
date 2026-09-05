"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "./connect-button";

type Item = { href: string; label: string; soon?: boolean };

/**
 * Six in the bar, the rest behind More.
 *
 * Eleven pills do not fit the header at any width worth designing for, and the honest split is not
 * alphabetical — it is what someone came here to DO (earn, borrow, stake), what is theirs
 * (portfolio), and the two things they are here to read about (token, docs). Everything else is
 * something you go looking for rather than something you land on.
 */
const primary: Item[] = [
  { href: "/earn", label: "Earn" },
  { href: "/borrow", label: "Borrow" },
  { href: "/stake", label: "Stake" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/token", label: "Token", soon: true },
  { href: "/docs", label: "Docs" },
];

const more: Item[] = [
  { href: "/stats", label: "Stats" },
  { href: "/activity", label: "Activity" },
  { href: "/builders", label: "Builders" },
  { href: "/launchpad", label: "Launchpad", soon: true },
];

function Soon() {
  return (
    <span className="ml-1.5 rounded-full bg-brand-bright/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-brand-bright">
      soon
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = more.some((m) => isActive(m.href));

  /**
   * One pill that travels, rather than a background switching off one item and on at another.
   *
   * Measured from the DOM rather than computed from the label, because the pill has to land on the
   * real thing at the real width — a font that loads late, or a "soon" badge, moves the target. It
   * starts at null so the first paint has no pill to slide FROM: appearing in place is right on
   * arrival, and sliding is right on every navigation after.
   */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>("[data-active='true']");
      if (!el) return setPill(null);
      // Rects, not offsetLeft: the More button sits inside its own positioned wrapper, so its
      // offsetParent is that wrapper and its offsetLeft is zero. A rect is measured against the
      // viewport and therefore does not care how anything is nested.
      const a = el.getBoundingClientRect();
      const b = nav.getBoundingClientRect();
      setPill({ left: a.left - b.left, width: a.width });
    };
    measure();
    // Fonts land after hydration and change every width in the bar.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(measure).catch(() => {});
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [pathname, moreActive, moreOpen]);

  // A dropdown that only closes on its own trigger is a dropdown people leave open by accident.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Navigating should close whatever is hanging open, on both breakpoints.
  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  return (
    <div className="sticky top-0 left-0 right-0 z-50 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-6xl gap-3">
        <div className="mx-auto w-full rounded-full bg-bg-strong p-3 shadow-[0_10px_40px_-20px_rgba(0,43,56,0.8)]">
          <div className="relative flex h-9 items-center justify-between px-2">
            <Link href="/" className="group flex items-center gap-2.5 text-text-white">
              <Image
                src="/cluby-mark.png"
                alt=""
                width={64}
                height={64}
                priority
                className="h-8 w-8 transition-opacity duration-200 group-hover:opacity-80"
              />
              <span className="text-[19px] font-semibold tracking-tight">Cluby</span>
            </Link>

            <nav
              ref={navRef}
              className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 xl:flex"
            >
              {/* The travelling pill. Transform and width, both composited, on the same curve as
                  everything else that moves on this site. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -z-10 rounded-full bg-white/10 transition-[transform,width,opacity] duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                style={{
                  width: pill ? `${pill.width}px` : 0,
                  transform: `translateX(${pill?.left ?? 0}px)`,
                  opacity: pill ? 1 : 0,
                }}
              />

              {primary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={isActive(item.href) ? "true" : undefined}
                  className={`group relative rounded-full px-3.5 py-2 text-sm transition-colors duration-200 ${
                    isActive(item.href) ? "text-text-white" : "text-text-faint hover:text-text-white"
                  }`}
                >
                  {/* Hover is a separate, fainter layer, so passing over an item does not fight the
                      pill that marks where you actually are. */}
                  <span
                    aria-hidden
                    className="absolute inset-0 -z-10 scale-x-75 rounded-full bg-white/5 opacity-0 transition-all duration-200 ease-out group-hover:scale-x-100 group-hover:opacity-100"
                  />
                  {item.label}
                  {item.soon && <Soon />}
                </Link>
              ))}

              <div ref={moreRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  data-active={moreActive ? "true" : undefined}
                  className={`group relative flex items-center gap-1 rounded-full px-3.5 py-2 text-sm transition-colors duration-200 ${
                    moreActive || moreOpen ? "text-text-white" : "text-text-faint hover:text-text-white"
                  }`}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 -z-10 scale-x-75 rounded-full bg-white/5 opacity-0 transition-all duration-200 ease-out group-hover:scale-x-100 group-hover:opacity-100"
                  />
                  More
                  <svg
                    viewBox="0 0 10 6"
                    className={`h-1.5 w-2.5 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div
                  className={`absolute right-0 top-full mt-3 w-44 origin-top-right rounded-2xl border border-line-dark bg-bg-strong p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] transition-all duration-200 ease-out ${
                    moreOpen
                      ? "pointer-events-auto scale-100 opacity-100"
                      : "pointer-events-none scale-95 opacity-0"
                  }`}
                >
                  {more.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center rounded-xl px-3 py-2 text-sm transition-colors ${
                        isActive(item.href)
                          ? "bg-white/10 text-text-white"
                          : "text-text-faint hover:bg-white/5 hover:text-text-white"
                      }`}
                    >
                      {item.label}
                      {item.soon && <Soon />}
                    </Link>
                  ))}
                </div>
              </div>
            </nav>

            <div className="hidden items-center gap-3 xl:flex">
              <ConnectButton compact />
            </div>

            <button
              type="button"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="flex h-6 w-6 flex-col items-center justify-center gap-1.5 xl:hidden"
            >
              <span
                className={`block h-px w-6 bg-white transition-transform duration-300 ${open ? "translate-y-[3.5px] rotate-45" : ""}`}
              />
              <span
                className={`block h-px w-6 bg-white transition-transform duration-300 ${open ? "-translate-y-[3.5px] -rotate-45" : ""}`}
              />
            </button>
          </div>

          {/* Height-animated rather than mounted and unmounted, so opening the menu is a movement
              and not a jump. */}
          <div
            className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out xl:hidden ${
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <nav className="flex min-h-0 flex-col gap-1 px-2 pt-4">
              {[...primary, ...more].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-2xl px-4 py-3 text-sm transition-colors ${
                    isActive(item.href) ? "bg-white/10 text-text-white" : "text-text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                  {item.soon && <Soon />}
                </Link>
              ))}
              <div className="mb-2 mt-3 flex justify-center">
                <ConnectButton />
              </div>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
