import { describe, expect, it } from 'vitest';
import { computeDemand, evidenceMatchesSource, normalizeRole, type RoleId } from '@jobradar/core';
import { DEMO_COMPANIES, buildDemoDataset, toDemandJob } from '../src';

const now = new Date('2026-10-27T08:00:00Z');
const roles: RoleId[] = ['fullstack', 'frontend', 'backend', 'software'];

describe('demo dataset (complete scenario)', () => {
  const ds = buildDemoDataset({ now, roleId: 'fullstack', scenario: 'complete' });

  it('has exactly 100 unique, in-scan jobs split 35/30/35', () => {
    expect(ds.sampleJobs).toHaveLength(100);
    expect(new Set(ds.sampleJobs.map((j) => j.id)).size).toBe(100);
    expect(new Set(ds.sampleJobs.map((j) => j.contentHash)).size).toBe(100);
    const by = (c: string) => ds.sampleJobs.filter((j) => j.companyCategory === c).length;
    expect([by('startup'), by('mid'), by('large')]).toEqual([35, 30, 35]);
    expect(ds.scanSummary.label).toBe('100/100');
    expect(ds.scanSummary.state).toBe('complete');
    expect(ds.scanSummary.quotasMet).toBe(true);
  });

  it('labels everything as demo and never links to a real host', () => {
    for (const j of ds.jobs) {
      expect(j.provenance).toBe('demo');
      expect(j.id.startsWith('demo_')).toBe(true);
      expect(j.sourceUrl).toContain('.invalid/');
    }
    expect(ds.companies.every((c) => c.provenance === 'demo')).toBe(true);
    expect(ds.scan.provenance).toBe('demo');
    expect(ds.snapshots.every((s) => s.provenance === 'demo')).toBe(true);
  });

  it('keeps stored evidence verifiable against the description text', () => {
    for (const j of ds.jobs) for (const s of j.skills) expect(evidenceMatchesSource(j.description, s)).toBe(true);
  });

  it('normalises titles consistently', () => {
    for (const j of ds.jobs) expect(normalizeRole(j.title)).toBe(j.normalizedRole);
  });

  it('snapshot counts equal an independent aggregation of the stored jobs', () => {
    const cur = ds.snapshots[ds.snapshots.length - 1]!;
    const demand = computeDemand(ds.sampleJobs.map(toDemandJob));
    expect(cur.n).toBe(100);
    for (const s of demand.skills) expect(cur.counts[s.skillId]!.jobs).toBe(s.jobs);
    // and each skill's job ids really mention it
    for (const s of demand.skills.slice(0, 15)) {
      for (const id of s.jobIds) {
        expect(ds.sampleJobs.find((j) => j.id === id)!.skills.some((x) => x.skillId === s.skillId)).toBe(true);
      }
    }
  });

  it('produces a believable skill distribution', () => {
    const demand = computeDemand(ds.sampleJobs.map(toDemandJob));
    const top = demand.skills.slice(0, 12).map((s) => s.skillId);
    expect(top).toEqual(expect.arrayContaining(['react', 'typescript', 'nodejs']));
    // required ≠ merely mentioned
    const ts = demand.bySkill.get('typescript')!;
    expect(ts.required).toBeLessThan(ts.jobs + 1);
    expect(demand.skills.some((s) => s.mentioned > 0)).toBe(true);
  });

  it('includes jobs from daily-bot discovery that are not part of the evidence base', () => {
    expect(ds.newJobs.length).toBe(14);
    expect(ds.jobs.length).toBe(114);
    expect(ds.newJobs.every((j) => j.sample === 'new_since_scan')).toBe(true);
  });

  it('has closed/changed postings flagged rather than hidden', () => {
    expect(ds.sampleJobs.filter((j) => j.status === 'expired')).toHaveLength(3);
    expect(ds.sampleJobs.filter((j) => j.status === 'changed')).toHaveLength(3);
  });

  it('includes at least one low-confidence company classification', () => {
    expect(DEMO_COMPANIES.some((c) => c.classification.confidence === 'low')).toBe(true);
  });

  it('is deterministic', () => {
    const again = buildDemoDataset({ now, roleId: 'fullstack', scenario: 'complete' });
    expect(again.sampleJobs.map((j) => j.contentHash)).toEqual(ds.sampleJobs.map((j) => j.contentHash));
  });
});

describe('demo dataset (partial scenario)', () => {
  const ds = buildDemoDataset({ now, roleId: 'fullstack', scenario: 'partial' });
  it('reports 63/100 and does not call it complete', () => {
    expect(ds.sampleJobs).toHaveLength(63);
    expect(ds.scanSummary.label).toBe('63/100');
    expect(ds.scanSummary.state).toBe('partial');
    expect(ds.scan.broadening.length).toBeGreaterThan(1);
    expect(ds.snapshots[ds.snapshots.length - 1]!.n).toBe(63);
    expect(ds.sources.some((s) => s.status === 'failed')).toBe(true);
  });
});

describe('every supported role has a usable sample', () => {
  for (const roleId of roles) {
    it(roleId, () => {
      const ds = buildDemoDataset({ now, roleId, scenario: 'complete' });
      expect(ds.sampleJobs).toHaveLength(100);
      const primary = ds.sampleJobs.filter((j) => j.normalizedRole === roleId).length;
      expect(primary).toBeGreaterThanOrEqual(45);
    });
  }
});
