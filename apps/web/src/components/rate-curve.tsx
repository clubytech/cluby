"use client";

import { useMemo, useState } from "react";

/**
 * What the rate does as the pool fills.
 *
 * Morpho's adaptive curve is public arithmetic, so this is not a projection: given the rate the
 * market charges right now, the rate at any other utilization follows exactly. The one thing it
 * cannot show is the slow drift of the curve's own centre, which moves over days — so the label
 * says "at today's curve" rather than pretending to forecast.
 */

const TARGET = 0.9;
const STEEPNESS = 4;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/** The multiplier Morpho applies to the rate-at-target for a given utilization. */
function curveAt(u: number): number {
  const err = u < TARGET ? (u - TARGET) / TARGET : (u - TARGET) / (1 - TARGET);
  const coeff = err < 0 ? 1 - 1 / STEEPNESS : STEEPNESS - 1;
  return coeff * err + 1;
}

export function RateCurve({
  borrowApy,
  utilization,
  performanceFee = 0,
}: {
  borrowApy: number;
  utilization: number;
  performanceFee?: number;
}) {
  const [u, setU] = useState(() => Math.max(0.05, Math.min(0.99, utilization || 0.5)));
  const [size, setSize] = useState(1000);

  /**
   * Read the curve's centre out of the rate the market charges today. Doing it this way means the
   * chart is anchored to a real on-chain number instead of a constant someone typed in.
   */
  const rateAtTarget = useMemo(() => {
    const linear = Math.log1p(Math.max(borrowApy, 0));
    const c = curveAt(Math.max(0, Math.min(1, utilization)));
    // A market that has never been touched reports zero; fall back to Morpho's own 4% centre so the
    // shape is still honest about where the curve sits.
    return c > 0 && linear > 0 ? linear / c : 0.04;
  }, [borrowApy, utilization]);

  const borrowAt = (x: number) => Math.expm1(rateAtTarget * curveAt(x));
  const supplyAt = (x: number) => borrowAt(x) * x * (1 - performanceFee);

  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      pts.push(`${(x * 300).toFixed(1)},${(90 - Math.min(1, borrowAt(x) / 0.6) * 84).toFixed(1)}`);
    }
    return `M${pts.join("L")}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateAtTarget]);

  const markerX = u * 300;
  const markerY = 90 - Math.min(1, borrowAt(u) / 0.6) * 84;
  const nowX = Math.max(0, Math.min(1, utilization)) * 300;

  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-[family-name:var(--font-ibm-plex-serif)] text-[22px] font-semibold">What the rate does as the pool fills</h3>
        <span className="num text-[11px] uppercase tracking-widest text-text-soft">at today&apos;s curve</span>
      </div>

      <svg viewBox="0 0 300 100" className="mt-5 h-28 w-full" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1="90" x2="300" y2="90" stroke="var(--color-line)" strokeWidth="1" />
        <line x1={TARGET * 300} y1="4" x2={TARGET * 300} y2="90" stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke="var(--color-brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <line x1={nowX} y1="4" x2={nowX} y2="90" stroke="var(--color-text-faint)" strokeWidth="1" />
        <circle cx={markerX} cy={markerY} r="4" fill="var(--color-brand-bright)" stroke="white" strokeWidth="1.5" />
      </svg>
      <div className="num flex justify-between text-[10px] uppercase tracking-widest text-text-soft">
        <span>0%</span>
        <span>target 90%</span>
        <span>100%</span>
      </div>

      <label className="mt-6 block">
        <span className="flex justify-between text-sm">
          <span className="text-text-soft">Utilization</span>
          <span className="num text-text-strong">{(u * 100).toFixed(0)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={99}
          value={Math.round(u * 100)}
          onChange={(e) => setU(Number(e.target.value) / 100)}
          className="mt-2 w-full accent-[var(--color-brand)]"
        />
      </label>

      <label className="mt-4 block">
        <span className="flex justify-between text-sm">
          <span className="text-text-soft">Your deposit</span>
          <span className="num text-text-strong">${size.toLocaleString("en-US")}</span>
        </span>
        <input
          type="range"
          min={100}
          max={100000}
          step={100}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--color-brand)]"
        />
      </label>

      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
        {[
          ["Borrower pays", `${(borrowAt(u) * 100).toFixed(2)}%`],
          ["You earn", `${(supplyAt(u) * 100).toFixed(2)}%`],
          ["Per year", `$${(size * supplyAt(u)).toFixed(2)}`],
        ].map(([l, v]) => (
          <div key={l}>
            <p className="text-[11px] uppercase tracking-widest text-text-soft">{l}</p>
            <p className="num mt-1 text-lg">{v}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-text-soft">
        Utilization is how much of the pool is borrowed. Below 90% the rate falls gently; above it the
        curve steepens hard, which is what pulls new deposits in and pushes borrowers to repay. At{" "}
        {(utilization * 100).toFixed(0)}% — where this market stands now — the supply side earns{" "}
        {(supplyAt(utilization) * 100).toFixed(2)}%. Nothing here is subsidised: the borrower&apos;s
        payment is the whole of the lender&apos;s yield.
      </p>
    </div>
  );
}
