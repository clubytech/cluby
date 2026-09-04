export const usd = (n: number, digits = 2) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 10_000
      ? `$${(n / 1_000).toFixed(1)}K`
      : `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const pct = (n: number | null, digits = 2) =>
  n === null ? "—" : `${(n * 100).toFixed(digits)}%`;

export function age(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}
