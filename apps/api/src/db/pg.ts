import pg from 'pg';
import type { Db } from './types';

function wrap(client: pg.Pool | pg.PoolClient, pool?: pg.Pool): Db {
  const self: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await client.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await client.query(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      if (!pool) return fn(self);
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const out = await fn(wrap(c));
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    async close() {
      await pool?.end();
    },
  };
  return self;
}

export function createPg(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return wrap(pool, pool);
}
