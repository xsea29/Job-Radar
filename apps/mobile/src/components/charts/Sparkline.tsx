import type { TrendPoint } from '@jobradar/core';

export function Sparkline({ points, width = 64, height = 22 }: { points: TrendPoint[]; width?: number; height?: number }) {
  const comp = points.filter((p) => p.comparable);
  if (comp.length < 2) return <span className="jr-small jr-muted">—</span>;
  const max = Math.max(...comp.map((p) => p.pct), 0.05);
  const pts = comp.map((p, i) => `${(i / (comp.length - 1)) * (width - 6) + 3},${height - 3 - (p.pct / max) * (height - 6)}`);
  const last = pts[pts.length - 1]!.split(',');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--primary)" />
    </svg>
  );
}
