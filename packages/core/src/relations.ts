import { getSkill } from './taxonomy';
import type { ProfileSkill, SkillLevel } from './types';

/**
 * How well does a profile already cover a skill?
 *  - `direct`     : the user lists the skill itself.
 *  - `implied`    : the user lists a specific tool that embodies this concept
 *                   (Jest ⇒ unit testing, PostgreSQL ⇒ SQL, Express ⇒ Node.js).
 *  - `equivalent` : a different skill in the same substitution group
 *                   (Vue ↔ React, GCP ↔ AWS, Jenkins ↔ GitHub Actions, Node.js ↔ Java).
 *  - `foundation` : the user has every skill this one builds on (Next.js ← React),
 *                   so the learning distance is small.
 *  - `none`
 */
export type CoverageKind = 'direct' | 'implied' | 'equivalent' | 'foundation' | 'none';

export interface Coverage {
  kind: CoverageKind;
  level?: SkillLevel;
  /** Skill ids that provide the coverage. */
  via: string[];
  /** 0–1 multiplier on substitute credit (how well the skills transfer). */
  transfer: number;
}

const LEVEL_RANK: Record<SkillLevel, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Different languages share concepts but jobs that name one rarely accept another. */
const GROUP_TRANSFER: Record<string, number> = { 'backend-lang': 0.5, 'frontend-framework': 0.8 };

export function coverageFor(skillId: string, have: ProfileSkill[]): Coverage {
  const map = new Map(have.map((s) => [s.skillId, s.level]));
  const direct = map.get(skillId);
  if (direct) return { kind: 'direct', level: direct, via: [skillId], transfer: 1 };

  const def = getSkill(skillId);
  const implying = (def?.impliedBy ?? []).filter((id) => map.has(id));
  if (implying.length) {
    const best = implying.map((id) => map.get(id)!).sort((a, b) => LEVEL_RANK[b] - LEVEL_RANK[a])[0]!;
    return { kind: 'implied', level: best, via: implying, transfer: 1 };
  }
  if (def?.group) {
    const peers = have.filter((h) => h.skillId !== skillId && getSkill(h.skillId)?.group === def.group && LEVEL_RANK[h.level] >= 2);
    if (peers.length) return { kind: 'equivalent', level: peers[0]!.level, via: peers.map((p) => p.skillId), transfer: GROUP_TRANSFER[def.group] ?? 1 };
  }
  if (def?.buildsOn?.length && def.buildsOn.every((b) => map.has(b))) {
    return { kind: 'foundation', via: def.buildsOn, transfer: 1 };
  }
  return { kind: 'none', via: [], transfer: 0 };
}

export function hasSkill(skillId: string, have: ProfileSkill[]): boolean {
  return have.some((s) => s.skillId === skillId);
}
