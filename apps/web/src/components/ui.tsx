import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function Button({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost" | "dark";
}) {
  const styles = {
    primary: "bg-brand-bright text-bg-deep hover:bg-white hover:shadow-[0_12px_30px_-14px_rgba(64,176,192,0.9)]",
    ghost: "border border-white/25 text-white hover:border-white/50 hover:bg-white/10",
    dark: "bg-bg-strong text-white hover:bg-bg-mid hover:shadow-[0_12px_30px_-16px_rgba(0,43,56,0.9)]",
  }[variant];
  return (
    <Link
      href={href}
      className={`press inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition-[background-color,border-color,box-shadow,transform] duration-250 ${styles}`}
    >
      {children}
    </Link>
  );
}

export function SectionHeading({
  title,
  lead,
  align = "center",
}: {
  title: string;
  lead?: string;
  align?: "center" | "left";
}) {
  const alignment = align === "center" ? "text-center mx-auto" : "text-left";
  return (
    <div className={`flex flex-col gap-3 md:gap-4 ${align === "center" ? "items-center" : ""}`}>
      <h2
        className={`font-[family-name:var(--font-ibm-plex-serif)] text-[32px] font-semibold leading-tight tracking-tight md:text-[36px] lg:text-[48px] ${alignment}`}
      >
        {title}
      </h2>
      {lead && <p className={`max-w-3xl text-base text-text-soft ${alignment}`}>{lead}</p>}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "live" | "pending"; children: ReactNode }) {
  const styles = {
    neutral: "border-line text-text-soft",
    live: "border-up/30 bg-up/10 text-up",
    pending: "border-warn/30 bg-warn/10 text-[#8a5a00]",
  }[tone];
  return (
    <span className={`num rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-widest ${styles}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="group flex flex-col gap-1 px-6 py-5 md:px-10">
      <p className="text-[11px] uppercase tracking-widest text-text-soft transition-colors duration-200 group-hover:text-brand">
        {label}
      </p>
      <p className="num text-[28px] font-medium leading-none text-text-strong transition-transform duration-250 ease-out group-hover:-translate-y-0.5">
        {value}
      </p>
      {sub && <p className="text-xs text-text-soft">{sub}</p>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  interactive = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Only for a card you can act on. A container that lifts under the cursor and does nothing
   *  when clicked is a promise the page does not keep. */
  interactive?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">) {
  // The rest is forwarded because a Card is still a div: an id an anchor points at, an aria
  // attribute, a data hook. A wrapper that swallows them makes every caller reach around it.
  return (
    <div className={`rounded-[28px] bg-bg-weak p-6 md:p-8 ${interactive ? "lift" : ""} ${className}`} {...rest}>
      {children}
    </div>
  );
}
