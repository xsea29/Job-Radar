import { buildDailyReport, classifySkillTrend, computeDemand, computeGapAnalysis, computeMatch, concentration, getSkill, toMatchProfile, type DailyReport, type UserProfile } from '@jobradar/core';
import { boardKey, buildScan, collectBoards, type BoardConfig, type FetchResult, type AdapterContext, type ScanRequest } from '@jobradar/ingest';
import type { Db } from './db/types';
import { persistPostings, saveScan } from './db/repo';
import { loadEvidence } from './evidence';
import { loadProfile } from './users';

export interface DailyDeps {
  db: Db;
  boards: BoardConfig[];
  request: ScanRequest;
  ctx: AdapterContext;
  /** Override for tests; defaults to the real collector. */
  collect?: (boards: BoardConfig[], ctx: AdapterContext) => Promise<FetchResult[]>;
  now?: Date;
  /** Take a demand snapshot (for trends) only if the last one is at least this old. */
  snapshotEveryDays?: number;
  /** Idempotency key date for the daily run (the scheduler passes its local calendar date). */
  keyDate?: string;
  /** Idempotency slot for a refresh run (the scheduler passes floor(now / interval)). */
  slot?: number;
}

export type PipelineMode = 'daily' | 'refresh';

export interface DailyResult {
  skipped?: 'already-ran' | 'locked';
  mode?: PipelineMode;
  scanId?: string;
  snapshotCreated?: boolean;
  newlyExpired?: number;
  newPostings?: number;
  changedPostings?: number;
  validPostings?: number;
  failedBoards?: string[];
  reports?: number;
}

const DAY = 86_400_000;
const STALE_RUN_MINUTES = 30;

/**
 * Mark postings that vanished from a board read successfully as expired. A
 * board that failed to load proves nothing, so its postings are left alone
 * ("unverified" is not "gone").
 */
export async function expireMissing(db: Db, results: FetchResult[], at: Date): Promise<number> {
  let n = 0;
  for (const r of results) {
    if (r.report.status !== 'ok') continue;
    const ids = r.postings.map((p) => p.externalId);
    const res = await db.query<{ id: string }>(
      `UPDATE job_postings SET status='expired', last_verified_at=$3
        WHERE source_board_id = (SELECT id FROM source_boards WHERE source_id=$1 AND token=$2)
          AND status <> 'expired' AND NOT (external_id = ANY($4::text[])) RETURNING id`,
      [r.board.ats, r.board.token, at.toISOString(), ids],
    );
    n += res.rows.length;
  }
  return n;
}

/**
 * Claim a run slot. One run at a time across all instances (the claim step is
 * serialised with a transaction-scoped advisory lock, which is safe with pooled
 * connections), idempotent per key, and a crashed run's slot is retaken after 30 minutes.
 */
export async function claimRun(db: Db, kind: 'daily' | 'scan', key: string): Promise<'ok' | 'locked' | 'already-ran'> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('jobradar-claim'))`);
    const busy = await tx.query(`SELECT 1 FROM worker_runs WHERE state='running' AND started_at > now() - interval '${STALE_RUN_MINUTES} minutes' LIMIT 1`);
    if (busy.rows.length) return 'locked';
    const r = await tx.query(
      `INSERT INTO worker_runs (kind, run_key, state) VALUES ($1,$2,'running')
       ON CONFLICT (kind, run_key) DO UPDATE SET state='running', started_at=now(), finished_at=NULL
         WHERE worker_runs.state='failed' OR (worker_runs.state='running' AND worker_runs.started_at < now() - interval '${STALE_RUN_MINUTES} minutes')
       RETURNING id`,
      [kind, key],
    );
    return r.rows.length ? 'ok' : 'already-ran';
  });
}

/**
 * The scheduled workflow, in two modes sharing one code path.
 *  - daily   : fetch → dedupe/filter/extract → persist new + changed postings → expire vanished
 *              → record a scan (+ demand snapshot at most every few days) → per-user matches,
 *              daily report and notification decisions.
 *  - refresh : the same fetch/persist/expire, but no scan record, no snapshot and no reports:
 *              cheap enough to run every few minutes so new postings show up promptly.
 */
export async function runPipeline(d: DailyDeps, mode: PipelineMode): Promise<DailyResult> {
  const now = d.now ?? new Date();
  const key = mode === 'daily' ? `daily:${d.keyDate ?? now.toISOString().slice(0, 10)}` : `refresh:${d.slot ?? Math.floor(now.getTime() / 3_600_000)}`;
  const claim = await claimRun(d.db, 'daily', key);
  if (claim === 'locked') return { skipped: 'locked', mode };
  if (claim === 'already-ran') return { skipped: 'already-ran', mode };
  try {
    const results = await (d.collect ?? collectBoards)(d.boards, d.ctx);
    const base = { ...d.request, now };
    // A refresh keeps every relevant posting (no 100-job cap): the cap belongs to the evidence base, not to tracking.
    const request: ScanRequest = mode === 'refresh' ? { ...base, scan: { target: 5000, quotas: { startup: 1700, mid: 1600, large: 1700 } } } : base;
    const outcome = buildScan(results, request);
    // Track every relevant posting, not only the capped evidence base, so postings beyond the cap
    // are not mistaken for "new" by the next refresh.
    const tracked = mode === 'daily' ? buildScan(results, { ...base, scan: { target: 5000, quotas: { startup: 1700, mid: 1600, large: 1700 } } }) : outcome;
    if (mode === 'daily') await d.db.transaction((tx) => persistPostings(tx, { boards: d.boards, outcome: tracked, at: now.toISOString() }));
    let out: DailyResult;
    if (mode === 'refresh') {
      const p = await d.db.transaction((tx) => persistPostings(tx, { boards: d.boards, outcome, at: now.toISOString() }));
      const newlyExpired = await expireMissing(d.db, results, now);
      out = { mode, newPostings: p.newJobs, changedPostings: p.changedJobs, newlyExpired, validPostings: outcome.summary.valid, failedBoards: outcome.failedBoards };
    } else {
      const last = await d.db.query<{ end_date: string }>(`SELECT max(end_date) end_date FROM skill_demand_snapshots WHERE provenance='live'`);
      const lastSnap = last.rows[0]?.end_date ? new Date(last.rows[0].end_date).getTime() : 0;
      const createSnapshot = now.getTime() - lastSnap >= (d.snapshotEveryDays ?? 7) * DAY;
      const saved = await saveScan(d.db, { outcome, request: d.request, boards: d.boards, startedAt: new Date(now.getTime() - 60_000), finishedAt: now, snapshotLabel: now.toLocaleString('en-GB', { month: 'short', year: 'numeric' }), createSnapshot });
      const newlyExpired = await expireMissing(d.db, results, now);
      const reports = await buildReports(d.db, now);
      out = { mode, scanId: saved.scanId, snapshotCreated: createSnapshot, newlyExpired, newPostings: saved.newJobs, changedPostings: saved.changedJobs, validPostings: outcome.summary.valid, failedBoards: outcome.failedBoards, reports };
    }
    await d.db.query(`UPDATE worker_runs SET state='succeeded', finished_at=now(), detail=$2 WHERE kind='daily' AND run_key=$1`, [key, JSON.stringify(out)]);
    return out;
  } catch (e) {
    await d.db.query(`UPDATE worker_runs SET state='failed', finished_at=now(), detail=$2 WHERE kind='daily' AND run_key=$1`, [key, JSON.stringify({ error: String(e) })]);
    throw e;
  }
}

/** The once-a-day run (kept as the stable entry point for the CLI and tests). */
export const runDaily = (d: DailyDeps): Promise<DailyResult> => runPipeline(d, 'daily');
export const runRefresh = (d: DailyDeps): Promise<DailyResult> => runPipeline(d, 'refresh');

/** Per user: matches, daily report, notification decision (delivery history kept). */
export async function buildReports(db: Db, now: Date): Promise<number> {
  const ev = await loadEvidence(db);
  if (!ev) return 0;
  const users = (await db.query<{ id: string }>(`SELECT id FROM users WHERE deleted_at IS NULL`)).rows;
  const demandJobs = ev.sampleJobs.map((j) => ({ id: j.id, companyId: j.companyId, companyCategory: j.companyCategory, roleId: j.normalizedRole, industry: j.industry, city: j.city, experience: j.experience, skills: j.skills }));
  const demand = computeDemand(demandJobs);
  const trends = demand.skills.map((s) => classifySkillTrend({ id: s.skillId, foundational: getSkill(s.skillId)?.foundational }, ev.snapshots, concentration(demandJobs, s.skillId, (j) => j.industry)));
  const date = now.toISOString().slice(0, 10);
  let made = 0;
  for (const u of users) {
    const profile = await loadProfile(db, u.id);
    if (!profile) continue;
    const mp = toMatchProfile(profile);
    const prefs = (await db.query<{ in_app: boolean; push: boolean; email: boolean; only_significant: boolean; match_threshold: number }>(`SELECT * FROM notification_preferences WHERE user_id=$1`, [u.id])).rows[0] ?? { in_app: true, push: true, email: false, only_significant: true, match_threshold: 70 };
    const since = new Date(now.getTime() - DAY).toISOString();
    const fresh = ev.jobs.filter((j) => j.firstSeenAt > since);
    const scored = fresh.map((j) => ({ j, m: computeMatch(mp, { id: j.id, roleId: j.normalizedRole, city: j.city, country: j.country, workArrangement: j.workArrangement, experience: j.experience, salary: j.salary, skills: j.skills }) }));
    for (const { j, m } of scored) {
      await db.query(`INSERT INTO job_matches (user_id, job_id, overall, skill_match, experience_status, components, config_hash) VALUES ($1,$2,$3,$4,$5,$6,'default') ON CONFLICT (user_id, job_id) DO UPDATE SET overall=EXCLUDED.overall, skill_match=EXCLUDED.skill_match, experience_status=EXCLUDED.experience_status, components=EXCLUDED.components, computed_at=now()`, [u.id, j.id, m.overall, m.skillMatch, m.experience.status, JSON.stringify(m.components)]);
    }
    const gaps = computeGapAnalysis({ demand, trends: new Map(trends.map((t) => [t.skillId, t])), profile: mp, jobs: demandJobs }).gaps;
    const report: DailyReport = buildDailyReport({
      date, since, demand, trends, gaps,
      newJobs: scored.map(({ j, m }) => ({ id: j.id, title: j.title, company: j.companyName, match: m.overall, firstSeenAt: j.firstSeenAt, skills: j.skills.map((s) => ({ skillId: s.skillId, requirement: s.requirement })) })),
      sources: ev.sources.filter((s) => s.status !== 'not_connected').map((s) => ({ id: s.id, name: s.name, status: s.status, failingDays: s.failingDays })),
      cfg: { matchNotifyThreshold: prefs.match_threshold, newRequirementMinCount: 2, newRequirementLift: 2, maxBestMatches: 3 },
    });
    const ins = await db.query(`INSERT INTO daily_reports (user_id, report_date, payload, notify) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, report_date) DO NOTHING RETURNING id`, [u.id, date, JSON.stringify(report), report.notify.send]);
    if (ins.rows.length === 0) continue; // idempotent: already generated today
    made++;
    const send = report.notify.send || !prefs.only_significant;
    for (const [channel, on] of [['in_app', prefs.in_app], ['push', prefs.push], ['email', prefs.email]] as const) {
      if (!on) continue;
      const delivered = send && channel === 'in_app'; // push/email need provider credentials: recorded, not faked
      const reason = !send ? 'Nothing significant changed' : channel === 'in_app' ? report.notify.reasons.join(' ') : 'Channel provider not configured';
      await db.query(`INSERT INTO notification_deliveries (user_id, report_date, channel, status, reason, sent_at) VALUES ($1,$2,$3,$4,$5,$6)`, [u.id, date, channel, delivered ? 'sent' : send ? 'queued' : 'suppressed', reason, delivered ? now.toISOString() : null]);
    }
  }
  return made;
}

export type { UserProfile };
export { boardKey };
