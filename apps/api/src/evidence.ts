/* eslint-disable @typescript-eslint/no-explicit-any -- raw SQL rows are mapped to typed records at this boundary */
import {
  summarizeScan,
  summarizeSections,
  type Company,
  type DemandSnapshot,
  type ExtractedSkill,
  type FailedRetrieval,
  type JobPosting,
  type JobSource,
  type RoleId,
  type ScanCandidate,
  type ScanRun,
  type ScanSummary,
} from '@jobradar/core';
import type { Db } from './db/types';

/** Same shape the mobile app's `Evidence` uses, but provenance is 'live'. */
export interface LiveEvidence {
  provenance: 'live';
  now: string;
  roleId: RoleId;
  scenario: 'complete' | 'partial';
  jobs: JobPosting[];
  sampleJobs: JobPosting[];
  newJobs: JobPosting[];
  companies: Company[];
  sources: JobSource[];
  scan: ScanRun;
  scanHistory: ScanRun[];
  scanSummary: ScanSummary;
  snapshots: DemandSnapshot[];
  failedRetrievals: FailedRetrieval[];
  botRanAt: string;
}

type Row = Record<string, any>;
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : '');

function toRun(r: Row, current: boolean, valid: { startup: number; mid: number; large: number }, rejectedByReason: Record<string, number>): ScanRun {
  return {
    id: r.id, startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), target: r.target, valid: r.valid, retrieved: r.retrieved, duplicates: r.duplicates,
    inaccessible: r.inaccessible, rejected: r.rejected, rejectedByReason, state: r.state, roleId: r.role_id, region: r.region, broadening: r.broadening ?? [],
    provenance: 'live', current, quotas: valid,
  };
}

/**
 * Rebuild the evidence the app consumes from stored rows. The evidence base is
 * the latest scan that produced a demand snapshot; postings found by later
 * (snapshot-less) daily runs are "new since scan". Returns null before any scan.
 */
export async function loadEvidence(db: Db, roleId?: RoleId): Promise<LiveEvidence | null> {
  const q = async (sql: string, p: unknown[] = []) => (await db.query<Row>(sql, p)).rows;
  const runs = await q(`SELECT * FROM scan_runs WHERE provenance='live' AND state IN ('complete','partial') ${roleId ? 'AND role_id=$1' : ''} ORDER BY finished_at DESC`, roleId ? [roleId] : []);
  const base = runs.find((r) => r.snapshot_created);
  if (!base) return null;
  const later = runs.filter((r) => new Date(r.finished_at) > new Date(base.finished_at));

  const results = await q(
    `SELECT sr.scan_id, sr.candidate_key, sr.job_id, sr.snapshot_id, sr.status, sr.reason, sr.detail, c.category
       FROM scan_results sr LEFT JOIN job_postings jp ON jp.id = sr.job_id LEFT JOIN companies c ON c.id = jp.company_id WHERE sr.scan_id = ANY($1::uuid[])`,
    [[base.id, ...later.map((r) => r.id)]],
  );
  const baseRes = results.filter((r) => r.scan_id === base.id);
  const baseJobIds = new Set(baseRes.filter((r) => r.status === 'valid').map((r) => r.job_id));
  const newIds = new Set<string>();
  const snapshotFor = new Map<string, string>();
  for (const r of results) if (r.status === 'valid') snapshotFor.set(r.job_id, r.scan_id === base.id || !snapshotFor.has(r.job_id) ? r.snapshot_id : snapshotFor.get(r.job_id)!);
  for (const r of results) if (r.scan_id !== base.id && r.status === 'valid' && !baseJobIds.has(r.job_id)) newIds.add(r.job_id);
  const wanted = [...baseJobIds, ...newIds];

  const jobRows = wanted.length
    ? await q(
        `SELECT jp.*, sb.source_id, s.name AS source_name, c.name AS company_name, c.category, c.industry, d.description, d.id AS snap_id
           FROM job_postings jp JOIN source_boards sb ON sb.id = jp.source_board_id JOIN job_sources s ON s.id = sb.source_id
           JOIN companies c ON c.id = jp.company_id JOIN job_description_snapshots d ON d.id = jp.current_snapshot_id WHERE jp.id = ANY($1::uuid[])`,
        [wanted],
      )
    : [];
  const skillRows = jobRows.length
    ? await q(
        `SELECT js.id, js.snapshot_id, js.job_id, js.skill_id, sk.name, js.requirement, js.confidence, js.original_wording, js.is_alternative, js.method, js.taxonomy_version
           FROM job_skills js JOIN skills sk ON sk.id = js.skill_id WHERE js.snapshot_id = ANY($1::uuid[])`,
        [jobRows.map((j) => j.snap_id)],
      )
    : [];
  const evRows = skillRows.length ? await q(`SELECT * FROM skill_evidence WHERE job_skill_id = ANY($1::bigint[]) ORDER BY id`, [skillRows.map((s) => s.id)]) : [];
  const evBy = new Map<string, Row[]>();
  for (const e of evRows) evBy.set(String(e.job_skill_id), [...(evBy.get(String(e.job_skill_id)) ?? []), e]);
  const skillsBy = new Map<string, ExtractedSkill[]>();
  for (const s of skillRows) {
    const skill: ExtractedSkill = {
      skillId: s.skill_id, canonicalName: s.name, requirement: s.requirement, confidence: Number(s.confidence), originalWording: s.original_wording, isAlternative: s.is_alternative,
      method: s.method, taxonomyVersion: s.taxonomy_version,
      evidence: (evBy.get(String(s.id)) ?? []).map((e) => ({ sentence: e.sentence, start: e.sent_start, end: e.sent_end, matchedText: e.matched_text, matchStart: e.match_start, matchEnd: e.match_end, section: e.section, requirement: e.requirement, confidence: Number(e.confidence) })),
    };
    skillsBy.set(s.snapshot_id, [...(skillsBy.get(s.snapshot_id) ?? []), skill]);
  }

  const toJob = (j: Row, sample: JobPosting['sample']): JobPosting => ({
    id: j.id, provenance: 'live', companyId: j.company_id, companyName: j.company_name, companyCategory: j.category, industry: j.industry ?? 'Other', title: j.title, normalizedRole: j.normalized_role ?? 'software',
    description: j.description, sourceId: j.source_id, sourceName: j.source_name, sourceUrl: j.source_url, city: j.city ?? undefined, country: j.country ?? 'India',
    workArrangement: j.work_arrangement ?? undefined,
    experience: j.experience_raw ? { min: j.experience_min == null ? undefined : Number(j.experience_min), max: j.experience_max == null ? undefined : Number(j.experience_max), raw: j.experience_raw } : undefined,
    employmentType: j.employment_type === 'contract' ? 'contract' : 'full-time', postedAt: j.posted_at ? iso(j.posted_at) : undefined, firstSeenAt: iso(j.first_seen_at), lastVerifiedAt: iso(j.last_verified_at), status: j.status,
    salary: j.salary_min != null || j.salary_max != null ? { min: j.salary_min == null ? undefined : Number(j.salary_min), max: j.salary_max == null ? undefined : Number(j.salary_max), currency: j.salary_currency, period: j.salary_period } : undefined,
    skills: skillsBy.get(j.snap_id) ?? [], summary: summarizeSections(j.description), contentHash: j.content_hash, sample,
  });
  const sampleJobs = jobRows.filter((j) => baseJobIds.has(j.id)).map((j) => toJob(j, 'in_scan'));
  const newJobs = jobRows.filter((j) => newIds.has(j.id)).map((j) => toJob(j, 'new_since_scan'));

  const companies: Company[] = (await q(`SELECT * FROM companies WHERE provenance='live' ORDER BY name`)).map((c) => ({
    id: c.id, name: c.name, provenance: 'live', category: c.category, classification: { category: c.category, basis: c.classification_basis, confidence: c.classification_confidence, explanation: c.classification_explanation },
    industry: c.industry ?? 'Other', hqCity: c.hq_city ?? '', employees: c.employees ?? undefined, fundingStage: c.funding_stage ?? undefined, countries: c.countries ?? undefined,
  }));

  // Sources: per ATS, health aggregated over its boards.
  const health = await q(`SELECT sb.source_id, max(sb.consecutive_failures) fails, max(sb.last_checked_at) checked, max(sb.last_success_at) success, count(*) boards FROM source_boards sb GROUP BY 1`);
  const reps = await q(`SELECT split_part(board_key, ':', 1) src, sum(fetched) fetched FROM scan_source_reports WHERE scan_id=$1 GROUP BY 1`, [base.id]);
  const validBySrc = new Map<string, number>();
  for (const j of jobRows.filter((x) => baseJobIds.has(x.id))) validBySrc.set(j.source_id, (validBySrc.get(j.source_id) ?? 0) + 1);
  const srcRows = await q(`SELECT * FROM job_sources ORDER BY id`);
  const sources: JobSource[] = srcRows.map((s) => {
    const h = health.find((x) => x.source_id === s.id);
    const fails = Number(h?.fails ?? 0);
    return {
      id: s.id, name: s.name, kind: s.kind, status: fails >= 3 ? 'failed' : fails > 0 ? 'delayed' : 'ok', access: s.access_note, lastCheckedAt: h?.checked ? iso(h.checked) : undefined, lastSuccessAt: h?.success ? iso(h.success) : undefined,
      failingDays: fails, jobsRetrieved: Number(reps.find((r) => r.src === s.id)?.fetched ?? 0), jobsValid: validBySrc.get(s.id) ?? 0,
      note: fails ? `Worst board has failed ${fails} time${fails > 1 ? 's' : ''} in a row.` : `${h?.boards ?? 0} public board(s), healthy.`,
    };
  });

  // Scan summary + history.
  const toCandidates = (rows: Row[]): ScanCandidate[] =>
    rows.map((r) => ({ id: r.candidate_key, status: r.status === 'surplus' ? 'duplicate' : r.status, rejection: r.status === 'rejected' ? r.reason : undefined, category: r.status === 'valid' ? r.category : undefined })).filter((c) => !(c as { status: string }).status.startsWith('surplus')) as ScanCandidate[];
  const surplusFree = baseRes.filter((r) => r.status !== 'surplus');
  const scanSummary = summarizeScan(toCandidates(surplusFree), { target: base.target, quotas: { startup: base.quota_startup, mid: base.quota_mid, large: base.quota_large } });
  const quotasOf = (rows: Row[]) => ({ startup: rows.filter((r) => r.status === 'valid' && r.category === 'startup').length, mid: rows.filter((r) => r.status === 'valid' && r.category === 'mid').length, large: rows.filter((r) => r.status === 'valid' && r.category === 'large').length });
  const reasons = (rows: Row[]) => { const o: Record<string, number> = {}; for (const r of rows) if (r.status === 'rejected' && r.reason) o[r.reason] = (o[r.reason] ?? 0) + 1; return o; };
  const scan = toRun(base, true, quotasOf(baseRes), reasons(baseRes));
  const histRuns = runs.filter((r) => r.snapshot_created);
  const histRes = histRuns.length > 1 ? await q(`SELECT sr.scan_id, sr.status, sr.reason, c.category FROM scan_results sr LEFT JOIN job_postings jp ON jp.id=sr.job_id LEFT JOIN companies c ON c.id=jp.company_id WHERE sr.scan_id = ANY($1::uuid[])`, [histRuns.map((r) => r.id)]) : [];
  const scanHistory = histRuns.map((r) => (r.id === base.id ? scan : toRun(r, false, quotasOf(histRes.filter((x) => x.scan_id === r.id)), reasons(histRes.filter((x) => x.scan_id === r.id)))));

  const snaps = await q(`SELECT * FROM skill_demand_snapshots WHERE provenance='live' ${roleId ? 'AND role_id=$1' : ''} ORDER BY end_date`, roleId ? [roleId] : []);
  const counts = snaps.length ? await q(`SELECT snapshot_id, skill_id, jobs, required, preferred FROM skill_demand_counts WHERE snapshot_id = ANY($1::uuid[])`, [snaps.map((s) => s.id)]) : [];
  const snapshots: DemandSnapshot[] = snaps.map((s) => ({
    id: s.id, label: s.label, startDate: iso(s.start_date), endDate: iso(s.end_date), n: s.n, roleId: s.role_id, region: s.region, experienceBand: s.experience_band, companyMix: s.company_mix, provenance: 'live',
    counts: Object.fromEntries(counts.filter((c) => c.snapshot_id === s.id).map((c) => [c.skill_id, { jobs: c.jobs, required: c.required, preferred: c.preferred }])),
  }));

  const failed = await q(`SELECT 'report' kind, board_key target, error reason, at, retryable FROM scan_source_reports WHERE scan_id=$1 AND status='failed' UNION ALL SELECT 'result', candidate_key, reason, $2::timestamptz, false FROM scan_results WHERE scan_id=$1 AND status='inaccessible' LIMIT 50`, [base.id, base.finished_at]);
  const failedRetrievals: FailedRetrieval[] = failed.map((f, i) => ({ id: `f${i}`, sourceId: String(f.target).split(':')[0]!, target: String(f.target), reason: f.reason ?? 'unreadable', at: iso(f.at), retryable: !!f.retryable }));

  return {
    provenance: 'live', now: new Date().toISOString(), roleId: base.role_id, scenario: base.state === 'complete' ? 'complete' : 'partial',
    jobs: [...sampleJobs, ...newJobs], sampleJobs, newJobs, companies, sources, scan, scanHistory, scanSummary, snapshots, failedRetrievals, botRanAt: iso(runs[0]!.finished_at),
  };
}
