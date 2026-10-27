import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CATEGORY_LABELS, LABEL_DESCRIPTIONS, SKILL_CATEGORIES, breakdownBy, coverageFor, experienceBand, getSkill, skillName, type DemandJob, type Requirement } from '@jobradar/core';
import { CategoryCompare } from '../components/charts/CategoryCompare';
import { SkillBar } from '../components/charts/SkillBar';
import { TrendChart } from '../components/charts/TrendChart';
import { Excerpt, Quote } from '../components/domain/Excerpt';
import { CategoryMark, EvidenceDots, LabelBadge, RequirementKey } from '../components/ui/Markers';
import { Page } from '../components/ui/Page';
import { Badge, Button, Card, List, Row, SectionHeader, Segmented } from '../components/ui/Primitives';
import { DataGate, EmptyState } from '../components/ui/States';
import type { Analysis } from '../data/analyze';
import { ACTION_LABEL, TIER_LABEL } from '../lib/labels';
import { pct } from '../lib/format';
import { useProfile } from '../state/profile';

export default function SkillDetail() {
  const { skillId = '' } = useParams();
  return (
    <Page title={skillName(skillId)} backHref="/tabs/market">
      <DataGate rows={3}>{(a) => <Content a={a} skillId={skillId} />}</DataGate>
    </Page>
  );
}

type Dim = 'experience' | 'role' | 'industry' | 'city';

function Content({ a, skillId }: { a: Analysis; skillId: string }) {
  const nav = useNavigate();
  const { profile } = useProfile();
  const def = getSkill(skillId);
  const demand = a.demand.bySkill.get(skillId);
  const trend = a.trends.get(skillId);
  const [dim, setDim] = useState<Dim>('experience');
  const [reqFilter, setReqFilter] = useState<'all' | Requirement>('all');
  const [limit, setLimit] = useState(5);
  const gap = a.gap.items.find((g) => g.skillId === skillId);

  const breakdown = useMemo(() => {
    const key: Record<Dim, (j: DemandJob) => string | undefined> = {
      experience: (j) => experienceBand(j),
      role: (j) => j.roleId,
      industry: (j) => j.industry,
      city: (j) => j.city ?? 'Remote',
    };
    return breakdownBy(a.demandJobs, skillId, key[dim], 8).slice(0, 8);
  }, [a, skillId, dim]);

  const evidence = useMemo(() => {
    const out: { view: (typeof a.jobs)[number]; skill: (typeof a.jobs)[number]['job']['skills'][number] }[] = [];
    for (const id of demand?.jobIds ?? []) {
      const view = a.jobById.get(id);
      const skill = view?.job.skills.find((s) => s.skillId === skillId);
      if (view && skill) out.push({ view, skill });
    }
    const order: Record<Requirement, number> = { required: 0, preferred: 1, mentioned: 2 };
    return out.sort((x, y) => order[x.skill.requirement] - order[y.skill.requirement] || y.skill.confidence - x.skill.confidence);
  }, [a, demand, skillId]);

  if (!def) return <EmptyState title="Unknown skill" body="This skill is not in the taxonomy." />;
  if (!demand) {
    return (
      <>
        <div className="jr-stack">
          <h1 className="jr-h1">{def.name}</h1>
          <p className="jr-muted">{SKILL_CATEGORIES.find((c) => c.id === def.category)?.label}</p>
        </div>
        <Card>
          <p>
            <strong>Not seen in this sample</strong> (0/{a.demand.n} jobs).
          </p>
          <p className="jr-small jr-muted">That says nothing about the wider market. It was not asked for in these {a.demand.n} descriptions.</p>
        </Card>
      </>
    );
  }

  const cov = coverageFor(skillId, profile.skills);
  const shown = evidence.filter((e) => reqFilter === 'all' || e.skill.requirement === reqFilter);

  return (
    <>
      <div className="jr-stack">
        <span className="jr-small jr-muted">{SKILL_CATEGORIES.find((c) => c.id === def.category)?.label}</span>
        <h1 className="jr-h1">{def.name}</h1>
        <div className="jr-cluster">
          {trend && <LabelBadge label={trend.label} />}
          {trend && <EvidenceDots quality={trend.evidence} />}
        </div>
      </div>

      <Card className="jr-stack">
        <div className="jr-stat">
          <span className="jr-overline">In the sample</span>
          <span className="jr-bignum mono">
            {demand.jobs}/{demand.n}
            <small> jobs ({pct(demand.pct)})</small>
          </span>
        </div>
        <SkillBar n={demand.n} required={demand.required} preferred={demand.preferred} mentioned={demand.mentioned} height={14} showMentioned />
        <div className="jr-split3">
          <Split label="Required" value={demand.required} n={demand.n} color="var(--req)" />
          <Split label="Preferred" value={demand.preferred} n={demand.n} color="var(--pref)" />
          <Split label="Mentioned only" value={demand.mentioned} n={demand.n} color="var(--ment)" />
        </div>
        {trend && (
          <div className="jr-callout">
            <strong>{trend.summary}</strong>
            <span className="jr-small jr-muted">{LABEL_DESCRIPTIONS[trend.label]}</span>
          </div>
        )}
      </Card>

      <Card className="jr-stack">
        <h2 className="jr-h3">Your profile</h2>
        {cov.kind === 'direct' && (
          <p>
            You list <strong>{def.name}</strong> at <strong>{cov.level}</strong> level.
          </p>
        )}
        {cov.kind === 'implied' && (
          <p>
            Covered by <strong>{cov.via.map(skillName).join(', ')}</strong>, which you list.
          </p>
        )}
        {cov.kind === 'equivalent' && (
          <p>
            You list a similar skill: <strong>{cov.via.map(skillName).join(', ')}</strong>.
          </p>
        )}
        {cov.kind === 'foundation' && (
          <p>
            It builds on <strong>{cov.via.map(skillName).join(', ')}</strong>, which you already have.
          </p>
        )}
        {cov.kind === 'none' && <p>You don’t list this skill yet.</p>}
        {gap && gap.status !== 'strength' && (
          <div className="jr-cluster">
            <Badge tone={gap.tier === 'essential' ? 'danger' : 'warning'}>{TIER_LABEL[gap.tier]}</Badge>
            <Badge tone="neutral">{ACTION_LABEL[gap.action]}</Badge>
            <span className="jr-small jr-muted">Priority {gap.priority}/100</span>
          </div>
        )}
        <Button variant="secondary" onClick={() => nav('/tabs/skills')}>
          Open gap analysis
        </Button>
      </Card>

      <section className="jr-stack">
        <SectionHeader title="By company type" subtitle="Each bar is a share of that group’s jobs; the denominator is printed." />
        <Card className="jr-stack">
          <CategoryCompare demand={demand} />
          <RequirementKey />
        </Card>
      </section>

      <section className="jr-stack">
        <SectionHeader title="Breakdown" subtitle="Segments under 8 jobs are flagged as unreliable." />
        <Segmented
          label="Breakdown by"
          value={dim}
          onChange={setDim}
          options={[
            { value: 'experience', label: 'Experience' },
            { value: 'role', label: 'Role' },
            { value: 'industry', label: 'Industry' },
            { value: 'city', label: 'Location' },
          ]}
        />
        <List>
          {breakdown.map((r) => (
            <Row
              key={r.key}
              title={dim === 'role' ? (getRoleLabel(r.key)) : r.key}
              subtitle={
                <>
                  <SkillBar n={r.n} required={r.required} preferred={r.jobs - r.required} />
                  {!r.reliable && <span className="jr-warn-text"> Only {r.n} jobs in this segment. Don’t read much into it.</span>}
                </>
              }
              meta={
                <span className="mono jr-small">
                  <strong>
                    {r.jobs}/{r.n}
                  </strong>
                </span>
              }
            />
          ))}
        </List>
      </section>

      {trend && (
        <section className="jr-stack">
          <SectionHeader title="Trend" subtitle="Compared only with samples of the same role, region, experience band and company mix." />
          <Card className="jr-stack">
            <TrendChart trend={trend} />
            {trend.reasons.length > 0 && (
              <ul className="jr-bullets" style={{ margin: 0 }}>
                {trend.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {trend.baselineOnly && <p className="jr-small jr-muted">Baseline established; trend not yet available.</p>}
          </Card>
        </section>
      )}

      <section className="jr-stack">
        <SectionHeader title="Evidence" subtitle={`Every number above comes from these ${evidence.length} jobs.`} />
        <Segmented
          label="Filter evidence"
          value={reqFilter}
          onChange={(v) => {
            setReqFilter(v);
            setLimit(5);
          }}
          options={[
            { value: 'all', label: `All (${evidence.length})` },
            { value: 'required', label: `Required (${demand.required})` },
            { value: 'preferred', label: `Preferred (${demand.preferred})` },
            { value: 'mentioned', label: `Mentioned (${demand.mentioned})` },
          ]}
        />
        <div className="jr-stack">
          {shown.slice(0, limit).map(({ view, skill }) => {
            const ev = skill.evidence[0]!;
            return (
              <button key={view.job.id} type="button" className="jr-card jr-evitem" onClick={() => nav(`/job/${view.job.id}`)}>
                <div className="jr-split">
                  <span className="jr-cat">
                    <CategoryMark category={view.job.companyCategory} />
                    <strong>{view.job.companyName}</strong>
                  </span>
                  <Badge tone={skill.requirement === 'required' ? 'primary' : skill.requirement === 'preferred' ? 'info' : 'neutral'}>{skill.requirement}</Badge>
                </div>
                <span className="jr-small jr-muted">{view.job.title}</span>
                <Quote>
                  <Excerpt sentence={ev.sentence} from={ev.matchStart - ev.start} to={ev.matchEnd - ev.start} />
                </Quote>
                <span className="jr-small jr-muted">
                  Wording: “{skill.originalWording}” · {Math.round(skill.confidence * 100)}% confidence
                  {skill.isAlternative ? ' · one of several alternatives' : ''}
                </span>
              </button>
            );
          })}
        </div>
        {shown.length > limit && (
          <Button variant="secondary" block onClick={() => setLimit(limit + 10)}>
            Show more ({shown.length - limit} left)
          </Button>
        )}
      </section>
      <p className="jr-small jr-muted">Company categories: {Object.entries(CATEGORY_LABELS).filter(([k]) => k !== 'unclassified').map(([, v]) => v).join(' · ')}. Classification basis is on each company page.</p>
    </>
  );
}

function getRoleLabel(id: string): string {
  return { fullstack: 'Full-Stack Engineer', frontend: 'Frontend Engineer', backend: 'Backend Engineer', software: 'Software Engineer' }[id] ?? id;
}

function Split({ label, value, n, color }: { label: string; value: number; n: number; color: string }) {
  return (
    <div className="jr-split3__item">
      <span className="jr-small jr-muted">
        <i className="jr-key__sw" style={{ background: color, display: 'inline-block', marginRight: 6 }} />
        {label}
      </span>
      <span className="mono jr-split3__val">
        {value}
        <small>/{n}</small>
      </span>
    </div>
  );
}
