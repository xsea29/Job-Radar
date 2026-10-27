import { buildDailyReport, classifySkillTrend, computeDemand, computeGapAnalysis, computeMatch, concentration, getSkill, toMatchProfile, type DailyReport, type UserProfile } from '@jobradar/core';
import { boardKey, buildScan, collectBoards, type BoardConfig, type FetchResult, type AdapterContext, type ScanRequest } from '@jobradar/ingest';
import type { Db } from './db/types';
import { saveScan } from './db/repo';
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
}

export interface DailyResult {
  skipped?: 'already-ran' | 'locked';
  scanId?: string;
  snapshotCreated?: boolean;
  newlyExpired?: number;
  reports?: number;
}

const DAY = 86_400_000;

/**
 * Mark postings that vanished from a board we read successfully today as
 * expired. A board that failed to load proves nothing, so its postings are
 * left alone ("unverified" is not "gone").
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
 * The daily workflow. Idempotent per UTC date (worker_runs unique key) and safe
 * across several instances (advisory lock): fetch → dedupe/filter/extract →
 * persist (new + changed postings) → expire vanished postings → optional demand
 * snapshot → per-user matches, report and notification decisions.
 */
export async function runDaily(d: DailyDeps): Promise<DailyResult> {
  const now = d.now ?? new Date();
  const key = `daily:${now.toISOString().slice(0, 10)}`;
  const lock = await d.db.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext('jobradar-daily')) ok`);
  if (!lock.rows[0]!.ok) return { skipped: 'locked' };
  try {
    const claim = await d.db.query(`INSERT INTO worker_runs (kind, run_key, state) VALUES ('daily', $1, 'running') ON CONFLICT (kind, run_key) DO UPDATE SET state='running', started_at=now() WHERE worker_runs.state='failed' RETURNING id`, [key]);
    if (claim.rows.length === 0) return { skipped: 'already-ran' };
    try {
      const results = await (d.collect ?? collectBoards)(d.boards, d.ctx);
      const outcome = buildScan(results, { ...d.request, now });
      const last = await d.db.query<{ end_date: string }>(`SELECT max(end_date) end_date FROM skill_demand_snapshots WHERE provenance='live'`);
      const lastSnap = last.rows[0]?.end_date ? new Date(last.rows[0].end_date).getTime() : 0;
      const createSnapshot = now.getTime() - lastSnap >= (d.snapshotEveryDays ?? 7) * DAY;
      const started = new Date(now.getTime() - 60_000);
      const saved = await saveScan(d.db, { outcome, request: d.request, boards: d.boards, startedAt: started, finishedAt: now, snapshotLabel: now.toLocaleString('en-GB', { month: 'short', year: 'numeric' }), createSnapshot });
      const newlyExpired = await expireMissing(d.db, results, now);
      const reports = await buildReports(d.db, now);
      await d.db.query(`UPDATE worker_runs SET state='succeeded', finished_at=now(), detail=$2 WHERE kind='daily' AND run_key=$1`, [key, JSON.stringify({ valid: outcome.summary.valid, failedBoards: outcome.failedBoards, newlyExpired, reports, createSnapshot })]);
      return { scanId: saved.scanId, snapshotCreated: createSnapshot, newlyExpired, reports };
    } catch (e) {
      await d.db.query(`UPDATE worker_runs SET state='failed', finished_at=now(), detail=$2 WHERE kind='daily' AND run_key=$1`, [key, JSON.stringify({ error: String(e) })]);
      throw e;
    }
  } finally {
    await d.db.query(`SELECT pg_advisory_unlock(hashtext('jobradar-daily'))`);
  }
}

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
