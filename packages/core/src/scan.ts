import type { CompanyCategory } from './types';

/**
 * Scan validation. A scan is "complete" only when `target` distinct, relevant,
 * retrievable job descriptions have been processed. Everything else is
 * reported as partial with the real numerator.
 */

export type RejectionReason =
  | 'role_mismatch'
  | 'employment_type'
  | 'experience_mismatch'
  | 'location_mismatch'
  | 'missing_description'
  | 'stale_posting';

export type CandidateStatus = 'valid' | 'duplicate' | 'inaccessible' | 'rejected';

export interface ScanCandidate {
  id: string;
  status: CandidateStatus;
  rejection?: RejectionReason;
  /** Category of the company (valid candidates only). */
  category?: CompanyCategory | 'unclassified';
}

export interface ScanConfig {
  target: number;
  quotas: Record<CompanyCategory, number>;
}

export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  target: 100,
  quotas: { startup: 35, mid: 30, large: 35 },
};

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  role_mismatch: 'Role did not match target',
  employment_type: 'Not a full-time or contract role',
  experience_mismatch: 'Experience outside range',
  location_mismatch: 'Location outside preferences',
  missing_description: 'Description missing or too short',
  stale_posting: 'Posting older than window',
};

export interface QuotaRow {
  category: CompanyCategory;
  target: number;
  valid: number;
  shortfall: number;
}

export interface ScanSummary {
  target: number;
  retrieved: number;
  valid: number;
  duplicates: number;
  inaccessible: number;
  rejected: number;
  rejectedByReason: Partial<Record<RejectionReason, number>>;
  unclassified: number;
  remaining: number;
  state: 'complete' | 'partial';
  /** "63/100" — the denominator is always the configured target. */
  label: string;
  quotas: QuotaRow[];
  quotasMet: boolean;
  warnings: string[];
}

export function summarizeScan(candidates: ScanCandidate[], cfg: ScanConfig = DEFAULT_SCAN_CONFIG): ScanSummary {
  const valid = candidates.filter((c) => c.status === 'valid');
  const rejectedByReason: Partial<Record<RejectionReason, number>> = {};
  for (const c of candidates) {
    if (c.status === 'rejected' && c.rejection) rejectedByReason[c.rejection] = (rejectedByReason[c.rejection] ?? 0) + 1;
  }
  const quotas: QuotaRow[] = (Object.keys(cfg.quotas) as CompanyCategory[]).map((category) => {
    const v = valid.filter((c) => c.category === category).length;
    return { category, target: cfg.quotas[category], valid: v, shortfall: Math.max(0, cfg.quotas[category] - v) };
  });
  const unclassified = valid.filter((c) => c.category === 'unclassified').length;
  const complete = valid.length >= cfg.target;
  const warnings: string[] = [];
  if (!complete) warnings.push(`Only ${valid.length} of ${cfg.target} valid job descriptions were collected. This is not a completed ${cfg.target}-job scan.`);
  for (const q of quotas) if (q.shortfall > 0) warnings.push(`${q.shortfall} short of the ${q.target}-job ${q.category} quota.`);
  if (unclassified > 0) warnings.push(`${unclassified} jobs are from companies whose size could not be classified.`);
  return {
    target: cfg.target,
    retrieved: candidates.length,
    valid: valid.length,
    duplicates: candidates.filter((c) => c.status === 'duplicate').length,
    inaccessible: candidates.filter((c) => c.status === 'inaccessible').length,
    rejected: candidates.filter((c) => c.status === 'rejected').length,
    rejectedByReason,
    unclassified,
    remaining: Math.max(0, cfg.target - valid.length),
    state: complete ? 'complete' : 'partial',
    label: `${valid.length}/${cfg.target}`,
    quotas,
    quotasMet: quotas.every((q) => q.shortfall === 0),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Controlled broadening
// ---------------------------------------------------------------------------

export interface SearchCriteria {
  roleIds: string[];
  experienceMin: number;
  experienceMax: number;
  postedWithinDays: number;
  countries: string[];
  cities: string[];
  /** Whether nearby cities in the same country were added. */
  nearbyCities: boolean;
}

export interface BroadeningStep {
  criteria: SearchCriteria;
  /** Human-readable, shown to the user. */
  disclosure: string;
}

/**
 * Ordered, bounded relaxations. Role *family*, country and the user's minimum
 * experience floor are never relaxed (spec: preserve location, role and
 * experience requirements). Each step is disclosed.
 */
export function broadeningSteps(base: SearchCriteria): BroadeningStep[] {
  const steps: BroadeningStep[] = [];
  let c = { ...base };
  c = { ...c, postedWithinDays: Math.max(c.postedWithinDays, 60) };
  steps.push({ criteria: c, disclosure: `Publication window widened to ${c.postedWithinDays} days.` });
  c = { ...c, experienceMax: c.experienceMax + 2 };
  steps.push({ criteria: c, disclosure: `Maximum experience widened by 2 years (now ${c.experienceMin}–${c.experienceMax} yrs). Minimum unchanged.` });
  // Only meaningful when the user restricted cities; otherwise it would change nothing.
  if (base.cities.length > 0) {
    c = { ...c, nearbyCities: true };
    steps.push({ criteria: c, disclosure: 'Nearby cities in the same country included. Country unchanged.' });
  }
  c = { ...c, postedWithinDays: Math.max(c.postedWithinDays, 90) };
  steps.push({ criteria: c, disclosure: `Publication window widened to ${c.postedWithinDays} days.` });
  return steps;
}
