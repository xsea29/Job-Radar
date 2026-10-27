import type { GapAction, GapItem, GapTier } from './gap';
import { guideFor } from './learning';
import { getSkill, skillName } from './taxonomy';

/**
 * Personalised roadmap, derived entirely from the gap analysis.
 * Phase 1 – essential gaps; Phase 2 – deepen what employers weigh;
 * Phase 3 – watch list and "show, don't relearn" items.
 */

export interface RoadmapMilestone {
  id: string;
  label: string;
}

export interface RoadmapItem {
  id: string;
  skillId: string;
  title: string;
  tier: GapTier;
  action: GapAction;
  /** Evidence line, e.g. "Required in 41/100 jobs". */
  why: string;
  nextStep: string;
  project: string;
  milestones: RoadmapMilestone[];
  hours: number;
}

export interface RoadmapPhase {
  id: 'close' | 'deepen' | 'watch';
  title: string;
  subtitle: string;
  items: RoadmapItem[];
  totalHours: number;
  /** Week range at the user's weekly learning budget, e.g. [1, 4]. */
  weeks: [number, number];
}

const ACTION_VERB: Record<GapAction, string> = {
  learn: 'Learn',
  'build-on': 'Build on your base:',
  deepen: 'Deepen',
  transfer: 'Show transfer:',
  watch: 'Watch',
  skip: 'Skip',
  maintain: 'Maintain',
};

function toItem(g: GapItem): RoadmapItem {
  const guide = guideFor(g.skillId);
  const name = skillName(g.skillId);
  const hours = g.action === 'transfer' ? Math.min(6, Math.round(guide.hours / 3)) : g.action === 'deepen' ? Math.round(guide.hours * 0.7) : g.action === 'build-on' ? Math.round(guide.hours * 0.7) : guide.hours;
  return {
    id: g.skillId,
    skillId: g.skillId,
    title: `${ACTION_VERB[g.action]} ${name}`,
    tier: g.tier,
    action: g.action,
    why: `Required in ${g.raw.required}/${g.raw.n} jobs, preferred in ${g.raw.preferred}.`,
    nextStep: g.action === 'transfer' ? `Add a small project that shows ${name} through the related skill you already have.` : guide.nextStep,
    project: guide.project,
    milestones: guide.milestones.map((label, i) => ({ id: `${g.skillId}:${i}`, label })),
    hours,
  };
}

export function buildRoadmap(gaps: GapItem[], weeklyHours: number, opts: { maxClose?: number; maxDeepen?: number; maxWatch?: number } = {}): RoadmapPhase[] {
  const hoursPerWeek = Math.max(1, weeklyHours || 5);
  const maxClose = opts.maxClose ?? 3;
  const maxDeepen = opts.maxDeepen ?? 3;
  const maxWatch = opts.maxWatch ?? 3;
  const open = gaps.filter((g) => g.status !== 'strength');

  const close = open.filter((g) => g.tier === 'essential').slice(0, maxClose);
  const used = new Set(close.map((g) => g.skillId));
  const deepen = open.filter((g) => !used.has(g.skillId) && (g.tier === 'valuable' || (g.status === 'partial' && g.action !== 'skip'))).slice(0, maxDeepen);
  deepen.forEach((g) => used.add(g.skillId));
  const watch = open.filter((g) => !used.has(g.skillId) && (g.tier === 'speculative' || (g.action === 'transfer' && getSkill(g.skillId)?.group !== 'backend-lang'))).sort((a, b) => Number(b.tier === 'speculative') - Number(a.tier === 'speculative')).slice(0, maxWatch);

  const defs: { id: RoadmapPhase['id']; title: string; subtitle: string; items: GapItem[] }[] = [
    { id: 'close', title: 'Close the essential gaps', subtitle: 'Required by a meaningful share of the jobs you target.', items: close },
    { id: 'deepen', title: 'Deepen what employers weigh', subtitle: 'Valuable skills and areas where you are only at beginner level.', items: deepen },
    { id: 'watch', title: 'Watch list & transfer', subtitle: 'Limited evidence, or covered by skills you already have.', items: watch },
  ];

  let week = 1;
  const phases: RoadmapPhase[] = [];
  for (const d of defs) {
    const items = d.items.map(toItem);
    const totalHours = items.reduce((s, i) => s + i.hours, 0);
    const weeks = Math.max(items.length ? 1 : 0, Math.ceil(totalHours / hoursPerWeek));
    phases.push({ id: d.id, title: d.title, subtitle: d.subtitle, items, totalHours, weeks: [week, week + Math.max(0, weeks - 1)] });
    week += weeks;
  }
  return phases;
}
