"use client";

import { useEffect, useRef } from "react";

/**
 * The hero backdrop: a field of columns that grow up out of the floor, and ticker glyphs that drift
 * from the bottom edge and dissolve near the headline.
 *
 * It replaces the stock photo of coins. The motion is the argument — collateral goes in at the
 * bottom, liquidity comes out the top — so it runs once on entry and then only breathes, and the
 * whole band parallaxes down as the page scrolls so the headline is never fighting it.
 */

const BAR_COUNT = 56;
const TICKERS = ["NVDA", "SPY", "AAPL", "TSLA", "ETH", "MSFT", "AMZN", "GOOGL", "META", "COIN", "HOOD", "QQQ"];

/**
 * Deterministic pseudo-random in [0,1). The server and the client must draw the same field or React
 * throws away the markup it just streamed.
 */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function HeroField() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Only the first viewport matters; past it the hero is gone and the work is wasted.
        const p = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
        el.style.setProperty("--scroll", String(p));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={root} className="hero-field absolute inset-0 -z-10 overflow-hidden bg-bg-deep">
      <style>{css}</style>

      {/* Columns rising out of the floor. */}
      <div className="hero-bars">
        {Array.from({ length: BAR_COUNT }, (_, i) => {
          const r = rand(i);
          const r2 = rand(i + 97);
          // A slow swell across the row keeps it from reading as noise.
          const swell = 0.45 + 0.55 * Math.sin((i / BAR_COUNT) * Math.PI);
          const height = (14 + r * 62) * swell;
          return (
            <span
              key={i}
              className="hero-bar"
              style={{
                // Two custom properties the keyframes read, so each column has its own ceiling.
                ["--h" as string]: `${height.toFixed(1)}%`,
                ["--delay" as string]: `${(i * 26).toFixed(0)}ms`,
                ["--breathe" as string]: `${(5.5 + r2 * 5).toFixed(2)}s`,
                opacity: 0.16 + r2 * 0.34,
              }}
            />
          );
        })}
      </div>

      {/* Tickers drifting up through the band and dissolving. */}
      <div className="hero-tickers" aria-hidden>
        {TICKERS.map((t, i) => {
          const r = rand(i + 401);
          return (
            <span
              key={t}
              className="hero-ticker num"
              style={{
                left: `${(4 + (i * 92) / TICKERS.length + r * 5).toFixed(1)}%`,
                ["--delay" as string]: `${(i * 1.9 + r * 2).toFixed(2)}s`,
                ["--dur" as string]: `${(17 + r * 9).toFixed(1)}s`,
              }}
            >
              {t}
            </span>
          );
        })}
      </div>

      {/* Ground glow and the fade that hands the headline back its contrast. */}
      <div className="hero-glow" />
      <div className="hero-veil" />
    </div>
  );
}

const css = `
.hero-field { --scroll: 0; }

.hero-bars {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 46%;
  display: flex;
  align-items: flex-end;
  gap: 0.35%;
  padding-inline: 2%;
  transform: translate3d(0, calc(var(--scroll) * 22%), 0);
  opacity: calc(1 - var(--scroll) * 0.85);
  will-change: transform, opacity;
}

.hero-bar {
  flex: 1 1 0;
  height: var(--h);
  border-radius: 2px 2px 0 0;
  background: linear-gradient(to top, rgb(64 176 192 / 0.9), rgb(64 176 192 / 0.04));
  transform-origin: bottom;
  animation:
    hero-rise 1.1s cubic-bezier(0.16, 1, 0.3, 1) var(--delay) backwards,
    hero-breathe var(--breathe) ease-in-out calc(var(--delay) + 1.1s) infinite;
}

@keyframes hero-rise {
  from { transform: scaleY(0); }
  to   { transform: scaleY(1); }
}

@keyframes hero-breathe {
  0%, 100% { transform: scaleY(1); }
  50%      { transform: scaleY(1.35); }
}

.hero-tickers {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transform: translate3d(0, calc(var(--scroll) * 30%), 0);
  opacity: calc(1 - var(--scroll));
}

.hero-ticker {
  position: absolute;
  bottom: -8%;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgb(255 255 255 / 0.5);
  animation: hero-drift var(--dur) linear var(--delay) infinite;
}

@keyframes hero-drift {
  0%   { transform: translateY(0); opacity: 0; }
  12%  { opacity: 0.55; }
  70%  { opacity: 0.16; }
  100% { transform: translateY(-84vh); opacity: 0; }
}

.hero-glow {
  position: absolute;
  inset-inline: -10%;
  bottom: -22%;
  height: 52%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgb(0 120 140 / 0.35), transparent 65%);
  filter: blur(28px);
  transform: translate3d(0, calc(var(--scroll) * 26%), 0);
}

.hero-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    var(--color-bg-deep) 0%,
    rgb(0 27 36 / 0.72) 44%,
    rgb(0 27 36 / 0.25) 68%,
    rgb(0 27 36 / 0.88) 100%
  );
}

@media (prefers-reduced-motion: reduce) {
  .hero-bar { animation: none; }
  .hero-ticker { animation: none; opacity: 0.28; bottom: 22%; }
}
`;
