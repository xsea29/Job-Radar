import type { DemandTable } from './demand';
import type { GapItem } from './gap';
import type { SkillTrend } from './trend';
import { skillName } from './taxonomy';
import type { Requirement } from './types';

/**
 * Daily report assembly and notification-significance rules.
 * Everything here is derived from stored records; no free-text generation.
 */

export interface ReportJobInput {
  id: string;
  title: string;
  company: string;
  match: number | null;
  firstSeenAt: string;
  skills: { skillId: string; requirement: Requirement }[];
}

export interface SourceHealthInput {
  id: string;
  name: string;
  status: 'ok' | 'delayed' | 'failed' | 'not_connected';
  /** Consecutive days failing. */
  failingDays: number;
}

export interface ReportConfig {
  /** Notify when a new job scores at or above this. */
  matchNotifyThreshold: number;
  /** Minimum new required-mentions before calling something a new requirement. */
  newRequirementMinCount: number;
  /** New required-rate must be this multiple of the sample rate. */
  newRequirementLift: number;
  maxBestMatches: number;
}

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  matchNotifyThreshold: 70,
  newRequirementMinCount: 2,
  newRequirementLift: 2,
  maxBestMatches: 3,
};

export interface NewRequirement {
  skillId: string;
  requiredInNew: number;
  newN: number;
  sampleRequired: number;
  sampleN: number;
  note: string;
}

export interface DemandChange {
  skillId: string;
  label: SkillTrend['label'];
  deltaPP: number;
  summary: string;
}

export interface DailyReport {
  date: string;
  since: string;
  newJobIds: string[];
  bestMatchIds: string[];
  newRequirements: NewRequirement[];
  demandChanges: DemandChange[];
  gapFocus?: { skillId: string; priority: number; note: string };
  recommendedAction: { title: string; detail: string; skillId?: string };
  sources: { ok: number; delayed: number; failed: number; notConnected: number; issues: string[] };
  notify: { send: boolean; reasons: string[] };
}

export function buildDailyReport(args: {
  date: string;
  since: string;
  newJobs: ReportJobInput[];
  demand: DemandTable;
  trends: SkillTrend[];
  gaps: GapItem[];
  sources: SourceHealthInput[];
  cfg?: ReportConfig;
}): DailyReport {
  const cfg = args.cfg ?? DEFAULT_REPORT_CONFIG;
  const { newJobs, demand, trends, gaps, sources } = args;

  const best = [...newJobs].filter((j) => j.match != null).sort((a, b) => (b.match ?? 0) - (a.match ?? 0)).slice(0, cfg.maxBestMatches);

  // New requirements: skills required disproportionately often in the new postings.
  const requiredInNew = new Map<string, number>();
  for (const j of newJobs) {
    for (const s of new Set(j.skills.filter((x) => x.requirement === 'required').map((x) => x.skillId))) {
      requiredInNew.set(s, (requiredInNew.get(s) ?? 0) + 1);
    }
  }
  const newRequirements: NewRequirement[] = [];
  for (const [skillId, c] of requiredInNew) {
    const sample = demand.bySkill.get(skillId);
    const sampleRate = sample ? sample.required / demand.n : 0;
    const newRate = newJobs.length ? c / newJobs.length : 0;
    if (c >= cfg.newRequirementMinCount && newRate >= Math.max(0.1, sampleRate * cfg.newRequirementLift)) {
      newRequirements.push({
        skillId,
        requiredInNew: c,
        newN: newJobs.length,
        sampleRequired: sample?.required ?? 0,
        sampleN: demand.n,
        note: `Required in ${c}/${newJobs.length} new postings vs ${sample?.required ?? 0}/${demand.n} in the baseline sample. Small sample: treat as a signal, not a trend.`,
      });
    }
  }
  newRequirements.sort((a, b) => b.requiredInNew - a.requiredInNew);

  const demandChanges: DemandChange[] = trends
    .filter((t) => t.comparison?.meaningful)
    .map((t) => ({ skillId: t.skillId, label: t.label, deltaPP: t.comparison!.deltaPP, summary: t.summary }))
    .sort((a, b) => Math.abs(b.deltaPP) - Math.abs(a.deltaPP))
    .slice(0, 4);

  const topGap = gaps.find((g) => g.tier === 'essential') ?? gaps.find((g) => g.tier === 'valuable');
  const gapFocus = topGap
    ? { skillId: topGap.skillId, priority: topGap.priority, note: `Required in ${topGap.raw.required}/${topGap.raw.n} jobs; you don’t list it yet.` }
    : undefined;

  const strongNew = best.filter((j) => (j.match ?? 0) >= cfg.matchNotifyThreshold);
  const recommendedAction = strongNew.length
    ? { title: `Review ${strongNew[0]!.title} at ${strongNew[0]!.company}`, detail: `Highest new match today (${strongNew[0]!.match}). Check the missing skills before applying.` }
    : gapFocus
      ? { title: `Spend this week on ${skillName(gapFocus.skillId)}`, detail: gapFocus.note, skillId: gapFocus.skillId }
      : { title: 'No action needed today', detail: 'Nothing in the new postings changes your plan.' };

  const issues = sources.filter((s) => s.status === 'failed' || s.status === 'delayed').map((s) => `${s.name}: ${s.status}${s.failingDays > 1 ? ` for ${s.failingDays} days` : ''}`);
  const reasons: string[] = [];
  if (strongNew.length) reasons.push(`${strongNew.length} new job${strongNew.length > 1 ? 's' : ''} match ≥ ${cfg.matchNotifyThreshold}.`);
  if (demandChanges.length) reasons.push('A skill-demand change exceeds sampling noise.');
  const persistent = sources.filter((s) => s.status === 'failed' && s.failingDays >= 2);
  if (persistent.length) reasons.push(`${persistent.length} source${persistent.length > 1 ? 's have' : ' has'} been failing for 2+ days.`);

  return {
    date: args.date,
    since: args.since,
    newJobIds: newJobs.map((j) => j.id),
    bestMatchIds: best.map((j) => j.id),
    newRequirements: newRequirements.slice(0, 3),
    demandChanges,
    gapFocus,
    recommendedAction,
    sources: {
      ok: sources.filter((s) => s.status === 'ok').length,
      delayed: sources.filter((s) => s.status === 'delayed').length,
      failed: sources.filter((s) => s.status === 'failed').length,
      notConnected: sources.filter((s) => s.status === 'not_connected').length,
      issues,
    },
    notify: { send: reasons.length > 0, reasons: reasons.length ? reasons : ['Nothing significant changed. No push notification sent.'] },
  };
}
