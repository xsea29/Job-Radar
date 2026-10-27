import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_CONFIG,
  DEFAULT_SCAN_CONFIG,
  broadeningSteps,
  buildDailyReport,
  buildRoadmap,
  canonicalJobKey,
  checkComparability,
  classifyCompany,
  classifySkillTrend,
  compareProportions,
  computeDemand,
  computeGapAnalysis,
  computeMatch,
  contentHash,
  formatCount,
  getSkill,
  summarizeScan,
  type DemandJob,
  type DemandSnapshot,
  type MatchProfile,
  type ScanCandidate,
} from '../src';

const mix = { startup: 35, mid: 30, large: 35 };
function snap(id: string, end: string, n: number, counts: Record<string, number>, over: Partial<DemandSnapshot> = {}): DemandSnapshot {
  return {
    id,
    label: id,
    startDate: end,
    endDate: end,
    n,
    roleId: 'fullstack',
    region: 'IN',
    experienceBand: '3-6',
    companyMix: mix,
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { jobs: v, required: v, preferred: 0 }])),
    provenance: 'demo',
    ...over,
  };
}

describe('hash', () => {
  it('collapses cosmetic differences', () => {
    expect(contentHash('Build REST APIs.\n\nWe use  React!')).toBe(contentHash('build rest apis we use react'));
    expect(contentHash('a b c')).not.toBe(contentHash('a b d'));
  });
  it('canonical key ignores case and punctuation', () => {
    expect(canonicalJobKey({ company: 'Acme, Inc.', title: 'Full-Stack Engineer', city: 'Pune' })).toBe(
      canonicalJobKey({ company: 'acme inc', title: 'full stack engineer', city: 'PUNE' }),
    );
  });
});

describe('classifyCompany', () => {
  it('classifies by headcount', () => {
    expect(classifyCompany({ employees: 60 }).category).toBe('startup');
    expect(classifyCompany({ employees: 900 }).category).toBe('mid');
    expect(classifyCompany({ employees: 12000 }).category).toBe('large');
  });
  it('flags boundary headcounts as low confidence', () => {
    expect(classifyCompany({ employees: 210 }).confidence).toBe('low');
    expect(classifyCompany({ employees: 60 }).confidence).toBe('high');
  });
  it('does not guess when data is missing', () => {
    const c = classifyCompany({});
    expect(c.category).toBe('unclassified');
    expect(c.basis).toBe('unknown');
  });
  it('uses early funding stage only as a low-confidence fallback', () => {
    const c = classifyCompany({ fundingStage: 'series-a' });
    expect(c).toMatchObject({ category: 'startup', confidence: 'low', basis: 'funding_stage' });
    expect(classifyCompany({ fundingStage: 'series-d' }).category).toBe('unclassified');
  });
});

describe('summarizeScan', () => {
  const mk = (n: number, status: ScanCandidate['status'], category?: ScanCandidate['category']): ScanCandidate[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${status}-${category}-${i}`, status, category }));
  it('labels 63 valid jobs as 63/100 and partial', () => {
    const s = summarizeScan([...mk(20, 'valid', 'startup'), ...mk(20, 'valid', 'mid'), ...mk(23, 'valid', 'large'), ...mk(9, 'duplicate'), ...mk(4, 'inaccessible')]);
    expect(s.label).toBe('63/100');
    expect(s.state).toBe('partial');
    expect(s.remaining).toBe(37);
    expect(s.duplicates).toBe(9);
    expect(s.warnings[0]).toMatch(/not a completed 100-job scan/);
  });
  it('does not count duplicates, inaccessible or rejected jobs', () => {
    const s = summarizeScan([...mk(100, 'duplicate'), ...mk(5, 'inaccessible'), { id: 'r', status: 'rejected', rejection: 'role_mismatch' }]);
    expect(s.valid).toBe(0);
    expect(s.rejectedByReason.role_mismatch).toBe(1);
  });
  it('is complete at 100 with quotas met', () => {
    const s = summarizeScan([...mk(35, 'valid', 'startup'), ...mk(30, 'valid', 'mid'), ...mk(35, 'valid', 'large')], DEFAULT_SCAN_CONFIG);
    expect(s.state).toBe('complete');
    expect(s.quotasMet).toBe(true);
  });
  it('reports quota shortfalls and unclassified jobs', () => {
    const s = summarizeScan([...mk(30, 'valid', 'startup'), ...mk(30, 'valid', 'mid'), ...mk(35, 'valid', 'large'), ...mk(5, 'valid', 'unclassified')]);
    expect(s.state).toBe('complete');
    expect(s.quotasMet).toBe(false);
    expect(s.quotas[0]!.shortfall).toBe(5);
    expect(s.unclassified).toBe(5);
  });
  it('broadens in disclosed steps without touching country or role', () => {
    const base = { roleIds: ['fullstack'], experienceMin: 3, experienceMax: 6, postedWithinDays: 30, countries: ['IN'], cities: ['Bengaluru'], nearbyCities: false };
    const steps = broadeningSteps(base);
    expect(steps.length).toBeGreaterThan(2);
    for (const s of steps) {
      expect(s.criteria.countries).toEqual(['IN']);
      expect(s.criteria.roleIds).toEqual(['fullstack']);
      expect(s.criteria.experienceMin).toBe(3);
      expect(s.disclosure.length).toBeGreaterThan(10);
    }
  });
});

describe('computeDemand', () => {
  const jobs: DemandJob[] = [
    { id: 'a', companyId: '1', companyCategory: 'startup', roleId: 'fullstack', skills: [{ skillId: 'ts', requirement: 'required' }, { skillId: 'ts', requirement: 'preferred' }, { skillId: 'go', requirement: 'preferred' }] },
    { id: 'b', companyId: '2', companyCategory: 'mid', roleId: 'fullstack', skills: [{ skillId: 'ts', requirement: 'preferred' }] },
    { id: 'c', companyId: '3', companyCategory: 'large', roleId: 'backend', skills: [{ skillId: 'go', requirement: 'required' }] },
    { id: 'd', companyId: '4', companyCategory: 'unclassified', roleId: 'fullstack', skills: [{ skillId: 'ts', requirement: 'mentioned' }] },
  ];
  const t = computeDemand(jobs);
  it('counts each job once per skill with the strongest class', () => {
    const ts = t.bySkill.get('ts')!;
    expect(ts.jobs).toBe(3);
    expect(ts.required).toBe(1);
    expect(ts.preferred).toBe(1);
    expect(ts.mentioned).toBe(1);
    expect(ts.n).toBe(4);
    expect(ts.pct).toBeCloseTo(0.75);
    expect(ts.jobIds.sort()).toEqual(['a', 'b', 'd']);
  });
  it('keeps category denominators visible and excludes unclassified from them', () => {
    const ts = t.bySkill.get('ts')!;
    expect(t.categoryN).toEqual({ startup: 1, mid: 1, large: 1 });
    expect(t.unclassifiedN).toBe(1);
    expect(ts.byCategory.startup).toMatchObject({ n: 1, jobs: 1, required: 1 });
    expect(formatCount(ts.jobs, ts.n)).toBe('3/4 jobs (75%)');
  });
});

describe('trend', () => {
  const cfg = undefined;
  it('proportion test: noise vs meaningful', () => {
    expect(compareProportions(40, 100, 44, 100).meaningful).toBe(false);
    const big = compareProportions(30, 100, 52, 100);
    expect(big.meaningful).toBe(true);
    expect(big.pValue).toBeLessThan(0.01);
    expect(compareProportions(10, 100, 20, 100).pValue).toBeCloseTo(0.0498, 2); // z≈1.96
  });
  it('baseline only: no trend claimed', () => {
    const t = classifySkillTrend({ id: 'x' }, [snap('now', '2026-10-01', 100, { x: 30 })], null, cfg);
    expect(t.baselineOnly).toBe(true);
    expect(t.comparison).toBeUndefined();
    expect(t.summary).toMatch(/Baseline established; trend not yet available/);
    expect(t.label).toBe('established');
  });
  it('growing needs a comparable meaningful increase', () => {
    const t = classifySkillTrend({ id: 'x' }, [snap('prev', '2026-07-01', 100, { x: 20 }), snap('now', '2026-10-01', 100, { x: 41 })], null);
    expect(t.label).toBe('growing');
    expect(t.comparison!.deltaPP).toBeCloseTo(21);
  });
  it('small movement is noise → established', () => {
    const t = classifySkillTrend({ id: 'x' }, [snap('prev', '2026-07-01', 100, { x: 40 }), snap('now', '2026-10-01', 100, { x: 44 })], null);
    expect(t.label).toBe('established');
  });
  it('a single drop is not declining', () => {
    const t = classifySkillTrend({ id: 'x' }, [snap('prev', '2026-07-01', 100, { x: 50 }), snap('now', '2026-10-01', 100, { x: 30 })], null);
    expect(t.label).toBe('uncertain');
    expect(t.summary).toMatch(/needs another comparable sample/);
  });
  it('declining requires a sustained fall across ≥3 comparable samples', () => {
    const t = classifySkillTrend(
      { id: 'x' },
      [snap('p2', '2026-04-01', 100, { x: 50 }), snap('p1', '2026-07-01', 100, { x: 38 }), snap('now', '2026-10-01', 100, { x: 24 })],
      null,
    );
    expect(t.label).toBe('declining');
  });
  it('ignores incomparable snapshots (different company mix) instead of inferring a trend', () => {
    const skewed = snap('prev', '2026-07-01', 100, { x: 10 }, { companyMix: { startup: 5, mid: 5, large: 90 } });
    const now = snap('now', '2026-10-01', 100, { x: 40 });
    expect(checkComparability(skewed, now).comparable).toBe(false);
    const t = classifySkillTrend({ id: 'x' }, [skewed, now], null);
    expect(t.baselineOnly).toBe(true);
    expect(t.label).not.toBe('growing');
    expect(t.reasons.join(' ')).toMatch(/excluded/);
  });
  it('small samples are uncertain with low evidence', () => {
    const t = classifySkillTrend({ id: 'x' }, [snap('now', '2026-10-01', 20, { x: 10 })], null);
    expect(t.label).toBe('uncertain');
    expect(t.evidence).toBe('low');
  });
  it('low-base increase is emerging, not growing', () => {
    const t = classifySkillTrend({ id: 'x' }, [snap('prev', '2026-07-01', 100, { x: 1 }), snap('now', '2026-10-01', 100, { x: 10 })], null);
    expect(t.label).toBe('emerging');
  });
  it('foundational concepts keep their label regardless of movement', () => {
    expect(classifySkillTrend({ id: 'x', foundational: true }, [snap('now', '2026-10-01', 100, { x: 60 })], null).label).toBe('foundational');
  });
  it('specialized when concentrated in a small segment', () => {
    const t = classifySkillTrend({ id: 'x' }, [snap('now', '2026-10-01', 100, { x: 12 })], { key: 'Fintech', share: 0.75, segmentShare: 0.2, count: 9 });
    expect(t.label).toBe('specialized');
  });
});

describe('match', () => {
  const profile: MatchProfile = {
    yearsExperience: 4,
    targetRoleId: 'fullstack',
    skills: [
      { skillId: 'react', level: 'advanced' },
      { skillId: 'typescript', level: 'intermediate' },
      { skillId: 'gcp', level: 'intermediate' },
    ],
    cities: ['Bengaluru'],
    countries: ['India'],
    acceptsRemote: true,
    workArrangements: ['hybrid', 'remote'],
    expectedSalary: { min: 2_500_000, currency: 'INR', period: 'year' },
  };
  const sk = (skillId: string, requirement: 'required' | 'preferred', isAlternative = false) => ({ skillId, requirement, confidence: 0.9, isAlternative });

  it('scores skills, experience and overall separately', () => {
    const r = computeMatch(profile, {
      id: 'j', roleId: 'fullstack', city: 'Bengaluru', country: 'India', workArrangement: 'hybrid', experience: { min: 3, max: 6 },
      skills: [sk('react', 'required'), sk('typescript', 'required'), sk('aws', 'required'), sk('kubernetes', 'required'), sk('graphql', 'preferred')],
    });
    expect(r.skills.matchedRequired).toEqual(['react', 'typescript']);
    expect(r.skills.partialRequired.map((p) => p.skillId)).toEqual(['aws']); // via GCP
    expect(r.skills.missingRequired).toEqual(['kubernetes']);
    expect(r.skills.requiredScore).toBe(63); // (2 + 0.5) / 4
    expect(r.experience.status).toBe('eligible');
    expect(r.overall).not.toBeNull();
  });

  it('does not penalise missing data and reports it as not scored', () => {
    const r = computeMatch(profile, { id: 'j', roleId: 'fullstack', skills: [sk('react', 'required')] });
    const salary = r.components.find((c) => c.key === 'salary')!;
    const exp = r.components.find((c) => c.key === 'experience')!;
    expect(salary.score).toBeNull();
    expect(exp.score).toBeNull();
    expect(r.experience.status).toBe('unknown');
    expect(r.overall).toBe(100);
    const total = r.components.reduce((s, c) => s + c.effectiveWeight, 0);
    expect(total).toBeCloseTo(1);
  });

  it('treats "X, Y or Z" alternatives as satisfied by any one', () => {
    const r = computeMatch(profile, { id: 'j', roleId: 'fullstack', skills: [sk('react', 'required', true), sk('vue', 'required', true), sk('angular', 'required', true)] });
    expect(r.skills.requiredScore).toBe(100);
  });

  it('flags under-experience as a status, not a rejection', () => {
    const r = computeMatch({ ...profile, yearsExperience: 1 }, { id: 'j', roleId: 'fullstack', experience: { min: 5, max: 8 }, skills: [sk('react', 'required')] });
    expect(r.experience.status).toBe('under');
    expect(r.overall).toBeGreaterThan(0);
  });

  it('weights are configurable', () => {
    const job = { id: 'j', roleId: 'fullstack' as const, experience: { min: 6 }, skills: [sk('react', 'required')] };
    const base = computeMatch({ ...profile, yearsExperience: 1 }, job).overall!;
    const heavySkills = computeMatch({ ...profile, yearsExperience: 1 }, job, { ...DEFAULT_MATCH_CONFIG, weights: { ...DEFAULT_MATCH_CONFIG.weights, required: 0.9, experience: 0.01 } }).overall!;
    expect(heavySkills).toBeGreaterThan(base);
  });
});

describe('gap analysis', () => {
  const mkJob = (i: number, role: DemandJob['roleId'], skills: [string, 'required' | 'preferred'][]): DemandJob => ({
    id: `j${i}`, companyId: `c${i}`, companyCategory: 'mid', roleId: role, skills: skills.map(([skillId, requirement]) => ({ skillId, requirement })),
  });
  const jobs: DemandJob[] = Array.from({ length: 40 }, (_, i) =>
    mkJob(i, 'fullstack', [
      ['react', 'required'],
      ...(i < 24 ? ([['docker', 'required']] as [string, 'required'][]) : []),
      ...(i < 18 ? ([['aws', 'required']] as [string, 'required'][]) : []),
      ...(i < 6 ? ([['rag', 'preferred']] as [string, 'preferred'][]) : []),
      ...(i < 10 ? ([['vue', 'preferred']] as [string, 'preferred'][]) : []),
    ]),
  );
  const demand = computeDemand(jobs);
  const trends = new Map(demand.skills.map((s) => [s.skillId, classifySkillTrend({ id: s.skillId, foundational: getSkill(s.skillId)?.foundational }, [snap('now', '2026-10-01', demand.n, { [s.skillId]: s.jobs })], null)]));
  const profile: MatchProfile = {
    yearsExperience: 4, targetRoleId: 'fullstack', cities: [], countries: [], acceptsRemote: true, workArrangements: [],
    skills: [{ skillId: 'react', level: 'advanced' }, { skillId: 'gcp', level: 'intermediate' }],
  };
  const g = computeGapAnalysis({ demand, trends, profile, jobs });
  const item = (id: string) => g.items.find((i) => i.skillId === id)!;

  it('marks existing skills as strengths with zero priority', () => {
    expect(item('react').status).toBe('strength');
    expect(item('react').priority).toBe(0);
  });
  it('ranks a high-demand required gap as essential', () => {
    expect(item('docker').tier).toBe('essential');
    expect(item('docker').priority).toBeGreaterThan(item('rag').priority);
  });
  it('does not recommend learning AWS when an equivalent cloud skill is held', () => {
    expect(item('aws').status).toBe('covered');
    expect(item('aws').action).toBe('transfer');
    expect(item('aws').tier).toBe('optional');
  });
  it('low-prevalence skills are speculative, not essential', () => {
    expect(['speculative', 'optional']).toContain(item('rag').tier);
    expect(item('rag').tier).not.toBe('essential');
  });
  it('points sum to the priority (transparent score)', () => {
    const d = item('docker');
    const sum = Object.values(d.points).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(d.priority);
  });
  it('roadmap is derived from gaps and respects weekly hours', () => {
    const slow = buildRoadmap(g.gaps, 3);
    const fast = buildRoadmap(g.gaps, 12);
    expect(slow[0]!.items.map((i) => i.skillId)).toContain('docker');
    expect(slow[0]!.weeks[1]).toBeGreaterThanOrEqual(fast[0]!.weeks[1]);
    for (const p of slow) for (const i of p.items) expect(i.milestones.length).toBeGreaterThan(0);
  });
});

describe('daily report', () => {
  const demand = computeDemand([{ id: 'a', companyId: '1', companyCategory: 'mid', roleId: 'fullstack', skills: [{ skillId: 'react', requirement: 'required' }] }]);
  it('stays quiet when nothing significant changed', () => {
    const r = buildDailyReport({
      date: '2026-10-27', since: '2026-10-26', demand, trends: [], gaps: [],
      newJobs: [{ id: 'n1', title: 'Eng', company: 'X', match: 52, firstSeenAt: '2026-10-27', skills: [] }],
      sources: [{ id: 's', name: 'S', status: 'ok', failingDays: 0 }],
    });
    expect(r.notify.send).toBe(false);
    expect(r.notify.reasons[0]).toMatch(/Nothing significant/);
  });
  it('notifies for a strong match or a persistent source failure', () => {
    const r = buildDailyReport({
      date: '2026-10-27', since: '2026-10-26', demand, trends: [], gaps: [],
      newJobs: [{ id: 'n1', title: 'Eng', company: 'X', match: 82, firstSeenAt: '2026-10-27', skills: [] }],
      sources: [{ id: 's', name: 'S', status: 'failed', failingDays: 3 }],
    });
    expect(r.notify.send).toBe(true);
    expect(r.notify.reasons.length).toBe(2);
    expect(r.sources.issues[0]).toMatch(/3 days/);
  });
});

describe('coverage relations', () => {
  const mkProfile = (skills: MatchProfile['skills']): MatchProfile => ({ yearsExperience: 4, targetRoleId: 'fullstack', skills, cities: [], countries: [], acceptsRemote: true, workArrangements: [] });
  const sk = (skillId: string, requirement: 'required' | 'preferred') => ({ skillId, requirement, confidence: 0.9, isAlternative: false });

  it('a specific tool implies its concept (Jest ⇒ unit testing, PostgreSQL ⇒ SQL)', () => {
    const p = mkProfile([{ skillId: 'jest', level: 'intermediate' }, { skillId: 'postgresql', level: 'intermediate' }]);
    const r = computeMatch(p, { id: 'j', roleId: 'fullstack', skills: [sk('unit-testing', 'required'), sk('sql', 'required')] });
    expect(r.skills.requiredScore).toBe(100);
    expect(r.skills.impliedRequired.map((i) => i.skillId).sort()).toEqual(['sql', 'unit-testing']);
  });

  it('alternative backend languages transfer only partially in matching', () => {
    const p = mkProfile([{ skillId: 'nodejs', level: 'intermediate' }]);
    const r = computeMatch(p, { id: 'j', roleId: 'backend', skills: [sk('java', 'required')] });
    expect(r.skills.requiredScore).toBe(25); // 0.5 substitute credit × 0.5 language transfer
    expect(r.skills.partialRequired[0]!.skillId).toBe('java');
  });

  it('gap analysis treats an alternative stack as transfer, not a top gap', () => {
    const jobs: DemandJob[] = Array.from({ length: 30 }, (_, i) => ({
      id: `j${i}`, companyId: `c${i}`, companyCategory: 'mid', roleId: 'fullstack',
      skills: [{ skillId: 'java', requirement: 'required' }, { skillId: 'unit-testing', requirement: 'required' }],
    }));
    const demand = computeDemand(jobs);
    const trends = new Map(demand.skills.map((s) => [s.skillId, classifySkillTrend({ id: s.skillId }, [snap('now', '2026-10-01', demand.n, { [s.skillId]: s.jobs })], null)]));
    const g = computeGapAnalysis({
      demand, trends, jobs,
      profile: mkProfile([{ skillId: 'nodejs', level: 'intermediate' }, { skillId: 'jest', level: 'intermediate' }]),
    });
    const java = g.items.find((i) => i.skillId === 'java')!;
    expect(java.status).toBe('covered');
    expect(java.action).toBe('transfer');
    expect(java.rationale.join(' ')).toMatch(/alternative backend stack/);
    expect(g.items.find((i) => i.skillId === 'unit-testing')!.status).toBe('strength');
  });

  it('excludes soft practices from learnable gaps', () => {
    const jobs: DemandJob[] = Array.from({ length: 30 }, (_, i) => ({ id: `j${i}`, companyId: `c${i}`, companyCategory: 'mid', roleId: 'fullstack', skills: [{ skillId: 'communication', requirement: 'required' }] }));
    const demand = computeDemand(jobs);
    const g = computeGapAnalysis({ demand, trends: new Map(), jobs, profile: mkProfile([]) });
    expect(g.items.find((i) => i.skillId === 'communication')).toBeUndefined();
  });
});

describe('broadening', () => {
  it('does not claim to widen cities when none were restricted', () => {
    const base = { roleIds: ['fullstack'], experienceMin: 3, experienceMax: 6, postedWithinDays: 30, countries: ['IN'], cities: [], nearbyCities: false };
    expect(broadeningSteps(base).some((s) => /Nearby cities/.test(s.disclosure))).toBe(false);
  });
});
