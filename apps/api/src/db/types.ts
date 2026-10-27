/** Minimal driver-neutral interface so production (pg) and dev/tests (PGlite) share all SQL. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Run several statements without parameters (migrations). */
  exec(sql: string): Promise<void>;
  /** Run `fn` in a transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
