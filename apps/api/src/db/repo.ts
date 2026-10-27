import { SKILLS, TAXONOMY_VERSION, classifyCompany, type SalaryRange } from '@jobradar/core';
import { boardKey, snapshotFromOutcome, type BoardConfig, type ScanOutcome, type ScanRequest, type ScannedJob, type SourceReport } from '@jobradar/ingest';
import type { Db } from './types';

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const SOURCES = [
  { id: 'greenhouse', name: 'Greenhouse job boards', access: 'Public Job Board API (read-only, no credentials).' },
  { id: 'lever', name: 'Lever postings', access: 'Public Postings API (read-only, no credentials).' },
  { id: 'ashby', name: 'Ashby job boards', access: 'Public job-posting API (read-only, no credentials).' },
];

/** Idempotent: keep `skills` / `skill_aliases` in step with the code taxonomy. */
export async function seedReference(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const s of SOURCES) {
      await tx.query(
        `INSERT INTO job_sources (id, name, kind, access_note) VALUES ($1,$2,'ats_api',$3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, access_note = EXCLUDED.access_note`,
        [s.id, s.name, s.access],
      );
    }
    for (const s of SKILLS) {
      await tx.query(
        `INSERT INTO skills (id, name, category, foundational, taxonomy_version) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, foundational = EXCLUDED.foundational, taxonomy_version = EXCLUDED.taxonomy_version`,
        [s.id, s.name, s.category, !!s.foundational, TAXONOMY_VERSION],
      );
      for (const a of s.aliases) await tx.query(`INSERT INTO skill_aliases (skill_id, alias, case_sensitive) VALUES ($1,$2,false) ON CONFLICT DO NOTHING`, [s.id, a]);
      for (const a of s.caseSensitiveAliases ?? []) await tx.query(`INSERT INTO skill_aliases (skill_id, alias, case_sensitive) VALUES ($1,$2,true) ON CONFLICT DO NOTHING`, [s.id, a]);
    }
  });
}

async function upsertCompany(tx: Db, b: BoardConfig): Promise<string> {
  const c = classifyCompany(b);
  const r = await tx.query<{ id: string }>(
    `INSERT INTO companies (slug, name, industry, hq_city, employees, funding_stage, listed, countries, category, classification_basis, classification_confidence, classification_explanation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, industry=EXCLUDED.industry, hq_city=EXCLUDED.hq_city, employees=EXCLUDED.employees, funding_stage=EXCLUDED.funding_stage,
       listed=EXCLUDED.listed, countries=EXCLUDED.countries, category=EXCLUDED.category, classification_basis=EXCLUDED.classification_basis,
       classification_confidence=EXCLUDED.classification_confidence, classification_explanation=EXCLUDED.classification_explanation, updated_at=now()
     RETURNING id`,
    [slugify(b.companyName), b.companyName, b.industry ?? null, b.hqCity ?? null, b.employees ?? null, b.fundingStage ?? null, b.listed ?? null, b.countries ?? null, c.category, c.basis, c.confidence, c.explanation],
  );
  return r.rows[0]!.id;
}

async function upsertBoard(tx: Db, b: BoardConfig, companyId: string): Promise<string> {
  const r = await tx.query<{ id: string }>(
    `INSERT INTO source_boards (source_id, token, company_id, region) VALUES ($1,$2,$3,$4)
     ON CONFLICT (source_id, token) DO UPDATE SET company_id = EXCLUDED.company_id, region = EXCLUDED.region RETURNING id`,
    [b.ats, b.token, companyId, b.region ?? null],
  );
  return r.rows[0]!.id;
}

async function recordBoardHealth(tx: Db, boardId: string, rep: SourceReport): Promise<void> {
  if (rep.status === 'failed') {
    await tx.query(`UPDATE source_boards SET last_checked_at=$2, consecutive_failures = consecutive_failures + 1, last_error=$3 WHERE id=$1`, [boardId, rep.at, rep.error ?? null]);
  } else {
    await tx.query(`UPDATE source_boards SET last_checked_at=$2, last_success_at=$2, consecutive_failures=0, last_error=NULL WHERE id=$1`, [boardId, rep.at]);
  }
}

async function insertSkills(tx: Db, job: ScannedJob, jobId: string, snapshotId: string): Promise<void> {
  for (const s of job.skills) {
    const r = await tx.query<{ id: string }>(
      `INSERT INTO job_skills (snapshot_id, job_id, skill_id, requirement, confidence, original_wording, is_alternative, method, taxonomy_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [snapshotId, jobId, s.skillId, s.requirement, s.confidence, s.originalWording, s.isAlternative, s.method, s.taxonomyVersion],
    );
    for (const e of s.evidence) {
      await tx.query(
        `INSERT INTO skill_evidence (job_skill_id, sentence, sent_start, sent_end, match_start, match_end, matched_text, section, requirement, confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [r.rows[0]!.id, e.sentence, e.start, e.end, e.matchStart, e.matchEnd, e.matchedText, e.section, e.requirement, e.confidence],
      );
    }
  }
}

const sal = (s?: SalaryRange) => [s?.min ?? null, s?.max ?? null, s?.currency ?? null, s?.period ?? null];

/** Insert or refresh a posting; a changed description becomes a NEW snapshot (old one is kept). */
async function upsertJob(tx: Db, job: ScannedJob, boardId: string, companyId: string, now: string): Promise<{ jobId: string; snapshotId: string; changed: boolean }> {
  const p = job.posting;
  const ex = await tx.query<{ id: string; content_hash: string; current_snapshot_id: string }>(`SELECT id, content_hash, current_snapshot_id FROM job_postings WHERE source_board_id=$1 AND external_id=$2`, [boardId, p.externalId]);
  const fields = [p.title, job.normalizedRole ?? null, p.employmentType, job.location?.city ?? null, job.location?.country ?? null, p.workArrangement ?? null, job.experience?.min ?? null, job.experience?.max ?? null, job.experience?.raw ?? null, ...sal(p.salary), p.postedAt ?? null, p.url, p.applyUrl ?? null];

  if (ex.rows.length === 0) {
    const ins = await tx.query<{ id: string }>(
      `INSERT INTO job_postings (source_board_id, external_id, company_id, title, normalized_role, employment_type, city, country, work_arrangement, experience_min, experience_max, experience_raw,
         salary_min, salary_max, salary_currency, salary_period, posted_at, source_url, apply_url, status, first_seen_at, last_verified_at, content_hash, canonical_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'active',$20,$20,$21,$22) RETURNING id`,
      [boardId, p.externalId, companyId, ...fields, now, job.contentHash, job.canonicalKey],
    );
    const jobId = ins.rows[0]!.id;
    const snap = await tx.query<{ id: string }>(`INSERT INTO job_description_snapshots (job_id, content_hash, description, captured_at) VALUES ($1,$2,$3,$4) RETURNING id`, [jobId, job.contentHash, p.description, now]);
    await tx.query(`UPDATE job_postings SET current_snapshot_id=$2 WHERE id=$1`, [jobId, snap.rows[0]!.id]);
    await insertSkills(tx, job, jobId, snap.rows[0]!.id);
    return { jobId, snapshotId: snap.rows[0]!.id, changed: false };
  }

  const row = ex.rows[0]!;
  if (row.content_hash === job.contentHash) {
    await tx.query(`UPDATE job_postings SET last_verified_at=$2, status='active' WHERE id=$1`, [row.id, now]);
    return { jobId: row.id, snapshotId: row.current_snapshot_id, changed: false };
  }
  const snap = await tx.query<{ id: string }>(
    `INSERT INTO job_description_snapshots (job_id, content_hash, description, captured_at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (job_id, content_hash) DO UPDATE SET captured_at = EXCLUDED.captured_at RETURNING id`,
    [row.id, job.contentHash, p.description, now],
  );
  const snapshotId = snap.rows[0]!.id;
  await tx.query(
    `UPDATE job_postings SET title=$2, normalized_role=$3, employment_type=$4, city=$5, country=$6, work_arrangement=$7, experience_min=$8, experience_max=$9, experience_raw=$10,
       salary_min=$11, salary_max=$12, salary_currency=$13, salary_period=$14, posted_at=$15, source_url=$16, apply_url=$17,
       status='changed', last_verified_at=$18, content_hash=$19, canonical_key=$20, current_snapshot_id=$21 WHERE id=$1`,
    [row.id, ...fields, now, job.contentHash, job.canonicalKey, snapshotId],
  );
  const has = await tx.query(`SELECT 1 FROM job_skills WHERE snapshot_id=$1 LIMIT 1`, [snapshotId]);
  if (has.rows.length === 0) await insertSkills(tx, job, row.id, snapshotId);
  return { jobId: row.id, snapshotId, changed: true };
}

export interface SaveScanArgs {
  outcome: ScanOutcome;
  request: ScanRequest;
  boards: BoardConfig[];
  startedAt: Date;
  finishedAt: Date;
  userId?: string | null;
  snapshotLabel: string;
  region?: string;
  /** Daily refreshes pass false: trends only compare snapshots taken every few days. Default true. */
  createSnapshot?: boolean;
}

/** Persist a whole scan atomically: postings, versions, extraction + evidence, results, source health, demand snapshot. */
export async function saveScan(db: Db, a: SaveScanArgs): Promise<{ scanId: string; snapshotId: string; changedJobs: number }> {
  const { outcome: o, request: req } = a;
  const now = a.finishedAt.toISOString();
  const region = a.region ?? req.countries.join(', ');
  return db.transaction(async (tx) => {
    const boardIds = new Map<string, { boardId: string; companyId: string }>();
    for (const b of a.boards) {
      const companyId = await upsertCompany(tx, b);
      boardIds.set(boardKey(b), { boardId: await upsertBoard(tx, b, companyId), companyId });
    }
    for (const rep of o.sourceReports) {
      const ids = boardIds.get(rep.boardKey);
      if (ids) await recordBoardHealth(tx, ids.boardId, rep);
    }

    const scan = await tx.query<{ id: string }>(
      `INSERT INTO scan_runs (user_id, role_id, region, target, quota_startup, quota_mid, quota_large, state, started_at, finished_at, retrieved, valid, duplicates, inaccessible, rejected, surplus_valid, criteria, broadening, warnings, snapshot_created)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [a.userId ?? null, req.targetRoleId, region, req.scan.target, req.scan.quotas.startup, req.scan.quotas.mid, req.scan.quotas.large, o.summary.state, a.startedAt.toISOString(), now, o.summary.retrieved, o.summary.valid, o.summary.duplicates, o.summary.inaccessible, o.summary.rejected, o.surplusValid, JSON.stringify(o.finalCriteria), JSON.stringify(o.broadening), JSON.stringify(o.summary.warnings), a.createSnapshot !== false],
    );
    const scanId = scan.rows[0]!.id;

    let changedJobs = 0;
    const saved = new Map<string, { jobId: string; snapshotId: string }>();
    for (const j of o.selected) {
      const ids = boardIds.get(boardKey(j.board))!;
      const r = await upsertJob(tx, j, ids.boardId, ids.companyId, now);
      if (r.changed) changedJobs++;
      saved.set(j.id, r);
    }
    for (const v of o.verdicts) {
      const s = saved.get(v.id);
      await tx.query(
        `INSERT INTO scan_results (scan_id, candidate_key, job_id, snapshot_id, status, reason, detail, duplicate_of, title, company_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [scanId, v.id, s?.jobId ?? null, s?.snapshotId ?? null, v.status, v.reason ?? null, v.detail ?? null, v.duplicateOf ?? null, v.title, v.company],
      );
    }
    for (const rep of o.sourceReports) {
      await tx.query(
        `INSERT INTO scan_source_reports (scan_id, board_key, status, fetched, skipped, attempts, http_status, error, retryable, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [scanId, rep.boardKey, rep.status, rep.fetched, JSON.stringify(rep.skipped), rep.attempts, rep.httpStatus ?? null, rep.error ?? null, rep.retryable ?? null, rep.at],
      );
    }

    if (a.createSnapshot === false) return { scanId, snapshotId: '', changedJobs };
    const snap = snapshotFromOutcome(o, { id: scanId, label: a.snapshotLabel, roleId: req.targetRoleId, region, experienceBand: `${req.experience.min}–${req.experience.max} yrs`, startDate: a.startedAt.toISOString(), endDate: now });
    const sid = await tx.query<{ id: string }>(
      `INSERT INTO skill_demand_snapshots (scan_id, label, start_date, end_date, n, role_id, region, experience_band, company_mix, provenance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'live') RETURNING id`,
      [scanId, snap.label, snap.startDate, snap.endDate, snap.n, snap.roleId, snap.region, snap.experienceBand, JSON.stringify(snap.companyMix)],
    );
    for (const [skillId, c] of Object.entries(snap.counts)) {
      await tx.query(`INSERT INTO skill_demand_counts (snapshot_id, skill_id, jobs, required, preferred) VALUES ($1,$2,$3,$4,$5)`, [sid.rows[0]!.id, skillId, c.jobs, c.required, c.preferred]);
    }
    return { scanId, snapshotId: sid.rows[0]!.id, changedJobs };
  });
}

/** Recompute skill counts from the stored rows (not from the in-memory outcome): the traceability check. */
export async function skillCountsFromRows(db: Db, scanId: string): Promise<Map<string, { jobs: number; required: number; preferred: number }>> {
  const r = await db.query<{ skill_id: string; jobs: string; required: string; preferred: string }>(
    `SELECT js.skill_id, count(DISTINCT js.job_id) AS jobs,
            count(*) FILTER (WHERE js.requirement='required') AS required,
            count(*) FILTER (WHERE js.requirement='preferred') AS preferred
       FROM scan_results sr JOIN job_skills js ON js.snapshot_id = sr.snapshot_id
      WHERE sr.scan_id=$1 AND sr.status='valid' GROUP BY js.skill_id`,
    [scanId],
  );
  return new Map(r.rows.map((x) => [x.skill_id, { jobs: Number(x.jobs), required: Number(x.required), preferred: Number(x.preferred) }]));
}

/**
 * Every stored evidence span must be recoverable from the stored description
 * using JS string slicing (offsets are UTF-16 code units). Returns the number
 * of rows that are NOT, so 0 means fully traceable.
 */
export async function verifyEvidenceOffsets(db: Db, scanId?: string): Promise<number> {
  const rows = await db.query<{ description: string; sentence: string; sent_start: number; sent_end: number; match_start: number; match_end: number; matched_text: string }>(
    `SELECT d.description, e.sentence, e.sent_start, e.sent_end, e.match_start, e.match_end, e.matched_text
       FROM skill_evidence e JOIN job_skills js ON js.id = e.job_skill_id JOIN job_description_snapshots d ON d.id = js.snapshot_id
      ${scanId ? 'WHERE js.snapshot_id IN (SELECT snapshot_id FROM scan_results WHERE scan_id = $1)' : ''}`,
    scanId ? [scanId] : [],
  );
  return rows.rows.filter((r) => r.description.slice(r.sent_start, r.sent_end) !== r.sentence || r.description.slice(r.match_start, r.match_end) !== r.matched_text).length;
}
