import { skillName, type SkillDemand, type SkillTrend } from '@jobradar/core';
import { useNavigate } from 'react-router-dom';
import { SkillBar } from '../charts/SkillBar';
import { LabelBadge } from '../ui/Markers';

/**
 * One line of the demand ranking. The count is always "jobs/denominator".
 * `scope` lets the caller rank within a company category (denominator then
 * becomes the number of jobs in that category).
 */
export function SkillRow({ demand, trend, scope, showLabel = true }: { demand: SkillDemand; trend?: SkillTrend; scope?: { n: number; jobs: number; required: number; preferred: number }; showLabel?: boolean }) {
  const nav = useNavigate();
  const n = scope?.n ?? demand.n;
  const jobs = scope?.jobs ?? demand.jobs;
  const required = scope?.required ?? demand.required;
  const preferred = scope?.preferred ?? demand.preferred;
  const mentioned = Math.max(0, jobs - required - preferred);
  return (
    <button type="button" className="jr-skillrow jr-row--tap" onClick={() => nav(`/skill/${demand.skillId}`)}>
      <div className="jr-skillrow__top">
        <span className="jr-skillrow__name">{skillName(demand.skillId)}</span>
        {showLabel && trend && <LabelBadge label={trend.label} />}
        <span className="jr-skillrow__count mono">
          {jobs}/{n}
        </span>
      </div>
      <SkillBar n={n} required={required} preferred={preferred} mentioned={mentioned} />
    </button>
  );
}
