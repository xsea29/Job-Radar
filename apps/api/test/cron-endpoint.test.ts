import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultContext, defaultRequest, type FetchResult } from '@jobradar/ingest';
import { createApp, createPglite, makeTrigger, migrate, seedReference, type Db } from '../src';
import { NOW, boardOf, ok, posting } from './helpers';

const SECRET = 'cron-secret-0123456789';
let db: Db;
let server: Server;
let base = '';
let fetchCalls = 0;
let results: FetchResult[] = [];
let gate: Promise<void> | null = null;

const boot = (over: { cronSecret?: string | undefined; slotMinutes?: number; authRateLimit?: number } = {}) => {
  server?.close();
  const trigger = makeTrigger(
    () => ({ db, boards: results.map((r) => r.board), ctx: defaultContext(), request: defaultRequest({ now: NOW }), collect: async () => { fetchCalls++; if (gate) await gate; return results; } }),
    over.slotMinutes ?? 10,
  );
  server = createApp({ db, jwtSecret: 'x'.repeat(40), trigger, cronSecret: 'cronSecret' in over ? over.cronSecret : SECRET, authRateLimit: over.authRateLimit ?? 100 }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const get = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(base + path, init);
  return { status: r.status, body: await r.json().catch(() => null) };
};
const bearer = { headers: { Authorization: `Bearer ${SECRET}` } };
const runs = async () => (await db.query<{ run_key: string; state: string }>(`SELECT run_key, state FROM worker_runs ORDER BY started_at`)).rows;
const until = async (cond: () => Promise<boolean>, ms = 20_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };

beforeEach(async () => {
  db = await createPglite(); await migrate(db); await seedReference(db);
  fetchCalls = 0; gate = null;
  const b = boardOf('acme', 'mid');
  results = [ok(b, [posting(b, { title: 'Software Engineer' })])];
  boot();
});
afterEach(() => server.close());

describe('GET|POST /v1/cron/scan', () => {
  it('is disabled (501) until CRON_SECRET is configured, and a too-short secret does not enable it', async () => {
    boot({ cronSecret: undefined });
    expect((await get('/v1/cron/scan', bearer)).status).toBe(501);
    boot({ cronSecret: 'short' });
    expect((await get('/v1/cron/scan', { headers: { Authorization: 'Bearer short' } })).status).toBe(501);
    expect(fetchCalls).toBe(0);
  });

  it('rejects missing and wrong secrets without starting anything', async () => {
    expect((await get('/v1/cron/scan')).status).toBe(401);
    expect((await get('/v1/cron/scan', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await get(`/v1/cron/scan?key=wrong`)).status).toBe(401);
    expect(fetchCalls).toBe(0);
    expect(await runs()).toEqual([]);
  });

  it('accepts the secret as a Bearer token, an X-Cron-Secret header, or ?key=, via GET or POST', async () => {
    boot({ slotMinutes: 1 });
    const a = await get('/v1/cron/scan', bearer);
    expect(a).toMatchObject({ status: 202, body: { status: 'started', mode: 'refresh' } });
    await until(async () => (await runs()).every((r) => r.state === 'succeeded') && (await runs()).length === 1);
    // new slot each time → fresh claim: simulate by using daily (different key) and then other auth styles on repeats
    const b = await get('/v1/cron/scan?mode=daily', { headers: { 'X-Cron-Secret': SECRET } });
    expect(b.status).toBe(202);
    await until(async () => (await runs()).length === 2 && (await runs()).every((r) => r.state === 'succeeded'));
    const c = await get(`/v1/cron/scan?key=${SECRET}`, { method: 'POST' });
    expect([200, 202]).toContain(c.status); // same refresh slot as (a): already-ran or a new slot
    expect(['already-ran', 'started']).toContain(c.body.status);
  });

  it('actually runs the scanner: new postings are stored and the run is recorded', async () => {
    const r = await get('/v1/cron/scan?wait=true', bearer);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'done', mode: 'refresh', result: { mode: 'refresh', newPostings: 1, validPostings: 1 } });
    expect(Number((await db.query<{ n: string }>(`SELECT count(*) n FROM job_postings`)).rows[0]!.n)).toBe(1);
    expect((await runs())[0]).toMatchObject({ state: 'succeeded' });
  });

  it('a repeat inside the slot is a harmless no-op (no second fetch), so the endpoint cannot be used to hammer the job boards', async () => {
    const first = await get('/v1/cron/scan?wait=true', bearer);
    expect(first.body.status).toBe('done');
    const again = await get('/v1/cron/scan?wait=true', bearer);
    expect(again).toMatchObject({ status: 200, body: { status: 'already-ran' } });
    expect(fetchCalls).toBe(1);
  });

  it('daily mode runs the full workflow once per day', async () => {
    const r = await get('/v1/cron/scan?mode=daily&wait=true', bearer);
    expect(r.body).toMatchObject({ status: 'done', mode: 'daily', result: { mode: 'daily', snapshotCreated: true } });
    expect(Number((await db.query<{ n: string }>(`SELECT count(*) n FROM scan_runs`)).rows[0]!.n)).toBe(1);
    expect((await get('/v1/cron/scan?mode=daily&wait=true', bearer)).body.status).toBe('already-ran');
  });

  it('answers immediately (202) while the slow scan keeps running, and reports "busy" to a second caller', async () => {
    let release!: () => void;
    gate = new Promise<void>((r) => { release = r; });
    const t0 = Date.now();
    const started = await get('/v1/cron/scan', bearer);
    expect(started).toMatchObject({ status: 202, body: { status: 'started' } });
    expect(Date.now() - t0).toBeLessThan(5000); // did not wait for the scan
    const busy = await get('/v1/cron/scan?mode=daily', bearer);
    expect(busy).toMatchObject({ status: 200, body: { status: 'busy' } });
    release();
    await until(async () => (await runs()).some((r) => r.state === 'succeeded'));
  });

  it('validates the mode and rate-limits repeated bad attempts', async () => {
    expect((await get('/v1/cron/scan?mode=everything', bearer)).status).toBe(400);
    boot({ authRateLimit: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await get('/v1/cron/scan?key=bad')).status);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
  });

  it('a database failure is a clean 500, never a hang', async () => {
    const broken = { ...db, transaction: async () => { throw new Error('db down'); } } as unknown as Db;
    server.close();
    server = createApp({ db: broken, jwtSecret: 'x'.repeat(40), cronSecret: SECRET, trigger: makeTrigger(() => ({ db: broken, boards: [], ctx: defaultContext(), request: defaultRequest({ now: NOW }) })) }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const r = await get('/v1/cron/scan', bearer);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('db down');
  });
});

describe('POST /v1/refresh (the app button)', () => {
  const bootPublic = (over: { publicRefresh?: boolean; authRateLimit?: number; trustProxy?: number } = {}) => {
    server.close();
    const trigger = makeTrigger(() => ({ db, boards: results.map((r) => r.board), ctx: defaultContext(), request: defaultRequest({ now: NOW }), collect: async () => { fetchCalls++; return results; } }), 10);
    server = createApp({ db, jwtSecret: 'x'.repeat(40), trigger, publicRefresh: over.publicRefresh ?? true, authRateLimit: over.authRateLimit ?? 100, trustProxy: over.trustProxy }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const post = (path = '/v1/refresh', headers: Record<string, string> = {}) => get(path, { method: 'POST', headers });

  it('is off (501) unless explicitly enabled', async () => {
    bootPublic({ publicRefresh: false });
    expect((await post()).status).toBe(501);
    expect(fetchCalls).toBe(0);
  });

  it('needs no login or secret, runs the scanner, waits for the result and reports when data was last updated', async () => {
    bootPublic();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'done', mode: 'refresh', result: { newPostings: 1, validPostings: 1 } });
    expect(typeof r.body.lastRunAt).toBe('string');
    expect(Number((await db.query<{ n: string }>(`SELECT count(*) n FROM job_postings`)).rows[0]!.n)).toBe(1);
  });

  it('many presses = one scan: repeats are `already-ran` and fetch nothing (cannot be used to hammer the boards)', async () => {
    bootPublic();
    expect((await post()).body.status).toBe('done');
    for (let i = 0; i < 5; i++) expect((await post()).body).toMatchObject({ status: 'already-ran' });
    expect(fetchCalls).toBe(1);
  });

  it('can return immediately with ?wait=false', async () => {
    bootPublic();
    const r = await post('/v1/refresh?wait=false');
    expect(r).toMatchObject({ status: 202, body: { status: 'started' } });
    await until(async () => (await runs()).some((x) => x.state === 'succeeded'));
  });

  it('only POST is accepted (a link preview or crawler GET cannot trigger it)', async () => {
    bootPublic();
    expect((await get('/v1/refresh')).status).toBe(404);
    expect(fetchCalls).toBe(0);
  });

  it('rate-limits per client IP, and behind a proxy different users have different limits', async () => {
    bootPublic({ authRateLimit: 2, trustProxy: 1 });
    const a = () => post('/v1/refresh?wait=false', { 'X-Forwarded-For': '203.0.113.7' }).then((r) => r.status);
    const codes = [await a(), await a(), await a()];
    expect(codes[2]).toBe(429);
    const other = await post('/v1/refresh?wait=false', { 'X-Forwarded-For': '198.51.100.9' }); // a different user is not blocked
    expect(other.status).not.toBe(429);
  });
});
