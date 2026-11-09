import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultContext, defaultRequest } from '@jobradar/ingest';
import { DEFAULT_SCHEDULE, EventHub, Scheduler, createApp, createPglite, loadEvidence, migrate, parseTime, releaseActiveRun, runPipeline, seedReference, zonedParts, claimRun, type DailyResult, type Db } from '../src';
import { NOW, boardOf, ok, pool, posting } from './helpers';

describe('time helpers', () => {
  it('reads wall-clock time in a zone (IST = UTC+5:30)', () => {
    expect(zonedParts(new Date('2026-11-08T00:30:00Z'), 'Asia/Kolkata')).toEqual({ date: '2026-11-08', minutes: 6 * 60 });
    expect(zonedParts(new Date('2026-11-07T20:00:00Z'), 'Asia/Kolkata')).toEqual({ date: '2026-11-08', minutes: 1 * 60 + 30 });
  });
  it('validates HH:MM', () => {
    expect(parseTime('06:00')).toBe(360);
    expect(() => parseTime('25:00')).toThrow();
    expect(() => parseTime('6am')).toThrow();
  });
});

describe('Scheduler.tick', () => {
  const mk = (over: { done?: boolean; boot?: boolean; failDaily?: boolean } = {}) => {
    const calls: string[] = [];
    let t = new Date('2026-11-08T00:00:00Z').getTime(); // 05:30 IST
    let done = over.done ?? false;
    let fail = over.failDaily ?? false;
    const finished: string[] = [];
    const s = new Scheduler({ ...DEFAULT_SCHEDULE, refreshEveryMinutes: 60 }, {
      now: () => new Date(t),
      runDaily: async (d): Promise<DailyResult> => { calls.push(`daily:${d}`); if (fail) throw new Error('boom'); done = true; return { mode: 'daily' }; },
      runRefresh: async (slot): Promise<DailyResult> => { calls.push(`refresh:${slot}`); return { mode: 'refresh', newPostings: 2 }; },
      dailyDone: async () => done,
      needsBootstrap: async () => over.boot ?? false,
      onFinished: (k) => finished.push(k),
    });
    return { s, calls, finished, at: (iso: string) => { t = new Date(iso).getTime(); }, fix: () => { fail = false; } };
  };

  it('refreshes before the daily time, runs the daily job once after it, then goes back to refreshing', async () => {
    const x = mk();
    expect(await x.s.tick()).toBe('refresh'); // 05:30 IST, daily not due
    expect(await x.s.tick()).toBe('idle'); // refresh interval not elapsed
    x.at('2026-11-08T00:31:00Z'); // 06:01 IST
    expect(await x.s.tick()).toBe('daily');
    expect(x.calls.filter((c) => c.startsWith('daily'))).toEqual(['daily:2026-11-08']);
    x.at('2026-11-08T01:40:00Z');
    expect(await x.s.tick()).toBe('refresh'); // daily is done, refresh resumes
    expect(x.calls.filter((c) => c.startsWith('daily'))).toHaveLength(1);
    expect(x.finished).toEqual(['refresh', 'daily', 'refresh']);
  });

  it('catches up a missed daily run when the server starts late', async () => {
    const x = mk();
    x.at('2026-11-08T09:00:00Z'); // 14:30 IST, nobody ran today
    expect(await x.s.tick()).toBe('daily');
  });

  it('runs the daily job immediately on first start (no evidence yet), whatever the time', async () => {
    const x = mk({ boot: true });
    expect(await x.s.tick()).toBe('daily'); // 05:30 IST, before 06:00
  });

  it('does nothing extra when the daily job already succeeded today', async () => {
    const x = mk({ done: true });
    x.at('2026-11-08T09:00:00Z');
    expect(await x.s.tick()).toBe('refresh');
    expect(x.calls.some((c) => c.startsWith('daily'))).toBe(false);
  });

  it('retries a failed daily job after the wait, then succeeds', async () => {
    const x = mk({ failDaily: true });
    x.at('2026-11-08T00:31:00Z');
    expect(await x.s.tick()).toBe('retry-wait');
    x.at('2026-11-08T00:40:00Z'); // 9 min later: still waiting (15), so refresh not daily
    expect(await x.s.tick()).toBe('refresh');
    x.fix();
    x.at('2026-11-08T00:50:00Z'); // 19 min after failure
    expect(await x.s.tick()).toBe('daily');
  });

  it('never overlaps runs in one process', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const s = new Scheduler(DEFAULT_SCHEDULE, { now: () => new Date('2026-11-08T01:00:00Z'), runDaily: async () => { await gate; return {}; }, runRefresh: async () => ({}), dailyDone: async () => false });
    const first = s.tick();
    expect(await s.tick()).toBe('busy');
    release();
    await first;
  });

  it('rejects an absurdly short refresh interval', () => {
    expect(() => new Scheduler({ ...DEFAULT_SCHEDULE, refreshEveryMinutes: 1 }, { runDaily: async () => ({}), runRefresh: async () => ({}), dailyDone: async () => true })).toThrow(/at least 5/);
  });
});

describe('pipeline modes on the database', () => {
  let db: Db;
  beforeEach(async () => { db = await createPglite(); await migrate(db); await seedReference(db); });
  const req = () => defaultRequest({ now: NOW });
  const deps = (results: ReturnType<typeof pool>, now: Date, extra: object = {}) => ({ db, boards: results.map((r) => r.board), request: { ...req(), now }, ctx: defaultContext(), collect: async () => results, now, ...extra });
  const n = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0]!.n);

  it('refresh stores new postings and expires vanished ones WITHOUT creating a scan, snapshot or report', async () => {
    const a = boardOf('live', 'mid');
    const p1 = posting(a, { title: 'Software Engineer' });
    const p2 = posting(a, { title: 'Backend Engineer' });
    const r = { ...req(), acceptedRoleIds: ['software', 'backend'] as ('software' | 'backend')[] };
    const first = await runPipeline({ ...deps([ok(a, [p1, p2])], NOW), request: r, slot: 1 }, 'refresh');
    expect(first).toMatchObject({ mode: 'refresh', newPostings: 2, validPostings: 2 });
    expect(await n(`SELECT count(*) n FROM scan_runs`)).toBe(0);
    expect(await n(`SELECT count(*) n FROM skill_demand_snapshots`)).toBe(0);
    expect(await n(`SELECT count(*) n FROM job_postings WHERE status='active'`)).toBe(2);
    const later = new Date(NOW.getTime() + 3_600_000);
    const p3 = posting(a, { title: 'Software Engineer II' });
    const second = await runPipeline({ ...deps([ok(a, [p1, p3])], later), request: { ...r, now: later }, slot: 2 }, 'refresh');
    expect(second).toMatchObject({ newPostings: 1, newlyExpired: 1 });
    const st = Object.fromEntries((await db.query<{ external_id: string; status: string }>(`SELECT external_id, status FROM job_postings`)).rows.map((x) => [x.external_id, x.status]));
    expect(st).toEqual({ [p1.externalId]: 'active', [p2.externalId]: 'expired', [p3.externalId]: 'active' });
  });

  it('refresh is idempotent per slot, and keeps ALL relevant postings (no 100-job cap)', async () => {
    const results = pool(30, 4); // 360 relevant postings
    const a = await runPipeline(deps(results, NOW, { slot: 7 }), 'refresh');
    expect(a.validPostings).toBe(360);
    expect(await n(`SELECT count(*) n FROM job_postings`)).toBe(360);
    expect(await runPipeline(deps(results, NOW, { slot: 7 }), 'refresh')).toMatchObject({ skipped: 'already-ran' });
    expect(await runPipeline(deps(results, NOW, { slot: 8 }), 'refresh')).toMatchObject({ newPostings: 0 });
  });

  it('postings found by refreshes appear as new_since_scan after the daily scan, and the evidence base stays at 100', async () => {
    const results = pool(15, 3);
    await runPipeline(deps(results, NOW, { keyDate: '2026-10-27' }), 'daily');
    const extra = boardOf('newco', 'mid');
    const later = new Date(NOW.getTime() + 2 * 3_600_000);
    await runPipeline(deps([...results, ok(extra, [posting(extra, { title: 'Software Engineer' })])], later, { slot: 3 }), 'refresh');
    const ev = await loadEvidence(db);
    expect(ev!.sampleJobs).toHaveLength(100);
    expect(ev!.newJobs).toHaveLength(1);
    expect(ev!.newJobs[0]).toMatchObject({ companyName: 'newco', sample: 'new_since_scan' });
    expect(new Date(ev!.botRanAt).getTime()).toBeGreaterThanOrEqual(new Date(ev!.scan.finishedAt).getTime()); // "updated at" reflects the latest run
  });

  it('claims: one run at a time, per-key idempotency, failed runs can be retried', async () => {
    expect(await claimRun(db, 'daily', 'k1')).toBe('ok');
    expect(await claimRun(db, 'daily', 'k2')).toBe('locked'); // k1 still running
    await db.query(`UPDATE worker_runs SET state='failed' WHERE run_key='k1'`);
    expect(await claimRun(db, 'daily', 'k1')).toBe('ok'); // retry of the failed key
    await db.query(`UPDATE worker_runs SET state='succeeded' WHERE run_key='k1'`);
    expect(await claimRun(db, 'daily', 'k1')).toBe('already-ran');
    expect(await claimRun(db, 'daily', 'k2')).toBe('ok');
    await db.query(`UPDATE worker_runs SET started_at = now() - interval '2 hours' WHERE run_key='k2'`); // crashed run
    expect(await claimRun(db, 'daily', 'k3')).toBe('ok'); // stale 'running' does not block forever
  });

  it('a failing run is recorded as failed and rethrown', async () => {
    await expect(runPipeline({ ...deps([], NOW, { slot: 1 }), collect: async () => { throw new Error('network down'); } }, 'refresh')).rejects.toThrow('network down');
    const r = (await db.query<{ state: string; detail: { error: string } }>(`SELECT state, detail FROM worker_runs`)).rows[0]!;
    expect(r.state).toBe('failed');
    expect(r.detail.error).toContain('network down');
    expect(await runPipeline({ ...deps([], NOW, { slot: 1 }) }, 'refresh')).toMatchObject({ mode: 'refresh' }); // the failed slot can be retried
  });
});

describe('live updates (server-sent events)', () => {
  let db: Db;
  let server: Server;
  let hub: EventHub;
  let base = '';
  beforeEach(async () => {
    db = await createPglite(); await migrate(db); await seedReference(db);
    hub = new EventHub();
    server = createApp({ db, jwtSecret: 'x'.repeat(40), hub }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => { hub.close(); server.close(); });

  it('streams an evidence-updated signal to connected clients (and only a signal)', async () => {
    const ac = new AbortController();
    const res = await fetch(`${base}/v1/events`, { signal: ac.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = dec.decode((await reader.read()).value);
    expect(text).toContain(': connected');
    expect(hub.size).toBe(1);
    hub.publish('evidence-updated', { kind: 'refresh', newPostings: 3 });
    while (!text.includes('evidence-updated')) text += dec.decode((await reader.read()).value);
    const data = JSON.parse(text.split('data: ')[1]!.split('\n')[0]!);
    expect(data).toMatchObject({ kind: 'refresh', newPostings: 3 });
    expect(Object.keys(data).sort()).toEqual(['at', 'kind', 'newPostings']);
    ac.abort();
  });

  it('health reports the last successful run and live clients; events 501 when disabled', async () => {
    await runPipeline({ db, boards: [], request: defaultRequest({ now: NOW }), ctx: defaultContext(), collect: async () => [], now: NOW, slot: 1 }, 'refresh');
    const h = await (await fetch(`${base}/v1/health`)).json();
    expect(h).toMatchObject({ ok: true, liveClients: 0 });
    expect(h.lastRun.key).toBe('refresh:1');
    const off = createApp({ db, jwtSecret: 'x'.repeat(40) }).listen(0);
    expect((await fetch(`http://127.0.0.1:${(off.address() as AddressInfo).port}/v1/events`)).status).toBe(501);
    off.close();
  });
});

describe('left-behind run markers (restart / deploy while a run was in flight)', () => {
  let db: Db;
  beforeEach(async () => { db = await createPglite(); await migrate(db); await seedReference(db); });
  const n = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0]!.n);

  it('releaseActiveRun frees the slot immediately, so the next instance is not locked out', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const b = boardOf('slow', 'mid');
    const running = runPipeline({ db, boards: [b], request: defaultRequest({ now: NOW }), ctx: defaultContext(), now: NOW, slot: 1, collect: async () => { await gate; return [ok(b, [posting(b, { title: 'Software Engineer' })])]; } }, 'refresh');
    running.catch(() => undefined);
    while ((await n(`SELECT count(*) n FROM worker_runs WHERE state='running'`)) === 0) await new Promise((r) => setTimeout(r, 20));
    expect(await claimRun(db, 'daily', 'daily:next')).toBe('locked'); // the orphan-in-waiting blocks others
    expect(await releaseActiveRun()).toBe(true); // what the SIGTERM handler does
    expect(await claimRun(db, 'daily', 'daily:next')).toBe('ok'); // a new instance can start right away
    const row = (await db.query<{ state: string; detail: { error: string } }>(`SELECT state, detail FROM worker_runs WHERE run_key='refresh:1'`)).rows[0]!;
    expect(row.state).toBe('failed');
    expect(row.detail.error).toMatch(/shutdown/);
    release();
    await running.catch(() => undefined);
  });

  it('a marker from a dead process is retaken once stale (15 min), not 30', async () => {
    await db.query(`INSERT INTO worker_runs (kind, run_key, state, started_at) VALUES ('daily','daily:old','running', now() - interval '10 minutes')`);
    expect(await claimRun(db, 'daily', 'daily:new')).toBe('locked');
    await db.query(`UPDATE worker_runs SET started_at = now() - interval '16 minutes'`);
    expect(await claimRun(db, 'daily', 'daily:new')).toBe('ok');
  });

  it('the scheduler backs off for 2 min when the daily slot is locked, and logs once instead of every tick', async () => {
    let t = new Date('2026-11-09T05:00:00Z').getTime(); // 10:30 IST, daily due
    const calls: number[] = [];
    const logs: string[] = [];
    let locked = true;
    let done = false;
    const s = new Scheduler({ ...DEFAULT_SCHEDULE, refreshEveryMinutes: 0 }, {
      now: () => new Date(t), log: (m) => logs.push(m),
      runDaily: async (): Promise<DailyResult> => { calls.push(t); if (locked) return { skipped: 'locked', mode: 'daily' }; done = true; return { mode: 'daily' }; },
      runRefresh: async () => ({}), dailyDone: async () => done,
    });
    expect(await s.tick()).toBe('retry-wait');
    t += 30_000; expect(await s.tick()).toBe('idle'); // inside the back-off: no call, no log spam
    t += 30_000; expect(await s.tick()).toBe('idle');
    expect(calls).toHaveLength(1);
    t += 2 * 60_000; expect(await s.tick()).toBe('retry-wait'); // after 2 min it tries again
    expect(calls).toHaveLength(2);
    expect(logs.filter((l) => /holds the slot/.test(l))).toHaveLength(1); // logged once, not every time
    locked = false;
    t += 2 * 60_000; expect(await s.tick()).toBe('daily'); // slot freed → runs
  });
});
