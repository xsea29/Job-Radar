import { toCandidate, rejectionFor, defaultRequest, type ScanRequest } from './scan';
import { ADAPTERS } from './adapters';
import { boardKey, type AdapterContext, type AtsKind, type BoardConfig, type SourceReport } from './types';

/** A company we'd LIKE to scan, with guesses for its public board slug. Nothing here is assumed to exist. */
export interface BoardCandidate {
  name: string;
  /** Possible slugs in the board URL. */
  tokens: string[];
  /** ATS to try (default: all three). */
  ats?: AtsKind[];
  industry?: string;
  hqCity?: string;
  employees?: number;
  listed?: boolean;
  countries?: number;
  estimated?: boolean;
  source?: string;
}

export interface ProbeResult {
  ats: AtsKind;
  token: string;
  outcome: 'found' | 'not_found' | 'error';
  detail?: string;
}

export interface DiscoveryRow {
  candidate: BoardCandidate;
  tried: ProbeResult[];
  found?: { board: BoardConfig; postings: number; /** passing the scan's role/location/experience criteria */ relevant: number; report: SourceReport };
}

const ALL: AtsKind[] = ['greenhouse', 'lever', 'ashby'];

/**
 * Check which candidates really have a public board, and how many of their
 * postings are relevant to the scan. Stops at the first board found per
 * company. A 404 means "no such board"; anything else is an *error* and proves
 * nothing, so callers must not treat errors as "doesn't exist".
 */
export async function discoverBoards(candidates: BoardCandidate[], ctx: AdapterContext, req: ScanRequest = defaultRequest(), onProgress?: (row: DiscoveryRow, i: number, n: number) => void): Promise<DiscoveryRow[]> {
  const rows: DiscoveryRow[] = [];
  const criteria = { roleIds: req.acceptedRoleIds, experienceMin: req.experience.min, experienceMax: req.experience.max, postedWithinDays: req.postedWithinDays, countries: req.countries, cities: req.cities, nearbyCities: false };
  for (const [i, cand] of candidates.entries()) {
    const row: DiscoveryRow = { candidate: cand, tried: [] };
    outer: for (const ats of cand.ats ?? ALL) {
      for (const token of cand.tokens) {
        const board: BoardConfig = { ats, token, companyName: cand.name, industry: cand.industry, hqCity: cand.hqCity, employees: cand.employees, listed: cand.listed, countries: cand.countries, estimated: cand.estimated, source: cand.source };
        const r = await ADAPTERS[ats].fetchBoard(board, ctx);
        if (r.report.status === 'ok') {
          row.tried.push({ ats, token, outcome: 'found' });
          const relevant = r.postings.filter((p) => !rejectionFor(toCandidate(p, board), criteria, req)).length;
          row.found = { board, postings: r.postings.length, relevant, report: r.report };
          break outer;
        }
        row.tried.push({ ats, token, outcome: r.report.httpStatus === 404 ? 'not_found' : 'error', detail: r.report.error });
      }
    }
    rows.push(row);
    onProgress?.(row, i + 1, candidates.length);
  }
  return rows;
}

export interface DiscoverySummary {
  checked: number;
  found: number;
  notFound: number;
  /** Candidates where every probe errored: inconclusive (network blocked, rate-limited…). */
  inconclusive: number;
  withRelevantJobs: number;
}

export function summarizeDiscovery(rows: DiscoveryRow[]): DiscoverySummary {
  const found = rows.filter((r) => r.found);
  const inconclusive = rows.filter((r) => !r.found && r.tried.length > 0 && r.tried.every((t) => t.outcome === 'error'));
  return { checked: rows.length, found: found.length, notFound: rows.length - found.length - inconclusive.length, inconclusive: inconclusive.length, withRelevantJobs: found.filter((r) => r.found!.relevant > 0).length };
}

/** Boards worth scanning: exist and have at least `minRelevant` relevant postings. */
export function boardsFromDiscovery(rows: DiscoveryRow[], minRelevant = 1): BoardConfig[] {
  const seen = new Set<string>();
  const out: BoardConfig[] = [];
  for (const r of rows) {
    if (!r.found || r.found.relevant < minRelevant) continue;
    const k = boardKey(r.found.board);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r.found.board);
    }
  }
  return out;
}
