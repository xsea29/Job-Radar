import { describe, expect, it } from 'vitest';
import { evidenceMatchesSource, type CompanyCategory } from '@jobradar/core';
import { buildScan, defaultRequest, snapshotFromOutcome, type BoardConfig, type FetchResult, type RawPosting, type ScanRequest } from '../src';

/**
 * SYNTHETIC POOL BUILDER — generates format-valid postings so we can test the
 * orchestration rules (dedupe, filters, quotas, broadening). Not real data.
 */
const NOW = new Date('2026-10-27T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const SIZE: Record<CompanyCategory, number> = { startup: 80, mid: 900, large: 20000 };

function body(i: number, extra = ''): string {
  return `About us\nCompany ${i} builds software.\n\nWhat you'll do\n- Build features end to end for customers (ticket ${i})\n\nRequirements\n- 3+ years of professional experience\n- Strong proficiency in TypeScript and Node.js\n- Hands-on experience with PostgreSQL\n\nNice to have\n- Docker is a plus\n${extra}\nWe value clear communication and ownership of what you ship in production.`;
}

let seq = 0;
function posting(board: BoardConfig, over: Partial<RawPosting> = {}): RawPosting {
  const i = ++seq;
  return {
    ats: board.ats, boardToken: board.token, companyName: board.companyName, externalId: String(i), title: `Full Stack Engineer (team ${i})`, description: body(i), url: `https://example.invalid/${board.token}/${i}`,
    locations: ['Bengaluru, India'], employmentType: 'full-time', postedAt: daysAgo(3), ...over,
  };
}

function boardOf(name: string, cat: CompanyCategory | undefined, ats: BoardConfig['ats'] = 'greenhouse'): BoardConfig {
  return { ats, token: name, companyName: name, employees: cat ? SIZE[cat] : undefined, industry: 'SaaS' };
}

const ok = (b: BoardConfig, postings: RawPosting[]): FetchResult => ({ board: b, postings, report: { boardKey: `${b.ats}:${b.token}`, ats: b.ats, status: 'ok', fetched: postings.length, skipped: [], attempts: 1, at: NOW.toISOString() } });

/** n boards of a category, each with `per` postings. */
function boards(cat: CompanyCategory, n: number, per: number, over: Partial<RawPosting> | ((k: number) => Partial<RawPosting>) = {}): FetchResult[] {
  return Array.from({ length: n }, (_, k) => {
    const b = boardOf(`${cat}-${k}`, cat);
    return ok(b, Array.from({ length: per }, (_, j) => posting(b, { title: ['Full Stack Developer', 'Software Engineer', 'Senior Software Engineer', 'Full Stack Engineer'][j % 4], ...(typeof over === 'function' ? over(k) : over) })));
  });
}
const req = (o: Partial<ScanRequest> = {}) => defaultRequest({ now: NOW, ...o });

describe('buildScan', () => {
  it('reaches exactly 100 valid with a 35/30/35 split when the pool allows', () => {
    const pool = [...boards('startup', 20, 3), ...boards('mid', 20, 3), ...boards('large', 20, 3)];
    const o = buildScan(pool, req());
    expect(o.summary.label).toBe('100/100');
    expect(o.summary.state).toBe('complete');
    expect(o.summary.quotas.map((q) => q.valid)).toEqual([35, 30, 35]);
    expect(o.summary.quotasMet).toBe(true);
    expect(o.selected).toHaveLength(100);
    expect(o.surplusValid).toBe(80);
    expect(o.broadening).toEqual([]);
  });

  it('reports 63/100 honestly when only 63 valid jobs exist, after trying every broadening step', () => {
    const pool = [...boards('startup', 7, 3), ...boards('mid', 7, 3), ...boards('large', 7, 3)];
    const o = buildScan(pool, req());
    expect(o.summary.valid).toBe(63);
    expect(o.summary.label).toBe('63/100');
    expect(o.summary.state).toBe('partial');
    expect(o.summary.warnings[0]).toMatch(/not a completed 100-job scan/);
    expect(o.broadening.length).toBeGreaterThan(2);
    expect(o.selected).toHaveLength(63);
  });

  it('removes duplicates (same text, or same company+title+city) across boards and does not count them', () => {
    const a = boardOf('dupco', 'mid');
    const b = boardOf('dupco', 'mid', 'lever'); // same company on a second ATS
    const p1 = posting(a, { title: 'Backend Engineer' });
    const sameText = posting(b, { title: 'Backend Engineer II', description: p1.description });
    const sameKey = posting(b, { title: 'Backend Engineer', description: p1.description + '\nApply today.' }); // near-identical
    const o = buildScan([ok(a, [p1]), ok(b, [sameText, sameKey])], req({ acceptedRoleIds: ['backend'] }));
    expect(o.summary.valid).toBe(1);
    expect(o.summary.duplicates).toBe(2);
    expect(o.verdicts.filter((v) => v.status === 'duplicate').every((v) => v.duplicateOf === p1.ats + ':dupco:' + p1.externalId)).toBe(true);
  });

  it('keeps same company+title+city postings whose text differs (different teams)', () => {
    const b = boardOf('teams', 'mid');
    const mk = (i: number, team: string) => posting(b, { title: 'Software Engineer', description: `About the ${team} team\nWe own the ${team} product line and ship weekly to enterprise customers.\n\nWhat you'll do\n- Design, build and operate ${team} services in production with a small autonomous group\n- Partner with ${team} product managers on roadmap and quality\n\nRequirements\n- 3+ years of professional experience\n- Strong proficiency in TypeScript and Node.js for ${team} workloads (${i})\n- Hands-on experience with PostgreSQL` });
    const o = buildScan([ok(b, [mk(1, 'payments'), mk(2, 'search'), mk(3, 'identity')])], req());
    expect(o.summary.valid).toBe(3);
    expect(o.summary.duplicates).toBe(0);
  });
  it('rejects with a stated reason and counts each', () => {
    const b = boardOf('mixed', 'mid');
    const o = buildScan(
      [
        ok(b, [
          posting(b, { title: 'Recruiter' }),
          posting(b, { title: 'Frontend Engineer' }), // role family not accepted
          posting(b, { locations: ['Berlin, Germany'] }),
          posting(b, { locations: ['Remote'] }), // no country
          posting(b, { employmentType: 'intern' }),
          posting(b, { description: 'Too short.' }),
          posting(b, { postedAt: daysAgo(200) }),
          posting(b, { description: body(5).replace('3+ years', '12+ years') }),
          posting(b, { title: 'Software Engineer' }), // the one valid job
        ]),
      ],
      req(),
    );
    const by = o.summary.rejectedByReason;
    expect(o.summary.valid).toBe(1);
    expect(by).toMatchObject({ role_mismatch: 2, location_mismatch: 2, employment_type: 1, missing_description: 1, experience_mismatch: 1 });
    expect(o.verdicts.filter((v) => v.status === 'rejected').every((v) => v.detail)).toBe(true);
  });

  it('stale postings are only accepted after the disclosed window widening', () => {
    const b = boardOf('old', 'mid');
    const o = buildScan([ok(b, [posting(b, { postedAt: daysAgo(50) })])], req({ scan: { target: 1, quotas: { startup: 0, mid: 1, large: 0 } } }));
    expect(o.summary.valid).toBe(1);
    expect(o.broadening[0]).toMatch(/60 days/);
    expect(o.finalCriteria.postedWithinDays).toBe(60);
  });

  it('never relaxes country, role family or the experience floor while broadening', () => {
    const b = boardOf('x', 'mid');
    const o = buildScan([ok(b, [posting(b, { locations: ['Austin, US'] }), posting(b, { title: 'Recruiter' }), posting(b, { description: body(1).replace('3+ years', '1-2 years') })])], req());
    expect(o.summary.valid).toBe(0);
    expect(o.finalCriteria.countries).toEqual(['India']);
    expect(o.finalCriteria.roleIds).toEqual(['fullstack', 'software']);
    expect(o.finalCriteria.experienceMin).toBe(3);
  });

  it('counts unreadable listings and failed boards as inaccessible, never as scanned', () => {
    const good = boardOf('good', 'mid');
    const bad = boardOf('bad', 'mid');
    const failed: FetchResult = { board: bad, postings: [], report: { boardKey: 'greenhouse:bad', ats: 'greenhouse', status: 'failed', fetched: 0, skipped: [], attempts: 4, httpStatus: 403, error: 'HTTP 403', retryable: false, at: NOW.toISOString() } };
    const withSkips = ok(good, [posting(good)]);
    withSkips.report.skipped = [{ reason: 'no description', count: 2 }];
    const o = buildScan([withSkips, failed], req());
    expect(o.summary.valid).toBe(1);
    expect(o.summary.inaccessible).toBe(3);
    expect(o.failedBoards).toEqual(['greenhouse:bad']);
  });

  it('with no usable data at all it is 0/100 and partial, not complete', () => {
    const o = buildScan([], req());
    expect(o.summary).toMatchObject({ valid: 0, label: '0/100', state: 'partial' });
  });

  it('companies without size data are valid but excluded from quotas; backfill discloses the imbalance', () => {
    const unk = boardOf('mystery', undefined);
    const pool = [ok(unk, Array.from({ length: 10 }, () => posting(unk))), ...boards('mid', 5, 3)];
    const o = buildScan(pool, req({ scan: { target: 20, quotas: { startup: 5, mid: 10, large: 5 } } }));
    expect(o.summary.valid).toBe(20);
    expect(o.summary.unclassified).toBe(5);
    expect(o.summary.quotasMet).toBe(false);
    expect(o.summary.warnings.join(' ')).toMatch(/could not be classified/);
  });

  it('keeps stored evidence verifiable and snapshots match an independent count', () => {
    const pool = [...boards('startup', 12, 3), ...boards('mid', 12, 3), ...boards('large', 12, 3)];
    const o = buildScan(pool, req());
    for (const j of o.selected) for (const s of j.skills) expect(evidenceMatchesSource(j.posting.description, s)).toBe(true);
    const snap = snapshotFromOutcome(o, { id: 's1', label: 'Oct 2026', roleId: 'fullstack', region: 'India', experienceBand: '3–6 yrs', startDate: daysAgo(7), endDate: daysAgo(0) });
    expect(snap.provenance).toBe('live');
    expect(snap.n).toBe(100);
    expect(snap.counts.typescript!.jobs).toBe(o.selected.filter((j) => j.skills.some((s) => s.skillId === 'typescript')).length);
    expect(snap.companyMix).toEqual({ startup: 35, mid: 30, large: 35 });
  });

  it('is deterministic', () => {
    const pool = [...boards('startup', 20, 3), ...boards('mid', 20, 3), ...boards('large', 20, 3)];
    const a = buildScan(pool, req()).selected.map((j) => j.id);
    const b = buildScan(pool, req()).selected.map((j) => j.id);
    expect(a).toEqual(b);
  });
});
