import { defaultContext, defaultRequest, type AdapterContext, type BoardConfig, type ScanRequest } from '@jobradar/ingest';
import { loadBoards } from './config';
import type { Db } from './db/types';

type Role = 'fullstack' | 'backend' | 'frontend' | 'software';
const ADJACENT: Record<Role, Role[]> = { fullstack: ['fullstack', 'software'], backend: ['backend', 'software'], frontend: ['frontend', 'software'], software: ['software', 'fullstack', 'backend', 'frontend'] };

export interface RuntimeDeps {
  db: Db;
  boards: BoardConfig[];
  ctx: AdapterContext;
  request: ScanRequest;
}

/**
 * What a run collects, from environment variables. Shared by the server, the
 * `daily` / `refresh` CLIs (used by Render cron jobs) so they cannot drift apart.
 * The boards file is re-read on every call: edits apply without a restart.
 */
export function runtimeDeps(db: Db, env: NodeJS.ProcessEnv = process.env): RuntimeDeps {
  const role = (env.TARGET_ROLE ?? 'fullstack') as Role;
  if (!ADJACENT[role]) throw new Error(`TARGET_ROLE must be one of ${Object.keys(ADJACENT).join(', ')} (got "${role}")`);
  const years = Number(env.TARGET_YEARS ?? 4);
  return {
    db,
    boards: loadBoards(env.BOARDS_FILE ?? 'config/boards.verified.json'),
    ctx: defaultContext(),
    request: defaultRequest({ targetRoleId: role, acceptedRoleIds: ADJACENT[role], experience: { min: Math.max(0, years - 1), max: years + 2 } }),
  };
}
