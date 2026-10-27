import type { CompanyCategory } from '@jobradar/core';
import type { BoardConfig, FetchResult, RawPosting } from '@jobradar/ingest';

/** SYNTHETIC format-valid postings for exercising persistence. Not real data. */
export const NOW = new Date('2026-10-27T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const SIZE: Record<CompanyCategory, number> = { startup: 80, mid: 900, large: 20000 };
const STACK = ['TypeScript and Node.js', 'React and TypeScript', 'Java and Spring Boot', 'Python and PostgreSQL'];

export function body(i: number, extra = ''): string {
  return `About us\nCompany ${i} builds software.\n\nWhat you'll do\n- Build features end to end (ticket ${i})\n\nRequirements\n- 3+ years of professional experience\n- Strong proficiency in ${STACK[i % STACK.length]}\n- Hands-on experience with PostgreSQL\n\nNice to have\n- Docker is a plus\n${extra}\nWe value clear communication and ownership of what you ship in production.`;
}

let seq = 0;
export function posting(board: BoardConfig, over: Partial<RawPosting> = {}): RawPosting {
  const i = ++seq;
  return { ats: board.ats, boardToken: board.token, companyName: board.companyName, externalId: String(i), title: `Full Stack Engineer (team ${i})`, description: body(i), url: `https://example.invalid/${board.token}/${i}`, locations: ['Bengaluru, India'], employmentType: 'full-time', postedAt: daysAgo(3), ...over };
}

export const boardOf = (name: string, cat: CompanyCategory, ats: BoardConfig['ats'] = 'greenhouse'): BoardConfig => ({ ats, token: name, companyName: name, employees: SIZE[cat], industry: 'SaaS' });

export const ok = (b: BoardConfig, postings: RawPosting[]): FetchResult => ({ board: b, postings, report: { boardKey: `${b.ats}:${b.token}`, ats: b.ats, status: 'ok', fetched: postings.length, skipped: [], attempts: 1, at: NOW.toISOString() } });

export function pool(perCat = 15, per = 3): FetchResult[] {
  const out: FetchResult[] = [];
  for (const cat of ['startup', 'mid', 'large'] as CompanyCategory[]) {
    for (let k = 0; k < perCat; k++) {
      const b = boardOf(`${cat}-${k}`, cat, (['greenhouse', 'lever', 'ashby'] as const)[k % 3]);
      out.push(ok(b, Array.from({ length: per }, () => posting(b))));
    }
  }
  return out;
}
