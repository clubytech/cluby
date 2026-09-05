"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "./connect-button";
import { Pill, useSlidingPill } from "./sliding-pill";

type Item = { href: string; label: string; soon?: boolean };

/**
 * Six in the bar, the rest behind More.
 *
 * Eleven pills do not fit the header at any width worth designing for, and the honest split is not
 * alphabetical — it is what someone came here to DO (earn, borrow, stake), what is theirs
 * (portfolio), and the two things they are here to read about (token, docs). Everything else is
 * something you go looking for rather than something you land on.
 */
/**
 * `soon` on Token is not a constant: the token registry decides it.
 *
 * A nav that still says "soon" next to a page announcing a live contract address is the kind of
 * disagreement that makes a reader wonder which half of the site to believe — and on a page whose
 * subject is an address people send money to, that doubt is expensive. So the flag comes from the
 * same read the page uses.
 */
const primary: Item[] = [
  { href: "/earn", label: "Earn" },
  { href: "/borrow", label: "Borrow" },
  { href: "/stake", label: "Stake" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/token", label: "Token" },
  { href: "/docs", label: "Docs" },
];

const more: Item[] = [
  { href: "/stats", label: "Stats" },
  { href: "/activity", label: "Activity" },
  { href: "/builders", label: "Builders" },
  { href: "/launchpad", label: "Launchpad", soon: true },
];

/** The nav items as rendered, with Token's badge resolved against the chain. */
function withTokenState(items: Item[], tokenLive: boolean): Item[] {
  return items.map((i) => (i.href === "/token" ? { ...i, soon: !tokenLive } : i));
}

function Soon() {
  return (
    <span className="ml-1.5 rounded-full bg-brand-bright/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-brand-bright">
      soon
    </span>
  );
}

export function SiteHeader({ tokenLive = false }: { tokenLive?: boolean }) {
  // Resolved once: three render sites use these lists and all three must agree.
  const barItems = withTokenState(primary, tokenLive);
  const moreItems = withTokenState(more, tokenLive);

  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = more.some((m) => isActive(m.href));

  // The same travelling pill the market filters use — one implementation, two places.
  const nav = useSlidingPill<HTMLElement>([pathname, moreActive]);

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

  /**
   * An outline once the page has moved, and none at the very top.
   *
   * At rest the bar sits on the hero and any edge on it is a line drawn across a photograph. As soon
   * as content starts sliding under it, the same edge is what separates the two — so it appears then
   * and not before.
   *
   * A boolean, not a number: it changes twice per page, so React re-renders twice rather than
   * sixty times a second, and the listener stays a two-line passive one.
   */
  useEffect(() => {
    const read = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", read, { passive: true });
    // Read once on mount too: a reload part-way down a page, or a restored back-navigation
    // position, arrives without ever firing a scroll event.
    read();
    return () => window.removeEventListener("scroll", read);
  }, []);

  // Navigating should close whatever is hanging open, on both breakpoints.
  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  return (
    <div className="sticky top-0 left-0 right-0 z-50 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-6xl gap-3">
        <div
          className={`mx-auto w-full bg-bg-strong p-3 transition-[box-shadow,background-color,border-radius] duration-300 ease-out ${
            // A pill only stays a pill while it is one line tall. `border-radius: 9999px` on a box
            // that grows to fit ten menu items is an ellipse, and the items spill straight out of
            // it. The radius has to become a corner as soon as the menu opens.
            open ? "rounded-[28px]" : "rounded-full"
          } ${
            scrolled
              ? "shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_16px_44px_-22px_rgba(0,43,56,0.95)]"
              : "shadow-[0_10px_40px_-20px_rgba(0,43,56,0.8)]"
          }`}
        >
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
              ref={nav.ref}
              className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 xl:flex"
            >
              <Pill pill={nav.pill} className="-z-10 bg-white/10" />

              {barItems.map((item) => (
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
                  {moreItems.map((item) => (
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
              {[...barItems, ...moreItems].map((item) => (
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
