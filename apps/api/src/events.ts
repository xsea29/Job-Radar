import type { Response } from 'express';

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
