import type { AdapterContext } from './types';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryable: boolean,
    readonly attempts: number,
  ) {
    super(message);
  }
}

export const defaultContext = (over: Partial<AdapterContext> = {}): AdapterContext => ({
  fetch: globalThis.fetch.bind(globalThis),
  userAgent: 'JobRadarBot/0.1 (+https://github.com/xsea29/Job-Radar; read-only, public job-board APIs)',
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs: 20_000,
  maxAttempts: 4,
  minHostDelayMs: 400,
  ...over,
});

const lastHit = new Map<string, number>();

/** Test hook: forget rate-limit state. */
export function resetRateLimiter(): void {
  lastHit.clear();
}

function retryAfterMs(h: Headers | undefined, now: number): number | undefined {
  const v = h?.get('retry-after');
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.min(60_000, secs * 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : Math.min(60_000, Math.max(0, t - now));
}

/**
 * GET JSON politely: identifies itself, spaces requests per host, times out,
 * and retries only what is worth retrying (network errors, 408/425/429/5xx)
 * with exponential backoff, honouring Retry-After. 4xx otherwise fails fast.
 * It never sends credentials and never follows a login or CAPTCHA.
 */
export async function getJson<T>(url: string, ctx: AdapterContext): Promise<{ data: T; attempts: number; status: number }> {
  const host = new URL(url).host;
  let lastErr: HttpError | undefined;
  for (let attempt = 1; attempt <= ctx.maxAttempts; attempt++) {
    const wait = (lastHit.get(host) ?? 0) + ctx.minHostDelayMs - ctx.now();
    if (wait > 0) await ctx.sleep(wait);
    lastHit.set(host, ctx.now());

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ctx.timeoutMs);
    let backoff = Math.min(8000, 500 * 2 ** (attempt - 1));
    try {
      const res = await ctx.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': ctx.userAgent }, signal: ac.signal, redirect: 'follow' });
      if (res.ok) {
        try {
          return { data: (await res.json()) as T, attempts: attempt, status: res.status };
        } catch {
          throw new HttpError('Response was not valid JSON', res.status, false, attempt);
        }
      }
      const retryable = [408, 425, 429].includes(res.status) || res.status >= 500;
      backoff = retryAfterMs(res.headers, ctx.now()) ?? backoff;
      lastErr = new HttpError(`HTTP ${res.status}`, res.status, retryable, attempt);
      if (!retryable) throw lastErr;
    } catch (e) {
      if (e instanceof HttpError) {
        lastErr = e;
        if (!e.retryable) throw e;
      } else {
        const aborted = e instanceof Error && e.name === 'AbortError';
        lastErr = new HttpError(aborted ? `Timed out after ${ctx.timeoutMs} ms` : `Network error: ${e instanceof Error ? e.message : String(e)}`, undefined, true, attempt);
      }
    } finally {
      clearTimeout(timer);
    }
    if (attempt < ctx.maxAttempts) await ctx.sleep(backoff);
  }
  throw new HttpError(lastErr?.message ?? 'Request failed', lastErr?.status, true, ctx.maxAttempts);
}
