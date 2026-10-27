import type { SalaryRange } from '@jobradar/core';
import { HttpError, getJson } from '../http';
import { htmlToText } from '../html';
import { bestLocation } from '../location';
import { boardKey, type AdapterContext, type BoardConfig, type FetchResult, type RawPosting, type SourceAdapter, type SourceReport } from '../types';

/**
 * Greenhouse Job Board API (public, read-only):
 *   GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 * `content` is entity-escaped HTML. Field names follow the public docs and are
 * parsed defensively; they still need confirming against live responses.
 */
interface GhJob {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  offices?: { name?: string; location?: string }[];
  departments?: { name?: string }[];
  content?: string;
  pay_input_ranges?: { min_cents?: number; max_cents?: number; currency_type?: string }[];
}

export function parseGreenhouse(json: unknown, board: BoardConfig): { postings: RawPosting[]; skipped: { reason: string; count: number }[] } {
  const jobs = (json as { jobs?: GhJob[] })?.jobs;
  if (!Array.isArray(jobs)) throw new HttpError('Unexpected Greenhouse response shape (no "jobs" array)', undefined, false, 1);
  const skipped = new Map<string, number>();
  const skip = (r: string) => skipped.set(r, (skipped.get(r) ?? 0) + 1);
  const postings: RawPosting[] = [];
  for (const j of jobs) {
    if (!j.title || j.id == null || !j.absolute_url) {
      skip('missing id/title/url');
      continue;
    }
    const description = j.content ? htmlToText(j.content, { escaped: true }) : '';
    if (!description) {
      skip('no description');
      continue;
    }
    const locs = [j.location?.name, ...(j.offices ?? []).flatMap((o) => [o.location, o.name])].filter((x): x is string => !!x);
    const pay = j.pay_input_ranges?.[0];
    const salary: SalaryRange | undefined =
      pay && (pay.min_cents != null || pay.max_cents != null) && pay.currency_type
        ? { min: pay.min_cents != null ? pay.min_cents / 100 : undefined, max: pay.max_cents != null ? pay.max_cents / 100 : undefined, currency: pay.currency_type, period: 'year' }
        : undefined;
    const loc = bestLocation(locs);
    postings.push({
      ats: 'greenhouse',
      boardToken: board.token,
      companyName: board.companyName,
      externalId: String(j.id),
      title: j.title.trim(),
      description,
      url: j.absolute_url,
      locations: locs,
      workArrangement: loc?.remote ? 'remote' : undefined,
      employmentType: 'unknown',
      postedAt: j.first_published ?? undefined,
      updatedAt: j.updated_at,
      salary,
      department: j.departments?.[0]?.name,
    });
  }
  return { postings, skipped: [...skipped].map(([reason, count]) => ({ reason, count })) };
}

export const greenhouseAdapter: SourceAdapter = {
  ats: 'greenhouse',
  async fetchBoard(board: BoardConfig, ctx: AdapterContext): Promise<FetchResult> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.token)}/jobs?content=true`;
    return runFetch(board, ctx, url, (json) => parseGreenhouse(json, board));
  },
};

/** Shared fetch → parse → report wrapper for all adapters. */
export async function runFetch(
  board: BoardConfig,
  ctx: AdapterContext,
  url: string,
  parse: (json: unknown) => { postings: RawPosting[]; skipped: { reason: string; count: number }[] },
): Promise<FetchResult> {
  const base = { boardKey: boardKey(board), ats: board.ats, at: new Date(ctx.now()).toISOString() };
  try {
    const { data, attempts, status } = await getJson<unknown>(url, ctx);
    const { postings, skipped } = parse(data);
    const report: SourceReport = { ...base, status: 'ok', fetched: postings.length, skipped, attempts, httpStatus: status };
    return { board, postings, report };
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(e instanceof Error ? e.message : String(e), undefined, false, 1);
    const report: SourceReport = { ...base, status: 'failed', fetched: 0, skipped: [], attempts: err.attempts, httpStatus: err.status, error: err.message, retryable: err.retryable };
    return { board, postings: [], report };
  }
}
