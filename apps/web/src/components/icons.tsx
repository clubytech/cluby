import type { ReactNode } from "react";

/**
 * Line icons that move the part carrying their meaning.
 *
 * Two-tone rather than flat: a soft filled shape underneath and a stroke over it, so the mark reads
 * as an object with a body instead of a wire diagram. Every stroke is round-capped and round-joined,
 * every glyph is built on the same 24-grid at the same 1.6 weight, and the optical sizes were
 * matched by eye rather than by bounding box — a circle at the same nominal size as a square looks
 * smaller, so it is drawn larger.
 *
 * They animate on `.group:hover`, so the card owns the interaction and the icon responds: the vault
 * lid lifts, the scale tips, the shield draws its tick, the arrows trade places. An icon that only
 * scales says "you are hovering", which the cursor already said.
 *
 * All of it is transform and stroke-dashoffset — composited, and covered by the global
 * reduced-motion rule in `globals.css`.
 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <span className="relative flex h-12 w-12 items-center justify-center rounded-[14px] bg-gradient-to-br from-brand/12 to-brand/5 text-brand ring-1 ring-brand/10 transition-all duration-400 ease-out group-hover:from-brand group-hover:to-brand-dim group-hover:text-white group-hover:ring-brand/30 group-hover:shadow-[0_10px_24px_-12px_rgba(0,120,140,0.7)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[22px] w-[22px]"
      >
        {children}
      </svg>
    </span>
  );
}

/** Lending: a vault whose lid lifts. */
export function IconVault() {
  return (
    <Frame>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.6" fill="currentColor" fillOpacity="0.14" />
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.6" />
      <circle cx="12" cy="13.75" r="3.1" />
      <path d="M12 11.4v1.6M12 13.75h1.9" />
      <path
        d="M6.5 7.5V6a5.5 5.5 0 0111 0v1.5"
        className="origin-[12px_7.5px] transition-transform duration-500 ease-out group-hover:-translate-y-[1.6px]"
      />
    </Frame>
  );
}

/** Collateral: a balance that tips under the weight on one side. */
export function IconScale() {
  return (
    <Frame>
      <path d="M12 4.5v15M8 19.5h8" />
      <g className="origin-[12px_7.5px] transition-transform duration-[600ms] ease-out group-hover:-rotate-[9deg]">
        <path d="M5 7.5h14" />
        <path d="M5 7.5l-2.4 4.6a2.7 2.7 0 004.8 0z" fill="currentColor" fillOpacity="0.14" />
        <path d="M19 7.5l2.4 4.6a2.7 2.7 0 01-4.8 0z" fill="currentColor" fillOpacity="0.14" />
      </g>
      <circle cx="12" cy="7.5" r="1.5" fill="currentColor" fillOpacity="0.2" />
    </Frame>
  );
}

/** Safety: a shield whose tick draws itself. */
export function IconShield() {
  return (
    <Frame>
      <path d="M12 3l7.5 3v5.8c0 4.4-3.1 8.1-7.5 9-4.4-.9-7.5-4.6-7.5-9V6z" fill="currentColor" fillOpacity="0.12" />
      <path d="M12 3l7.5 3v5.8c0 4.4-3.1 8.1-7.5 9-4.4-.9-7.5-4.6-7.5-9V6z" />
      <path
        d="M8.8 12.2l2.4 2.4 4.2-4.6"
        pathLength={1}
        className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-[600ms] ease-out group-hover:[stroke-dashoffset:0]"
      />
    </Frame>
  );
}

/** An exchange: two arrows that trade places. */
export function IconSwap() {
  return (
    <Frame>
      <rect x="2.5" y="3.5" width="19" height="17" rx="3.4" fill="currentColor" fillOpacity="0.1" stroke="none" />
      <g className="transition-transform duration-[600ms] ease-out group-hover:translate-x-[2.5px]">
        <path d="M6 9.5h9.5" />
        <path d="M13 6.8l2.7 2.7-2.7 2.7" />
      </g>
      <g className="transition-transform duration-[600ms] ease-out group-hover:-translate-x-[2.5px]">
        <path d="M18 14.5H8.5" />
        <path d="M11 11.8L8.3 14.5 11 17.2" />
      </g>
    </Frame>
  );
}

/** Speed: a bolt that snaps. */
export function IconBolt() {
  return (
    <Frame>
      <path
        d="M13.4 2.8L5.6 13.2h5.3l-.9 8 7.8-10.4h-5.3z"
        fill="currentColor"
        fillOpacity="0.14"
        className="origin-center transition-transform duration-400 ease-out group-hover:scale-[1.08]"
      />
      <path
        d="M13.4 2.8L5.6 13.2h5.3l-.9 8 7.8-10.4h-5.3z"
        className="origin-center transition-transform duration-400 ease-out group-hover:scale-[1.08]"
      />
    </Frame>
  );
}

/** A price feed: a line that redraws itself over a filled area. */
export function IconFeed() {
  return (
    <Frame>
      <path d="M3.5 19.5h17" />
      <path d="M4 14.6l4.3-5.2 3.5 3.1 3.4-5.3 4.3 4.6v7.7H4z" fill="currentColor" fillOpacity="0.12" stroke="none" />
      <path
        d="M4 14.6l4.3-5.2 3.5 3.1 3.4-5.3 4.3 4.6"
        pathLength={1}
        className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-[800ms] ease-out group-hover:[stroke-dashoffset:0]"
      />
      <circle
        cx="19.5"
        cy="11.8"
        r="1.5"
        fill="currentColor"
        className="opacity-0 transition-opacity duration-300 delay-[500ms] group-hover:opacity-100"
      />
    </Frame>
  );
}

/** A market: a candle chart whose last candle grows. */
export function IconMarket() {
  return (
    <Frame>
      <path d="M3.5 20h17" />
      <g className="origin-bottom">
        <path d="M7 16.5V9.5M7 7v2.5M7 16.5V19" />
        <rect x="5.4" y="9.5" width="3.2" height="7" rx="1" fill="currentColor" fillOpacity="0.14" />
        <path d="M12 14V7.5M12 5v2.5M12 14v3.5" />
        <rect x="10.4" y="7.5" width="3.2" height="6.5" rx="1" fill="currentColor" fillOpacity="0.14" />
      </g>
      <g className="origin-[17px_20px] transition-transform duration-[600ms] ease-out group-hover:scale-y-[1.22]">
        <path d="M17 17V11M17 8.5V11M17 17v2" />
        <rect x="15.4" y="11" width="3.2" height="6" rx="1" fill="currentColor" fillOpacity="0.2" />
      </g>
    </Frame>
  );
}
