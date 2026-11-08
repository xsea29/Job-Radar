/**
 * The JobRadar server: REST API + live-update stream + its own scheduler.
 * No external cron is needed; a single process does everything:
 *   - once a day at DAILY_AT (in TIMEZONE): full scan, snapshot (if due), reports, notification decisions
 *   - every REFRESH_EVERY_MINUTES: fetch the public boards, store new/changed postings, expire vanished ones
 *   - after each run: tells connected apps to refresh (server-sent events)
 * A daily run missed while the server was down is caught up on start.
 */
import { defaultContext, defaultRequest } from '@jobradar/ingest';
import { loadBoards } from '../config';
import { connect } from '../db/connect';
import { migrate } from '../db/migrate';
import { seedReference } from '../db/repo';
import { EventHub } from '../events';
import { DEFAULT_SCHEDULE, Scheduler, type ScheduleConfig } from '../scheduler';
import { createApp } from '../server';
import { runPipeline } from '../worker';

const env = process.env;
const secret = env.JWT_SECRET;
if (!secret || secret.length < 32) {
  console.error('Set JWT_SECRET to a random string of at least 32 characters (e.g. `openssl rand -base64 48`).');
  process.exit(2);
}

const cfg: ScheduleConfig = {
  ...DEFAULT_SCHEDULE,
  dailyAt: env.DAILY_AT ?? DEFAULT_SCHEDULE.dailyAt,
  timeZone: env.TIMEZONE ?? DEFAULT_SCHEDULE.timeZone,
  refreshEveryMinutes: env.REFRESH_EVERY_MINUTES != null ? Number(env.REFRESH_EVERY_MINUTES) : DEFAULT_SCHEDULE.refreshEveryMinutes,
};

const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
const db = await connect();
await migrate(db);
await seedReference(db);

const boardsPath = env.BOARDS_FILE ?? 'config/boards.verified.json';
const role = (env.TARGET_ROLE as 'fullstack' | 'backend' | 'frontend' | 'software' | undefined) ?? 'fullstack';
const adjacent = { fullstack: ['fullstack', 'software'], backend: ['backend', 'software'], frontend: ['frontend', 'software'], software: ['software', 'fullstack', 'backend', 'frontend'] } as const;
const years = Number(env.TARGET_YEARS ?? 4);
const deps = () => ({
  db,
  boards: loadBoards(boardsPath), // re-read each run so edits to the file apply without a restart
  ctx: defaultContext(),
  request: defaultRequest({ targetRoleId: role, acceptedRoleIds: [...adjacent[role]], experience: { min: Math.max(0, years - 1), max: years + 2 } }),
});

const hub = new EventHub();
const scheduler = new Scheduler(cfg, {
  runDaily: (keyDate) => runPipeline({ ...deps(), keyDate }, 'daily'),
  runRefresh: (slot) => runPipeline({ ...deps(), slot }, 'refresh'),
  dailyDone: async (keyDate) => (await db.query(`SELECT 1 FROM worker_runs WHERE run_key=$1 AND state='succeeded'`, [`daily:${keyDate}`])).rows.length > 0,
  needsBootstrap: async () => (await db.query(`SELECT 1 FROM scan_runs WHERE snapshot_created AND state IN ('complete','partial') LIMIT 1`)).rows.length === 0,
  log,
  onFinished: (kind, r) => hub.publish('evidence-updated', { kind, newPostings: r.newPostings ?? 0, newlyExpired: r.newlyExpired ?? 0 }),
});

const app = createApp({
  db, jwtSecret: secret, corsOrigin: env.CORS_ORIGIN, hub,
  runScan: () => runPipeline({ ...deps(), slot: Date.now() }, 'refresh').then((r) => hub.publish('evidence-updated', { kind: 'manual', newPostings: r.newPostings ?? 0 })),
});
const port = Number(env.PORT ?? 8787);
const server = app.listen(port, () => {
  log(`JobRadar API on :${port} · daily ${cfg.dailyAt} ${cfg.timeZone} · refresh ${cfg.refreshEveryMinutes ? `every ${cfg.refreshEveryMinutes} min` : 'off'} · boards: ${boardsPath}`);
  scheduler.start();
});

const stop = () => {
  log('Shutting down…');
  scheduler.stop();
  hub.close();
  server.close(() => void db.close().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
