/** Run the daily workflow once (cron / scheduler entry point). */
import { defaultContext, defaultRequest } from '@jobradar/ingest';
import { loadBoards } from '../config';
import { connect } from '../db/connect';
import { migrate } from '../db/migrate';
import { seedReference } from '../db/repo';
import { runDaily } from '../worker';

const db = await connect();
await migrate(db);
await seedReference(db);
const r = await runDaily({ db, boards: loadBoards(process.env.BOARDS_FILE ?? 'config/boards.verified.json'), request: defaultRequest(), ctx: defaultContext() });
console.log(JSON.stringify(r));
await db.close();
