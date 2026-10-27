import { coverageFor, type Coverage } from './relations';
import { getSkill } from './taxonomy';
import type { DemandTable } from './demand';
import type { SkillTrend } from './trend';
import type { DemandJob, MatchProfile, SkillCategoryId, SkillLabel } from './types';

/**
 * Transparent skill-gap prioritisation.
 *
 *   priority = 100 × Σ wᵢ·xᵢ      (all xᵢ normalised to 0–1)
 *
 *   x₁ roleRelevance   share of *target-role* jobs that mention the skill
 *   x₂ prevalence      share of all analysed jobs that mention the skill
 *   x₃ requiredShare   share of all analysed jobs that list it as required
 *   x₄ gapNeed         how much the user's profile is missing it (1 = absent)
 *   x₅ sustained       evidence of durable demand, from the trend label
 *
 * Inputs x₁–x₃ are divided by a cap (a share at or above the cap scores 1) so
 * a skill needn't be in every job to rank highly. Weights, caps and thresholds
 * are config, exposed in the UI, and every score keeps its per-term points.
 */

export interface GapWeights {
  roleRelevance: number;
  prevalence: number;
  requiredShare: number;
  gapNeed: number;
  sustained: number;
}

export interface GapConfig {
  weights: GapWeights;
  caps: { roleRelevance: number; prevalence: number; requiredShare: number };
  essentialPriority: number;
  valuablePriority: number;
  essentialMinRequiredShare: number;
  /** Skills seen in fewer jobs than this are not scored. */
  minJobs: number;
  /** Categories never offered as "learn this" (soft practices). Existing strengths still show. */
  excludeCategories: SkillCategoryId[];
  /** Below this prevalence a skill can only be "speculative" or "optional". */
  speculativeBelowPrevalence: number;
  sustainedByLabel: Record<SkillLabel, number>;
}

export const DEFAULT_GAP_CONFIG: GapConfig = {
  weights: { roleRelevance: 0.2, prevalence: 0.25, requiredShare: 0.3, gapNeed: 0.15, sustained: 0.1 },
  caps: { roleRelevance: 0.6, prevalence: 0.6, requiredShare: 0.5 },
  essentialPriority: 58,
  valuablePriority: 44,
  essentialMinRequiredShare: 0.15,
  minJobs: 4,
  excludeCategories: ['practices'],
  speculativeBelowPrevalence: 0.08,
  sustainedByLabel: {
    foundational: 1,
    established: 0.9,
    growing: 0.85,
    specialized: 0.5,
    uncertain: 0.5,
    emerging: 0.4,
    declining: 0.1,
  },
};

export type GapStatus = 'strength' | 'partial' | 'covered' | 'gap';
export type GapTier = 'essential' | 'valuable' | 'optional' | 'speculative' | 'none';
export type GapAction = 'learn' | 'build-on' | 'deepen' | 'transfer' | 'watch' | 'skip' | 'maintain';

export interface GapItem {
  skillId: string;
  status: GapStatus;
  tier: GapTier;
  action: GapAction;
  /** 0–100; 0 for strengths. */
  priority: number;
  /** Raw (pre-cap) values for display. */
  raw: { prevalence: number; requiredShare: number; preferredShare: number; roleRelevance: number; jobs: number; required: number; preferred: number; n: number };
  /** Normalised 0–1 inputs. */
  inputs: GapWeights;
  /** Points contributed by each term (sum ≈ priority). */
  points: GapWeights;
  coverage: Coverage;
  label: SkillLabel;
  rationale: string[];
}

export interface GapAnalysis {
  items: GapItem[];
  strengths: GapItem[];
  gaps: GapItem[];
  config: GapConfig;
  /** Skills the user lists that were not seen in the sample. */
  unseenUserSkills: string[];
  targetRoleJobCount: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function gapNeedFor(cov: Coverage): number {
  switch (cov.kind) {
    case 'none':
      return 1;
    case 'foundation':
      return 0.5;
    case 'equivalent':
      return 0.3;
    case 'direct':
    case 'implied':
      return cov.level === 'beginner' ? 0.5 : cov.level === 'intermediate' ? 0.15 : 0;
  }
}

export function computeGapAnalysis(args: {
  demand: DemandTable;
  trends: Map<string, SkillTrend>;
  profile: MatchProfile;
  jobs: DemandJob[];
  config?: GapConfig;
}): GapAnalysis {
  const cfg = args.config ?? DEFAULT_GAP_CONFIG;
  const { demand, trends, profile, jobs } = args;
  const targetJobs = jobs.filter((j) => j.roleId === profile.targetRoleId);
  const useRole = targetJobs.length >= 5;

  const items: GapItem[] = [];
  for (const d of demand.skills) {
    if (d.jobs < cfg.minJobs) continue;
    const cov = coverageFor(d.skillId, profile.skills);
    const cat = getSkill(d.skillId)?.category;
    if (cat && cfg.excludeCategories.includes(cat) && cov.kind !== 'direct') continue;
    const trend = trends.get(d.skillId);
    const label: SkillLabel = trend?.label ?? 'uncertain';

    const roleHits = useRole ? targetJobs.filter((j) => j.skills.some((s) => s.skillId === d.skillId && s.requirement !== 'mentioned')).length : 0;
    const roleRelevance = useRole ? roleHits / targetJobs.length : d.pct;

    const need = gapNeedFor(cov);
    const inputs: GapWeights = {
      roleRelevance: clamp01(roleRelevance / cfg.caps.roleRelevance),
      prevalence: clamp01(d.pct / cfg.caps.prevalence),
      requiredShare: clamp01(d.requiredPct / cfg.caps.requiredShare),
      gapNeed: need,
      sustained: cfg.sustainedByLabel[label],
    };
    const w = cfg.weights;
    const points: GapWeights = {
      roleRelevance: 100 * w.roleRelevance * inputs.roleRelevance,
      prevalence: 100 * w.prevalence * inputs.prevalence,
      requiredShare: 100 * w.requiredShare * inputs.requiredShare,
      gapNeed: 100 * w.gapNeed * inputs.gapNeed,
      sustained: 100 * w.sustained * inputs.sustained,
    };

    const listed = cov.kind === 'direct' || cov.kind === 'implied';
    const isStrength = listed && (cov.level === 'intermediate' || cov.level === 'advanced');
    const status: GapStatus = isStrength ? 'strength' : cov.kind === 'equivalent' ? 'covered' : listed ? 'partial' : 'gap';
    const priority = status === 'strength' ? 0 : Math.round(Object.values(points).reduce((a, b) => a + b, 0));

    const rationale: string[] = [];
    rationale.push(`Required in ${d.required}/${d.n} jobs (${pct(d.requiredPct)}), preferred in ${d.preferred}.`);
    if (useRole) rationale.push(`Listed (required or preferred) in ${roleHits}/${targetJobs.length} ${'target-role'} jobs.`);

    let tier: GapTier = 'none';
    let action: GapAction = 'maintain';
    if (status === 'strength') {
      tier = 'none';
      action = 'maintain';
      rationale.push(cov.kind === 'implied' ? `Covered by ${cov.via.map((v) => getSkill(v)?.name ?? v).join(', ')}, which you list.` : 'You already list this at a working level.');
    } else if (label === 'declining') {
      tier = 'optional';
      action = 'skip';
      rationale.push('Demand is declining across comparable samples. Low priority.');
    } else if (status === 'covered') {
      tier = 'optional';
      action = 'transfer';
      const peers = cov.via.map((v) => getSkill(v)?.name ?? v).join(', ');
      rationale.push(
        getSkill(d.skillId)?.group === 'backend-lang'
          ? `You already work in ${peers}. This is an alternative backend stack: learn it only if you want roles that name it.`
          : `You already have ${peers}. A similar skill, so show how it transfers rather than learning a new tool.`,
      );
    } else {
      const speculative = label === 'emerging' || d.pct < cfg.speculativeBelowPrevalence;
      if (priority >= cfg.essentialPriority && d.requiredPct >= cfg.essentialMinRequiredShare) tier = 'essential';
      else if (speculative) tier = 'speculative';
      else if (priority >= cfg.valuablePriority) tier = 'valuable';
      else tier = 'optional';
      action = status === 'partial' ? 'deepen' : cov.kind === 'foundation' ? 'build-on' : tier === 'speculative' ? 'watch' : 'learn';
      if (cov.kind === 'foundation') rationale.push(`Builds on ${cov.via.map((v) => getSkill(v)?.name ?? v).join(', ')}, which you already have.`);
      if (status === 'partial') rationale.push('You list this at beginner level; employers ask for working depth.');
      if (tier === 'speculative') rationale.push('Evidence is limited. Watch, don’t prioritise.');
    }

    items.push({
      skillId: d.skillId,
      status,
      tier,
      action,
      priority,
      raw: { prevalence: d.pct, requiredShare: d.requiredPct, preferredShare: d.preferredPct, roleRelevance, jobs: d.jobs, required: d.required, preferred: d.preferred, n: d.n },
      inputs,
      points,
      coverage: cov,
      label,
      rationale,
    });
  }

  items.sort((a, b) => b.priority - a.priority || b.raw.jobs - a.raw.jobs);
  const seen = new Set(demand.skills.map((s) => s.skillId));
  return {
    items,
    strengths: items.filter((i) => i.status === 'strength').sort((a, b) => b.raw.jobs - a.raw.jobs),
    gaps: items.filter((i) => i.status !== 'strength'),
    config: cfg,
    unseenUserSkills: profile.skills.filter((s) => !seen.has(s.skillId)).map((s) => s.skillId),
    targetRoleJobCount: targetJobs.length,
  };
}
