import type { DailyResult, PipelineMode } from './worker';
import type { RuntimeDeps } from './runtime';
import { runPipeline } from './worker';

export type TriggerMode = 'refresh' | 'daily';
export type ClaimResult = 'ok' | 'locked' | 'already-ran';

export interface TriggerHandle {
  /** Settles as soon as the run slot was claimed or refused (fast); rejects if the database is unreachable. */
  claimed: Promise<ClaimResult>;
  /** Settles when the run finishes (slow). */
  done: Promise<DailyResult>;
}
export type Trigger = (mode: TriggerMode) => TriggerHandle;

/**
 * Start the scanner on demand. `refresh` finds new postings and expires vanished ones;
 * `daily` also records a scan, reports and notification decisions.
 *
 * Calls are rate-limited by design, not by luck: a refresh is claimed per `slotMinutes`
 * window (default 10) and a daily run per UTC date, so hammering the endpoint cannot start
 * a stampede of fetches against the job boards. A repeat inside the window is a no-op.
 */
export function makeTrigger(deps: () => RuntimeDeps & { collect?: Parameters<typeof runPipeline>[0]['collect'] }, slotMinutes = 10): Trigger {
  return (mode) => {
    let resolveClaim!: (c: ClaimResult) => void;
    let rejectClaim!: (e: unknown) => void;
    const claimed = new Promise<ClaimResult>((res, rej) => {
      resolveClaim = res;
      rejectClaim = rej;
    });
    const now = new Date();
    const pipeline: PipelineMode = mode === 'daily' ? 'daily' : 'refresh';
    const done = (async () => {
      try {
        return await runPipeline({ ...deps(), now, keyDate: now.toISOString().slice(0, 10), slot: Math.floor(now.getTime() / (Math.max(1, slotMinutes) * 60_000)), onClaim: resolveClaim }, pipeline);
      } catch (e) {
        rejectClaim(e); // no-op if the claim already settled
        throw e;
      }
    })();
    done.catch(() => undefined); // surfaced through `claimed` / logged by the caller; never an unhandled rejection
    return { claimed, done };
  };
}
