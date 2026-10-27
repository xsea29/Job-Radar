import type { CompanyCategory, DemandJob, Requirement } from './types';

/**
 * Deterministic demand aggregation. Every statistic shown in the app is the
 * output of these functions over stored job records — never an AI estimate —
 * and every row keeps the ids of the jobs it was computed from so the UI can
 * open the evidence.
 */

export const CATEGORIES: CompanyCategory[] = ['startup', 'mid', 'large'];

export interface CategoryBreakdown {
  /** Jobs in this category in the sample (denominator). */
  n: number;
  jobs: number;
  required: number;
  preferred: number;
  pct: number;
}

export interface SkillDemand {
  skillId: string;
  jobs: number;
  required: number;
  preferred: number;
  mentioned: number;
  /** Denominator for all percentages below. */
  n: number;
  pct: number;
  requiredPct: number;
  preferredPct: number;
  byCategory: Record<CompanyCategory, CategoryBreakdown>;
  /** Ids of the jobs that mention the skill (any classification). */
  jobIds: string[];
}

export interface DemandTable {
  n: number;
  categoryN: Record<CompanyCategory, number>;
  unclassifiedN: number;
  skills: SkillDemand[];
  bySkill: Map<string, SkillDemand>;
}

const RANK: Record<Requirement, number> = { required: 3, preferred: 2, mentioned: 1 };

export function computeDemand(jobs: DemandJob[]): DemandTable {
  const n = jobs.length;
  const categoryN: Record<CompanyCategory, number> = { startup: 0, mid: 0, large: 0 };
  let unclassifiedN = 0;
  for (const j of jobs) {
    if (j.companyCategory === 'unclassified') unclassifiedN++;
    else categoryN[j.companyCategory]++;
  }

  const acc = new Map<string, SkillDemand>();
  const blank = (skillId: string): SkillDemand => ({
    skillId,
    jobs: 0,
    required: 0,
    preferred: 0,
    mentioned: 0,
    n,
    pct: 0,
    requiredPct: 0,
    preferredPct: 0,
    byCategory: {
      startup: { n: categoryN.startup, jobs: 0, required: 0, preferred: 0, pct: 0 },
      mid: { n: categoryN.mid, jobs: 0, required: 0, preferred: 0, pct: 0 },
      large: { n: categoryN.large, jobs: 0, required: 0, preferred: 0, pct: 0 },
    },
    jobIds: [],
  });

  for (const job of jobs) {
    // One record per (job, skill): keep the strongest classification.
    const strongest = new Map<string, Requirement>();
    for (const s of job.skills) {
      const prev = strongest.get(s.skillId);
      if (!prev || RANK[s.requirement] > RANK[prev]) strongest.set(s.skillId, s.requirement);
    }
    for (const [skillId, req] of strongest) {
      const d = acc.get(skillId) ?? blank(skillId);
      d.jobs++;
      d[req]++;
      d.jobIds.push(job.id);
      if (job.companyCategory !== 'unclassified') {
        const c = d.byCategory[job.companyCategory];
        c.jobs++;
        if (req === 'required') c.required++;
        if (req === 'preferred') c.preferred++;
      }
      acc.set(skillId, d);
    }
  }

  for (const d of acc.values()) {
    d.pct = n ? d.jobs / n : 0;
    d.requiredPct = n ? d.required / n : 0;
    d.preferredPct = n ? d.preferred / n : 0;
    for (const cat of CATEGORIES) {
      const c = d.byCategory[cat];
      c.pct = c.n ? c.jobs / c.n : 0;
    }
  }

  const skills = [...acc.values()].sort((a, b) => b.jobs - a.jobs || b.required - a.required || a.skillId.localeCompare(b.skillId));
  return { n, categoryN, unclassifiedN, skills, bySkill: new Map(skills.map((s) => [s.skillId, s])) };
}

// ---------------------------------------------------------------------------
// Generic breakdowns (role / experience / location / industry)
// ---------------------------------------------------------------------------

export interface BreakdownRow {
  key: string;
  n: number;
  jobs: number;
  required: number;
  pct: number;
  /** False when the segment is smaller than `minSample`: show, but warn. */
  reliable: boolean;
}

export function experienceBand(job: Pick<DemandJob, 'experience'>): string {
  const min = job.experience?.min;
  if (min == null) return 'Not stated';
  if (min <= 2) return '0–2 yrs';
  if (min <= 5) return '3–5 yrs';
  if (min <= 8) return '6–8 yrs';
  return '9+ yrs';
}

export function breakdownBy(
  jobs: DemandJob[],
  skillId: string,
  keyFn: (j: DemandJob) => string | undefined,
  minSample = 8,
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const j of jobs) {
    const key = keyFn(j);
    if (!key) continue;
    const row = rows.get(key) ?? { key, n: 0, jobs: 0, required: 0, pct: 0, reliable: false };
    row.n++;
    const hit = j.skills.filter((s) => s.skillId === skillId);
    if (hit.length) {
      row.jobs++;
      if (hit.some((s) => s.requirement === 'required')) row.required++;
    }
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, pct: r.n ? r.jobs / r.n : 0, reliable: r.n >= minSample }))
    .sort((a, b) => b.n - a.n);
}

export interface Concentration {
  key: string;
  /** Share of this skill's mentions that fall in the segment. */
  share: number;
  /** Share of the whole sample that the segment makes up. */
  segmentShare: number;
  count: number;
}

/** Where is the skill concentrated? Used by the "Specialized" label. */
export function concentration(
  jobs: DemandJob[],
  skillId: string,
  keyFn: (j: DemandJob) => string | undefined,
): Concentration | null {
  const total = new Map<string, number>();
  const hits = new Map<string, number>();
  let hitTotal = 0;
  for (const j of jobs) {
    const k = keyFn(j);
    if (!k) continue;
    total.set(k, (total.get(k) ?? 0) + 1);
    if (j.skills.some((s) => s.skillId === skillId)) {
      hits.set(k, (hits.get(k) ?? 0) + 1);
      hitTotal++;
    }
  }
  if (!hitTotal) return null;
  let best: Concentration | null = null;
  for (const [k, c] of hits) {
    const share = c / hitTotal;
    if (!best || share > best.share) best = { key: k, share, segmentShare: (total.get(k) ?? 0) / jobs.length, count: c };
  }
  return best;
}

export function formatCount(jobs: number, n: number): string {
  return `${jobs}/${n} jobs (${n ? Math.round((jobs / n) * 100) : 0}%)`;
}
