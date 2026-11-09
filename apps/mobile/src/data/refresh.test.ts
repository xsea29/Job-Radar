import { describe, expect, it } from 'vitest';
import { describeOutcome, requestRefresh, RefreshError } from './refresh';

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const fmt = (s: string) => `at ${s}`;

describe('requestRefresh', () => {
  it('POSTs to /v1/refresh and reports what the scan found', async () => {
    let seen: { url: string; method?: string } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, method: init.method };
      return new Response(JSON.stringify({ status: 'done', result: { newPostings: 3, failedBoards: ['x'] }, lastRunAt: 't' }), { status: 200 });
    }) as unknown as typeof fetch;
    const o = await requestRefresh('https://api.test', f);
    expect(seen).toEqual({ url: 'https://api.test/v1/refresh', method: 'POST' });
    expect(o).toEqual({ kind: 'updated', newPostings: 3, failedBoards: 1, lastRunAt: 't' });
  });

  it.each([
    ['already-ran', 'recent'],
    ['busy', 'busy'],
    ['started', 'running'],
  ])('maps server status %s to %s', async (status, kind) => {
    expect((await requestRefresh('https://api.test', reply(200, { status }))).kind).toBe(kind);
  });

  it('turns failures into plain messages', async () => {
    await expect(requestRefresh(undefined)).rejects.toThrow(/not connected/);
    await expect(requestRefresh('https://api.test', reply(429, {}))).rejects.toThrow(/Too many/);
    await expect(requestRefresh('https://api.test', reply(501, {}))).rejects.toThrow(/turned off/);
    await expect(requestRefresh('https://api.test', reply(500, {}))).rejects.toThrow(/error 500/);
    await expect(requestRefresh('https://api.test', reply(200, { nope: 1 }))).rejects.toBeInstanceOf(RefreshError);
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(requestRefresh('https://api.test', down)).rejects.toThrow(/Could not reach/);
  });
});

describe('describeOutcome', () => {
  it('states only what was reported', () => {
    expect(describeOutcome({ kind: 'updated', newPostings: 0, failedBoards: 0 }, fmt)).toBe('No new jobs since the last update.');
    expect(describeOutcome({ kind: 'updated', newPostings: 1, failedBoards: 2 }, fmt)).toBe('1 new job found. 2 company boards could not be read this time.');
    expect(describeOutcome({ kind: 'recent', lastRunAt: 'T' }, fmt)).toContain('(at T)');
    expect(describeOutcome({ kind: 'recent' }, fmt)).not.toContain('(');
  });
});
