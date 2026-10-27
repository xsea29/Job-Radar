import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PROFILE } from '@jobradar/demo';
import { buildScan, defaultContext, defaultRequest } from '@jobradar/ingest';
import { createPglite, createApp, loadEvidence, migrate, runDaily, saveScan, seedReference, type Db } from '../src';
import { NOW, boardOf, ok, pool, posting } from './helpers';

let db: Db;
let server: Server;
let base = '';
const SECRET = 'x'.repeat(40);

beforeEach(async () => {
  db = await createPglite();
  await migrate(db);
  await seedReference(db);
  server = createApp({ db, jwtSecret: SECRET, authRateLimit: 100, runScan: async () => undefined }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => server.close());

const call = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const r = await fetch(base + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...init.headers } });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};
const register = async (email = 'asha@example.com') => (await call('/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'correct-horse-battery' }) })).body.token as string;
const req = () => defaultRequest({ now: NOW });
const saveSample = async (when = NOW, createSnapshot = true, results = pool(15, 3)) => saveScan(db, { outcome: buildScan(results, req()), request: req(), boards: results.map((r) => r.board), startedAt: new Date(when.getTime() - 60_000), finishedAt: when, snapshotLabel: 'Oct 2026', createSnapshot });
const profileBody = () => { const { resumeText: _r, ...p } = DEMO_PROFILE; return p; };

describe('auth', () => {
  it('registers, logs in, rejects wrong passwords with one generic error, and validates input', async () => {
    const t = await register();
    expect(t.split('.')).toHaveLength(3);
    expect((await call('/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'asha@example.com', password: 'correct-horse-battery' }) })).status).toBe(409);
    expect((await call('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ASHA@example.com', password: 'correct-horse-battery' }) })).status).toBe(200);
    const wrong = await call('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'asha@example.com', password: 'wrong-password-123' }) });
    const unknown = await call('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password-123' }) });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect((await call('/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'bad', password: 'short' }) })).status).toBe(400);
    const stored = (await db.query<{ password_hash: string }>(`SELECT password_hash FROM users`)).rows[0]!.password_hash;
    expect(stored).toMatch(/^scrypt\$/);
    expect(stored).not.toContain('correct-horse');
  });
  it('protects personal routes and rejects forged or expired tokens', async () => {
    expect((await call('/v1/profile')).status).toBe(401);
    expect((await call('/v1/profile', { token: 'a.b.c' })).status).toBe(401);
    const t = await register();
    expect((await call('/v1/profile', { token: t.slice(0, -2) + 'xx' })).status).toBe(401);
    expect((await call('/v1/profile', { token: t })).status).toBe(404); // authenticated, no profile yet
  });
  it('rate-limits repeated auth attempts', async () => {
    server.close();
    server = createApp({ db, jwtSecret: SECRET, authRateLimit: 3 }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await call('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.co', password: 'wrong-password-123' }) })).status);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
  });
  it('account deletion removes the user and their data', async () => {
    const t = await register();
    await call('/v1/profile', { method: 'PUT', token: t, body: JSON.stringify(profileBody()) });
    expect((await call('/v1/me', { method: 'DELETE', token: t })).status).toBe(204);
    for (const tbl of ['users', 'user_profiles', 'user_skills', 'notification_preferences']) expect(Number((await db.query<{ n: string }>(`SELECT count(*) n FROM ${tbl}`)).rows[0]!.n)).toBe(0);
  });
});

describe('profile', () => {
  it('round-trips, validates, and never stores resume text', async () => {
    const t = await register();
    expect((await call('/v1/profile', { method: 'PUT', token: t, body: JSON.stringify({ ...profileBody(), targetRoleId: 'nope' }) })).status).toBe(400);
    const put = await call('/v1/profile', { method: 'PUT', token: t, body: JSON.stringify({ ...profileBody(), resumeText: 'SECRET RESUME' }) });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ name: 'Sagar', targetRoleId: 'fullstack', yearsExperience: 4 });
    expect(put.body.skills).toHaveLength(DEMO_PROFILE.skills.length);
    expect(JSON.stringify(put.body)).not.toContain('SECRET RESUME');
    expect((await call('/v1/profile', { token: t })).body.locations.cities).toEqual(['Bengaluru', 'Hyderabad', 'Pune']);
  });
});

describe('evidence & analytics', () => {
  it('404s honestly before any scan', async () => {
    expect((await call('/v1/evidence')).status).toBe(404);
    expect((await call('/v1/market')).status).toBe(404);
  });
  it('serves the stored scan in the app\'s evidence shape and every count matches the rows', async () => {
    await saveSample();
    const ev = (await call('/v1/evidence')).body;
    expect(ev).toMatchObject({ provenance: 'live', scanSummary: { label: '100/100', state: 'complete' } });
    expect(ev.sampleJobs).toHaveLength(100);
    expect(ev.snapshots).toHaveLength(1);
    expect(ev.sampleJobs.every((j: { provenance: string }) => j.provenance === 'live')).toBe(true);
    const market = (await call('/v1/market')).body;
    expect(market.n).toBe(100);
    const ts = market.skills.find((s: { skillId: string }) => s.skillId === 'typescript');
    expect(ts.jobs).toBe(ev.sampleJobs.filter((j: { skills: { skillId: string }[] }) => j.skills.some((s) => s.skillId === 'typescript')).length);
    const trend = market.trends.find((t: { skillId: string }) => t.skillId === 'typescript');
    expect(trend.baselineOnly).toBe(true); // one snapshot ⇒ no invented trend
    for (const j of ev.sampleJobs.slice(0, 10)) for (const s of j.skills) for (const e of s.evidence) expect(j.description.slice(e.matchStart, e.matchEnd)).toBe(e.matchedText);
  });
  it('paginates jobs and hides descriptions in lists', async () => {
    await saveSample();
    const page = (await call('/v1/jobs?limit=5&offset=10')).body;
    expect(page.total).toBe(100);
    expect(page.items).toHaveLength(5);
    expect(page.items[0].description).toBeUndefined();
    expect((await call('/v1/jobs?limit=500')).status).toBe(400);
    const one = (await call(`/v1/jobs/${page.items[0].id}`)).body;
    expect(one.description.length).toBeGreaterThan(100);
    expect((await call('/v1/jobs/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
  it('computes personal matches, gaps and a roadmap for the signed-in user', async () => {
    await saveSample();
    const t = await register();
    expect((await call('/v1/matches', { token: t })).status).toBe(409); // profile first
    await call('/v1/profile', { method: 'PUT', token: t, body: JSON.stringify(profileBody()) });
    const m = (await call('/v1/matches?limit=3', { token: t })).body;
    expect(m.items).toHaveLength(3);
    expect(m.items[0].match.overall).toBeGreaterThanOrEqual(m.items[2].match.overall);
    expect(m.items[0].match.components).toHaveLength(6);
    const g = (await call('/v1/gap', { token: t })).body;
    expect(g.n).toBe(100);
    expect(g.gap.gaps.every((x: { status: string }) => x.status !== 'strength')).toBe(true);
    expect(g.roadmap).toHaveLength(3);
  });
  it('stores notification preferences and learning progress per user', async () => {
    const t = await register();
    const prefs = { inApp: true, push: false, email: true, onlyWhenSignificant: false, matchThreshold: 80 };
    expect((await call('/v1/notifications/preferences', { method: 'PUT', token: t, body: JSON.stringify(prefs) })).status).toBe(200);
    expect((await call('/v1/notifications/preferences', { token: t })).body).toEqual(prefs);
    expect((await call('/v1/notifications/preferences', { method: 'PUT', token: t, body: JSON.stringify({ ...prefs, matchThreshold: 999 }) })).status).toBe(400);
    await call('/v1/learning/progress', { method: 'PUT', token: t, body: JSON.stringify({ milestoneId: 'docker:0', done: true }) });
    expect((await call('/v1/learning/progress', { token: t })).body.done).toEqual(['docker:0']);
    await call('/v1/learning/progress', { method: 'PUT', token: t, body: JSON.stringify({ milestoneId: 'docker:0', done: false }) });
    expect((await call('/v1/learning/progress', { token: t })).body.done).toEqual([]);
  });
  it('requires auth to start a scan and answers 202', async () => {
    expect((await call('/v1/scans/run', { method: 'POST' })).status).toBe(401);
    expect((await call('/v1/scans/run', { method: 'POST', token: await register() })).status).toBe(202);
  });
});

describe('daily worker', () => {
  const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
  const deps = (results: ReturnType<typeof pool>, now: Date) => ({ db, boards: results.map((r) => r.board), request: { ...req(), now }, ctx: defaultContext(), collect: async () => results, now });

  it('runs once per day (idempotent), snapshots only every few days, and builds a report per user', async () => {
    const t = await register();
    await call('/v1/profile', { method: 'PUT', token: t, body: JSON.stringify(profileBody()) });
    const results = pool(15, 3);
    const first = await runDaily(deps(results, NOW));
    expect(first).toMatchObject({ snapshotCreated: true, reports: 1 });
    expect(await runDaily(deps(results, NOW))).toEqual({ skipped: 'already-ran' });
    const second = await runDaily(deps(results, day(1)));
    expect(second.snapshotCreated).toBe(false); // < 7 days since the last snapshot
    expect(Number((await db.query<{ n: string }>(`SELECT count(*) n FROM skill_demand_snapshots`)).rows[0]!.n)).toBe(1);
    expect(Number((await db.query<{ n: string }>(`SELECT count(*) n FROM scan_runs`)).rows[0]!.n)).toBe(2);
    const later = await runDaily(deps(results, day(8)));
    expect(later.snapshotCreated).toBe(true);
    expect(Number((await db.query<{ n: string }>(`SELECT count(*) n FROM skill_demand_snapshots`)).rows[0]!.n)).toBe(2);
    expect((await call('/v1/reports', { token: t })).body.items.length).toBe(3);
  });

  it('expires postings that vanished from a board read successfully, but not from a failed board', async () => {
    const a = boardOf('alive', 'mid');
    const b = boardOf('flaky', 'mid');
    const pa = [posting(a, { title: 'Software Engineer' }), posting(a, { title: 'Backend Engineer' })];
    const pb = [posting(b, { title: 'Software Engineer' })];
    await runDaily({ ...deps([ok(a, pa), ok(b, pb)], NOW), request: { ...req(), acceptedRoleIds: ['software', 'backend'] } });
    const failed = { board: b, postings: [], report: { boardKey: 'greenhouse:flaky', ats: 'greenhouse' as const, status: 'failed' as const, fetched: 0, skipped: [], attempts: 4, httpStatus: 503, error: 'HTTP 503', retryable: true, at: day(1).toISOString() } };
    const r = await runDaily({ ...deps([ok(a, [pa[0]!]), failed], day(1)), request: { ...req(), acceptedRoleIds: ['software', 'backend'], now: day(1) } });
    expect(r.newlyExpired).toBe(1);
    const status = Object.fromEntries((await db.query<{ external_id: string; status: string }>(`SELECT external_id, status FROM job_postings`)).rows.map((x) => [x.external_id, x.status]));
    expect(status[pa[0]!.externalId]).toBe('active');
    expect(status[pa[1]!.externalId]).toBe('expired');
    expect(status[pb[0]!.externalId]).toBe('active'); // failed board proves nothing
  });

  it('suppresses notifications when nothing is significant and records why', async () => {
    const t = await register();
    await call('/v1/profile', { method: 'PUT', token: t, body: JSON.stringify({ ...profileBody(), skills: [] }) });
    await runDaily(deps(pool(15, 3), NOW));
    const rows = (await db.query<{ channel: string; status: string; reason: string }>(`SELECT channel, status, reason FROM notification_deliveries ORDER BY channel`)).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(['sent', 'queued', 'suppressed']).toContain(r.status);
    const push = rows.find((r) => r.channel === 'push');
    if (push && push.status !== 'suppressed') expect(push.reason).toBe('Channel provider not configured'); // never pretends to have pushed
  });

  it('loadEvidence marks postings found by later snapshot-less runs as new_since_scan', async () => {
    await saveSample(NOW, true, pool(15, 3));
    const more = pool(15, 3).map((r) => ({ ...r }));
    const extra = boardOf('newco', 'mid');
    more.push(ok(extra, [posting(extra, { title: 'Software Engineer' })]));
    await saveScan(db, { outcome: buildScan(more, req()), request: req(), boards: more.map((r) => r.board), startedAt: day(1), finishedAt: new Date(day(1).getTime() + 60_000), snapshotLabel: 'x', createSnapshot: false });
    const ev = await loadEvidence(db);
    expect(ev!.sampleJobs).toHaveLength(100);
    expect(ev!.scan.finishedAt).toBe(NOW.toISOString());
  });
});
