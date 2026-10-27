import type { GapAction, GapTier, JobStatus, WorkArrangement } from '@jobradar/core';

export const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };

export const TIER_LABEL: Record<GapTier, string> = {
  essential: 'Essential',
  valuable: 'Valuable',
  optional: 'Optional',
  speculative: 'Speculative',
  none: 'Strength',
};

export const TIER_HELP: Record<GapTier, string> = {
  essential: 'Required by a meaningful share of the jobs you target, and missing from your profile.',
  valuable: 'Frequently asked for; worth addressing after the essentials.',
  optional: 'Lower evidence, or already covered by a similar skill you have.',
  speculative: 'Early or limited evidence. Keep an eye on it; don’t prioritise it.',
  none: '',
};

export const ACTION_LABEL: Record<GapAction, string> = {
  learn: 'Learn',
  'build-on': 'Build on what you know',
  deepen: 'Deepen',
  transfer: 'Show transfer',
  watch: 'Watch',
  skip: 'Skip',
  maintain: 'Maintain',
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  active: 'Active',
  expired: 'Closed',
  changed: 'Changed since scan',
  unverified: 'Not re-verified',
};

export function jobLocation(city: string | undefined, arrangement: WorkArrangement): string {
  if (arrangement === 'remote') return city ? `Remote · ${city}` : 'Remote · India';
  return `${city ?? 'India'} · ${ARRANGEMENT_LABEL[arrangement]}`;
}
