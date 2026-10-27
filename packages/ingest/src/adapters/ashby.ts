import type { SalaryRange } from '@jobradar/core';
import { HttpError } from '../http';
import { htmlToText } from '../html';
import { bestLocation, normalizeEmployment, normalizeWorkplace } from '../location';
import type { AdapterContext, BoardConfig, FetchResult, RawPosting, SourceAdapter } from '../types';
import { runFetch } from './greenhouse';

/**
 * Ashby public job-posting API (read-only):
 *   GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true
 */
interface AshbyJob {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: { summaryComponents?: { compensationType?: string; interval?: string; currencyCode?: string; minValue?: number; maxValue?: number }[] };
}

function ashbySalary(c: AshbyJob['compensation']): SalaryRange | undefined {
  const s = c?.summaryComponents?.find((x) => (x.compensationType ?? '').toLowerCase() === 'salary');
  if (!s?.currencyCode || (s.minValue == null && s.maxValue == null)) return undefined;
  const i = (s.interval ?? '').toLowerCase();
  const period = i.includes('year') ? 'year' : i.includes('month') ? 'month' : undefined;
  return period ? { min: s.minValue, max: s.maxValue, currency: s.currencyCode, period } : undefined;
}

export function parseAshby(json: unknown, board: BoardConfig): { postings: RawPosting[]; skipped: { reason: string; count: number }[] } {
  const jobs = (json as { jobs?: AshbyJob[] })?.jobs;
  if (!Array.isArray(jobs)) throw new HttpError('Unexpected Ashby response shape (no "jobs" array)', undefined, false, 1);
  const skipped = new Map<string, number>();
  const skip = (r: string) => skipped.set(r, (skipped.get(r) ?? 0) + 1);
  const postings: RawPosting[] = [];
  for (const j of jobs) {
    if (j.isListed === false) {
      skip('not publicly listed');
      continue;
    }
    if (!j.id || !j.title || !j.jobUrl) {
      skip('missing id/title/url');
      continue;
    }
    const description = j.descriptionHtml ? htmlToText(j.descriptionHtml) : (j.descriptionPlain ?? '').trim();
    if (!description) {
      skip('no description');
      continue;
    }
    const locs = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter((x): x is string => !!x);
    const loc = bestLocation(locs);
    postings.push({
      ats: 'ashby',
      boardToken: board.token,
      companyName: board.companyName,
      externalId: j.id,
      title: j.title.trim(),
      description,
      url: j.jobUrl,
      applyUrl: j.applyUrl,
      locations: locs,
      workArrangement: normalizeWorkplace(j.workplaceType) ?? (j.isRemote ? 'remote' : loc?.remote ? 'remote' : undefined),
      employmentType: normalizeEmployment(j.employmentType),
      postedAt: j.publishedAt,
      salary: ashbySalary(j.compensation),
      department: j.team ?? j.department,
    });
  }
  return { postings, skipped: [...skipped].map(([reason, count]) => ({ reason, count })) };
}

export const ashbyAdapter: SourceAdapter = {
  ats: 'ashby',
  async fetchBoard(board: BoardConfig, ctx: AdapterContext): Promise<FetchResult> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.token)}?includeCompensation=true`;
    return runFetch(board, ctx, url, (json) => parseAshby(json, board));
  },
};
