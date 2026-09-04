type Point = { x: number; y: number };

/**
 * A small line chart drawn as inline SVG. No chart library: the shapes here are two paths and some
 * text, and a dependency for that would cost more in bundle size than it saves in code.
 */
export function SeriesChart({
  points,
  label,
  format,
  height = 160,
  accent = "var(--color-brand)",
}: {
  points: Point[];
  label: string;
  format: (v: number) => string;
  height?: number;
  accent?: string;
}) {
  if (points.length < 2) {
    return (
      <div className="rounded-[28px] border border-line bg-white p-6">
        <p className="text-[11px] uppercase tracking-widest text-text-soft">{label}</p>
        <p className="mt-6 text-sm text-text-soft">Not enough history yet.</p>
      </div>
    );
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // A flat series would divide by zero and collapse to a line at the top; give it a band instead.
  const spanY = maxY - minY || Math.max(Math.abs(maxY), 1) * 0.02;
  const spanX = maxX - minX || 1;

  const W = 600;
  const H = height;
  const pad = { top: 12, right: 8, bottom: 20, left: 8 };

  const px = (x: number) => pad.left + ((x - minX) / spanX) * (W - pad.left - pad.right);
  const py = (y: number) => pad.top + (1 - (y - (maxY - spanY)) / spanY) * (H - pad.top - pad.bottom);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const area = `${line} L${px(maxX).toFixed(1)},${(H - pad.bottom).toFixed(1)} L${px(minX).toFixed(1)},${(H - pad.bottom).toFixed(1)} Z`;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const change = first.y === 0 ? 0 : (last.y - first.y) / Math.abs(first.y);
  const hours = Math.max(1, Math.round((maxX - minX) / 3600));

  return (
    <div className="rounded-[28px] border border-line bg-white p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-text-soft">{label}</p>
        <p className="num text-sm">
          {format(last.y)}
          {change !== 0 && (
            <span className={change > 0 ? "ml-2 text-up" : "ml-2 text-down"}>
              {change > 0 ? "+" : ""}
              {(change * 100).toFixed(2)}%
            </span>
          )}
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label={label}>
        <path d={area} fill={accent} opacity="0.08" />
        <path d={line} fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={px(last.x)} cy={py(last.y)} r="3" fill={accent} />
        <text x={pad.left} y={H - 6} className="num" fontSize="10" fill="var(--color-text-soft)">
          {hours}h ago
        </text>
        <text x={W - pad.right} y={H - 6} textAnchor="end" className="num" fontSize="10" fill="var(--color-text-soft)">
          now
        </text>
      </svg>

      <div className="num mt-1 flex justify-between text-[11px] text-text-soft">
        <span>low {format(minY)}</span>
        <span>high {format(maxY)}</span>
      </div>
    </div>
  );
}
