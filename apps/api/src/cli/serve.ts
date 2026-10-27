import { loadBoards } from '../config';
import { connect } from '../db/connect';
import { migrate } from '../db/migrate';
import { seedReference } from '../db/repo';
import { createApp } from '../server';
import { runDaily } from '../worker';
import { defaultContext, defaultRequest } from '@jobradar/ingest';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  console.error('Set JWT_SECRET to a random string of at least 32 characters.');
  process.exit(2);
}
const db = await connect();
await migrate(db);
await seedReference(db);
const boardsPath = process.env.BOARDS_FILE ?? 'config/boards.verified.json';
const app = createApp({
  db, jwtSecret: secret, corsOrigin: process.env.CORS_ORIGIN,
  runScan: () => runDaily({ db, boards: loadBoards(boardsPath), request: defaultRequest(), ctx: defaultContext() }),
});
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`JobRadar API on :${port}`));
