import {
  DEFAULT_SCAN_CONFIG,
  broadeningSteps,
  canonicalJobKey,
  classifyCompany,
  computeDemand,
  contentHash,
  extractExperience,
  extractSkills,
  normalizeRole,
  summarizeScan,
  summarizeSections,
  type CompanyCategory,
  type CompanyClassification,
  type DemandSnapshot,
  type ExtractedSkill,
  type RejectionReason,
  type RoleId,
  type ScanCandidate,
  type ScanConfig,
  type ScanSummary,
  type SearchCriteria,
  type SectionSummary,
} from '@jobradar/core';
import { bestLocation, type ParsedLocation } from './location';
import { boardKey, type AdapterContext, type BoardConfig, type FetchResult, type RawPosting, type SourceReport } from './types';
import { ADAPTERS } from './adapters';

// ───────────────────────────── collecting ─────────────────────────────

/** Fetch every configured board, one at a time (the HTTP layer also spaces per host). */
export async function collectBoards(boards: BoardConfig[], ctx: AdapterContext, onProgress?: (done: number, total: number, r: FetchResult) => void): Promise<FetchResult[]> {
  const out: FetchResult[] = [];
  for (const b of boards) {
    const r = await ADAPTERS[b.ats].fetchBoard(b, ctx);
    out.push(r);
    onProgress?.(out.length, boards.length, r);
  }
  return out;
}

// ───────────────────────────── evaluating ─────────────────────────────

export interface ScanRequest {
  targetRoleId: RoleId;
  /** Role families accepted as relevant (the target plus adjacent generalist roles). */
  acceptedRoleIds: RoleId[];
  experience: { min: number; max: number };
  countries: string[];
  cities: string[];
  /** Accept remote postings that name no country. Off by default: eligibility is unknown. */
  includeGlobalRemote: boolean;
  postedWithinDays: number;
  minDescriptionChars: number;
  scan: ScanConfig;
  now: Date;
}

export const defaultRequest = (over: Partial<ScanRequest> = {}): ScanRequest => ({
  targetRoleId: 'fullstack',
  acceptedRoleIds: ['fullstack', 'software'],
  experience: { min: 3, max: 6 },
  countries: ['India'],
  cities: [],
  includeGlobalRemote: false,
  postedWithinDays: 30,
  minDescriptionChars: 200,
  scan: DEFAULT_SCAN_CONFIG,
  now: new Date(),
  ...over,
});

export interface Candidate {
  id: string;
  posting: RawPosting;
  board: BoardConfig;
  classification: CompanyClassification;
  category: CompanyCategory | 'unclassified';
  normalizedRole?: RoleId;
  location?: ParsedLocation;
  experience?: { min?: number; max?: number; raw: string };
  contentHash: string;
  canonicalKey: string;
}

export interface ScannedJob extends Candidate {
  skills: ExtractedSkill[];
  summary: SectionSummary;
}

export interface Verdict {
  id: string;
  title: string;
  company: string;
  status: 'valid' | 'duplicate' | 'inaccessible' | 'rejected' | 'surplus';
  reason?: RejectionReason | string;
  detail?: string;
  duplicateOf?: string;
}

export interface ScanOutcome {
  summary: ScanSummary;
  selected: ScannedJob[];
  verdicts: Verdict[];
  /** Valid postings beyond the target; kept out of the evidence base. */
  surplusValid: number;
  broadening: string[];
  finalCriteria: SearchCriteria;
  sourceReports: SourceReport[];
  /** Boards that failed outright: counted as inaccessible, never as scanned. */
  failedBoards: string[];
}

export const candidateId = (p: Pick<RawPosting, 'ats' | 'boardToken' | 'externalId'>) => `${p.ats}:${p.boardToken}:${p.externalId}`;

export function toCandidate(p: RawPosting, board: BoardConfig): Candidate {
  const classification = classifyCompany(board);
  const loc = bestLocation(p.locations);
  const exp = extractExperience(p.description);
  return {
    id: candidateId(p),
    posting: p,
    board,
    classification,
    category: classification.category,
    normalizedRole: normalizeRole(p.title),
    location: loc,
    experience: exp,
    contentHash: contentHash(p.description),
    canonicalKey: canonicalJobKey({ company: board.companyName, title: p.title, city: loc?.city }),
  };
}

const DAY = 86_400_000;

/** Why (if at all) a candidate fails the criteria. `undefined` = it passes. */
export function rejectionFor(c: Candidate, cr: SearchCriteria, req: ScanRequest): { reason: RejectionReason; detail: string } | undefined {
  const p = c.posting;
  if (p.description.length < req.minDescriptionChars) return { reason: 'missing_description', detail: `Only ${p.description.length} characters of description.` };
  if (['intern', 'part-time', 'other'].includes(p.employmentType)) return { reason: 'employment_type', detail: `Employment type: ${p.employmentType}.` };
  if (!c.normalizedRole || !cr.roleIds.includes(c.normalizedRole)) return { reason: 'role_mismatch', detail: c.normalizedRole ? `Normalised to ${c.normalizedRole}.` : 'Title is not a recognised engineering role.' };

  const loc = c.location;
  if (!loc) return { reason: 'location_mismatch', detail: 'No location stated.' };
  if (loc.country) {
    if (!cr.countries.includes(loc.country)) return { reason: 'location_mismatch', detail: `${loc.country} is outside ${cr.countries.join(', ')}.` };
    if (!loc.remote && loc.city && cr.cities.length && !cr.nearbyCities && !cr.cities.includes(loc.city)) return { reason: 'location_mismatch', detail: `${loc.city} is not in your cities.` };
  } else if (loc.remote) {
    if (!req.includeGlobalRemote) return { reason: 'location_mismatch', detail: 'Remote with no stated country; eligibility unknown.' };
  } else {
    return { reason: 'location_mismatch', detail: `Could not place “${loc.text}”.` };
  }

  const e = c.experience;
  if (e?.min != null && e.min > cr.experienceMax) return { reason: 'experience_mismatch', detail: `Asks for ${e.min}+ years (your window tops out at ${cr.experienceMax}).` };
  if (e?.max != null && e.max < cr.experienceMin) return { reason: 'experience_mismatch', detail: `Asks for up to ${e.max} years (your window starts at ${cr.experienceMin}).` };

  const when = p.postedAt ?? p.updatedAt;
  if (when && req.now.getTime() - new Date(when).getTime() > cr.postedWithinDays * DAY) return { reason: 'stale_posting', detail: `Published ${when.slice(0, 10)}.` };
  return undefined;
}

function recency(c: Candidate): number {
  const t = c.posting.postedAt ?? c.posting.updatedAt;
  return t ? new Date(t).getTime() : 0;
}

/** Fill per-category quotas first (newest first), then backfill from any category to reach the target. */
export function selectBalanced(valid: Candidate[], cfg: ScanConfig): { selected: Candidate[]; surplus: Candidate[] } {
  const sorted = [...valid].sort((a, b) => recency(b) - recency(a) || a.id.localeCompare(b.id));
  const picked = new Set<string>();
  const selected: Candidate[] = [];
  for (const cat of ['startup', 'mid', 'large'] as CompanyCategory[]) {
    for (const c of sorted.filter((x) => x.category === cat).slice(0, cfg.quotas[cat])) {
      picked.add(c.id);
      selected.push(c);
    }
  }
  for (const c of sorted) {
    if (selected.length >= cfg.target) break;
    if (!picked.has(c.id)) {
      picked.add(c.id);
      selected.push(c);
    }
  }
  return { selected: selected.slice(0, cfg.target), surplus: sorted.filter((c) => !selected.includes(c)) };
}

/**
 * Pure and deterministic: fetched pool + request → validated outcome.
 * Broadens in the disclosed, bounded steps from `@jobradar/core` until the
 * target is met or the steps run out; reports `n/target` honestly either way.
 */
export function buildScan(results: FetchResult[], req: ScanRequest): ScanOutcome {
  const sourceReports = results.map((r) => r.report);
  const failedBoards = results.filter((r) => r.report.status === 'failed').map((r) => r.report.boardKey);

  // 1. De-duplicate the whole pool (content hash, then company + title + city).
  const verdicts: Verdict[] = [];
  const seenHash = new Map<string, string>();
  const seenKey = new Map<string, string>();
  const pool: Candidate[] = [];
  const all = results.flatMap((r) => r.postings.map((p) => toCandidate(p, r.board))).sort((a, b) => recency(b) - recency(a) || a.id.localeCompare(b.id));
  for (const c of all) {
    const dupOf = seenHash.get(c.contentHash) ?? seenKey.get(c.canonicalKey);
    if (dupOf) {
      verdicts.push({ id: c.id, title: c.posting.title, company: c.posting.companyName, status: 'duplicate', duplicateOf: dupOf });
      continue;
    }
    seenHash.set(c.contentHash, c.id);
    seenKey.set(c.canonicalKey, c.id);
    pool.push(c);
  }

  // 2. Evaluate; broaden while short.
  const base: SearchCriteria = { roleIds: req.acceptedRoleIds, experienceMin: req.experience.min, experienceMax: req.experience.max, postedWithinDays: req.postedWithinDays, countries: req.countries, cities: req.cities, nearbyCities: false };
  const steps = broadeningSteps(base);
  const evaluate = (cr: SearchCriteria) => {
    const rejected: { c: Candidate; r: NonNullable<ReturnType<typeof rejectionFor>> }[] = [];
    const valid: Candidate[] = [];
    for (const c of pool) {
      const r = rejectionFor(c, cr, req);
      if (r) rejected.push({ c, r });
      else valid.push(c);
    }
    return { rejected, valid };
  };
  let criteria = base;
  let ev = evaluate(criteria);
  const broadening: string[] = [];
  for (const step of steps) {
    if (ev.valid.length >= req.scan.target) break;
    criteria = step.criteria;
    broadening.push(step.disclosure);
    ev = evaluate(criteria);
  }

  // 3. Select the evidence base and extract skills (with evidence) for it only.
  const { selected, surplus } = selectBalanced(ev.valid, req.scan);
  const scanned: ScannedJob[] = selected.map((c) => ({ ...c, skills: extractSkills(c.posting.description), summary: summarizeSections(c.posting.description) }));

  for (const s of selected) verdicts.push({ id: s.id, title: s.posting.title, company: s.posting.companyName, status: 'valid' });
  for (const s of surplus) verdicts.push({ id: s.id, title: s.posting.title, company: s.posting.companyName, status: 'surplus', detail: 'Valid, but beyond the target; not part of the evidence base.' });
  for (const { c, r } of ev.rejected) verdicts.push({ id: c.id, title: c.posting.title, company: c.posting.companyName, status: 'rejected', reason: r.reason, detail: r.detail });

  // 4. Inaccessible: listings with no description, and boards that could not be read.
  const candidates: ScanCandidate[] = selected.map((c) => ({ id: c.id, status: 'valid', category: c.category }));
  for (const v of verdicts.filter((v) => v.status === 'duplicate')) candidates.push({ id: v.id, status: 'duplicate' });
  for (const { c, r } of ev.rejected) candidates.push({ id: c.id, status: 'rejected', rejection: r.reason });
  for (const r of results) {
    for (const s of r.report.skipped) {
      for (let i = 0; i < s.count; i++) {
        candidates.push({ id: `${r.report.boardKey}:skipped:${s.reason}:${i}`, status: 'inaccessible' });
        verdicts.push({ id: `${r.report.boardKey}:skipped:${s.reason}:${i}`, title: '(unreadable listing)', company: r.board.companyName, status: 'inaccessible', reason: s.reason });
      }
    }
  }
  for (const k of failedBoards) {
    const rep = sourceReports.find((x) => x.boardKey === k)!;
    candidates.push({ id: `${k}:board`, status: 'inaccessible' });
    verdicts.push({ id: `${k}:board`, title: '(whole board unreachable)', company: k, status: 'inaccessible', reason: rep.error ?? 'fetch failed' });
  }

  return { summary: summarizeScan(candidates, req.scan), selected: scanned, verdicts, surplusValid: surplus.length, broadening, finalCriteria: criteria, sourceReports, failedBoards };
}

// ───────────────────────────── snapshots ─────────────────────────────

export function snapshotFromOutcome(o: ScanOutcome, args: { id: string; label: string; roleId: RoleId; region: string; experienceBand: string; startDate: string; endDate: string }): DemandSnapshot {
  const demand = computeDemand(
    o.selected.map((j) => ({ id: j.id, companyId: boardKey(j.board), companyCategory: j.category, roleId: j.normalizedRole!, industry: j.board.industry, city: j.location?.city, experience: j.experience, skills: j.skills })),
  );
  return {
    ...args,
    n: demand.n,
    companyMix: { ...demand.categoryN },
    counts: Object.fromEntries(demand.skills.map((s) => [s.skillId, { jobs: s.jobs, required: s.required, preferred: s.preferred }])),
    provenance: 'live',
  };
}
