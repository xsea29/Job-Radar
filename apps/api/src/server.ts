import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { classifySkillTrend, computeDemand, computeGapAnalysis, computeMatch, concentration, getSkill, buildRoadmap, toMatchProfile, type RoleId, type UserProfile } from '@jobradar/core';
import type { Db } from './db/types';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { EventHub } from './events';
import type { Trigger, TriggerMode } from './trigger';
import { loadEvidence } from './evidence';
import { hashPassword, loadProfile, saveProfile, signToken, verifyPassword, verifyToken } from './users';

export interface ServerOptions {
  db: Db;
  jwtSecret: string;
  /** Allowed browser origins for CORS: comma-separated, or '*'. Native app origins: https://localhost (Android), capacitor://localhost (iOS). */
  corsOrigin?: string;
  /** Requests per minute per IP on auth routes. */
  authRateLimit?: number;
  /** Starts the scanner on demand (see GET|POST /v1/cron/scan and POST /v1/scans/run). */
  trigger?: Trigger;
  /** Secret for /v1/cron/scan. Unset = that endpoint is disabled (501). At least 16 characters. */
  cronSecret?: string;
  /** Lets the app run POST /v1/refresh without a login. Safe by design (one refresh per time slot, shared by everyone). Default off here; the server entry turns it on. */
  publicRefresh?: boolean;
  /** Hops of reverse proxy to trust for the client IP (Render = 1). Without it every user looks like the proxy and shares one rate limit. */
  trustProxy?: number | string;
  /** Live-update channel for connected apps (GET /v1/events). */
  hub?: EventHub;
}

class HttpErr extends Error {
  constructor(readonly status: number, message: string, readonly code = 'error') {
    super(message);
  }
}

const Email = z.string().email().max(200).transform((s) => s.toLowerCase());
const Creds = z.object({ email: Email, password: z.string().min(10).max(200) });
const ProfileBody = z.object({
  name: z.string().max(80), currentRole: z.string().max(120), yearsExperience: z.number().min(0).max(60), targetRoleId: z.enum(['frontend', 'backend', 'fullstack', 'software']), targetRoleLabel: z.string().max(120).optional(),
  skills: z.array(z.object({ skillId: z.string().max(64), level: z.enum(['beginner', 'intermediate', 'advanced']) })).max(300), preferredSkillIds: z.array(z.string()).max(100),
  salary: z.object({ current: z.number().optional(), expectedMin: z.number().optional(), expectedMax: z.number().optional() }),
  locations: z.object({ cities: z.array(z.string()), countries: z.array(z.string()), remote: z.boolean(), hybrid: z.boolean(), onsite: z.boolean() }),
  companyCategories: z.array(z.enum(['startup', 'mid', 'large'])), industries: z.array(z.string()), noticePeriodDays: z.number().int().min(0).optional(),
  switchTimeline: z.enum(['asap', '1-3', '3-6', '6-12', 'exploring']), weeklyLearningHours: z.number().int().min(0).max(80),
  imports: z.object({ resume: z.boolean().optional(), github: z.string().optional() }).default({}),
});
const Prefs = z.object({ inApp: z.boolean(), push: z.boolean(), email: z.boolean(), onlyWhenSignificant: z.boolean(), matchThreshold: z.number().int().min(0).max(100) });
const Page = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) });

const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpErr(400, r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), 'validation');
  return r.data;
};

export function createApp(o: ServerOptions) {
  const app = express();
  app.disable('x-powered-by');
  if (o.trustProxy !== undefined && o.trustProxy !== '') app.set('trust proxy', Number.isNaN(Number(o.trustProxy)) ? o.trustProxy : Number(o.trustProxy));
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const allowed = (o.corsOrigin ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const origin = req.headers.origin;
    if (allowed.length) {
      if (allowed.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
      else if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });

  // Fixed-window limiter for auth routes (single instance; use a shared store behind a load balancer).
  const hits = new Map<string, { n: number; reset: number }>();
  const limit = (req: Request, _res: Response, next: NextFunction) => {
    const k = req.ip ?? 'x';
    const now = Date.now();
    const h = hits.get(k);
    if (!h || h.reset < now) hits.set(k, { n: 1, reset: now + 60_000 });
    else if (++h.n > (o.authRateLimit ?? 10)) return next(new HttpErr(429, 'Too many attempts. Try again in a minute.', 'rate_limited'));
    next();
  };

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => void fn(req, res).catch(next);
  const auth = (req: Request): string => {
    const sub = verifyToken((req.headers.authorization ?? '').replace(/^Bearer /, ''), o.jwtSecret);
    if (!sub) throw new HttpErr(401, 'Sign in required.', 'unauthorized');
    return sub;
  };

  app.get('/v1/health', wrap(async (_req, res) => {
    await o.db.query('SELECT 1');
    const last = (await o.db.query<{ finished_at: string; run_key: string }>(`SELECT finished_at, run_key FROM worker_runs WHERE state='succeeded' ORDER BY finished_at DESC LIMIT 1`)).rows[0];
    res.json({ ok: true, lastRun: last ? { key: last.run_key, at: new Date(last.finished_at).toISOString() } : null, liveClients: o.hub?.size ?? 0 });
  }));
  app.get('/v1/events', (req, res) => {
    if (!o.hub) return void res.status(501).json({ error: 'not_configured', message: 'Live updates are not enabled on this server.' });
    o.hub.add(res);
    req.on('close', () => res.end());
  });

  // ── auth ──
  app.post('/v1/auth/register', limit, wrap(async (req, res) => {
    const { email, password } = parse(Creds, req.body);
    const exists = await o.db.query(`SELECT 1 FROM users WHERE email=$1`, [email]);
    if (exists.rows.length) throw new HttpErr(409, 'That email is already registered.', 'conflict');
    const id = (await o.db.query<{ id: string }>(`INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id`, [email, await hashPassword(password)])).rows[0]!.id;
    await o.db.query(`INSERT INTO notification_preferences (user_id) VALUES ($1)`, [id]);
    res.status(201).json({ token: signToken(id, o.jwtSecret) });
  }));
  app.post('/v1/auth/login', limit, wrap(async (req, res) => {
    const { email, password } = parse(Creds, req.body);
    const u = (await o.db.query<{ id: string; password_hash: string | null; deleted_at: unknown }>(`SELECT id, password_hash, deleted_at FROM users WHERE email=$1`, [email])).rows[0];
    // same error for unknown user and wrong password
    if (!u || u.deleted_at || !u.password_hash || !(await verifyPassword(password, u.password_hash))) throw new HttpErr(401, 'Email or password is incorrect.', 'unauthorized');
    res.json({ token: signToken(u.id, o.jwtSecret) });
  }));
  app.delete('/v1/me', wrap(async (req, res) => { await o.db.query(`DELETE FROM users WHERE id=$1`, [auth(req)]); res.sendStatus(204); }));

  // ── public evidence & market (no personal data) ──
  app.get('/v1/evidence', wrap(async (req, res) => {
    const role = z.enum(['frontend', 'backend', 'fullstack', 'software']).optional().parse(req.query.role);
    const ev = await loadEvidence(o.db, role as RoleId | undefined);
    if (!ev) return void res.status(404).json({ error: 'no_scan', message: 'No scan has been run yet.' });
    res.json(ev);
  }));
  app.get('/v1/market', wrap(async (_req, res) => {
    const ev = await loadEvidence(o.db);
    if (!ev) return void res.status(404).json({ error: 'no_scan', message: 'No scan has been run yet.' });
    const jobs = ev.sampleJobs.map((j) => ({ id: j.id, companyId: j.companyId, companyCategory: j.companyCategory, roleId: j.normalizedRole, industry: j.industry, city: j.city, experience: j.experience, skills: j.skills }));
    const demand = computeDemand(jobs);
    const trends = demand.skills.map((s) => classifySkillTrend({ id: s.skillId, foundational: getSkill(s.skillId)?.foundational }, ev.snapshots, concentration(jobs, s.skillId, (j) => j.industry)));
    res.json({ n: demand.n, categoryN: demand.categoryN, skills: demand.skills, trends, scan: ev.scanSummary });
  }));
  app.get('/v1/jobs', wrap(async (req, res) => {
    const { limit: lim, offset } = parse(Page, req.query);
    const ev = await loadEvidence(o.db);
    if (!ev) return void res.status(404).json({ error: 'no_scan' });
    const q = String(req.query.q ?? '').toLowerCase();
    const list = ev.jobs.filter((j) => !q || `${j.title} ${j.companyName}`.toLowerCase().includes(q));
    res.json({ total: list.length, items: list.slice(offset, offset + lim).map(({ description: _d, ...j }) => j) });
  }));
  app.get('/v1/jobs/:id', wrap(async (req, res) => {
    const ev = await loadEvidence(o.db);
    const j = ev?.jobs.find((x) => x.id === req.params.id);
    if (!j) throw new HttpErr(404, 'Job not found.', 'not_found');
    res.json(j);
  }));
  app.get('/v1/scans', wrap(async (req, res) => {
    const { limit: lim, offset } = parse(Page, req.query);
    const r = await o.db.query(`SELECT id, role_id, region, target, valid, state, started_at, finished_at, retrieved, duplicates, inaccessible, rejected, broadening, snapshot_created FROM scan_runs ORDER BY finished_at DESC LIMIT $1 OFFSET $2`, [lim, offset]);
    res.json({ items: r.rows });
  }));
  // Start the scanner now. Shared by the signed-in route and the secret-protected cron route.
  let inflight = false;
  const startScan = async (mode: TriggerMode, wait: boolean) => {
    if (!o.trigger) throw new HttpErr(501, 'Scanning is not configured on this server.', 'not_configured');
    if (inflight) return { http: 200, body: { status: 'busy', mode, message: 'A scan is already running in this process.' } };
    const h = o.trigger(mode);
    inflight = true;
    void h.done.then(() => undefined, () => undefined).finally(() => { inflight = false; });
    const claim = await h.claimed;
    if (claim === 'locked') return { http: 200, body: { status: 'busy', mode, message: 'Another run is in progress.' } };
    if (claim === 'already-ran') return { http: 200, body: { status: 'already-ran', mode, message: 'This slot already ran; nothing to do.' } };
    if (!wait) return { http: 202, body: { status: 'started', mode } };
    const result = await Promise.race([h.done, new Promise<null>((r) => setTimeout(() => r(null), 90_000))]);
    return result ? { http: 200, body: { status: 'done', mode, result } } : { http: 202, body: { status: 'started', mode, message: 'Still running after 90 s; check /v1/health for lastRun.' } };
  };

  const lastRunAt = async () => {
    const r = await o.db.query<{ t: Date | null }>(`SELECT max(finished_at) AS t FROM worker_runs WHERE state='succeeded'`);
    return r.rows[0]?.t ? new Date(r.rows[0].t).toISOString() : null;
  };

  app.post('/v1/scans/run', wrap(async (req, res) => {
    auth(req);
    const r = await startScan('refresh', false);
    res.status(r.http).json({ ...r.body, lastRunAt: await lastRunAt() });
  }));

  // "Update jobs" button in the app: no login, no secret. The only thing it can do is request a refresh,
  // and a refresh is claimed once per time slot for EVERYONE (extra presses return `already-ran`),
  // so it cannot be used to hammer the job boards. Waits for the result by default.
  app.post('/v1/refresh', limit, wrap(async (req, res) => {
    if (!o.publicRefresh) throw new HttpErr(501, 'Updating from the app is turned off on this server.', 'not_configured');
    const wait = String(req.query.wait ?? 'true') !== 'false';
    const r = await startScan('refresh', wait);
    res.status(r.http).json({ ...r.body, lastRunAt: await lastRunAt() });
  }));

  // Secret-protected trigger for external schedulers (cron-job.org, UptimeRobot, curl…). GET and POST both work.
  const sha = (x: string) => createHash('sha256').update(x).digest();
  app.all('/v1/cron/scan', limit, wrap(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') throw new HttpErr(405, 'Use GET or POST.', 'method_not_allowed');
    if (!o.cronSecret || o.cronSecret.length < 16) throw new HttpErr(501, 'The cron trigger is disabled: set CRON_SECRET (16+ characters).', 'not_configured');
    const header = String(req.headers.authorization ?? '').replace(/^Bearer /, '') || String(req.headers['x-cron-secret'] ?? '');
    const given = header || String(req.query.key ?? ''); // ?key= works for services that cannot set headers; it ends up in URLs/logs, so prefer the header
    if (!given || !timingSafeEqual(sha(given), sha(o.cronSecret))) throw new HttpErr(401, 'Invalid or missing secret.', 'unauthorized');
    const mode = String(req.query.mode ?? 'refresh');
    if (mode !== 'refresh' && mode !== 'daily') throw new HttpErr(400, 'mode must be "refresh" or "daily".', 'validation');
    const wait = ['1', 'true', 'yes'].includes(String(req.query.wait ?? ''));
    const r = await startScan(mode, wait);
    res.status(r.http).json(r.body);
  }));

  // ── personal ──
  app.get('/v1/profile', wrap(async (req, res) => { const p = await loadProfile(o.db, auth(req)); if (p) res.json(p); else res.status(404).json({ error: 'no_profile' }); }));
  app.put('/v1/profile', wrap(async (req, res) => { const id = auth(req); await saveProfile(o.db, id, parse(ProfileBody, req.body) as unknown as UserProfile); res.json(await loadProfile(o.db, id)); }));
  const personal = async (req: Request) => {
    const id = auth(req);
    const profile = await loadProfile(o.db, id);
    if (!profile) throw new HttpErr(409, 'Complete your profile first.', 'no_profile');
    const ev = await loadEvidence(o.db, profile.targetRoleId);
    if (!ev) throw new HttpErr(404, 'No scan has been run yet.', 'no_scan');
    return { id, profile, ev, mp: toMatchProfile(profile) };
  };
  app.get('/v1/matches', wrap(async (req, res) => {
    const { limit: lim, offset } = parse(Page, req.query);
    const { ev, mp } = await personal(req);
    const scored = ev.jobs.map((j) => ({ job: { id: j.id, title: j.title, company: j.companyName, city: j.city, sample: j.sample }, match: computeMatch(mp, { id: j.id, roleId: j.normalizedRole, city: j.city, country: j.country, workArrangement: j.workArrangement, experience: j.experience, salary: j.salary, skills: j.skills }) })).sort((a, b) => (b.match.overall ?? -1) - (a.match.overall ?? -1));
    res.json({ total: scored.length, items: scored.slice(offset, offset + lim) });
  }));
  app.get('/v1/gap', wrap(async (req, res) => {
    const { ev, mp, profile } = await personal(req);
    const jobs = ev.sampleJobs.map((j) => ({ id: j.id, companyId: j.companyId, companyCategory: j.companyCategory, roleId: j.normalizedRole, industry: j.industry, city: j.city, experience: j.experience, skills: j.skills }));
    const demand = computeDemand(jobs);
    const trends = new Map(demand.skills.map((s) => [s.skillId, classifySkillTrend({ id: s.skillId, foundational: getSkill(s.skillId)?.foundational }, ev.snapshots, concentration(jobs, s.skillId, (j) => j.industry))]));
    const gap = computeGapAnalysis({ demand, trends, profile: mp, jobs });
    res.json({ n: demand.n, gap, roadmap: buildRoadmap(gap.gaps, profile.weeklyLearningHours) });
  }));
  app.get('/v1/reports', wrap(async (req, res) => {
    const { limit: lim, offset } = parse(Page, req.query);
    const r = await o.db.query(`SELECT report_date, notify, payload FROM daily_reports WHERE user_id=$1 ORDER BY report_date DESC LIMIT $2 OFFSET $3`, [auth(req), lim, offset]);
    res.json({ items: r.rows });
  }));
  app.get('/v1/notifications/preferences', wrap(async (req, res) => {
    const r = (await o.db.query<{ in_app: boolean; push: boolean; email: boolean; only_significant: boolean; match_threshold: number }>(`SELECT * FROM notification_preferences WHERE user_id=$1`, [auth(req)])).rows[0];
    res.json({ inApp: r?.in_app ?? true, push: r?.push ?? true, email: r?.email ?? false, onlyWhenSignificant: r?.only_significant ?? true, matchThreshold: r?.match_threshold ?? 70 });
  }));
  app.put('/v1/notifications/preferences', wrap(async (req, res) => {
    const p = parse(Prefs, req.body);
    await o.db.query(`INSERT INTO notification_preferences (user_id, in_app, push, email, only_significant, match_threshold) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET in_app=$2, push=$3, email=$4, only_significant=$5, match_threshold=$6`, [auth(req), p.inApp, p.push, p.email, p.onlyWhenSignificant, p.matchThreshold]);
    res.json(p);
  }));
  app.get('/v1/learning/progress', wrap(async (req, res) => res.json({ done: (await o.db.query<{ milestone_id: string }>(`SELECT milestone_id FROM learning_progress WHERE user_id=$1`, [auth(req)])).rows.map((r) => r.milestone_id) })));
  app.put('/v1/learning/progress', wrap(async (req, res) => {
    const id = auth(req);
    const { milestoneId, done } = parse(z.object({ milestoneId: z.string().max(120), done: z.boolean() }), req.body);
    if (done) await o.db.query(`INSERT INTO learning_progress (user_id, milestone_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, milestoneId]);
    else await o.db.query(`DELETE FROM learning_progress WHERE user_id=$1 AND milestone_id=$2`, [id, milestoneId]);
    res.json({ milestoneId, done });
  }));

  app.use((_req, res) => void res.status(404).json({ error: 'not_found' }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpErr) return void res.status(err.status).json({ error: err.code, message: err.message });
    if (err instanceof z.ZodError) return void res.status(400).json({ error: 'validation', message: err.issues.map((i) => i.message).join('; ') });
    console.error('Unhandled error:', err instanceof Error ? err.message : err); // never log request bodies (resumes, passwords)
    res.status(500).json({ error: 'internal', message: 'Something went wrong.' });
  });
  return app;
}
