"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * One pill that travels to whichever child is marked `data-active="true"`.
 *
 * Measured from the DOM rather than computed from the labels, because the labels are not the thing:
 * a font that loads late, a badge, a different language — each changes the width, and a pill sized
 * from a guess lands next to its target instead of on it. Rects rather than `offsetLeft`, because a
 * child inside its own positioned wrapper reports zero for that.
 *
 * It starts as `null` so the very first paint has nothing to slide FROM. Appearing in place is right
 * on arrival; sliding is right on every change after.
 */
export function useSlidingPill<T extends HTMLElement>(deps: readonly unknown[] = []) {
  const ref = useRef<T>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const measure = () => {
      const el = host.querySelector<HTMLElement>("[data-active='true']");
      if (!el) return setPill(null);
      const a = el.getBoundingClientRect();
      const b = host.getBoundingClientRect();
      setPill({ left: a.left - b.left, width: a.width });
    };

    measure();
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(measure).catch(() => {});
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref: ref as RefObject<T | null>, pill };
}

/**
 * The travelling element itself. Transform and width, both composited, on the site's one curve.
 * `className` carries the look, because a pill on a dark header and a pill on a white card are the
 * same mechanism wearing different clothes.
 */
export function Pill({
  pill,
  className = "",
}: {
  pill: { left: number; width: number } | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 left-0 rounded-full transition-[transform,width,opacity] duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${className}`}
      style={{
        width: pill ? `${pill.width}px` : 0,
        transform: `translateX(${pill?.left ?? 0}px)`,
        opacity: pill ? 1 : 0,
      }}
    />
  );
}
