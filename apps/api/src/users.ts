/* eslint-disable @typescript-eslint/no-explicit-any -- raw SQL rows are mapped to typed records at this boundary */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { emptyProfile, type UserProfile } from '@jobradar/core';
import type { Db } from './db/types';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scrypt(pw, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Minimal HS256 JWT (no external dependency).
const b64 = (x: Buffer | string) => Buffer.from(x).toString('base64url');
export function signToken(sub: string, secret: string, ttlSec = 3600, now = Date.now()): string {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ sub, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlSec }));
  return `${head}.${body}.${b64(createHmac('sha256', secret).update(`${head}.${body}`).digest())}`;
}
export function verifyToken(token: string, secret: string, now = Date.now()): string | null {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const good = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(p, 'base64url').toString()) as { sub: string; exp: number };
    return exp * 1000 > now ? sub : null;
  } catch {
    return null;
  }
}

export async function loadProfile(db: Db, userId: string): Promise<UserProfile | null> {
  const r = (await db.query<Record<string, any>>(`SELECT p.*, u.display_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id=$1`, [userId])).rows[0];
  if (!r) return null;
  const skills = (await db.query<{ skill_id: string; level: any }>(`SELECT skill_id, level FROM user_skills WHERE user_id=$1`, [userId])).rows.map((s) => ({ skillId: s.skill_id, level: s.level }));
  const base = emptyProfile();
  return {
    ...base, name: r.display_name ?? '', currentRole: r.current_title ?? '', yearsExperience: Number(r.years_experience), targetRoleId: r.target_role_id, targetRoleLabel: r.target_role_label ?? undefined, skills,
    preferredSkillIds: r.preferred_skill_ids, salary: { current: r.current_salary == null ? undefined : Number(r.current_salary), expectedMin: r.expected_salary_min == null ? undefined : Number(r.expected_salary_min), expectedMax: r.expected_salary_max == null ? undefined : Number(r.expected_salary_max) },
    locations: { ...base.locations, ...r.locations }, companyCategories: r.company_categories, industries: r.industries, noticePeriodDays: r.notice_period_days ?? undefined, switchTimeline: r.switch_timeline,
    weeklyLearningHours: r.weekly_learning_hours, imports: r.imports ?? {}, onboardingComplete: true,
  };
}

/** Resume text is intentionally NOT stored server-side (privacy: optional, on-device). */
export async function saveProfile(db: Db, userId: string, p: UserProfile): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(`UPDATE users SET display_name=$2 WHERE id=$1`, [userId, p.name || null]);
    await tx.query(
      `INSERT INTO user_profiles (user_id, current_title, years_experience, target_role_id, target_role_label, current_salary, expected_salary_min, expected_salary_max, notice_period_days, switch_timeline, weekly_learning_hours, locations, company_categories, industries, preferred_skill_ids, imports, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
       ON CONFLICT (user_id) DO UPDATE SET current_title=EXCLUDED.current_title, years_experience=EXCLUDED.years_experience, target_role_id=EXCLUDED.target_role_id, target_role_label=EXCLUDED.target_role_label,
         current_salary=EXCLUDED.current_salary, expected_salary_min=EXCLUDED.expected_salary_min, expected_salary_max=EXCLUDED.expected_salary_max, notice_period_days=EXCLUDED.notice_period_days,
         switch_timeline=EXCLUDED.switch_timeline, weekly_learning_hours=EXCLUDED.weekly_learning_hours, locations=EXCLUDED.locations, company_categories=EXCLUDED.company_categories,
         industries=EXCLUDED.industries, preferred_skill_ids=EXCLUDED.preferred_skill_ids, imports=EXCLUDED.imports, updated_at=now()`,
      [userId, p.currentRole || null, p.yearsExperience, p.targetRoleId, p.targetRoleLabel ?? null, p.salary.current ?? null, p.salary.expectedMin ?? null, p.salary.expectedMax ?? null, p.noticePeriodDays ?? null, p.switchTimeline, p.weeklyLearningHours, JSON.stringify(p.locations), p.companyCategories, p.industries, p.preferredSkillIds, JSON.stringify({ ...p.imports, resume: p.imports.resume ?? false })],
    );
    await tx.query(`DELETE FROM user_skills WHERE user_id=$1`, [userId]);
    for (const s of p.skills) await tx.query(`INSERT INTO user_skills (user_id, skill_id, level) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [userId, s.skillId, s.level]);
  });
}
