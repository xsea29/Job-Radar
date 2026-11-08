/**
 * Refresh postings once, then exit (cron entry point, e.g. a Render Cron Job every 30 min):
 * store new/changed postings and expire vanished ones. No scan record, no reports.
 * REFRESH_SLOT_MINUTES (default 30) makes a duplicate trigger inside the same slot a no-op.
 */
import { connect } from '../db/connect';
import { migrate } from '../db/migrate';
import { seedReference } from '../db/repo';
import { runtimeDeps } from '../runtime';
import { runRefresh } from '../worker';

const slotMinutes = Math.max(5, Number(process.env.REFRESH_SLOT_MINUTES ?? 30));
const db = await connect();
let code = 0;
try {
  await migrate(db);
  await seedReference(db);
  console.log(JSON.stringify(await runRefresh({ ...runtimeDeps(db), slot: Math.floor(Date.now() / (slotMinutes * 60_000)) })));
} catch (e) {
  console.error('refresh run failed:', e instanceof Error ? e.message : e);
  code = 1;
} finally {
  await db.close();
}
process.exit(code);
