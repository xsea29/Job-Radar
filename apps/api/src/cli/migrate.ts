import { connect } from '../db/connect';
import { migrate } from '../db/migrate';
import { seedReference } from '../db/repo';

const db = await connect();
const applied = await migrate(db);
await seedReference(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Schema up to date.');
await db.close();
