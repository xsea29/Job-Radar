import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { classifySkillTrend, computeDemand, computeGapAnalysis, computeMatch, concentration, getSkill, buildRoadmap, toMatchProfile, type RoleId, type UserProfile } from '@jobradar/core';
import type { Db } from './db/types';
import { loadEvidence } from './evidence';
import { hashPassword, loadProfile, saveProfile, signToken, verifyPassword, verifyToken } from './users';

export interface ServerOptions {
  db: Db;
  jwtSecret: string;
  /** Allowed browser origin for CORS (the app). */
  corsOrigin?: string;
  /** Requests per minute per IP on auth routes. */
  authRateLimit?: number;
  /** Optional trigger for an on-demand scan (wired to runDaily by the server entry). */
  runScan?: () => Promise<unknown>;
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
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (o.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', o.corsOrigin);
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

  app.get('/v1/health', wrap(async (_req, res) => { await o.db.query('SELECT 1'); res.json({ ok: true }); }));

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
  app.post('/v1/scans/run', wrap(async (req, res) => {
    auth(req);
    if (!o.runScan) throw new HttpErr(501, 'Scanning is not configured on this server.', 'not_configured');
    void o.runScan().catch(() => undefined); // runs in the background; poll /v1/scans
    res.status(202).json({ accepted: true });
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
