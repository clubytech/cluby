"use client";

import { useState } from "react";

/**
 * A market's logo, with the ticker chip as the fallback.
 *
 * The images are served from `public/logos`, downloaded once by `scripts/fetch-logos.mjs` rather
 * than hot-linked, so nothing in the render path depends on a third party being up. Three of the
 * catalogue's subjects are chain-native tokens with no listed company behind them and therefore no
 * logo at all — the chip is the right answer for those, not a broken image, so the fallback is a
 * designed state rather than an error state.
 *
 * `onError` covers the rest: a ticker added to the catalogue before anyone runs the fetch script
 * shows the chip and nothing looks broken.
 */
export function MarketLogo({ subject, size = 36 }: { subject: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;

  if (failed) {
    return (
      <span
        className="num flex shrink-0 items-center justify-center rounded-full bg-bg-strong text-[11px] text-white transition-all duration-250 ease-out group-hover:scale-110 group-hover:bg-brand"
        style={{ width: px, height: px }}
      >
        {subject.slice(0, 4)}
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-line transition-all duration-250 ease-out group-hover:scale-110 group-hover:ring-brand/50"
      style={{ width: px, height: px }}
    >
      {/* A plain img, not next/image: these are tiny, already the right size, and the point of the
          element is that it can fail and hand over to the chip. */}
      <img
        src={`/logos/${subject}.png`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain p-1"
      />
    </span>
  );
}
