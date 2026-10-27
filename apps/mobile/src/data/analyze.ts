import {
  DEFAULT_MATCH_CONFIG,
  buildDailyReport,
  buildRoadmap,
  classifySkillTrend,
  computeDemand,
  computeGapAnalysis,
  computeMatch,
  concentration,
  getSkill,
  toMatchProfile,
  type DailyReport,
  type DemandJob,
  type DemandTable,
  type GapAnalysis,
  type JobPosting,
  type MatchResult,
  type MatchWeights,
  type RoadmapPhase,
  type SkillTrend,
  type UserProfile,
} from '@jobradar/core';
import { toDemandJob } from '@jobradar/demo';
import type { Company } from '@jobradar/core';
import type { Evidence } from './source';
import { isoDay } from '../lib/format';

export interface JobView {
  job: JobPosting;
  match: MatchResult;
}

export interface CompanyView {
  company: Company;
  jobs: JobView[];
  sampleJobs: JobView[];
  topSkills: { skillId: string; jobs: number }[];
}

export interface Analysis {
  evidence: Evidence;
  demandJobs: DemandJob[];
  demand: DemandTable;
  trends: Map<string, SkillTrend>;
  gap: GapAnalysis;
  jobs: JobView[];
  jobById: Map<string, JobView>;
  companies: CompanyView[];
  companyById: Map<string, CompanyView>;
  roadmap: RoadmapPhase[];
  reports: DailyReport[];
}

const DAY = 86_400_000;

export function analyze(evidence: Evidence, profile: UserProfile, weights?: MatchWeights): Analysis {
  const mp = toMatchProfile(profile);
  const matchCfg = weights ? { ...DEFAULT_MATCH_CONFIG, weights } : DEFAULT_MATCH_CONFIG;

  const demandJobs = evidence.sampleJobs.map(toDemandJob);
  const demand = computeDemand(demandJobs);
  const trends = new Map<string, SkillTrend>();
  for (const s of demand.skills) {
    trends.set(
      s.skillId,
      classifySkillTrend({ id: s.skillId, foundational: getSkill(s.skillId)?.foundational }, evidence.snapshots, concentration(demandJobs, s.skillId, (j) => j.industry)),
    );
  }
  const gap = computeGapAnalysis({ demand, trends, profile: mp, jobs: demandJobs });

  const jobs: JobView[] = evidence.jobs.map((job) => ({
    job,
    match: computeMatch(
      mp,
      { id: job.id, roleId: job.normalizedRole, city: job.city, country: job.country, workArrangement: job.workArrangement, experience: job.experience, salary: job.salary, skills: job.skills },
      matchCfg,
    ),
  }));
  const jobById = new Map(jobs.map((j) => [j.job.id, j]));

  const companies: CompanyView[] = evidence.companies
    .map((company) => {
      const cj = jobs.filter((j) => j.job.companyId === company.id);
      const sample = cj.filter((j) => j.job.sample === 'in_scan');
      const counts = new Map<string, number>();
      for (const j of sample) for (const s of j.job.skills) if (s.requirement !== 'mentioned') counts.set(s.skillId, (counts.get(s.skillId) ?? 0) + 1);
      const topSkills = [...counts].map(([skillId, n]) => ({ skillId, jobs: n })).sort((a, b) => b.jobs - a.jobs).slice(0, 5);
      return { company, jobs: cj, sampleJobs: sample, topSkills };
    })
    .filter((c) => c.jobs.length > 0)
    .sort((a, b) => b.jobs.length - a.jobs.length || a.company.name.localeCompare(b.company.name));
  const companyById = new Map(companies.map((c) => [c.company.id, c]));

  const roadmap = buildRoadmap(gap.gaps, profile.weeklyLearningHours);

  // Daily reports for the last 7 bot runs (today first).
  const botRun = new Date(evidence.botRanAt).getTime();
  const trendList = [...trends.values()];
  const reports: DailyReport[] = [];
  for (let k = 0; k < 7; k++) {
    const end = botRun - k * DAY;
    const start = end - DAY;
    const newJobs = jobs
      .filter((j) => evidence.provenance !== 'live' || j.job.sample === 'new_since_scan') // live: only postings found after the scan
      .filter((j) => {
        const t = new Date(j.job.firstSeenAt).getTime();
        return t > start && t <= end;
      })
      .map((j) => ({ id: j.job.id, title: j.job.title, company: j.job.companyName, match: j.match.overall, firstSeenAt: j.job.firstSeenAt, skills: j.job.skills.map((s) => ({ skillId: s.skillId, requirement: s.requirement })) }));
    reports.push(
      buildDailyReport({
        date: isoDay(end),
        since: new Date(start).toISOString(),
        newJobs,
        demand,
        // Demand changes belong to the day the new snapshot landed (the scan end).
        trends: k === 2 ? trendList : [],
        gaps: gap.gaps,
        sources: evidence.sources.filter((s) => s.status !== 'not_connected').map((s) => ({ id: s.id, name: s.name, status: s.status, failingDays: Math.max(0, s.failingDays - k) })),
        cfg: { matchNotifyThreshold: 75, newRequirementMinCount: 2, newRequirementLift: 2, maxBestMatches: 3 },
      }),
    );
  }

  return { evidence, demandJobs, demand, trends, gap, jobs, jobById, companies, companyById, roadmap, reports };
}
