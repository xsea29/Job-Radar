import { describe, expect, it } from 'vitest';
import { buildDemoDataset, DEMO_PROFILE } from '@jobradar/demo';
import { computeDemand } from '@jobradar/core';
import { analyze } from './analyze';

const now = new Date('2026-10-27T08:00:00Z');

describe('analyze (demo evidence + core engines)', () => {
  const a = analyze(buildDemoDataset({ now, roleId: 'fullstack', scenario: 'complete' }), DEMO_PROFILE);

  it('derives demand only from the evidence base, not from new-since-scan postings', () => {
    expect(a.demand.n).toBe(100);
    expect(a.jobs.length).toBe(114);
    const recomputed = computeDemand(a.evidence.sampleJobs.map((j) => ({ id: j.id, companyId: j.companyId, companyCategory: j.companyCategory, roleId: j.normalizedRole, skills: j.skills })));
    expect(recomputed.skills.map((s) => [s.skillId, s.jobs])).toEqual(a.demand.skills.map((s) => [s.skillId, s.jobs]));
  });

  it('every skill count equals the number of source jobs that actually list it', () => {
    for (const s of a.demand.skills.slice(0, 20)) {
      const n = a.evidence.sampleJobs.filter((j) => j.skills.some((x) => x.skillId === s.skillId)).length;
      expect(s.jobs).toBe(n);
    }
  });

  it('keeps the denominator in the partial scenario', () => {
    const p = analyze(buildDemoDataset({ now, roleId: 'fullstack', scenario: 'partial' }), DEMO_PROFILE);
    expect(p.demand.n).toBe(63);
    expect(p.evidence.scanSummary.label).toBe('63/100');
    expect(p.demand.skills.every((s) => s.n === 63)).toBe(true);
  });

  it('produces a match for every job and a gap analysis without strengths in the gaps', () => {
    expect(a.jobs.every((j) => j.match.components.length === 6)).toBe(true);
    expect(a.gap.gaps.every((g) => g.status !== 'strength')).toBe(true);
    expect(a.roadmap.flatMap((p) => p.items).length).toBeGreaterThan(0);
  });

  it('builds seven daily reports, today first, and stays quiet when nothing is significant', () => {
    expect(a.reports).toHaveLength(7);
    expect(a.reports[0]!.date > a.reports[6]!.date).toBe(true);
    for (const r of a.reports) expect(r.notify.send ? r.notify.reasons.length > 0 : r.notify.reasons[0]).toBeTruthy();
  });

  it('supports other roles', () => {
    for (const roleId of ['frontend', 'backend', 'software'] as const) {
      const x = analyze(buildDemoDataset({ now, roleId, scenario: 'complete' }), { ...DEMO_PROFILE, targetRoleId: roleId });
      expect(x.demand.n).toBe(100);
    }
  });
});
