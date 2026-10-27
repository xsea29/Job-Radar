import { PGlite } from '@electric-sql/pglite';
import type { Db } from './types';

function wrap(db: PGlite | Parameters<Parameters<PGlite['transaction']>[0]>[0], owner?: PGlite): Db {
  const self: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await db.query<T>(sql, params);
      return { rows: r.rows };
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      if (!owner) return fn(self); // already inside a transaction
      return owner.transaction((tx) => fn(wrap(tx)));
    },
    async close() {
      await owner?.close();
    },
  };
  return self;
}

/** In-process Postgres (WASM). `dataDir` persists to disk; omit for an in-memory database. */
export async function createPglite(dataDir?: string): Promise<Db> {
  const db = await PGlite.create(dataDir);
  return wrap(db, db);
}
