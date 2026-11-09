/**
 * The JobRadar server: REST API + live-update stream + its own scheduler.
 * No external cron is needed; a single process does everything:
 *   - once a day at DAILY_AT (in TIMEZONE): full scan, snapshot (if due), reports, notification decisions
 *   - every REFRESH_EVERY_MINUTES: fetch the public boards, store new/changed postings, expire vanished ones
 *   - after each run (by this process OR a cron job): tells connected apps to refresh (server-sent events)
 * With SCHEDULER=off the process only serves the API and the live stream; use cron jobs for the runs.
 * A daily run missed while the server was down is caught up on start.
 */
import { connect } from '../db/connect';
import { migrate } from '../db/migrate';
import { seedReference } from '../db/repo';
import { EventHub, watchRuns } from '../events';
import { runtimeDeps } from '../runtime';
import { DEFAULT_SCHEDULE, Scheduler, type ScheduleConfig } from '../scheduler';
import { createApp } from '../server';
import { makeTrigger } from '../trigger';
import { releaseActiveRun, runPipeline } from '../worker';

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

if (env.CRON_SECRET && env.CRON_SECRET.length < 16) {
  console.error('CRON_SECRET must be at least 16 characters (or leave it unset to disable /v1/cron/scan).');
  process.exit(2);
}
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
const db = await connect();
await migrate(db);
await seedReference(db);

const boardsPath = env.BOARDS_FILE ?? 'config/boards.verified.json';
const deps = () => runtimeDeps(db, env); // re-reads the boards file each run

const hub = new EventHub();
// Live push for runs made by this process AND by other processes (cron jobs): watch the run ledger.
const stopWatching = watchRuns(db, hub, 15_000, (e) => log(`run watcher: ${e instanceof Error ? e.message : e}`));

// SCHEDULER=off: this process only serves the API; runs come from cron jobs (see render.yaml).
const schedulerOn = (env.SCHEDULER ?? 'on') !== 'off';
const scheduler = new Scheduler(cfg, {
  runDaily: (keyDate) => runPipeline({ ...deps(), keyDate }, 'daily'),
  runRefresh: (slot) => runPipeline({ ...deps(), slot }, 'refresh'),
  dailyDone: async (keyDate) => (await db.query(`SELECT 1 FROM worker_runs WHERE run_key=$1 AND state='succeeded'`, [`daily:${keyDate}`])).rows.length > 0,
  needsBootstrap: async () => (await db.query(`SELECT 1 FROM scan_runs WHERE snapshot_created AND state IN ('complete','partial') LIMIT 1`)).rows.length === 0,
  log,
});

const app = createApp({
  db, jwtSecret: secret, corsOrigin: env.CORS_ORIGIN, hub,
  trigger: makeTrigger(deps, Number(env.CRON_SLOT_MINUTES ?? 10)),
  cronSecret: env.CRON_SECRET,
  publicRefresh: (env.PUBLIC_REFRESH ?? 'on') !== 'off',
  trustProxy: env.TRUST_PROXY ?? (env.RENDER ? '1' : undefined), // Render sets RENDER=true and sits behind one proxy hop
});
const port = Number(env.PORT ?? 8787);
// With the scheduler off (cron jobs do the runs) a brand-new deployment would sit empty until the
// first cron fires; do ONE daily run now if there is no evidence base at all.
const bootstrapIfEmpty = async () => {
  if (schedulerOn) return; // the scheduler's own bootstrap rule covers this
  const empty = (await db.query(`SELECT 1 FROM scan_runs WHERE snapshot_created AND state IN ('complete','partial') LIMIT 1`)).rows.length === 0;
  if (!empty) return;
  log('No evidence yet: running one initial daily run…');
  try {
    log(`initial run: ${JSON.stringify(await runPipeline({ ...deps(), keyDate: new Date().toISOString().slice(0, 10) }, 'daily'))}`);
  } catch (e) {
    log(`initial run failed: ${e instanceof Error ? e.message : e}`);
  }
};

const server = app.listen(port, () => {
  log(`JobRadar API on :${port} · scheduler ${schedulerOn ? `on (daily ${cfg.dailyAt} ${cfg.timeZone}, refresh ${cfg.refreshEveryMinutes ? `every ${cfg.refreshEveryMinutes} min` : 'off'})` : 'off (runs come from cron jobs)'} · boards: ${boardsPath}`);
  if (schedulerOn) scheduler.start();
  else void bootstrapIfEmpty();
});

const stop = () => {
  log('Shutting down…');
  scheduler.stop();
  stopWatching();
  hub.close();
  // Release an in-flight run's marker so the next instance can take over at once (a deploy or env change restarts us).
  void releaseActiveRun().catch(() => undefined).finally(() => server.close(() => void db.close().then(() => process.exit(0))));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
