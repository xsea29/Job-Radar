/**
 * Run the daily workflow once, then exit (cron entry point, e.g. a Render Cron Job).
 * Exit code 1 on failure so the scheduler marks the run failed.
 */
import { connect } from '../db/connect';
import { migrate } from '../db/migrate';
import { seedReference } from '../db/repo';
import { runtimeDeps } from '../runtime';
import { runDaily } from '../worker';

const db = await connect();
let code = 0;
try {
  await migrate(db);
  await seedReference(db);
  console.log(JSON.stringify(await runDaily(runtimeDeps(db))));
} catch (e) {
  console.error('daily run failed:', e instanceof Error ? e.message : e);
  code = 1;
} finally {
  await db.close();
}
process.exit(code);
