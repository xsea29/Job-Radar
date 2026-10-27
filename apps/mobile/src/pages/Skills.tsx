import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { informationCircleOutline } from 'ionicons/icons';
import { ROLE_LABELS, getSkill, guideFor, skillName, type GapItem, type GapTier, type GapWeights } from '@jobradar/core';
import { LabelBadge } from '../components/ui/Markers';
import { Page, PageTitle } from '../components/ui/Page';
import { Badge, Button, Card, Collapsible, List, Row, SectionHeader, Segmented } from '../components/ui/Primitives';
import { Sheet } from '../components/ui/Sheet';
import { DataGate, PartialBanner } from '../components/ui/States';
import type { Analysis } from '../data/analyze';
import { ACTION_LABEL, TIER_HELP, TIER_LABEL } from '../lib/labels';
import { pct } from '../lib/format';

export default function Skills() {
  return (
    <Page>
      <DataGate rows={5}>{(a) => <SkillsContent a={a} />}</DataGate>
    </Page>
  );
}

const TIERS: GapTier[] = ['essential', 'valuable', 'optional', 'speculative'];
const TERM_LABEL: Record<keyof GapWeights, string> = {
  roleRelevance: 'Target-role relevance',
  prevalence: 'Prevalence in jobs',
  requiredShare: 'Required frequency',
  gapNeed: 'Size of your gap',
  sustained: 'Sustained demand',
};

function SkillsContent({ a }: { a: Analysis }) {
  const nav = useNavigate();
  const [view, setView] = useState<'gaps' | 'strengths'>('gaps');
  const [help, setHelp] = useState(false);
  const { gap } = a;
  const top = a.demand.skills.filter((s) => getSkill(s.skillId)?.category !== 'practices').slice(0, 20);
  const covered = top.filter((s) => gap.items.find((g) => g.skillId === s.skillId)?.status === 'strength').length;
  const count = (t: GapTier) => gap.gaps.filter((g) => g.tier === t).length;
  const roleLabel = ROLE_LABELS[a.evidence.roleId];

  return (
    <>
      <PageTitle title="Skill gap" subtitle={`Your profile vs ${a.demand.n} ${roleLabel} jobs`} />
      {a.evidence.scanSummary.state === 'partial' && <PartialBanner summary={a.evidence.scanSummary} />}
      <Card className="jr-stack">
        <div className="jr-stat">
          <span className="jr-overline">Coverage of the top 20 skills</span>
          <span className="jr-bignum mono">
            {covered}/{top.length}
            <small> you already list or cover</small>
          </span>
        </div>
        <div className="jr-split3">
          <MiniStat label="Essential gaps" value={count('essential')} />
          <MiniStat label="Valuable" value={count('valuable')} />
          <MiniStat label="Strengths" value={gap.strengths.length} />
        </div>
        <div className="jr-grid-2">
          <Button onClick={() => nav('/roadmap')}>Learning roadmap</Button>
          <Button variant="secondary" icon={informationCircleOutline} onClick={() => setHelp(true)}>
            How scored
          </Button>
        </div>
      </Card>

      <Segmented label="View" value={view} onChange={setView} options={[{ value: 'gaps', label: `Gaps (${gap.gaps.length})` }, { value: 'strengths', label: `Strengths (${gap.strengths.length})` }]} />

      {view === 'gaps' ? (
        TIERS.map((t) => {
          const items = gap.gaps.filter((g) => g.tier === t);
          if (!items.length) return null;
          return (
            <section key={t} className="jr-stack">
              <SectionHeader title={`${TIER_LABEL[t]} (${items.length})`} subtitle={TIER_HELP[t]} />
              <Card flush>
                {items.slice(0, t === 'speculative' ? 5 : t === 'optional' ? 8 : 10).map((g) => (
                  <GapCard key={g.skillId} g={g} a={a} />
                ))}
              </Card>
              {items.length > (t === 'speculative' ? 5 : t === 'optional' ? 8 : 10) && <p className="jr-small jr-muted">{items.length - (t === 'speculative' ? 5 : t === 'optional' ? 8 : 10)} more with lower priority are hidden.</p>}
            </section>
          );
        })
      ) : (
        <>
          <List>
            {gap.strengths.map((g) => (
              <Row key={g.skillId} title={skillName(g.skillId)} subtitle={`Required in ${g.raw.required}/${g.raw.n} jobs · ${g.rationale[g.rationale.length - 1]}`} meta={<Badge tone="success">Strength</Badge>} onClick={() => nav(`/skill/${g.skillId}`)} />
            ))}
          </List>
          {gap.unseenUserSkills.length > 0 && (
            <Card tone="primary">
              <strong>Listed on your profile but not seen in this sample</strong>
              <p className="jr-small" style={{ marginTop: 4 }}>
                {gap.unseenUserSkills.map(skillName).join(', ')}. That isn’t a gap and isn’t penalised; these jobs just didn’t ask for them.
              </p>
            </Card>
          )}
        </>
      )}
      <p className="jr-small jr-muted">Priorities come from a documented formula over the jobs in your evidence base; they are not AI opinions. Soft practices (communication, mentoring…) are tracked in Market but not scored as “learn this”.</p>

      <Sheet open={help} onClose={() => setHelp(false)} title="How priority is calculated" size="tall">
        <p>
          <strong>Priority = 100 × Σ weight × input</strong>, each input normalised to 0–1.
        </p>
        <table className="jr-table">
          <thead>
            <tr>
              <th>Input</th>
              <th className="r">Weight</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(TERM_LABEL) as (keyof GapWeights)[]).map((k) => (
              <tr key={k}>
                <td>{TERM_LABEL[k]}</td>
                <td className="r mono">{Math.round(gap.config.weights[k] * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="jr-bullets">
          <li>Relevance, prevalence and required frequency are shares of jobs, capped ({pct(gap.config.caps.prevalence)} / {pct(gap.config.caps.requiredShare)}) so a skill need not be in every job to score fully.</li>
          <li>Size of your gap is 1 if you lack the skill, lower if you list it at beginner level or hold a similar skill.</li>
          <li>Sustained demand comes from the trend label (foundational/established high, declining low, uncertain neutral).</li>
          <li>
            <strong>Essential</strong>: priority ≥ {gap.config.essentialPriority} and required in ≥ {pct(gap.config.essentialMinRequiredShare)} of jobs. <strong>Valuable</strong>: priority ≥ {gap.config.valuablePriority}. Emerging or rare skills are <strong>speculative</strong>; similar skills you already have are <strong>optional</strong> (“show transfer”).
          </li>
        </ul>
        <Button block variant="secondary" onClick={() => setHelp(false)}>
          Close
        </Button>
      </Sheet>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="jr-split3__item">
      <span className="jr-small jr-muted">{label}</span>
      <span className="mono jr-split3__val">{value}</span>
    </div>
  );
}

function GapCard({ g, a }: { g: GapItem; a: Analysis }) {
  const nav = useNavigate();
  const guide = guideFor(g.skillId);
  const trend = a.trends.get(g.skillId);
  return (
    <Collapsible
      title={
        <span className="jr-gaptitle">
          <span>{skillName(g.skillId)}</span>
          <span className="jr-small jr-muted">
            Required {g.raw.required}/{g.raw.n} · preferred {g.raw.preferred}
          </span>
        </span>
      }
      meta={
        <span className="jr-gapscore">
          <span className="mono">{g.priority}</span>
          <Badge tone="neutral">{ACTION_LABEL[g.action]}</Badge>
        </span>
      }
    >
      <div className="jr-cluster">{trend && <LabelBadge label={trend.label} />}</div>
      <ul className="jr-bullets" style={{ margin: 0 }}>
        {g.rationale.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="jr-stack" style={{ gap: 6 }}>
        <span className="jr-overline">Priority breakdown</span>
        {(Object.keys(TERM_LABEL) as (keyof GapWeights)[]).map((k) => (
          <div key={k} className="jr-term">
            <span className="jr-small">{TERM_LABEL[k]}</span>
            <div className="jr-term__bar">
              <div style={{ width: `${g.inputs[k] * 100}%` }} />
            </div>
            <span className="jr-small mono">+{g.points[k].toFixed(1)}</span>
          </div>
        ))}
      </div>
      <div className="jr-callout">
        <strong>Next step</strong>
        <span className="jr-small">{guide.nextStep}</span>
        <strong style={{ marginTop: 6 }}>Prove it with a project</strong>
        <span className="jr-small">{guide.project}</span>
      </div>
      <Button variant="secondary" onClick={() => nav(`/skill/${g.skillId}`)}>
        See the evidence
      </Button>
    </Collapsible>
  );
}
