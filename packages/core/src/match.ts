import { coverageFor } from './relations';
import type { MatchJob, MatchProfile, RoleId } from './types';

/**
 * Explainable job matching.
 *
 * Three distinct outputs, never blended silently:
 *   1. skillMatch      – how much of the job's stated skills the profile covers
 *   2. experience      – eligibility against the stated years (a status, not a score)
 *   3. overall         – a weighted estimate of suitability across components
 *
 * Missing data is NOT a negative: a component whose inputs are unknown is
 * marked "not scored" and its weight is redistributed over the rest.
 * The score estimates fit only — it does not predict interviews or offers.
 */

export interface MatchWeights {
  required: number;
  preferred: number;
  experience: number;
  role: number;
  location: number;
  salary: number;
}

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  required: 0.4,
  preferred: 0.1,
  experience: 0.15,
  role: 0.15,
  location: 0.1,
  salary: 0.1,
};

export interface MatchConfig {
  weights: MatchWeights;
  /** Credit for an equivalent / foundation-covered skill (0–1). */
  substituteCredit: number;
  /** Ignore extracted skills below this confidence. */
  minConfidence: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  weights: DEFAULT_MATCH_WEIGHTS,
  substituteCredit: 0.5,
  minConfidence: 0.5,
};

export type ExperienceStatus = 'eligible' | 'stretch' | 'under' | 'over' | 'unknown';
export type Suitability = 'strong' | 'good' | 'partial' | 'weak';

export interface MatchComponent {
  key: keyof MatchWeights;
  label: string;
  /** 0–1, or null when it could not be scored. */
  score: number | null;
  weight: number;
  /** Weight after redistributing over scored components. */
  effectiveWeight: number;
  note: string;
}

export interface SkillMatchDetail {
  /** 0–100, or null if the job lists no skills of this class. */
  requiredScore: number | null;
  preferredScore: number | null;
  /** Required skills the user lists directly. */
  matchedRequired: string[];
  /** Subset of matched skills covered through a more specific skill the user lists. */
  impliedRequired: { skillId: string; via: string[] }[];
  /** Covered through an equivalent / foundation skill. */
  partialRequired: { skillId: string; via: string[] }[];
  missingRequired: string[];
  matchedPreferred: string[];
  missingPreferred: string[];
}

export interface MatchResult {
  jobId: string;
  /** 0–100 weighted estimate; null only if nothing could be scored. */
  overall: number | null;
  suitability: Suitability | null;
  skillMatch: number | null;
  skills: SkillMatchDetail;
  experience: { status: ExperienceStatus; note: string };
  components: MatchComponent[];
  /** Plain-language reasons for the score. */
  explanation: string[];
}

const ROLE_AFFINITY: Record<RoleId, Record<RoleId, number>> = {
  fullstack: { fullstack: 1, software: 0.85, backend: 0.7, frontend: 0.7 },
  backend: { backend: 1, software: 0.85, fullstack: 0.7, frontend: 0.3 },
  frontend: { frontend: 1, software: 0.85, fullstack: 0.7, backend: 0.3 },
  software: { software: 1, fullstack: 0.85, backend: 0.85, frontend: 0.85 },
};

function experienceFit(years: number, exp?: { min?: number; max?: number }): { status: ExperienceStatus; score: number | null; note: string } {
  if (!exp || (exp.min == null && exp.max == null)) {
    return { status: 'unknown', score: null, note: 'No experience range stated. Not scored.' };
  }
  const min = exp.min ?? 0;
  const max = exp.max ?? Infinity;
  const range = exp.max != null ? `${min}–${exp.max} yrs` : `${min}+ yrs`;
  if (years >= min && years <= max) return { status: 'eligible', score: 1, note: `Your ${years} yrs fits the ${range} range.` };
  if (years > max) {
    const over = years - max;
    return { status: 'over', score: over <= 2 ? 0.85 : 0.65, note: `Above the stated ${range}; may read as over-experienced.` };
  }
  const gap = min - years;
  if (gap <= 1) return { status: 'stretch', score: 0.7, note: `${gap} yr under the stated ${range}. A stretch, not a bar.` };
  if (gap <= 2) return { status: 'stretch', score: 0.45, note: `${gap} yrs under the stated ${range}.` };
  return { status: 'under', score: 0.15, note: `${gap} yrs under the stated ${range}.` };
}

function locationFit(p: MatchProfile, j: MatchJob): { score: number | null; note: string } {
  if (!j.city && !j.country && !j.workArrangement) return { score: null, note: 'Location not stated. Not scored.' };
  const cityOk = j.city ? p.cities.map((c) => c.toLowerCase()).includes(j.city.toLowerCase()) : false;
  const arrangementOk = j.workArrangement ? p.workArrangements.includes(j.workArrangement) : true;
  if (j.workArrangement === 'remote') {
    return p.acceptsRemote ? { score: 1, note: 'Remote role; you are open to remote.' } : { score: 0.4, note: 'Remote role; remote is not in your preferences.' };
  }
  if (cityOk && arrangementOk) return { score: 1, note: `${j.city}, ${j.workArrangement ?? 'on-site'} matches your preferences.` };
  if (cityOk) return { score: 0.6, note: `${j.city} fits, but ${j.workArrangement} is not a preferred arrangement.` };
  if (j.country && p.countries.map((c) => c.toLowerCase()).includes(j.country.toLowerCase())) {
    return { score: 0.45, note: `Same country, outside your preferred cities${j.city ? ` (${j.city})` : ''}.` };
  }
  return { score: 0.1, note: 'Outside your target locations.' };
}

function salaryFit(p: MatchProfile, j: MatchJob): { score: number | null; note: string } {
  const js = j.salary;
  const ps = p.expectedSalary;
  if (!js || (js.min == null && js.max == null)) return { score: null, note: 'Salary not published. Not scored.' };
  if (!ps || (ps.min == null && ps.max == null)) return { score: null, note: 'No salary expectation set. Not scored.' };
  if (js.currency !== ps.currency) return { score: null, note: `Different currency (${js.currency}). Not scored.` };
  const jobMax = js.max ?? js.min!;
  const wantMin = ps.min ?? ps.max!;
  if (jobMax >= wantMin) return { score: 1, note: 'Published range reaches your minimum.' };
  const ratio = jobMax / wantMin;
  return { score: Math.max(0, Math.min(1, (ratio - 0.6) / 0.4)), note: `Published top of range is ${Math.round((1 - ratio) * 100)}% below your minimum.` };
}

export function computeMatch(profile: MatchProfile, job: MatchJob, cfg: MatchConfig = DEFAULT_MATCH_CONFIG): MatchResult {
  const usable = job.skills.filter((s) => s.confidence >= cfg.minConfidence);
  const required = usable.filter((s) => s.requirement === 'required');
  const preferred = usable.filter((s) => s.requirement === 'preferred');

  const have = profile.skills;
  const haveIds = new Set(have.map((s) => s.skillId));
  const detail: SkillMatchDetail = {
    requiredScore: null,
    preferredScore: null,
    matchedRequired: [],
    impliedRequired: [],
    partialRequired: [],
    missingRequired: [],
    matchedPreferred: [],
    missingPreferred: [],
  };

  // Alternatives ("React, Vue or Angular"): satisfied if ANY alternative in the group is held.
  const altSatisfied = (skillId: string) => {
    const mates = required.filter((r) => r.isAlternative);
    return mates.some((m) => haveIds.has(m.skillId)) && mates.some((m) => m.skillId === skillId);
  };

  let reqCredit = 0;
  for (const r of required) {
    const cov = coverageFor(r.skillId, have);
    if (cov.kind === 'direct' || cov.kind === 'implied') {
      detail.matchedRequired.push(r.skillId);
      if (cov.kind === 'implied') detail.impliedRequired.push({ skillId: r.skillId, via: cov.via });
      reqCredit += 1;
      continue;
    }
    if (r.isAlternative && altSatisfied(r.skillId)) {
      reqCredit += 1;
      detail.matchedRequired.push(r.skillId);
      continue;
    }
    if (cov.kind === 'equivalent' || cov.kind === 'foundation') {
      reqCredit += cfg.substituteCredit * cov.transfer;
      detail.partialRequired.push({ skillId: r.skillId, via: cov.via });
    } else {
      detail.missingRequired.push(r.skillId);
    }
  }
  if (required.length) detail.requiredScore = Math.round((reqCredit / required.length) * 100);

  let prefCredit = 0;
  for (const r of preferred) {
    const cov = coverageFor(r.skillId, have);
    if (cov.kind === 'direct' || cov.kind === 'implied') {
      detail.matchedPreferred.push(r.skillId);
      prefCredit += 1;
    } else {
      if (cov.kind === 'equivalent' || cov.kind === 'foundation') prefCredit += cfg.substituteCredit * cov.transfer;
      detail.missingPreferred.push(r.skillId);
    }
  }
  if (preferred.length) detail.preferredScore = Math.round((prefCredit / preferred.length) * 100);

  const exp = experienceFit(profile.yearsExperience, job.experience);
  const loc = locationFit(profile, job);
  const sal = salaryFit(profile, job);
  const roleScore = ROLE_AFFINITY[profile.targetRoleId]?.[job.roleId] ?? 0.4;

  const raw: { key: keyof MatchWeights; label: string; score: number | null; note: string }[] = [
    {
      key: 'required',
      label: 'Required skills',
      score: detail.requiredScore == null ? null : detail.requiredScore / 100,
      note: required.length
        ? `${detail.matchedRequired.length} of ${required.length} required skills listed${detail.partialRequired.length ? `, ${detail.partialRequired.length} partly covered by similar skills` : ''}.`
        : 'No required skills extracted. Not scored.',
    },
    {
      key: 'preferred',
      label: 'Preferred skills',
      score: detail.preferredScore == null ? null : detail.preferredScore / 100,
      note: preferred.length ? `${detail.matchedPreferred.length} of ${preferred.length} preferred skills listed.` : 'No preferred skills extracted. Not scored.',
    },
    { key: 'experience', label: 'Experience', score: exp.score, note: exp.note },
    {
      key: 'role',
      label: 'Role alignment',
      score: roleScore,
      note: roleScore === 1 ? 'Same role family as your target.' : 'Adjacent role family.',
    },
    { key: 'location', label: 'Location & arrangement', score: loc.score, note: loc.note },
    { key: 'salary', label: 'Salary', score: sal.score, note: sal.note },
  ];

  const scoredWeight = raw.reduce((s, c) => s + (c.score == null ? 0 : cfg.weights[c.key]), 0);
  const components: MatchComponent[] = raw.map((c) => ({
    ...c,
    weight: cfg.weights[c.key],
    effectiveWeight: c.score == null || scoredWeight === 0 ? 0 : cfg.weights[c.key] / scoredWeight,
  }));
  const overall = scoredWeight === 0 ? null : Math.round(components.reduce((s, c) => s + (c.score ?? 0) * c.effectiveWeight, 0) * 100);

  const skillParts = [detail.requiredScore, detail.preferredScore].filter((x): x is number => x != null);
  const skillMatch =
    detail.requiredScore != null && detail.preferredScore != null
      ? Math.round(detail.requiredScore * 0.8 + detail.preferredScore * 0.2)
      : skillParts[0] ?? null;

  const suitability: Suitability | null = overall == null ? null : overall >= 75 ? 'strong' : overall >= 60 ? 'good' : overall >= 45 ? 'partial' : 'weak';

  const explanation: string[] = [];
  if (detail.missingRequired.length) explanation.push(`Missing ${detail.missingRequired.length} required skill${detail.missingRequired.length > 1 ? 's' : ''}.`);
  if (detail.partialRequired.length) explanation.push(`${detail.partialRequired.length} required skill${detail.partialRequired.length > 1 ? 's are' : ' is'} partly covered by related skills (credited at ${Math.round(cfg.substituteCredit * 100)}%).`);
  const unscored = components.filter((c) => c.score == null).map((c) => c.label.toLowerCase());
  if (unscored.length) explanation.push(`Not scored (missing data): ${unscored.join(', ')}. This is not counted against you.`);

  return {
    jobId: job.id,
    overall,
    suitability,
    skillMatch,
    skills: detail,
    experience: { status: exp.status, note: exp.note },
    components,
    explanation,
  };
}
