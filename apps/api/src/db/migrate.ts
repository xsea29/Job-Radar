import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './types';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

/** Apply pending `NNN_name.sql` files in order, each in its own transaction, once. */
export async function migrate(db: Db, dir = DIR): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()) {
    if (done.has(file)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(readFileSync(join(dir, file), 'utf8'));
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
