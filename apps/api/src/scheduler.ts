import type { DailyResult } from './worker';

export interface ScheduleConfig {
  /** Local wall-clock time for the daily run, "HH:MM". */
  dailyAt: string;
  /** IANA time zone the daily time is expressed in. */
  timeZone: string;
  /** How often to refresh postings between daily runs (0 disables). Minimum 5. */
  refreshEveryMinutes: number;
  /** Wait before retrying a failed daily run. */
  retryMinutes: number;
  maxRetries: number;
}

export const DEFAULT_SCHEDULE: ScheduleConfig = { dailyAt: '06:00', timeZone: 'Asia/Kolkata', refreshEveryMinutes: 60, retryMinutes: 15, maxRetries: 3 };

/** Calendar date and minutes-since-midnight of `at` in `timeZone`. */
export function zonedParts(at: Date, timeZone: string): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(at)) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, minutes: Number(o.hour) * 60 + Number(o.minute) };
}

export function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`Invalid time "${hhmm}" (expected HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface SchedulerHooks {
  runDaily(keyDate: string): Promise<DailyResult>;
  runRefresh(slot: number): Promise<DailyResult>;
  /** Has a daily run already succeeded for this local date? */
  dailyDone(keyDate: string): Promise<boolean>;
  /** True while there is no evidence base at all: the daily run then happens immediately, whatever the time. */
  needsBootstrap?(): Promise<boolean>;
  now?: () => Date;
  log?: (msg: string) => void;
  /** Called after any run that finished (for pushing live updates to apps). */
  onFinished?: (kind: 'daily' | 'refresh', result: DailyResult) => void;
}

export type TickOutcome = 'daily' | 'refresh' | 'retry-wait' | 'idle' | 'busy';

/**
 * A small in-process scheduler (no cron daemon needed). `tick()` decides what is due:
 *  - the daily run, once the local time has passed `dailyAt` and no daily run succeeded
 *    today (this also CATCHES UP a run missed while the server was down), or immediately
 *    when there is no evidence base yet (first start);
 *  - otherwise a refresh every `refreshEveryMinutes`.
 * Failed daily runs are retried (`retryMinutes`, up to `maxRetries`). Runs never overlap in this
 * process, and the DB claim stops overlap across instances.
 */
export class Scheduler {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private lastRefreshAt = 0;
  private dailyFailures = 0;
  private retryNotBefore = 0;
  private readonly dailyMin: number;
  constructor(private readonly cfg: ScheduleConfig, private readonly h: SchedulerHooks) {
    this.dailyMin = parseTime(cfg.dailyAt);
    if (cfg.refreshEveryMinutes !== 0 && cfg.refreshEveryMinutes < 5) throw new Error('refreshEveryMinutes must be 0 or at least 5');
  }

  private now() {
    return this.h.now ? this.h.now() : new Date();
  }

  async tick(): Promise<TickOutcome> {
    if (this.busy) return 'busy';
    const now = this.now();
    const { date, minutes } = zonedParts(now, this.cfg.timeZone);
    this.busy = true;
    try {
      const bootstrap = (await this.h.needsBootstrap?.()) ?? false;
      if ((bootstrap || minutes >= this.dailyMin) && now.getTime() >= this.retryNotBefore && this.dailyFailures <= this.cfg.maxRetries && !(await this.h.dailyDone(date))) {
        try {
          const r = await this.h.runDaily(date);
          this.dailyFailures = 0;
          this.h.log?.(`daily ${date}: ${JSON.stringify(r)}`);
          if (!r.skipped) this.h.onFinished?.('daily', r);
          return 'daily';
        } catch (e) {
          this.dailyFailures++;
          this.retryNotBefore = now.getTime() + this.cfg.retryMinutes * 60_000;
          this.h.log?.(`daily ${date} failed (attempt ${this.dailyFailures}/${this.cfg.maxRetries + 1}): ${e instanceof Error ? e.message : e}`);
          return 'retry-wait';
        }
      }
      if (this.cfg.refreshEveryMinutes > 0 && now.getTime() - this.lastRefreshAt >= this.cfg.refreshEveryMinutes * 60_000) {
        this.lastRefreshAt = now.getTime();
        try {
          const slot = Math.floor(now.getTime() / (this.cfg.refreshEveryMinutes * 60_000));
          const r = await this.h.runRefresh(slot);
          this.h.log?.(`refresh: ${JSON.stringify(r)}`);
          if (!r.skipped) this.h.onFinished?.('refresh', r);
          return 'refresh';
        } catch (e) {
          this.h.log?.(`refresh failed: ${e instanceof Error ? e.message : e}`);
          return 'refresh';
        }
      }
      return 'idle';
    } finally {
      this.busy = false;
    }
  }

  start(tickMs = 30_000): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
