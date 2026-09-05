"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * Momentum scrolling.
 *
 * `scroll-behavior: smooth` only eases an anchor JUMP; it does nothing to the wheel. This eases the
 * viewport itself — it lerps toward the target every frame instead of snapping — which is the whole
 * difference between a page that feels built and a page that feels assembled.
 *
 * Four things this has to get right, and each of them is a bug if it is skipped:
 *
 *  1. ONE instance, destroyed on unmount. The App Router remounts on navigation; without cleanup the
 *     instances stack, the RAF loops multiply, and the page scrolls faster with every route change.
 *  2. CSS `scroll-behavior: smooth` has to be switched off at runtime, or the browser and Lenis both
 *     animate the same anchor jump and fight. The stylesheet keeps the rule as the no-JS fallback.
 *  3. Anchors stop working the moment Lenis owns the scroll position, so same-page hashes are routed
 *     through `scrollTo` with an offset that clears the sticky header. Cross-page links are left
 *     alone — those should navigate and let the browser jump on load.
 *  4. `prefers-reduced-motion` bails out entirely. Momentum can make people ill; this is not polish.
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const html = document.documentElement;
    const previousBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";

    const lenis = new Lenis({
      duration: 1.1,
      // Expo-out: quick to start, long soft landing. This is the curve that reads as weight.
      easing: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      // Touch devices already have momentum from the OS; adding ours on top feels wrong.
      smoothWheel: true,
      touchMultiplier: 1.6,
    });

    let frame = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    // The header is 108px of sticky chrome, so a heading scrolled to the very top lands under it.
    const HEADER = 116;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("#") || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -HEADER });
      history.pushState(null, "", href);
    };
    document.addEventListener("click", onClick);

    // Handy for verifying it is actually wired, and for anything that needs to reach it later.
    (window as Window & { __lenis?: Lenis }).__lenis = lenis;

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(frame);
      lenis.destroy();
      delete (window as Window & { __lenis?: Lenis }).__lenis;
      html.style.scrollBehavior = previousBehavior;
    };
  }, []);

  // A new route starts at the top, and Lenis holds the position it had, so it has to be told.
  useEffect(() => {
    const lenis = (window as Window & { __lenis?: Lenis }).__lenis;
    lenis?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}
