import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Response } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventHub, createPglite, migrate, watchRuns, runtimeDeps, type Db } from '../src';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('watchRuns (live push for runs made by OTHER processes, e.g. cron jobs)', () => {
  let db: Db;
  beforeEach(async () => { db = await createPglite(); await migrate(db); });

  const stubClient = () => {
    const writes: string[] = [];
    const res = { writeHead: () => undefined, write: (s: string) => { writes.push(s); return true; }, on: () => undefined, end: () => undefined } as unknown as Response;
    return { res, events: () => writes.filter((w) => w.startsWith('event:')) };
  };

  it('signals clients when a run finishes elsewhere, but not for pre-existing runs or when nothing changed', async () => {
    await db.query(`INSERT INTO worker_runs (kind, run_key, state, finished_at) VALUES ('daily','daily:2026-11-07','succeeded', now() - interval '1 day')`);
    const hub = new EventHub();
    const c = stubClient();
    hub.add(c.res);
    const stop = watchRuns(db, hub, 20);
    await sleep(120);
    expect(c.events()).toHaveLength(0); // baseline taken, nothing announced
    await db.query(`INSERT INTO worker_runs (kind, run_key, state, finished_at) VALUES ('daily','refresh:99','succeeded', now())`);
    await sleep(150);
    expect(c.events()).toHaveLength(1);
    expect(c.events()[0]).toContain('evidence-updated');
    expect(c.events()[0]).toContain('"kind":"refresh"');
    await sleep(120);
    expect(c.events()).toHaveLength(1); // no repeat without a new run
    await db.query(`INSERT INTO worker_runs (kind, run_key, state, finished_at) VALUES ('daily','daily:2026-11-08','succeeded', now() + interval '1 second')`);
    await sleep(150);
    expect(c.events()).toHaveLength(2);
    stop();
    hub.close();
  });

  it('keeps running if the database errors, reporting it', async () => {
    const errors: unknown[] = [];
    const broken = { ...db, query: async () => { throw new Error('db down'); } } as unknown as Db;
    const stop = watchRuns(broken, new EventHub(), 20, (e) => errors.push(e));
    await sleep(100);
    stop();
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('runtimeDeps', () => {
  it('reads role/years/boards from the environment and rejects a bad role', async () => {
    const db = await createPglite();
    const dir = mkdtempSync(join(tmpdir(), 'jr-'));
    const file = join(dir, 'boards.json');
    writeFileSync(file, JSON.stringify({ boards: [{ ats: 'greenhouse', token: 'x', companyName: 'X' }] }));
    const d = runtimeDeps(db, { BOARDS_FILE: file, TARGET_ROLE: 'backend', TARGET_YEARS: '7' });
    expect(d.boards).toHaveLength(1);
    expect(d.request.targetRoleId).toBe('backend');
    expect(d.request.acceptedRoleIds).toEqual(['backend', 'software']);
    expect(d.request.experience).toEqual({ min: 6, max: 9 });
    expect(() => runtimeDeps(db, { BOARDS_FILE: file, TARGET_ROLE: 'wizard' })).toThrow(/TARGET_ROLE/);
    await db.close();
  });
});

describe('cron CLIs (what Render runs)', () => {
  const run = (script: string, env: Record<string, string>) =>
    spawnSync('npx', ['tsx', script], { cwd: join(__dirname, '..'), env: { ...process.env, NODE_NO_WARNINGS: '1', ...env }, encoding: 'utf8', timeout: 90_000 });

  it('exit non-zero when the run cannot start (so the platform marks the cron run failed)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jr-'));
    for (const script of ['src/cli/refresh.ts', 'src/cli/daily.ts']) {
      const r = run(script, { PGLITE_DIR: join(dir, script.replace(/\W/g, '')), BOARDS_FILE: join(dir, 'missing.json') });
      expect(r.status, script).toBe(1);
      expect(r.stderr).toMatch(/run failed/);
    }
  }, 120_000);

  it('exit 0 and print a result when the run succeeds (no boards = nothing to fetch)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jr-'));
    const file = join(dir, 'boards.json');
    writeFileSync(file, JSON.stringify({ boards: [{ ats: 'greenhouse', token: 'x', companyName: 'X' }] }));
    const r = run('src/cli/refresh.ts', { PGLITE_DIR: join(dir, 'db'), BOARDS_FILE: file, http_proxy: 'http://127.0.0.1:1', https_proxy: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', NODE_USE_ENV_PROXY: '1' });
    // The one board is unreachable here (dead proxy), which is a recorded failure of that board, not of the run.
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout.trim().split('\n').pop()!)).toMatchObject({ mode: 'refresh', failedBoards: ['greenhouse:x'] });
  }, 120_000);
});
