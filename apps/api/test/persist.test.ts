import { beforeEach, describe, expect, it } from 'vitest';
import { buildScan, defaultRequest } from '@jobradar/ingest';
import { createPglite, migrate, saveScan, seedReference, skillCountsFromRows, type Db } from '../src';
import { NOW, boardOf, ok, pool, posting } from './helpers';

let db: Db;
const req = () => defaultRequest({ now: NOW });
const save = (results: ReturnType<typeof pool>, when = NOW) =>
  saveScan(db, { outcome: buildScan(results, req()), request: req(), boards: results.map((r) => r.board), startedAt: new Date(when.getTime() - 3_600_000), finishedAt: when, snapshotLabel: 'Oct 2026' });
const count = async (sql: string, p: unknown[] = []) => Number((await db.query<{ n: string }>(sql, p)).rows[0]!.n);

beforeEach(async () => {
  db = await createPglite();
  await migrate(db);
  await seedReference(db);
});

describe('migrations', () => {
  it('apply once and are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
    expect(await count(`SELECT count(*) n FROM schema_migrations`)).toBe(1);
  });
  it('create every entity from the spec', async () => {
    const t = (await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).rows.map((r) => r.table_name);
    for (const name of ['users', 'user_profiles', 'user_skills', 'companies', 'job_sources', 'job_postings', 'job_description_snapshots', 'skills', 'skill_aliases', 'job_skills', 'skill_evidence', 'scan_runs', 'scan_results', 'skill_demand_snapshots', 'skill_demand_counts', 'job_matches', 'learning_plans', 'learning_progress', 'notification_preferences', 'notification_deliveries', 'daily_reports']) {
      expect(t, name).toContain(name);
    }
  });
  it('seeds the taxonomy and sources', async () => {
    expect(await count(`SELECT count(*) n FROM skills`)).toBeGreaterThan(100);
    expect(await count(`SELECT count(*) n FROM skill_aliases WHERE case_sensitive`)).toBeGreaterThan(20);
    expect(await count(`SELECT count(*) n FROM job_sources`)).toBe(3);
    await seedReference(db); // idempotent
  });
});

describe('saveScan', () => {
  it('stores a complete 100-job scan with a 35/30/35 split', async () => {
    const { scanId } = await save(pool());
    const run = (await db.query<Record<string, unknown>>(`SELECT * FROM scan_runs WHERE id=$1`, [scanId])).rows[0]!;
    expect(run).toMatchObject({ state: 'complete', valid: 100, target: 100, provenance: 'live' });
    expect(await count(`SELECT count(*) n FROM scan_results WHERE scan_id=$1 AND status='valid'`, [scanId])).toBe(100);
    expect(await count(`SELECT count(*) n FROM job_postings`)).toBe(100);
    const split = (await db.query<{ category: string; n: string }>(`SELECT c.category, count(*) n FROM scan_results sr JOIN job_postings jp ON jp.id=sr.job_id JOIN companies c ON c.id=jp.company_id WHERE sr.scan_id=$1 AND sr.status='valid' GROUP BY 1`, [scanId])).rows;
    expect(Object.fromEntries(split.map((r) => [r.category, Number(r.n)]))).toEqual({ startup: 35, mid: 30, large: 35 });
  });

  it('every stored skill statistic is reproducible from the source rows', async () => {
    const { scanId, snapshotId } = await save(pool());
    const fromRows = await skillCountsFromRows(db, scanId);
    const stored = (await db.query<{ skill_id: string; jobs: number; required: number; preferred: number }>(`SELECT * FROM skill_demand_counts WHERE snapshot_id=$1`, [snapshotId])).rows;
    expect(stored.length).toBe(fromRows.size);
    for (const s of stored) expect(fromRows.get(s.skill_id)).toEqual({ jobs: s.jobs, required: s.required, preferred: s.preferred });
    expect(fromRows.get('typescript')!.jobs).toBeGreaterThan(0);
    const snap = (await db.query<{ n: number }>(`SELECT n FROM skill_demand_snapshots WHERE id=$1`, [snapshotId])).rows[0]!;
    expect(snap.n).toBe(100);
  });

  it('evidence offsets recover the exact sentence and wording from the stored description', async () => {
    await save(pool(3, 2));
    const bad = await count(`
      SELECT count(*) n FROM skill_evidence e
        JOIN job_skills js ON js.id = e.job_skill_id
        JOIN job_description_snapshots d ON d.id = js.snapshot_id
       WHERE substr(d.description, e.sent_start + 1, e.sent_end - e.sent_start) <> e.sentence
          OR substr(d.description, e.match_start + 1, e.match_end - e.match_start) <> e.matched_text`);
    expect(bad).toBe(0);
    expect(await count(`SELECT count(*) n FROM skill_evidence`)).toBeGreaterThan(20);
  });

  it('re-scanning the same boards creates no duplicate postings but keeps scan history', async () => {
    const results = pool(6, 3);
    await save(results, NOW);
    const later = new Date(NOW.getTime() + 86_400_000);
    const second = await save(results, later);
    expect(await count(`SELECT count(*) n FROM job_postings`)).toBe(54);
    expect(await count(`SELECT count(*) n FROM scan_runs`)).toBe(2);
    expect(await count(`SELECT count(*) n FROM skill_demand_snapshots`)).toBe(2);
    expect(second.changedJobs).toBe(0);
    const verified = (await db.query<{ last_verified_at: Date }>(`SELECT last_verified_at FROM job_postings LIMIT 1`)).rows[0]!;
    expect(new Date(verified.last_verified_at).toISOString()).toBe(later.toISOString());
  });

  it('a changed description becomes a new version, flags the posting, and keeps the old text', async () => {
    const b = boardOf('changer', 'mid');
    const p = posting(b, { title: 'Software Engineer' });
    await save([ok(b, [p])]);
    const changed = { ...p, description: p.description + '\nUpdate: we now also require Kubernetes experience.' };
    const r = await save([ok(b, [changed])], new Date(NOW.getTime() + 86_400_000));
    expect(r.changedJobs).toBe(1);
    expect(await count(`SELECT count(*) n FROM job_description_snapshots`)).toBe(2);
    const job = (await db.query<{ status: string; current_snapshot_id: string }>(`SELECT status, current_snapshot_id FROM job_postings`)).rows[0]!;
    expect(job.status).toBe('changed');
    const cur = (await db.query<{ description: string }>(`SELECT description FROM job_description_snapshots WHERE id=$1`, [job.current_snapshot_id])).rows[0]!;
    expect(cur.description).toContain('Kubernetes');
    // the first scan still points at the version it actually counted
    const first = (await db.query<{ description: string }>(`SELECT d.description FROM scan_results sr JOIN job_description_snapshots d ON d.id = sr.snapshot_id ORDER BY d.captured_at ASC LIMIT 1`)).rows[0]!;
    expect(first.description).not.toContain('Kubernetes');
  });

  it('stores a partial scan as partial with its disclosures, failures and rejection reasons', async () => {
    const good = boardOf('small', 'mid');
    const bad = boardOf('down', 'mid');
    const results = [ok(good, [posting(good, { title: 'Software Engineer' }), posting(good, { title: 'Recruiter' })]), { board: bad, postings: [], report: { boardKey: 'greenhouse:down', ats: 'greenhouse' as const, status: 'failed' as const, fetched: 0, skipped: [], attempts: 4, httpStatus: 503, error: 'HTTP 503', retryable: true, at: NOW.toISOString() } }];
    const { scanId } = await save(results);
    const run = (await db.query<{ state: string; valid: number; inaccessible: number; broadening: unknown[]; warnings: string[] }>(`SELECT * FROM scan_runs WHERE id=$1`, [scanId])).rows[0]!;
    expect(run).toMatchObject({ state: 'partial', valid: 1, inaccessible: 1 });
    expect(run.broadening.length).toBeGreaterThan(0);
    expect(run.warnings[0]).toMatch(/not a completed 100-job scan/);
    expect(await count(`SELECT count(*) n FROM scan_results WHERE scan_id=$1 AND status='rejected' AND reason='role_mismatch'`, [scanId])).toBe(1);
    const health = (await db.query<{ consecutive_failures: number; last_error: string }>(`SELECT consecutive_failures, last_error FROM source_boards sb JOIN companies c ON c.id=sb.company_id WHERE c.slug='down'`)).rows[0]!;
    expect(health).toEqual({ consecutive_failures: 1, last_error: 'HTTP 503' });
  });
});

describe('integrity constraints', () => {
  it('reject impossible states', async () => {
    const run = `INSERT INTO scan_runs (role_id, region, target, quota_startup, quota_mid, quota_large, state, started_at, valid, criteria) VALUES ('fullstack','India',100,35,30,35,'complete', now(), $1, '{}')`;
    await expect(db.query(run, [101])).rejects.toThrow(); // valid > target
    const { scanId } = await save(pool(2, 2));
    await expect(db.query(`INSERT INTO scan_results (scan_id, candidate_key, status) VALUES ($1,'x','valid')`, [scanId])).rejects.toThrow(); // valid needs job + snapshot
    await expect(db.query(`UPDATE skill_demand_counts SET required = jobs + 1`)).rejects.toThrow(); // required+preferred <= jobs
    await expect(db.query(`INSERT INTO companies (slug,name,category,classification_basis,classification_confidence,classification_explanation,provenance) VALUES ('z','Z','mid','manual','high','x','fake')`)).rejects.toThrow(); // provenance enum
    await expect(db.query(`INSERT INTO users (email) VALUES ('Mixed@Case.com')`)).rejects.toThrow(); // lower-case emails
  });
  it('cascades deletion of a user and their data', async () => {
    const u = (await db.query<{ id: string }>(`INSERT INTO users (email) VALUES ('a@b.co') RETURNING id`)).rows[0]!.id;
    await db.query(`INSERT INTO user_profiles (user_id, target_role_id) VALUES ($1,'fullstack')`, [u]);
    await db.query(`INSERT INTO user_skills (user_id, skill_id, level) VALUES ($1,'react','advanced')`, [u]);
    await db.query(`INSERT INTO notification_preferences (user_id) VALUES ($1)`, [u]);
    await db.query(`DELETE FROM users WHERE id=$1`, [u]);
    expect(await count(`SELECT (SELECT count(*) FROM user_profiles)+(SELECT count(*) FROM user_skills)+(SELECT count(*) FROM notification_preferences) n`)).toBe(0);
  });
});
