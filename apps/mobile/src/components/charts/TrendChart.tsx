import { useState } from 'react';
import type { SkillTrend, TrendPoint } from '@jobradar/core';
import { dateRange } from '../../lib/format';
import { Segmented } from '../ui/Primitives';

const W = 320;
const H = 176;
const PAD = { l: 34, r: 14, t: 22, b: 40 };

/**
 * Share of analysed jobs mentioning the skill, per comparable snapshot.
 * Non-comparable snapshots are drawn hollow and are not connected: no trend is
 * implied across a change in company mix / sample size.
 */
export function TrendChart({ trend }: { trend: SkillTrend }) {
  const points = trend.points;
  const [selected, setSelected] = useState<number>(points.length - 1);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  if (points.length === 0) return null;

  const maxPct = Math.max(...points.map((p) => p.pct), 0.1);
  const yMax = Math.min(1, Math.ceil((maxPct * 1.2) / 0.1) * 0.1);
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = (p: number) => PAD.t + (1 - p / yMax) * (H - PAD.t - PAD.b);
  const ticks = [0, yMax / 2, yMax];
  const sel = points[Math.min(selected, points.length - 1)]!;
  const comparable = points.map((p, i) => ({ p, i })).filter(({ p }) => p.comparable);

  const path = comparable.map(({ p, i }, k) => `${k === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');

  return (
    <div className="jr-trend">
      <div className="jr-trend__top">
        <span className="jr-overline">Share of jobs mentioning it</span>
        <Segmented label="Chart or table" value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />
      </div>
      {view === 'chart' ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="jr-trend__svg" role="img" aria-label={`Trend: ${trend.summary}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
                <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="jr-trend__tick">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            {comparable.length > 1 && <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, i) => {
              const cx = x(i);
              const cy = y(p.pct);
              const isCur = i === points.length - 1;
              return (
                <g key={p.snapshotId} onClick={() => setSelected(i)} style={{ cursor: 'pointer' }}>
                  <circle cx={cx} cy={cy} r={18} fill="transparent" />
                  {i === selected && <circle cx={cx} cy={cy} r={9} fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.4" />}
                  <circle cx={cx} cy={cy} r={5} fill={p.comparable ? (isCur ? 'var(--primary)' : 'var(--surface)') : 'var(--surface)'} stroke={p.comparable ? 'var(--primary)' : 'var(--text-3)'} strokeWidth="2" strokeDasharray={p.comparable ? undefined : '2 2'} />
                  <text x={cx} y={cy - 11} textAnchor="middle" className="jr-trend__val mono">
                    {p.jobs}/{p.n}
                  </text>
                  <text x={cx} y={H - 20} textAnchor="middle" className="jr-trend__x">
                    {p.label}
                  </text>
                  <text x={cx} y={H - 7} textAnchor="middle" className="jr-trend__xn">
                    n={p.n}
                    {p.comparable ? '' : ' ⚠'}
                  </text>
                </g>
              );
            })}
          </svg>
          <PointDetail p={sel} />
        </>
      ) : (
        <table className="jr-table">
          <thead>
            <tr>
              <th>Sample</th>
              <th>Window</th>
              <th className="r">Jobs</th>
              <th className="r">Share</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.snapshotId}>
                <td>
                  {p.label}
                  {!p.comparable && <span className="jr-small jr-warn-text"> · not comparable</span>}
                </td>
                <td>{dateRange(p.startDate, p.endDate)}</td>
                <td className="r mono">
                  {p.jobs}/{p.n}
                </td>
                <td className="r mono">{Math.round(p.pct * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PointDetail({ p }: { p: TrendPoint }) {
  return (
    <div className="jr-trend__detail">
      <strong>{p.label}</strong>
      <span className="jr-small jr-muted">
        {dateRange(p.startDate, p.endDate)} · {p.jobs}/{p.n} jobs ({Math.round(p.pct * 100)}%)
      </span>
      {!p.comparable && <span className="jr-small jr-warn-text">Not comparable with the current sample: {p.incomparableReasons.join(' ')} Shown for reference; no trend is drawn from it.</span>}
    </div>
  );
}
