import { mkdirSync } from 'node:fs';
import { createPg } from './pg';
import { createPglite } from './pglite';
import type { Db } from './types';

/** DATABASE_URL → PostgreSQL; otherwise an on-disk PGlite database for local development. */
export async function connect(env: NodeJS.ProcessEnv = process.env): Promise<Db> {
  if (env.DATABASE_URL) return createPg(env.DATABASE_URL);
  const dir = env.PGLITE_DIR ?? './.data/pglite';
  mkdirSync(dir, { recursive: true });
  return createPglite(dir);
}
