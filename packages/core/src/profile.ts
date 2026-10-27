import type { CompanyCategory, MatchProfile, ProfileSkill, RoleId, WorkArrangement } from './types';

/** Everything collected during onboarding / editable in settings. */
export type SwitchTimeline = 'asap' | '1-3' | '3-6' | '6-12' | 'exploring';

export interface UserProfile {
  name: string;
  currentRole: string;
  yearsExperience: number;
  targetRoleId: RoleId;
  /** Custom label when the user typed their own role. */
  targetRoleLabel?: string;
  skills: ProfileSkill[];
  /** Skills/technologies the user wants to work with (not necessarily has). */
  preferredSkillIds: string[];
  /** Annual figures in INR. */
  salary: { current?: number; expectedMin?: number; expectedMax?: number };
  locations: { cities: string[]; countries: string[]; remote: boolean; hybrid: boolean; onsite: boolean };
  companyCategories: CompanyCategory[];
  industries: string[];
  noticePeriodDays?: number;
  switchTimeline: SwitchTimeline;
  weeklyLearningHours: number;
  resumeText?: string;
  /** Where skills were imported from, for transparency. */
  imports: { resume?: boolean; github?: string };
  onboardingComplete: boolean;
}

export const SWITCH_TIMELINE_LABELS: Record<SwitchTimeline, string> = {
  asap: 'As soon as possible',
  '1-3': 'in 1 to 3 months',
  '3-6': 'in 3 to 6 months',
  '6-12': 'in 6 to 12 months',
  exploring: 'just exploring',
};

export function toMatchProfile(p: UserProfile): MatchProfile {
  const arrangements: WorkArrangement[] = [];
  if (p.locations.remote) arrangements.push('remote');
  if (p.locations.hybrid) arrangements.push('hybrid');
  if (p.locations.onsite) arrangements.push('onsite');
  const min = p.salary.expectedMin;
  const max = p.salary.expectedMax;
  return {
    yearsExperience: p.yearsExperience,
    targetRoleId: p.targetRoleId,
    skills: p.skills,
    cities: p.locations.cities,
    countries: p.locations.countries,
    acceptsRemote: p.locations.remote,
    workArrangements: arrangements,
    expectedSalary: min != null || max != null ? { min, max, currency: 'INR', period: 'year' } : undefined,
  };
}

export function emptyProfile(): UserProfile {
  return {
    name: '',
    currentRole: '',
    yearsExperience: 0,
    targetRoleId: 'fullstack',
    skills: [],
    preferredSkillIds: [],
    salary: {},
    locations: { cities: [], countries: ['India'], remote: true, hybrid: true, onsite: true },
    companyCategories: [],
    industries: [],
    switchTimeline: '3-6',
    weeklyLearningHours: 5,
    imports: {},
    onboardingComplete: false,
  };
}
