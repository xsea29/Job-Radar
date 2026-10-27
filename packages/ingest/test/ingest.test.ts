import { afterEach, describe, expect, it } from 'vitest';
import { extractSkills } from '@jobradar/core';
import { ADAPTERS, decodeEntities, defaultContext, getJson, htmlToText, parseAshby, parseGreenhouse, parseLever, parseLocation, resetRateLimiter, type AdapterContext, type BoardConfig } from '../src';
import { GH_DESC_ESCAPED, GH_DESC_HTML, ashbyResponse, ghResponse, leverResponse } from './fixtures';

afterEach(() => resetRateLimiter());

const board = (ats: BoardConfig['ats']): BoardConfig => ({ ats, token: 'acme', companyName: 'Acme (fixture)' });

function ctxWith(responses: (() => Response | Promise<Response>)[], over: Partial<AdapterContext> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  let t = 0;
  const ctx = defaultContext({
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
      const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
      return next();
    }) as unknown as typeof fetch,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    minHostDelayMs: 0,
    ...over,
  });
  return { ctx, calls, sleeps };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(body), { status, headers });

describe('htmlToText', () => {
  it('decodes entities and keeps headings and bullets on their own lines', () => {
    const t = htmlToText(GH_DESC_ESCAPED, { escaped: true });
    expect(t).toContain('Requirements\n- 3+ years with TypeScript & Node.js\n- Strong proficiency in PostgreSQL');
    expect(htmlToText(GH_DESC_HTML)).toBe(t);
    expect(decodeEntities('R&amp;D &#8211; &#x2019;s &unknown;')).toBe('R&D – ’s &unknown;');
  });
  it('drops scripts and styles', () => {
    expect(htmlToText('<style>p{}</style><p>Hi<script>alert(1)</script></p>')).toBe('Hi');
  });
  it('feeds the section-aware extractor correctly', () => {
    const skills = extractSkills(htmlToText(GH_DESC_ESCAPED, { escaped: true }));
    const by = Object.fromEntries(skills.map((s) => [s.skillId, s.requirement]));
    expect(by.typescript).toBe('required');
    expect(by.postgresql).toBe('required');
    expect(by.kubernetes).toBe('preferred');
  });
});

describe('location parsing', () => {
  it('maps spellings to canonical Indian cities', () => {
    expect(parseLocation('Bangalore, India')).toMatchObject({ city: 'Bengaluru', country: 'India' });
    expect(parseLocation('Gurgaon')).toMatchObject({ city: 'Gurugram', country: 'India' });
    expect(parseLocation('New York, NY, US')).toMatchObject({ country: 'United States', city: undefined });
    expect(parseLocation('Remote - India')).toMatchObject({ remote: true, country: 'India' });
    expect(parseLocation('Remote')).toMatchObject({ remote: true, country: undefined });
  });
});

describe('parsers (format fixtures)', () => {
  it('Greenhouse: parses, skips unusable rows and counts why', () => {
    const { postings, skipped } = parseGreenhouse(ghResponse, board('greenhouse'));
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({ externalId: '4001', title: 'Senior Full Stack Engineer', postedAt: '2026-10-01T10:00:00Z', salary: { min: 3_000_000, max: 4_500_000, currency: 'INR', period: 'year' } });
    expect(postings[0]!.description).toContain('- Strong proficiency in PostgreSQL');
    expect(skipped.sort((a, b) => a.reason.localeCompare(b.reason))).toEqual([{ reason: 'missing id/title/url', count: 1 }, { reason: 'no description', count: 1 }]);
  });
  it('Lever: stitches description + lists + additional with headings intact', () => {
    const { postings, skipped } = parseLever(leverResponse, board('lever'));
    expect(postings).toHaveLength(1);
    const p = postings[0]!;
    expect(p).toMatchObject({ workArrangement: 'hybrid', employmentType: 'full-time', locations: ['Pune', 'Hyderabad'], salary: { min: 2_800_000, currency: 'INR', period: 'year' } });
    expect(p.description).toMatch(/Requirements:\n- 4\+ years of Java or Go\n- Hands-on experience with Docker/);
    expect(skipped).toEqual([{ reason: 'no description', count: 1 }]);
    const by = Object.fromEntries(extractSkills(p.description).map((s) => [s.skillId, s.requirement]));
    expect(by).toMatchObject({ docker: 'required', java: 'required', kafka: 'preferred' });
  });
  it('Ashby: skips unlisted jobs and reads compensation', () => {
    const { postings, skipped } = parseAshby(ashbyResponse, board('ashby'));
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({ workArrangement: 'hybrid', employmentType: 'full-time', salary: { min: 2_400_000, max: 3_600_000, period: 'year' } });
    expect(skipped).toEqual([{ reason: 'not publicly listed', count: 1 }]);
  });
  it('rejects unexpected shapes instead of guessing', () => {
    expect(() => parseGreenhouse({ nope: 1 }, board('greenhouse'))).toThrow(/Unexpected/);
    expect(() => parseLever({}, board('lever'))).toThrow(/Unexpected/);
    expect(() => parseAshby([], board('ashby'))).toThrow(/Unexpected/);
  });
});

describe('getJson (polite fetching)', () => {
  it('identifies itself and sends no credentials', async () => {
    const { ctx, calls } = ctxWith([json({ ok: 1 })]);
    await getJson('https://boards-api.greenhouse.io/v1/boards/x/jobs', ctx);
    expect(calls[0]!.headers['User-Agent']).toMatch(/JobRadarBot/);
    expect(Object.keys(calls[0]!.headers).map((h) => h.toLowerCase())).not.toContain('authorization');
  });
  it('retries 5xx and 429 with backoff and honours Retry-After', async () => {
    const { ctx, calls, sleeps } = ctxWith([json({}, 503), json({}, 429, { 'retry-after': '3' }), json({ ok: 1 })]);
    const r = await getJson<{ ok: number }>('https://api.lever.co/v0/postings/x', ctx);
    expect(r.data.ok).toBe(1);
    expect(r.attempts).toBe(3);
    expect(calls).toHaveLength(3);
    expect(sleeps).toContain(3000);
  });
  it('fails fast on 404 and does not retry', async () => {
    const { ctx, calls } = ctxWith([json({}, 404)]);
    await expect(getJson('https://api.lever.co/v0/postings/nope', ctx)).rejects.toMatchObject({ status: 404, retryable: false });
    expect(calls).toHaveLength(1);
  });
  it('gives up after maxAttempts on persistent errors', async () => {
    const { ctx, calls } = ctxWith([json({}, 500)], { maxAttempts: 3 });
    await expect(getJson('https://api.lever.co/v0/postings/x', ctx)).rejects.toMatchObject({ retryable: true, attempts: 3 });
    expect(calls).toHaveLength(3);
  });
  it('treats network errors as retryable and recovers', async () => {
    let n = 0;
    const { ctx } = ctxWith([() => { if (n++ < 1) throw new TypeError('fetch failed'); return new Response('{"ok":1}'); }]);
    expect((await getJson<{ ok: number }>('https://api.lever.co/v0/postings/x', ctx)).attempts).toBe(2);
  });
  it('spaces requests to the same host', async () => {
    const { ctx, sleeps } = ctxWith([json({})], { minHostDelayMs: 500 });
    await getJson('https://api.lever.co/v0/postings/a', ctx);
    await getJson('https://api.lever.co/v0/postings/b', ctx);
    expect(sleeps.some((s) => s > 0 && s <= 500)).toBe(true);
  });
});

describe('adapters end to end (mock transport)', () => {
  it('Greenhouse fetchBoard builds the documented URL and reports success', async () => {
    const { ctx, calls } = ctxWith([json(ghResponse)]);
    const r = await ADAPTERS.greenhouse.fetchBoard({ ...board('greenhouse'), token: 'a b' }, ctx);
    expect(calls[0]!.url).toBe('https://boards-api.greenhouse.io/v1/boards/a%20b/jobs?content=true');
    expect(r.report).toMatchObject({ status: 'ok', fetched: 1, httpStatus: 200 });
  });
  it('Lever EU tenants use the EU host', async () => {
    const { ctx, calls } = ctxWith([json(leverResponse)]);
    await ADAPTERS.lever.fetchBoard({ ...board('lever'), region: 'eu' }, ctx);
    expect(calls[0]!.url).toBe('https://api.eu.lever.co/v0/postings/acme?mode=json');
  });
  it('a failing board yields a failed report, never fabricated postings', async () => {
    const { ctx } = ctxWith([json({}, 403)]);
    const r = await ADAPTERS.ashby.fetchBoard(board('ashby'), ctx);
    expect(r.postings).toEqual([]);
    expect(r.report).toMatchObject({ status: 'failed', fetched: 0, httpStatus: 403, retryable: false });
  });
  it('a blocked network (proxy 403) is reported as a failure with the status', async () => {
    const { ctx } = ctxWith([() => { throw new TypeError('CONNECT tunnel failed, response 403'); }], { maxAttempts: 2 });
    const r = await ADAPTERS.greenhouse.fetchBoard(board('greenhouse'), ctx);
    expect(r.report.status).toBe('failed');
    expect(r.report.error).toMatch(/Network error/);
    expect(r.report.retryable).toBe(true);
  });
});
