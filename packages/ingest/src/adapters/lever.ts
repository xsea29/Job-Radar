import type { SalaryRange } from '@jobradar/core';
import { HttpError } from '../http';
import { htmlToText } from '../html';
import { bestLocation, normalizeEmployment, normalizeWorkplace } from '../location';
import type { AdapterContext, BoardConfig, FetchResult, RawPosting, SourceAdapter } from '../types';
import { runFetch } from './greenhouse';

/**
 * Lever Postings API (public, read-only):
 *   GET https://api.lever.co/v0/postings/{site}?mode=json   (EU: api.eu.lever.co)
 * Descriptions arrive as a plain-text body plus structured "lists"
 * (heading + <li> html) and an "additional" block; they are stitched back
 * together so section headings and bullets survive.
 */
interface LeverList {
  text?: string;
  content?: string;
}
interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  country?: string;
  workplaceType?: string;
  descriptionPlain?: string;
  description?: string;
  lists?: LeverList[];
  additionalPlain?: string;
  additional?: string;
  categories?: { commitment?: string; department?: string; location?: string; team?: string; allLocations?: string[] };
  salaryRange?: { currency?: string; interval?: string; min?: number; max?: number };
}

function leverSalary(s: LeverPosting['salaryRange']): SalaryRange | undefined {
  if (!s?.currency || (s.min == null && s.max == null)) return undefined;
  const i = (s.interval ?? '').toLowerCase();
  const period = i.includes('year') ? 'year' : i.includes('month') ? 'month' : undefined;
  return period ? { min: s.min, max: s.max, currency: s.currency, period } : undefined;
}

export function parseLever(json: unknown, board: BoardConfig): { postings: RawPosting[]; skipped: { reason: string; count: number }[] } {
  if (!Array.isArray(json)) throw new HttpError('Unexpected Lever response shape (expected an array)', undefined, false, 1);
  const skipped = new Map<string, number>();
  const skip = (r: string) => skipped.set(r, (skipped.get(r) ?? 0) + 1);
  const postings: RawPosting[] = [];
  for (const p of json as LeverPosting[]) {
    if (!p.id || !p.text || !p.hostedUrl) {
      skip('missing id/title/url');
      continue;
    }
    const parts: string[] = [];
    parts.push(p.descriptionPlain?.trim() || (p.description ? htmlToText(p.description) : ''));
    for (const l of p.lists ?? []) if (l.content) parts.push(`${(l.text ?? '').replace(/:?\s*$/, ':')}\n${htmlToText(l.content)}`);
    const extra = p.additionalPlain?.trim() || (p.additional ? htmlToText(p.additional) : '');
    if (extra) parts.push(extra);
    const description = parts.filter(Boolean).join('\n\n').trim();
    if (!description) {
      skip('no description');
      continue;
    }
    const locs = [...(p.categories?.allLocations ?? []), p.categories?.location].filter((x): x is string => !!x);
    const uniq = [...new Set(locs)];
    const loc = bestLocation(uniq);
    postings.push({
      ats: 'lever',
      boardToken: board.token,
      companyName: board.companyName,
      externalId: p.id,
      title: p.text.trim(),
      description,
      url: p.hostedUrl,
      applyUrl: p.applyUrl,
      locations: uniq,
      workArrangement: normalizeWorkplace(p.workplaceType) ?? (loc?.remote ? 'remote' : undefined),
      employmentType: normalizeEmployment(p.categories?.commitment),
      postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      salary: leverSalary(p.salaryRange),
      department: p.categories?.team ?? p.categories?.department,
    });
  }
  return { postings, skipped: [...skipped].map(([reason, count]) => ({ reason, count })) };
}

export const leverAdapter: SourceAdapter = {
  ats: 'lever',
  async fetchBoard(board: BoardConfig, ctx: AdapterContext): Promise<FetchResult> {
    const host = board.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const url = `https://${host}/v0/postings/${encodeURIComponent(board.token)}?mode=json`;
    return runFetch(board, ctx, url, (json) => parseLever(json, board));
  },
};
