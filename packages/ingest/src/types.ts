import type { CompanyCategory, SalaryRange, WorkArrangement } from '@jobradar/core';

/**
 * Sources this package may read. Each is a public, documented, unauthenticated
 * job-board API intended for third-party consumption:
 *   greenhouse : https://developers.greenhouse.io/job-board.html
 *   lever      : https://github.com/lever/postings-api
 *   ashby      : https://developers.ashbyhq.com/docs/public-job-posting-api
 */
export type AtsKind = 'greenhouse' | 'lever' | 'ashby';

/** One company's public board, plus firmographics WE are told (never scraped or guessed). */
export interface BoardConfig {
  ats: AtsKind;
  /** Board token / site name used in the API URL. */
  token: string;
  companyName: string;
  industry?: string;
  hqCity?: string;
  employees?: number;
  fundingStage?: string;
  listed?: boolean;
  countries?: number;
  manualCategory?: CompanyCategory;
  source?: string;
  estimated?: boolean;
  /** Lever EU tenants use api.eu.lever.co. */
  region?: 'eu';
}

export type EmploymentType = 'full-time' | 'contract' | 'part-time' | 'intern' | 'other' | 'unknown';

/** A posting as retrieved and normalised by an adapter (before relevance filtering). */
export interface RawPosting {
  ats: AtsKind;
  boardToken: string;
  companyName: string;
  externalId: string;
  title: string;
  /** Plain text with headings/bullets preserved so section-aware extraction works. */
  description: string;
  url: string;
  applyUrl?: string;
  locations: string[];
  workArrangement?: WorkArrangement;
  employmentType: EmploymentType;
  postedAt?: string;
  updatedAt?: string;
  salary?: SalaryRange;
  department?: string;
}

export interface SourceReport {
  boardKey: string;
  ats: AtsKind;
  status: 'ok' | 'failed' | 'partial';
  fetched: number;
  /** Postings dropped by the adapter itself (unlisted, no description…). */
  skipped: { reason: string; count: number }[];
  attempts: number;
  httpStatus?: number;
  error?: string;
  retryable?: boolean;
  at: string;
}

export interface FetchResult {
  board: BoardConfig;
  postings: RawPosting[];
  report: SourceReport;
}

export interface AdapterContext {
  fetch: typeof fetch;
  userAgent: string;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  maxAttempts: number;
  /** Minimum gap between two requests to the same host. */
  minHostDelayMs: number;
}

export interface SourceAdapter {
  readonly ats: AtsKind;
  fetchBoard(board: BoardConfig, ctx: AdapterContext): Promise<FetchResult>;
}

export const boardKey = (b: Pick<BoardConfig, 'ats' | 'token'>) => `${b.ats}:${b.token}`;
