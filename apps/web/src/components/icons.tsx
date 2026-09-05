import type { ReactNode } from "react";

/**
 * A small set of line icons that move when the card around them is hovered.
 *
 * Each one animates the part that carries its meaning and nothing else: the vault door swings, the
 * shield's tick draws itself, the arrows on the exchange trade places. An icon that merely scales
 * says only "you are hovering", which the cursor already said.
 *
 * They move on `.group:hover`, so the card owns the interaction and the icon just responds. All of
 * it is transform and stroke-dashoffset — composited, and covered by the global reduced-motion rule
 * in `globals.css`.
 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand transition-colors duration-300 group-hover:bg-brand group-hover:text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        {children}
      </svg>
    </span>
  );
}

/** Lending: coins stacking up. The top one drops in. */
export function IconVault() {
  return (
    <Frame>
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
      <path
        d="M5 11.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5"
        className="origin-center transition-transform duration-500 ease-out group-hover:translate-y-[1.5px]"
      />
    </Frame>
  );
}

/** Borrowing against collateral: a weight on a scale, which tips. */
export function IconScale() {
  return (
    <Frame>
      <path d="M12 4v16" />
      <path d="M7 20h10" />
      <g className="origin-[12px_7px] transition-transform duration-500 ease-out group-hover:-rotate-[10deg]">
        <path d="M4 7h16" />
        <path d="M4 7l-2.5 5a2.8 2.8 0 005 0z" />
        <path d="M20 7l2.5 5a2.8 2.8 0 01-5 0z" />
      </g>
    </Frame>
  );
}

/** Safety: a shield whose tick draws itself on hover. */
export function IconShield() {
  return (
    <Frame>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.7-7 8.5-4.1-.8-7-4.3-7-8.5V6z" />
      <path
        d="M9 12l2.2 2.2L15.5 10"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-500 ease-out group-hover:[stroke-dashoffset:0]"
      />
    </Frame>
  );
}

/** An exchange: two arrows that swap places. */
export function IconSwap() {
  return (
    <Frame>
      <g className="transition-transform duration-500 ease-out group-hover:translate-x-[2px]">
        <path d="M4 9h13" />
        <path d="M14 6l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="transition-transform duration-500 ease-out group-hover:-translate-x-[2px]">
        <path d="M20 15H7" />
        <path d="M10 12l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Frame>
  );
}

/** Speed: a lightning bolt that flashes brighter. */
export function IconBolt() {
  return (
    <Frame>
      <path
        d="M13 3L5 13h6l-1 8 8-10h-6z"
        strokeLinejoin="round"
        className="origin-center transition-transform duration-300 ease-out group-hover:scale-110"
      />
    </Frame>
  );
}

/** A price feed: a line that redraws itself. */
export function IconFeed() {
  return (
    <Frame>
      <path d="M3 20h18" />
      <path
        d="M4 15l4-5 3.5 3L15 7l5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="[stroke-dasharray:1] transition-[stroke-dashoffset] duration-700 ease-out group-hover:[stroke-dashoffset:0] [stroke-dashoffset:1]"
      />
    </Frame>
  );
}
