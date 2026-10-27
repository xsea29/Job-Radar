import type { SectionSummary } from './extract';
import type {
  CompanyCategoryOrUnclassified,
  CompanyClassification,
  ExtractedSkill,
  JobStatus,
  Provenance,
  RoleId,
  SalaryRange,
  WorkArrangement,
} from './types';

/** Stored entities shared by the app (demo data now) and the backend (Stage 2). */

export interface Company {
  id: string;
  name: string;
  provenance: Provenance;
  category: CompanyCategoryOrUnclassified;
  classification: CompanyClassification;
  industry: string;
  hqCity: string;
  employees?: number;
  fundingStage?: string;
  countries?: number;
}

export type SourceStatus = 'ok' | 'delayed' | 'failed' | 'not_connected';

export interface JobSource {
  id: string;
  name: string;
  kind: 'ats_api' | 'licensed_feed' | 'careers_pages' | 'not_connected';
  status: SourceStatus;
  /** What we are permitted to do with this source. */
  access: string;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  failingDays: number;
  jobsRetrieved: number;
  jobsValid: number;
  note: string;
}

export interface JobPosting {
  id: string;
  provenance: Provenance;
  companyId: string;
  companyName: string;
  companyCategory: CompanyCategoryOrUnclassified;
  industry: string;
  title: string;
  normalizedRole: RoleId;
  description: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  city?: string;
  country: string;
  workArrangement: WorkArrangement;
  experience?: { min?: number; max?: number; raw: string };
  employmentType: 'full-time' | 'contract';
  postedAt?: string;
  firstSeenAt: string;
  lastVerifiedAt: string;
  status: JobStatus;
  salary?: SalaryRange;
  skills: ExtractedSkill[];
  summary: SectionSummary;
  contentHash: string;
  /** `in_scan` jobs form the evidence base; `new_since_scan` were found by the daily bot. */
  sample: 'in_scan' | 'new_since_scan';
}

export interface FailedRetrieval {
  id: string;
  sourceId: string;
  target: string;
  reason: string;
  at: string;
  retryable: boolean;
}

export interface ScanRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  target: number;
  valid: number;
  retrieved: number;
  duplicates: number;
  inaccessible: number;
  rejected: number;
  rejectedByReason: Record<string, number>;
  state: 'complete' | 'partial';
  roleId: RoleId;
  region: string;
  broadening: string[];
  provenance: Provenance;
  /** Whether this run is the current evidence base. */
  current: boolean;
  quotas: { startup: number; mid: number; large: number };
}

// Role normalisation ---------------------------------------------------------

const ROLE_RULES: { id: RoleId; re: RegExp }[] = [
  { id: 'fullstack', re: /full[\s-]?stack/i },
  { id: 'frontend', re: /front[\s-]?end|\bui engineer|react developer|web developer\b/i },
  { id: 'backend', re: /back[\s-]?end|api engineer|platform engineer|server[\s-]side/i },
  { id: 'software', re: /software (?:engineer|developer)|\bsde\b|application engineer|product engineer|member of technical staff|\bswe\b|developer\b|programmer/i },
];

/** Map a free-text job title to a normalised role, or undefined if unrecognised. */
export function normalizeRole(title: string): RoleId | undefined {
  for (const r of ROLE_RULES) if (r.re.test(title)) return r.id;
  return undefined;
}
