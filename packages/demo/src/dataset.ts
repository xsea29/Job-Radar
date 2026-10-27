import {
  DEFAULT_SCAN_CONFIG,
  classifyCompany,
  computeDemand,
  contentHash,
  extractExperience,
  extractSkills,
  getSkill,
  normalizeRole,
  summarizeScan,
  summarizeSections,
  type Company,
  type DemandSnapshot,
  type FailedRetrieval,
  type JobPosting,
  type JobSource,
  type RoleId,
  type ScanCandidate,
  type ScanRun,
  type ScanSummary,
  type WorkArrangement,
  type CompanyCategory,
} from '@jobradar/core';
import { DEMO_COMPANIES, companySlug, type DemoCompany } from './companies';
import { composeDescription, type JdSkill, type JdSpec } from './jd';
import { skillProbabilities } from './profiles';
import { chance, hashSeed, int, mulberry32, pick, shuffle, weighted, type Rng } from './rng';

export type DemoScenario = 'complete' | 'partial';

export interface DemoDataset {
  provenance: 'demo';
  now: string;
  roleId: RoleId;
  scenario: DemoScenario;
  /** In-scan jobs + jobs found by the daily bot since the scan. */
  jobs: JobPosting[];
  /** The evidence base: only jobs that belong to the current scan. */
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

// ---------------------------------------------------------------------------

const ROLE_MIX: Record<RoleId, [RoleId, number][]> = {
  fullstack: [['fullstack', 68], ['software', 20], ['frontend', 6], ['backend', 6]],
  frontend: [['frontend', 66], ['fullstack', 20], ['software', 14]],
  backend: [['backend', 66], ['fullstack', 12], ['software', 22]],
  software: [['software', 60], ['fullstack', 16], ['backend', 12], ['frontend', 12]],
};

const TITLES: Record<RoleId, string[]> = {
  fullstack: ['Full-Stack Engineer', 'Full Stack Developer', 'Software Engineer (Full Stack)', 'Senior Full-Stack Engineer', 'Full-Stack Engineer II', 'SDE-2 (Full Stack)', 'Product Engineer, Full Stack'],
  software: ['Software Engineer', 'Software Engineer II', 'Application Engineer', 'Senior Software Engineer', 'SDE-2', 'Software Developer', 'Member of Technical Staff'],
  frontend: ['Frontend Engineer', 'Front-End Developer', 'Senior Frontend Engineer', 'UI Engineer', 'React Developer'],
  backend: ['Backend Engineer', 'Back-End Developer', 'Senior Backend Engineer', 'API Engineer', 'Platform Engineer'],
};

const CITIES = ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Chennai', 'Gurugram'];

const SOURCE_DEFS: Omit<JobSource, 'status' | 'lastCheckedAt' | 'lastSuccessAt' | 'failingDays' | 'jobsRetrieved' | 'jobsValid' | 'note'>[] = [
  { id: 'greenhouse', name: 'Greenhouse job boards', kind: 'ats_api', access: 'Public Job Board API. Permitted for read-only retrieval.' },
  { id: 'lever', name: 'Lever postings', kind: 'ats_api', access: 'Public Postings API. Permitted for read-only retrieval.' },
  { id: 'ashby', name: 'Ashby job boards', kind: 'ats_api', access: 'Public job-posting API. Permitted for read-only retrieval.' },
  { id: 'adzuna', name: 'Adzuna API', kind: 'licensed_feed', access: 'Licensed API key. Descriptions limited to what the licence allows.' },
  { id: 'careers', name: 'Company careers pages', kind: 'careers_pages', access: 'Only pages whose robots.txt allows automated access.' },
];

const SOURCE_WEIGHTS: [string, number][] = [['greenhouse', 31], ['lever', 22], ['ashby', 14], ['adzuna', 18], ['careers', 15]];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();
const monthLabel = (t: number) => `${MONTHS[new Date(t).getUTCMonth()]} ${new Date(t).getUTCFullYear()}`;

function seniority(r: Rng, title: string): { min: number; max: number } {
  if (/senior/i.test(title)) return weighted(r, [[{ min: 5, max: 8 }, 6], [{ min: 5, max: 9 }, 3], [{ min: 6, max: 10 }, 1]]);
  if (/\bII\b|SDE-2/i.test(title)) return weighted(r, [[{ min: 3, max: 6 }, 6], [{ min: 3, max: 5 }, 3], [{ min: 4, max: 7 }, 2]]);
  return weighted(r, [[{ min: 3, max: 6 }, 4], [{ min: 2, max: 5 }, 3], [{ min: 4, max: 7 }, 2], [{ min: 1, max: 3 }, 1]]);
}

const SALARY_BASE: Record<number, [number, number]> = { 1: [6, 12], 2: [10, 18], 3: [16, 28], 4: [22, 36], 5: [28, 48], 6: [36, 58] };

function salaryFor(r: Rng, min: number, cat: CompanyCategory): { min: number; max: number } {
  const [lo, hi] = SALARY_BASE[Math.min(6, Math.max(1, min))]!;
  const f = cat === 'large' ? 1.05 : cat === 'startup' ? 0.97 : 1;
  const a = Math.round(lo * f * (0.9 + r() * 0.25));
  const b = Math.max(a + 4, Math.round(hi * f * (0.95 + r() * 0.25)));
  return { min: a * 100_000, max: b * 100_000 };
}

const ALT_GROUPS = ['frontend-framework', 'cloud-provider', 'sql-db'];

function chooseSkills(r: Rng, roleId: RoleId, category: CompanyCategory, industry: string): { skills: JdSkill[]; alternatives: JdSpec['alternatives'] } {
  const probs = skillProbabilities(roleId, category, industry);
  const chosen = new Map<string, JdSkill['slot']>();
  for (const [id, [pReq, pPref]] of Object.entries(probs)) {
    const x = r();
    if (x < pReq) chosen.set(id, 'required');
    else if ((x - pReq) / Math.max(0.0001, 1 - pReq) < pPref) chosen.set(id, 'preferred');
    else if (chance(r, 0.04)) chosen.set(id, 'mention');
  }
  // Skills that build on others usually come with them.
  for (const [id, slot] of [...chosen]) {
    if (slot === 'mention') continue;
    for (const b of getSkill(id)?.buildsOn ?? []) {
      if (!chosen.has(b) && chance(r, 0.8)) chosen.set(b, slot);
    }
  }
  // Every sample job has to have at least a handful of required skills.
  if ([...chosen.values()].filter((s) => s === 'required').length < 3) {
    for (const id of ['git', 'rest', 'communication']) if (!chosen.has(id)) chosen.set(id, 'required');
  }

  // "X, Y or Z" alternatives bullets.
  const alternatives: JdSpec['alternatives'] = [];
  for (const g of ALT_GROUPS) {
    const members = [...chosen].filter(([id, slot]) => slot === 'required' && getSkill(id)?.group === g).map(([id]) => id);
    if (members.length === 1 && chance(r, g === 'frontend-framework' ? 0.22 : 0.18)) {
      const extra = shuffle(r, Object.keys(probs).filter((id) => getSkill(id)?.group === g && !chosen.has(id))).slice(0, int(r, 1, 2));
      if (extra.length) {
        for (const e of extra) chosen.set(e, 'required');
        alternatives.push({ group: g, ids: [members[0]!, ...extra] });
      }
    }
  }
  return { skills: [...chosen].map(([skillId, slot]) => ({ skillId, slot })), alternatives };
}

// ---------------------------------------------------------------------------

interface BuildArgs {
  now: Date;
  roleId: RoleId;
  scenario: DemoScenario;
}

function genJobs(args: { r: Rng; roleId: RoleId; scanStart: number; scanEnd: number; botRun: number }): JobPosting[] {
  const { r, roleId, scanStart, scanEnd, botRun } = args;
  const jobs: JobPosting[] = [];
  let idx = 0;

  const makeJob = (co: DemoCompany, sample: JobPosting['sample'], firstSeen: number): JobPosting => {
    idx++;
    const cat = co.category as CompanyCategory;
    const jobRole = weighted(r, ROLE_MIX[roleId]);
    const title = pick(r, TITLES[jobRole]);
    const normalized = normalizeRole(title) ?? jobRole;
    const exp = seniority(r, title);
    const { skills, alternatives } = chooseSkills(r, normalized, cat, co.industry);

    const remote = co.hqCity === 'Remote' ? true : chance(r, cat === 'startup' ? 0.3 : cat === 'mid' ? 0.15 : 0.1);
    const arrangement: WorkArrangement = remote ? 'remote' : weighted(r, [['hybrid', cat === 'startup' ? 40 : 50], ['onsite', cat === 'startup' ? 30 : 38]] as [WorkArrangement, number][]);
    const city = remote ? undefined : chance(r, 0.75) && co.hqCity !== 'Remote' ? co.hqCity : pick(r, CITIES);

    const description = composeDescription(
      { company: co.name, companyCategory: cat, industry: co.industry, hq: co.hqCity === 'Remote' ? 'India (remote-first)' : co.hqCity, employees: co.employees ?? 100, countries: co.countries, title, roleId: normalized, expMin: exp.min, expMax: exp.max, skills, alternatives },
      r,
    );
    const extracted = extractSkills(description);
    const expRaw = extractExperience(description);
    const posted = firstSeen - int(r, 0, 14) * DAY;
    const sourceId = weighted(r, SOURCE_WEIGHTS);
    const sourceName = SOURCE_DEFS.find((s) => s.id === sourceId)!.name;
    const id = `demo_job_${String(idx).padStart(3, '0')}`;
    const hasSalary = chance(r, 0.4);
    const sal = hasSalary ? salaryFor(r, exp.min, cat) : undefined;

    return {
      id,
      provenance: 'demo',
      companyId: co.id,
      companyName: co.name,
      companyCategory: cat,
      industry: co.industry,
      title,
      normalizedRole: normalized,
      description,
      sourceId,
      sourceName,
      sourceUrl: `https://careers.example.invalid/${companySlug(co.name)}/jobs/${id.slice(-3)}${int(r, 100, 999)}`,
      city,
      country: 'India',
      workArrangement: arrangement,
      experience: expRaw ?? { min: exp.min, max: exp.max, raw: `${exp.min}-${exp.max} years` },
      employmentType: 'full-time',
      postedAt: iso(posted),
      firstSeenAt: iso(firstSeen),
      lastVerifiedAt: iso(botRun),
      status: 'active',
      salary: sal ? { ...sal, currency: 'INR', period: 'year' } : undefined,
      skills: extracted,
      summary: summarizeSections(description),
      contentHash: contentHash(description),
      sample,
    };
  };

  // 100 in-scan jobs: companies × their job counts, collected over the scan window.
  const plan: DemoCompany[] = DEMO_COMPANIES.flatMap((c) => Array.from({ length: c.jobCount }, () => c));
  for (const co of shuffle(r, plan)) {
    const firstSeen = scanStart + Math.floor(r() * (scanEnd - scanStart));
    jobs.push(makeJob(co, 'in_scan', firstSeen));
  }

  // Jobs found by the daily bot after the scan finished: 5 yesterday, 9 today.
  const classified = DEMO_COMPANIES.filter((c) => c.category !== 'unclassified');
  const picks = shuffle(r, classified).slice(0, 14);
  picks.forEach((co, i) => {
    const firstSeen = i < 5 ? botRun - DAY - Math.floor(r() * (DAY - 3_600_000)) : botRun - Math.floor(r() * (DAY - 3_600_000));
    jobs.push(makeJob(co, 'new_since_scan', Math.min(firstSeen, botRun - 60_000)));
  });

  // Verification status: a few in-scan postings have since closed or changed.
  const inScan = jobs.filter((j) => j.sample === 'in_scan');
  const flagged = shuffle(r, inScan).slice(0, 6);
  flagged.forEach((j, i) => {
    j.status = i < 3 ? 'expired' : 'changed';
  });
  return jobs;
}

// Earlier-snapshot share as a multiple of the current share: [oldest comparable, previous].
// Earlier snapshots are SYNTHETIC aggregates (no earlier job descriptions are invented).
const DRIFT: Record<string, [older: number, previous: number]> = {
  nextjs: [0.15, 0.4], tailwind: [0.2, 0.4], kubernetes: [0.35, 0.55], 'github-actions': [0.25, 0.5], playwright: [0.2, 0.45], serverless: [0.5, 0.7],
  llm: [0, 0.3], rag: [0, 0], opentelemetry: [0, 0.4], 'testing-library': [0.5, 0.7],
  jenkins: [2.4, 1.6], angular: [2.0, 1.45], redux: [1.9, 1.4], selenium: [2.2, 1.5], jquery: [1, 1],
};

function buildSnapshots(r: Rng, current: DemandSnapshot, scanEnd: number, roleId: RoleId): DemandSnapshot[] {
  const mk = (id: string, daysBefore: number, n: number, mix: DemandSnapshot['companyMix'], pickPct: (skillId: string, cur: number) => number): DemandSnapshot => {
    const end = scanEnd - daysBefore * DAY;
    const counts: DemandSnapshot['counts'] = {};
    for (const [skillId, c] of Object.entries(current.counts)) {
      const cur = c.jobs / current.n;
      const p = Math.max(0, Math.min(0.95, pickPct(skillId, cur)));
      const jobs = Math.round(p * n);
      if (jobs <= 0) continue;
      const reqShare = c.jobs ? c.required / c.jobs : 0.7;
      const required = Math.round(jobs * reqShare);
      counts[skillId] = { jobs, required, preferred: jobs - required };
    }
    return {
      id,
      label: monthLabel(end),
      startDate: iso(end - 6 * DAY),
      endDate: iso(end),
      n,
      roleId,
      region: 'India',
      experienceBand: current.experienceBand,
      companyMix: mix,
      counts,
      provenance: 'demo',
    };
  };

  const noise = new Map<string, [number, number]>();
  for (const id of Object.keys(current.counts)) noise.set(id, [(r() - 0.5) * 0.07, (r() - 0.5) * 0.05]);
  const driftFor = (id: string, cur: number, which: 0 | 1) => {
    const d = DRIFT[id];
    if (d) return cur * d[which];
    const [n0, n1] = noise.get(id) ?? [0, 0];
    return cur + (which === 0 ? n0 : n1 * 0.6);
  };
  const oldest = mk('snap_oldest', 273, 84, { startup: 12, mid: 20, large: 52 }, (id, cur) => cur + (noise.get(id)?.[0] ?? 0) * 2 + 0.05);
  const older = mk('snap_older', 182, 100, { startup: 35, mid: 30, large: 35 }, (id, cur) => driftFor(id, cur, 0));
  const previous = mk('snap_previous', 91, 100, { startup: 36, mid: 29, large: 35 }, (id, cur) => driftFor(id, cur, 1));
  return [oldest, older, previous, current];
}

export function buildDemoDataset({ now, roleId, scenario }: BuildArgs): DemoDataset {
  const r = mulberry32(hashSeed(`jobradar-demo:v1:${roleId}`));
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  // Daily bot runs 06:00 IST = 00:30 UTC.
  let botRun = startOfDay.getTime() + 30 * 60_000;
  if (botRun > now.getTime()) botRun -= DAY;
  const scanEnd = botRun - 2 * DAY;
  const scanStart = scanEnd - 6 * DAY;

  const all = genJobs({ r, roleId, scanStart, scanEnd, botRun });
  let inScan = all.filter((j) => j.sample === 'in_scan');
  const newJobs = all.filter((j) => j.sample === 'new_since_scan');

  if (scenario === 'partial') {
    // 63 of 100: a source failed mid-scan, so some categories are short.
    const keep: Record<CompanyCategory, number> = { startup: 18, mid: 19, large: 26 };
    const r2 = mulberry32(hashSeed(`partial:${roleId}`));
    const selected: JobPosting[] = [];
    for (const cat of ['startup', 'mid', 'large'] as CompanyCategory[]) {
      selected.push(...shuffle(r2, inScan.filter((j) => j.companyCategory === cat)).slice(0, keep[cat]));
    }
    inScan = selected;
  }
  const inScanIds = new Set(inScan.map((j) => j.id));
  const jobs = all.filter((j) => j.sample === 'new_since_scan' || inScanIds.has(j.id));

  // --- Scan candidates & summary (counts of non-valid candidates are aggregates) ---
  const nonValid = scenario === 'complete' ? { dup: 21, inacc: 9, rej: { role_mismatch: 7, experience_mismatch: 5, location_mismatch: 3, missing_description: 3 } } : { dup: 24, inacc: 22, rej: { role_mismatch: 6, experience_mismatch: 4, location_mismatch: 3, missing_description: 2 } };
  const candidates: ScanCandidate[] = inScan.map((j) => ({ id: j.id, status: 'valid', category: j.companyCategory }));
  for (let i = 0; i < nonValid.dup; i++) candidates.push({ id: `dup_${i}`, status: 'duplicate' });
  for (let i = 0; i < nonValid.inacc; i++) candidates.push({ id: `inacc_${i}`, status: 'inaccessible' });
  for (const [reason, n] of Object.entries(nonValid.rej)) {
    for (let i = 0; i < n; i++) candidates.push({ id: `rej_${reason}_${i}`, status: 'rejected', rejection: reason as never });
  }
  const scanSummary = summarizeScan(candidates, DEFAULT_SCAN_CONFIG);

  const broadening =
    scenario === 'complete'
      ? ['Publication window widened from 30 to 60 days to reach 100 valid jobs.']
      : ['Publication window widened from 30 to 60, then 90 days.', 'Maximum experience widened by 2 years (3–8 yrs). Minimum unchanged.', 'Nearby cities in India included. Country unchanged.', 'Still short of 100 after all permitted broadening steps. Reported as partial.'];

  const scan: ScanRun = {
    id: 'scan_current',
    startedAt: iso(scanStart),
    finishedAt: iso(scanEnd),
    target: scanSummary.target,
    valid: scanSummary.valid,
    retrieved: scanSummary.retrieved,
    duplicates: scanSummary.duplicates,
    inaccessible: scanSummary.inaccessible,
    rejected: scanSummary.rejected,
    rejectedByReason: scanSummary.rejectedByReason as Record<string, number>,
    state: scanSummary.state,
    roleId,
    region: 'India',
    broadening,
    provenance: 'demo',
    current: true,
    quotas: { startup: scanSummary.quotas[0]!.valid, mid: scanSummary.quotas[1]!.valid, large: scanSummary.quotas[2]!.valid },
  };

  const hist = (id: string, daysBefore: number, valid: number, state: ScanRun['state'], mix: ScanRun['quotas'], broad: string[], retrieved: number): ScanRun => ({
    id,
    startedAt: iso(scanEnd - daysBefore * DAY - 6 * DAY),
    finishedAt: iso(scanEnd - daysBefore * DAY),
    target: 100,
    valid,
    retrieved,
    duplicates: Math.round((retrieved - valid) * 0.45),
    inaccessible: Math.round((retrieved - valid) * 0.2),
    rejected: retrieved - valid - Math.round((retrieved - valid) * 0.45) - Math.round((retrieved - valid) * 0.2),
    rejectedByReason: {},
    state,
    roleId,
    region: 'India',
    broadening: broad,
    provenance: 'demo',
    current: false,
    quotas: mix,
  });
  const scanHistory: ScanRun[] = [
    scan,
    hist('scan_prev', 91, 100, 'complete', { startup: 36, mid: 29, large: 35 }, [], 141),
    hist('scan_older', 182, 100, 'complete', { startup: 35, mid: 30, large: 35 }, ['Publication window widened from 30 to 60 days.'], 152),
    hist('scan_oldest', 273, 84, 'partial', { startup: 12, mid: 20, large: 52 }, ['Only large-company sources were connected at the time.'], 126),
  ];

  // --- Sources ---------------------------------------------------------------
  const sources: JobSource[] = SOURCE_DEFS.map((d) => {
    const valid = inScan.filter((j) => j.sourceId === d.id).length;
    const base = { ...d, jobsValid: valid, jobsRetrieved: Math.round(valid * (scanSummary.retrieved / Math.max(1, scanSummary.valid))) };
    if (d.id === 'careers') {
      return { ...base, status: 'delayed', failingDays: 0, lastCheckedAt: iso(botRun - 40 * 60_000), lastSuccessAt: iso(botRun - 2 * DAY), note: 'Rate limited by some hosts. Retry scheduled with backoff.' };
    }
    if (d.id === 'ashby' && scenario === 'partial') {
      return { ...base, status: 'failed', failingDays: 3, lastCheckedAt: iso(botRun + 2 * 60_000), lastSuccessAt: iso(botRun - 3 * DAY), note: 'HTTP 503 after 3 retries. Jobs from this source are missing from the sample.' };
    }
    return { ...base, status: 'ok', failingDays: 0, lastCheckedAt: iso(botRun + 3 * 60_000), lastSuccessAt: iso(botRun + 3 * 60_000), note: 'Healthy.' };
  });
  sources.push(
    { id: 'naukri', name: 'Naukri', kind: 'not_connected', status: 'not_connected', access: 'No authorised API access. Not scraped.', failingDays: 0, jobsRetrieved: 0, jobsValid: 0, note: 'Not connected. Needs a partner API agreement.' },
    { id: 'linkedin', name: 'LinkedIn Jobs', kind: 'not_connected', status: 'not_connected', access: 'No authorised API access. Not scraped.', failingDays: 0, jobsRetrieved: 0, jobsValid: 0, note: 'Not connected. Automated collection requires an approved partnership.' },
  );

  const failureReasons: [string, string, boolean][] = [
    ['careers', 'robots.txt disallows /careers/* for automated access. Skipped.', false],
    ['careers', 'HTTP 429. Rate limited, retry scheduled.', true],
    ['greenhouse', 'HTTP 404. Posting was removed before retrieval.', false],
    ['lever', 'Description empty after fetch.', false],
    ['adzuna', 'Licence returns a snippet only. Full description unavailable.', false],
    ['ashby', scenario === 'partial' ? 'HTTP 503 after 3 retries.' : 'Timeout after 3 retries.', true],
    ['greenhouse', 'HTTP 404. Posting was removed before retrieval.', false],
    ['careers', 'Page requires login. Not attempted.', false],
    ['adzuna', 'Licence returns a snippet only. Full description unavailable.', false],
  ];
  const failedRetrievals: FailedRetrieval[] = failureReasons.slice(0, Math.min(failureReasons.length, nonValid.inacc)).map(([sourceId, reason, retryable], i) => ({
    id: `fail_${i}`,
    sourceId,
    target: `careers.example.invalid/${['harborview', 'kestrel', 'tessera', 'orion', 'vertex', 'atlas', 'zenroute', 'pinecrest', 'granite'][i]}/jobs/${200 + i}`,
    reason,
    at: iso(scanStart + (i + 1) * 11 * 3_600_000),
    retryable,
  }));

  // --- Snapshots ------------------------------------------------------------------
  const demand = computeDemand(inScan.map(toDemandJob));
  const current: DemandSnapshot = {
    id: 'snap_current',
    label: monthLabel(scanEnd),
    startDate: iso(scanStart),
    endDate: iso(scanEnd),
    n: demand.n,
    roleId,
    region: 'India',
    experienceBand: '3–6 yrs',
    companyMix: { ...demand.categoryN },
    counts: Object.fromEntries(demand.skills.map((s) => [s.skillId, { jobs: s.jobs, required: s.required, preferred: s.preferred }])),
    provenance: 'demo',
  };
  const snapshots = buildSnapshots(mulberry32(hashSeed(`snap:${roleId}`)), current, scanEnd, roleId);

  return {
    provenance: 'demo',
    now: now.toISOString(),
    roleId,
    scenario,
    jobs,
    sampleJobs: inScan,
    newJobs,
    companies: DEMO_COMPANIES.map(({ jobCount: _jobCount, ...c }) => c),
    sources,
    scan,
    scanHistory,
    scanSummary,
    snapshots,
    failedRetrievals,
    botRanAt: iso(botRun),
  };
}

export function toDemandJob(j: JobPosting) {
  return {
    id: j.id,
    companyId: j.companyId,
    companyCategory: j.companyCategory,
    roleId: j.normalizedRole,
    industry: j.industry,
    city: j.city,
    experience: j.experience,
    skills: j.skills.map((s) => ({ skillId: s.skillId, requirement: s.requirement })),
  };
}

export { classifyCompany };
