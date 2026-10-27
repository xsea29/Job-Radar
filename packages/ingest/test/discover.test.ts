import { afterEach, describe, expect, it } from 'vitest';
import { boardsFromDiscovery, defaultContext, defaultRequest, discoverBoards, resetRateLimiter, summarizeDiscovery, type AdapterContext } from '../src';
import { ghResponse, leverResponse } from './fixtures';

afterEach(() => resetRateLimiter());

/** url-substring → response; anything else 404s. */
function ctxFor(routes: Record<string, () => Response>): { ctx: AdapterContext; urls: string[] } {
  const urls: string[] = [];
  let t = 0;
  const ctx = defaultContext({
    fetch: (async (u: string) => {
      urls.push(String(u));
      const hit = Object.keys(routes).find((k) => String(u).includes(k));
      return hit ? routes[hit]!() : new Response('{}', { status: 404 });
    }) as unknown as typeof fetch,
    now: () => t,
    sleep: async (ms) => { t += ms; },
    minHostDelayMs: 0,
    maxAttempts: 1,
  });
  return { ctx, urls };
}
const j = (b: unknown, s = 200) => () => new Response(JSON.stringify(b), { status: s });
const req = () => defaultRequest({ now: new Date('2026-10-27T00:00:00Z'), acceptedRoleIds: ['fullstack', 'software', 'backend'], postedWithinDays: 2000, minDescriptionChars: 20 });

describe('discoverBoards', () => {
  it('finds the right ATS/slug, counts relevant postings, and stops at the first hit', async () => {
    const { ctx, urls } = ctxFor({ '/lever/': j([]), 'api.lever.co/v0/postings/acme-real': j(leverResponse) });
    const rows = await discoverBoards([{ name: 'Acme', tokens: ['acme', 'acme-real'], employees: 900, estimated: true }], ctx, req());
    expect(rows[0]!.found).toMatchObject({ board: { ats: 'lever', token: 'acme-real', companyName: 'Acme', estimated: true }, postings: 1 });
    expect(rows[0]!.found!.relevant).toBe(1); // "Backend Engineer", Pune/Hyderabad, stated 4+ yrs
    expect(rows[0]!.tried.map((t) => t.outcome)).toEqual(['not_found', 'not_found', 'not_found', 'found']);
    expect(urls.filter((u) => u.includes('ashby')).length).toBe(0);
  });

  it('distinguishes "no such board" (404) from errors, which prove nothing', async () => {
    const { ctx } = ctxFor({ greenhouse: j({}, 500), 'api.lever.co': j({}, 404), 'api.ashbyhq.com': () => { throw new TypeError('fetch failed'); } });
    const rows = await discoverBoards([{ name: 'X', tokens: ['x'] }], ctx, req());
    const by = Object.fromEntries(rows[0]!.tried.map((t) => [t.ats, t.outcome]));
    expect(by).toEqual({ greenhouse: 'error', lever: 'not_found', ashby: 'error' });
    expect(rows[0]!.found).toBeUndefined();
  });

  it('reports a fully blocked network as inconclusive, not as "no boards exist"', async () => {
    const { ctx } = ctxFor({ 'https': () => { throw new TypeError('CONNECT tunnel failed, response 403'); } });
    const rows = await discoverBoards([{ name: 'A', tokens: ['a'] }, { name: 'B', tokens: ['b'] }], ctx, req());
    expect(summarizeDiscovery(rows)).toMatchObject({ checked: 2, found: 0, notFound: 0, inconclusive: 2 });
    expect(boardsFromDiscovery(rows)).toEqual([]);
  });

  it('only keeps boards that exist AND have relevant postings', async () => {
    const { ctx } = ctxFor({ 'boards/has-jobs/': j(ghResponse), 'boards/us-only/': j({ jobs: [{ id: 1, title: 'Software Engineer', absolute_url: 'https://example.invalid/1', location: { name: 'Austin, US' }, content: ghResponse.jobs[0]!.content }] }) });
    const rows = await discoverBoards([{ name: 'HasJobs', tokens: ['has-jobs'], ats: ['greenhouse'] }, { name: 'UsOnly', tokens: ['us-only'], ats: ['greenhouse'] }, { name: 'Ghost', tokens: ['ghost'], ats: ['greenhouse'] }], ctx, req());
    expect(summarizeDiscovery(rows)).toEqual({ checked: 3, found: 2, notFound: 1, inconclusive: 0, withRelevantJobs: 1 });
    expect(boardsFromDiscovery(rows).map((b) => b.companyName)).toEqual(['HasJobs']);
  });
});
