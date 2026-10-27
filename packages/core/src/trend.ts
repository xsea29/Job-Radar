import type { CompanyCategory, RoleId, SkillDef, SkillLabel } from './types';
import type { Concentration } from './demand';

/**
 * Trend engine.
 *
 * Principles (from the product spec):
 *  - Only compare snapshots that are reasonably comparable (same role, region,
 *    experience band, similar company mix, adequate sample).
 *  - Never claim a decline from a single small sample or a change in mix.
 *  - Show both sides' counts and sample sizes; flag noise.
 *  - With no comparable history, say "baseline established; trend not yet
 *    available" — never fabricate history.
 */

export interface SnapshotSkillCount {
  jobs: number;
  required: number;
  preferred: number;
}

export interface DemandSnapshot {
  id: string;
  label: string;
  /** ISO dates of the sampling window. */
  startDate: string;
  endDate: string;
  n: number;
  roleId: RoleId;
  region: string;
  experienceBand: string;
  companyMix: Record<CompanyCategory, number>;
  counts: Record<string, SnapshotSkillCount>;
  provenance: 'demo' | 'live';
}

export interface TrendConfig {
  /** Minimum sample size for a snapshot to be used at all. */
  minSample: number;
  /** Minimum jobs mentioning a skill before any label other than "uncertain". */
  minMentions: number;
  /** Minimum absolute change (fraction, 0.05 = 5 percentage points). */
  minDelta: number;
  /** z threshold (1.96 ≈ 95%). */
  zThreshold: number;
  /** Max total-variation distance between company mixes to be comparable. */
  maxMixDistance: number;
  establishedPct: number;
  specializedShare: number;
  specializedMaxSegmentShare: number;
}

export const DEFAULT_TREND_CONFIG: TrendConfig = {
  minSample: 30,
  minMentions: 5,
  minDelta: 0.05,
  zThreshold: 1.96,
  maxMixDistance: 0.15,
  establishedPct: 0.15,
  specializedShare: 0.6,
  specializedMaxSegmentShare: 0.4,
};

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function normalCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26 approximation of erf (|error| < 1.5e-7).
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export interface ProportionComparison {
  p1: number;
  p2: number;
  /** p2 − p1, in fraction (0.07 = +7 percentage points). */
  diff: number;
  z: number;
  pValue: number;
  ci95: [number, number];
  meaningful: boolean;
}

/** Two-proportion comparison: earlier (k1/n1) vs later (k2/n2). */
export function compareProportions(
  k1: number,
  n1: number,
  k2: number,
  n2: number,
  cfg: Pick<TrendConfig, 'zThreshold' | 'minDelta'> = DEFAULT_TREND_CONFIG,
): ProportionComparison {
  const p1 = n1 ? k1 / n1 : 0;
  const p2 = n2 ? k2 / n2 : 0;
  const diff = p2 - p1;
  const pooled = n1 + n2 ? (k1 + k2) / (n1 + n2) : 0;
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / (n1 || 1) + 1 / (n2 || 1)));
  const z = se > 0 ? diff / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const seUnpooled = Math.sqrt((p1 * (1 - p1)) / (n1 || 1) + (p2 * (1 - p2)) / (n2 || 1));
  const ci95: [number, number] = [diff - 1.96 * seUnpooled, diff + 1.96 * seUnpooled];
  return { p1, p2, diff, z, pValue, ci95, meaningful: Math.abs(z) >= cfg.zThreshold && Math.abs(diff) >= cfg.minDelta };
}

// ---------------------------------------------------------------------------
// Comparability
// ---------------------------------------------------------------------------

export interface Comparability {
  comparable: boolean;
  reasons: string[];
}

function mixDistance(a: DemandSnapshot, b: DemandSnapshot): number {
  const cats: CompanyCategory[] = ['startup', 'mid', 'large'];
  const sa = cats.reduce((s, c) => s + a.companyMix[c], 0) || 1;
  const sb = cats.reduce((s, c) => s + b.companyMix[c], 0) || 1;
  return 0.5 * cats.reduce((s, c) => s + Math.abs(a.companyMix[c] / sa - b.companyMix[c] / sb), 0);
}

export function checkComparability(a: DemandSnapshot, b: DemandSnapshot, cfg: TrendConfig = DEFAULT_TREND_CONFIG): Comparability {
  const reasons: string[] = [];
  if (a.roleId !== b.roleId) reasons.push('Different target role.');
  if (a.region !== b.region) reasons.push('Different geography.');
  if (a.experienceBand !== b.experienceBand) reasons.push('Different experience band.');
  if (a.n < cfg.minSample || b.n < cfg.minSample) reasons.push(`Sample below ${cfg.minSample} jobs.`);
  const d = mixDistance(a, b);
  if (d > cfg.maxMixDistance) reasons.push(`Company mix differs by ${Math.round(d * 100)} points (limit ${Math.round(cfg.maxMixDistance * 100)}).`);
  return { comparable: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type EvidenceQuality = 'high' | 'medium' | 'low';

export interface TrendPoint {
  snapshotId: string;
  label: string;
  startDate: string;
  endDate: string;
  n: number;
  jobs: number;
  pct: number;
  /** Whether this snapshot is comparable with the current one. */
  comparable: boolean;
  incomparableReasons: string[];
}

export interface SkillTrend {
  skillId: string;
  label: SkillLabel;
  evidence: EvidenceQuality;
  /** Present only when a comparable earlier snapshot exists. */
  comparison?: ProportionComparison & {
    previous: TrendPoint;
    current: TrendPoint;
    deltaPP: number;
  };
  points: TrendPoint[];
  baselineOnly: boolean;
  /** One-line plain-language reason shown in the UI. */
  summary: string;
  reasons: string[];
}

function countFor(s: DemandSnapshot, skillId: string): number {
  return s.counts[skillId]?.jobs ?? 0;
}

export function classifySkillTrend(
  skill: Pick<SkillDef, 'id' | 'foundational'>,
  snapshots: DemandSnapshot[],
  concentrationInfo: Concentration | null,
  cfg: TrendConfig = DEFAULT_TREND_CONFIG,
): SkillTrend {
  const ordered = [...snapshots].sort((a, b) => a.endDate.localeCompare(b.endDate));
  const current = ordered[ordered.length - 1];
  if (!current) {
    return { skillId: skill.id, label: 'uncertain', evidence: 'low', points: [], baselineOnly: true, summary: 'No data yet.', reasons: ['No snapshots.'] };
  }
  const points: TrendPoint[] = ordered.map((s) => {
    const cmp = s === current ? { comparable: true, reasons: [] as string[] } : checkComparability(s, current, cfg);
    return {
      snapshotId: s.id,
      label: s.label,
      startDate: s.startDate,
      endDate: s.endDate,
      n: s.n,
      jobs: countFor(s, skill.id),
      pct: s.n ? countFor(s, skill.id) / s.n : 0,
      comparable: cmp.comparable,
      incomparableReasons: cmp.reasons,
    };
  });
  const curPoint = points[points.length - 1]!;
  const comparablePrev = points.slice(0, -1).filter((p) => p.comparable);
  const reasons: string[] = [];
  const baselineOnly = comparablePrev.length === 0;
  const excluded = points.slice(0, -1).filter((p) => !p.comparable);
  for (const p of excluded) reasons.push(`${p.label} excluded: ${p.incomparableReasons.join(' ')}`);

  let comparison: SkillTrend['comparison'];
  const lastPrev = comparablePrev[comparablePrev.length - 1];
  if (lastPrev) {
    const c = compareProportions(lastPrev.jobs, lastPrev.n, curPoint.jobs, curPoint.n, cfg);
    comparison = { ...c, previous: lastPrev, current: curPoint, deltaPP: c.diff * 100 };
  }

  const evidence: EvidenceQuality =
    curPoint.n < cfg.minSample || curPoint.jobs < cfg.minMentions ? 'low' : baselineOnly ? 'medium' : comparablePrev.length >= 2 ? 'high' : 'medium';

  const done = (label: SkillLabel, summary: string, ev: EvidenceQuality = evidence): SkillTrend => ({
    skillId: skill.id,
    label,
    evidence: ev,
    comparison,
    points,
    baselineOnly,
    summary,
    reasons,
  });

  const pctTxt = `${curPoint.jobs}/${curPoint.n}`;
  if (skill.foundational) {
    return done('foundational', `Transferable concept; appears in ${pctTxt} jobs.`, curPoint.n >= cfg.minSample ? 'high' : 'low');
  }
  if (curPoint.n < cfg.minSample) return done('uncertain', `Sample of ${curPoint.n} is below the ${cfg.minSample}-job minimum.`, 'low');
  if (curPoint.jobs < cfg.minMentions) {
    reasons.push(`Only ${curPoint.jobs} mention(s); at least ${cfg.minMentions} are needed for a label.`);
    return done('uncertain', `Too few mentions (${pctTxt}) to classify.`, 'low');
  }

  // Declining: ≥2 comparable earlier samples, monotonic non-increasing, meaningful net change.
  if (comparablePrev.length >= 2) {
    const series = [...comparablePrev, curPoint];
    const monotonicDown = series.every((p, i) => i === 0 || p.pct <= series[i - 1]!.pct + 0.005);
    const first = series[0]!;
    const net = compareProportions(first.jobs, first.n, curPoint.jobs, curPoint.n, cfg);
    if (monotonicDown && net.meaningful && net.diff < 0) {
      reasons.push(`Fell across ${series.length} comparable samples (${series.map((p) => Math.round(p.pct * 100) + '%').join(' → ')}).`);
      return done('declining', `Down ${Math.abs(Math.round(net.diff * 100))} pts over ${series.length} comparable samples.`);
    }
  }

  if (comparison?.meaningful && comparison.diff > 0) {
    const sig = `+${comparison.deltaPP.toFixed(0)} pts vs ${comparison.previous.label} (${comparison.previous.jobs}/${comparison.previous.n} → ${pctTxt})`;
    if (curPoint.pct >= cfg.establishedPct) {
      reasons.push('Increase exceeds sampling noise (z ≥ 1.96 and ≥ 5 pts).');
      return done('growing', sig);
    }
    reasons.push('Meaningful increase from a low base.');
    return done('emerging', `${sig}; still a small share of jobs.`);
  }
  if (comparison?.meaningful && comparison.diff < 0) {
    reasons.push('Single comparable sample shows a drop; a second comparable sample is needed before calling it Declining.');
    return done('uncertain', `Possible decline (${comparison.deltaPP.toFixed(0)} pts) — needs another comparable sample.`, 'low');
  }

  // Emerging: newly appearing, still small.
  if (lastPrev && lastPrev.jobs === 0 && curPoint.pct < cfg.establishedPct) {
    return done('emerging', `Not present in ${lastPrev.label}; now in ${pctTxt} jobs.`);
  }

  // Specialized: concentrated in one segment that is not simply the whole sample.
  if (
    concentrationInfo &&
    concentrationInfo.share >= cfg.specializedShare &&
    concentrationInfo.segmentShare <= cfg.specializedMaxSegmentShare &&
    curPoint.pct < 0.3
  ) {
    return done(
      'specialized',
      `${Math.round(concentrationInfo.share * 100)}% of mentions sit in “${concentrationInfo.key}”, which is ${Math.round(concentrationInfo.segmentShare * 100)}% of the sample.`,
    );
  }

  if (curPoint.pct >= cfg.establishedPct) {
    const stable = comparison ? `Stable vs ${comparison.previous.label} (${comparison.deltaPP >= 0 ? '+' : ''}${comparison.deltaPP.toFixed(0)} pts, within noise).` : 'Baseline established; trend not yet available.';
    return done('established', `In ${pctTxt} jobs. ${stable}`);
  }

  return done(
    'uncertain',
    baselineOnly ? `In ${pctTxt} jobs. Baseline established; trend not yet available.` : `In ${pctTxt} jobs; low share and no clear movement.`,
  );
}

export const LABEL_DESCRIPTIONS: Record<SkillLabel, string> = {
  foundational: 'A transferable concept or practice rather than a specific tool.',
  established: 'Widely required today with meaningful demand across the sample.',
  growing: 'A statistically meaningful increase across comparable samples.',
  emerging: 'New or small share with early evidence of growth. Treat as a watch-list item.',
  specialized: 'Concentrated in a particular segment (industry or company type) rather than broad demand.',
  declining: 'A sustained, meaningful reduction across at least three comparable samples.',
  uncertain: 'Not enough comparable evidence for a reliable classification.',
};
