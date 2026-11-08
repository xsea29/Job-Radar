import type { Response } from 'express';
import type { Db } from './db/types';

/**
 * Server-sent events: connected apps get a tiny "something changed" message
 * after each run and re-fetch. No payload data is pushed, only a signal, so
 * nothing private can leak through the stream.
 */
export class EventHub {
  private clients = new Set<Response>();
  private beat?: ReturnType<typeof setInterval>;

  get size(): number {
    return this.clients.size;
  }

  add(res: Response): void {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 5000\n: connected\n\n');
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
      if (this.clients.size === 0 && this.beat) {
        clearInterval(this.beat);
        this.beat = undefined;
      }
    });
    // Heartbeat so proxies don't drop idle connections.
    this.beat ??= setInterval(() => {
      for (const c of this.clients) c.write(': ping\n\n');
    }, 25_000);
  }

  publish(event: string, data: Record<string, unknown> = {}): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify({ ...data, at: new Date().toISOString() })}\n\n`;
    for (const c of this.clients) c.write(msg);
  }

  close(): void {
    if (this.beat) clearInterval(this.beat);
    for (const c of this.clients) c.end();
    this.clients.clear();
  }
}

/**
 * Poll the run ledger and signal connected apps when a run finished — including runs made by
 * other processes (e.g. Render cron jobs), which cannot reach this process's hub directly.
 * Returns a stop function.
 */
export function watchRuns(db: Db, hub: EventHub, everyMs = 15_000, onError: (e: unknown) => void = () => undefined): () => void {
  let last: string | null | undefined;
  let busy = false;
  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query<{ t: Date | null; key: string | null }>(`SELECT finished_at AS t, run_key AS key FROM worker_runs WHERE state='succeeded' ORDER BY finished_at DESC LIMIT 1`);
      const row = r.rows[0];
      const cur = row?.t ? new Date(row.t).toISOString() : null;
      if (last !== undefined && cur && cur !== last) hub.publish('evidence-updated', { kind: row!.key?.split(':')[0] ?? 'run' });
      last = cur;
    } catch (e) {
      onError(e);
    } finally {
      busy = false;
    }
  };
  void poll();
  const t = setInterval(() => void poll(), everyMs);
  return () => clearInterval(t);
}
