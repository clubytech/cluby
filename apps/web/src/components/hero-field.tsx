"use client";

import { useEffect, useRef } from "react";

/**
 * The hero backdrop: a field of columns that grow up out of the floor, ticker glyphs drifting
 * through them, and a wave that parts the field under the cursor.
 *
 * The motion is the argument — collateral goes in at the bottom, liquidity comes out the top — so
 * the entry runs once and then the field only breathes, and the whole band parallaxes away as the
 * page scrolls so the headline is never fighting it.
 *
 * The cursor wave is the one thing here that is not decorative: a backdrop that answers the pointer
 * is the difference between a picture behind the text and a surface the page is standing on. The
 * column under the cursor ducks toward the floor, its neighbours follow with a falloff, and the ones
 * just outside the dip rise slightly and lean away — which is what a wave actually does, and why it
 * reads as one rather than as a spotlight.
 */

const BAR_COUNT = 56;
const TICKERS = ["NVDA", "SPY", "AAPL", "TSLA", "ETH", "MSFT", "AMZN", "GOOGL", "META", "COIN", "HOOD", "QQQ"];

/** How many columns either side the wave reaches. */
const SIGMA = 4.4;

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
  const barsRef = useRef<HTMLDivElement>(null);
  const tickersRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  // Scroll parallax.
  //
  // Written straight onto the four elements that move, NOT into a custom property on the root.
  // A custom property looks tidier and is the reason the page stuttered: changing one on
  // `.hero-field` invalidates style for its whole subtree, and that subtree is sixty-odd nodes
  // because the band alone holds 56 columns. Four direct writes to four elements touch four.
  //
  // It also stops completely once the hero has left the viewport. Past that the work is invisible
  // by definition, and it was still running down the length of a page with forty market rows on it.
  useEffect(() => {
    const host = root.current;
    const bars = barsRef.current;
    const tickers = tickersRef.current;
    const glow = glowRef.current;
    if (!host || !bars || !tickers || !glow) return;

    let visible = true;
    let last = -1;
    let frame = 0;

    const paint = () => {
      frame = 0;
      const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, window.innerHeight)));
      // Below a hundredth nothing is visible, and the write is a style recalculation for nothing.
      if (Math.abs(p - last) < 0.01) return;
      last = p;
      bars.style.transform = `translate3d(0, ${(p * 22).toFixed(2)}%, 0)`;
      bars.style.opacity = String(1 - p * 0.9);
      tickers.style.transform = `translate3d(0, ${(p * 30).toFixed(2)}%, 0)`;
      tickers.style.opacity = String(1 - p);
      glow.style.transform = `translate3d(0, ${(p * 26).toFixed(2)}%, 0)`;
    };

    const onScroll = () => {
      if (!visible || frame) return;
      frame = requestAnimationFrame(paint);
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        host.dataset.idle = visible ? "false" : "true";
        if (visible) onScroll();
      },
      { rootMargin: "100px" },
    );
    io.observe(host);

    paint();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The wave.
  useEffect(() => {
    const host = root.current;
    const bars = barsRef.current;
    if (!host || !bars) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const nodes = Array.from(bars.children) as HTMLElement[];
    // Where the wave is now, and where it is heading. Easing between the two is what stops the
    // field from snapping between frames when the pointer jumps.
    const current = new Float32Array(nodes.length);
    let targetIndex = -1;
    let strength = 0;
    let targetStrength = 0;
    let raf = 0;
    let settled = true;

    const tick = () => {
      raf = 0;
      strength += (targetStrength - strength) * 0.16;

      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        const d = targetIndex < 0 ? 999 : i - targetIndex;
        // Gaussian dip, with a shallow negative ring outside it so the neighbours lift instead of
        // simply not moving. That ring is the whole reason this reads as a wave.
        const g = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
        const ring = -0.28 * Math.exp(-((Math.abs(d) - SIGMA * 1.9) ** 2) / (2 * 2.2 * 2.2));
        const want = (g + ring) * strength;

        const prev = current[i]!;
        const next = prev + (want - prev) * 0.22;
        current[i] = next;

        // A change too small to see is a style recalculation for nothing, and there are 56 of these
        // every frame. Three decimals is finer than a pixel at this scale.
        if (Math.abs(next - prev) < 0.001) continue;
        moved = true;

        const lean = d === 0 ? 0 : Math.sign(d) * g * strength * 7;
        // One write, not two: the transform is set directly rather than through two custom
        // properties the engine then has to resolve.
        nodes[i]!.style.transform = `translate3d(${lean.toFixed(1)}px, ${(next * 96).toFixed(1)}%, 0)`;
        nodes[i]!.style.setProperty("--duck", next.toFixed(3));
      }

      settled = !moved && Math.abs(targetStrength - strength) < 0.001;
      if (!settled) raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      settled = false;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const box = bars.getBoundingClientRect();
      // A zero-width band is a real state, not a hypothetical: a hidden tab, a collapsed container
      // or a print layout all report it. Dividing by a clamped 1 there does not produce "no wave",
      // it produces a wave pinned to column zero, which looks like a bug in the effect rather than
      // like a viewport that is not there.
      if (box.width < 1) {
        targetStrength = 0;
        kick();
        return;
      }
      const x = (e.clientX - box.left) / box.width;
      targetIndex = x * (nodes.length - 1);
      // Full strength inside the band, fading out above it, so approaching from the headline is a
      // swell rather than a switch.
      const above = Math.max(0, box.top - e.clientY);
      targetStrength = Math.max(0, 1 - above / 460);
      kick();
    };

    const onLeave = () => {
      targetStrength = 0;
      kick();
    };

    // On the window, not on the band: the bars sit behind the headline and the buttons, so a
    // listener on the band itself would go quiet exactly where people move the cursor most.
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={root} className="hero-field absolute inset-0 -z-10 overflow-hidden bg-bg-deep">
      <style>{css}</style>

      {/* Columns rising out of the floor. */}
      <div ref={barsRef} className="hero-bars">
        {Array.from({ length: BAR_COUNT }, (_, i) => {
          const r = rand(i);
          const r2 = rand(i + 97);
          // A slow swell across the row keeps it from reading as noise.
          const swell = 0.45 + 0.55 * Math.sin((i / BAR_COUNT) * Math.PI);
          const height = (26 + r * 74) * swell;
          return (
            <span
              key={i}
              className="hero-bar"
              style={{
                ["--h" as string]: `${height.toFixed(1)}%`,
                ["--delay" as string]: `${(i * 26).toFixed(0)}ms`,
                ["--breathe" as string]: `${(5.5 + r2 * 5).toFixed(2)}s`,
                ["--tint" as string]: (0.34 + r2 * 0.46).toFixed(2),
              }}
            >
              <span className="hero-bar-fill" />
            </span>
          );
        })}
      </div>

      {/* Tickers drifting up through the band and dissolving. */}
      <div ref={tickersRef} className="hero-tickers" aria-hidden>
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
      <div ref={glowRef} className="hero-glow" />
      <div className="hero-veil" />
    </div>
  );
}

// NOTE: this is a template literal, so a backtick anywhere below -- including inside a CSS comment
// -- ends the string and produces a syntax error thirty lines later that looks like a CSS problem.
// No backticks in here. It has cost an hour twice.
const css = `
.hero-field { --scroll: 0; }

/* Off screen, the field stops entirely. 56 infinite animations on masked elements are real
   compositing work, and paying for it down the length of a page that shows none of it is what a
   scroll stutter is made of. */
.hero-field[data-idle="true"] .hero-bar-fill,
.hero-field[data-idle="true"] .hero-ticker {
  animation-play-state: paused;
}

.hero-bars {
  position: absolute;
  inset-inline: 0;
  bottom: -12%;
  height: 90%;
  display: flex;
  align-items: flex-end;
  gap: 0.3%;
  padding-inline: 2%;
  will-change: transform, opacity;
}

/* The wrapper owns the pointer wave; the fill inside owns the entry and the breathing. Keeping
   them on separate elements is what lets both run at once without one overwriting the other. */
.hero-bar {
  --duck: 0;
  flex: 1 1 0;
  height: var(--h);
  /* transform is written directly by the wave; this is only the resting state. No will-change here:
     56 permanent compositor layers cost more than they save, and the transform composites while it
     is actually moving regardless. */
  transform: translate3d(0, 0, 0);
}

.hero-bar-fill {
  display: block;
  height: 100%;
  border-radius: 3px 3px 0 0;
  transform-origin: bottom;
  /* The top of a column is where it stops existing, not where it gets cut off. */
  -webkit-mask-image: linear-gradient(to top, #000 0%, #000 62%, transparent 100%);
  mask-image: linear-gradient(to top, #000 0%, #000 62%, transparent 100%);
  /* Brighter than a wash: a hot cyan foot that carries most of the light, cooling as it rises. */
  background: linear-gradient(
    to top,
    rgb(150 240 252 / calc(var(--tint) + 0.62)) 0%,
    rgb(64 200 220 / calc(var(--tint) + 0.34)) 30%,
    rgb(64 176 192 / calc(var(--tint) * 0.36)) 100%
  );
  /* No animated box-shadow here, deliberately. Driving a blur radius from a custom property
     repaints a blurred region per element per frame -- 56 of them -- and the cost compounds until
     the whole page stutters. The glow is a separate, static layer below; only its opacity moves,
     and opacity composites. */
  box-shadow: 0 0 16px rgb(90 210 230 / calc(var(--tint) * 0.5));
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
  will-change: transform, opacity;
}

.hero-ticker {
  position: absolute;
  bottom: -8%;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgb(190 240 250 / 0.62);
  text-shadow: 0 0 14px rgb(64 176 192 / 0.45);
  animation: hero-drift var(--dur) linear var(--delay) infinite;
}

@keyframes hero-drift {
  0%   { transform: translateY(0); opacity: 0; }
  12%  { opacity: 0.7; }
  70%  { opacity: 0.2; }
  100% { transform: translateY(-84vh); opacity: 0; }
}

.hero-glow {
  position: absolute;
  inset-inline: -10%;
  bottom: -30%;
  height: 56%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgb(0 150 175 / 0.5), transparent 65%);
  filter: blur(28px);
  will-change: transform;
}

.hero-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    var(--color-bg-deep) 0%,
    rgb(0 27 36 / 0.88) 22%,
    rgb(0 27 36 / 0.5) 42%,
    rgb(0 27 36 / 0.06) 64%,
    rgb(0 27 36 / 0.35) 84%,
    rgb(0 27 36 / 0.92) 100%
  );
}

@media (prefers-reduced-motion: reduce) {
  .hero-bar { transform: none; }
  .hero-bar-fill { animation: none; }
  .hero-ticker { animation: none; opacity: 0.28; bottom: 22%; }
}
`;
