import { IonIcon } from '@ionic/react';
import { briefcaseOutline, mapOutline, playOutline, radioOutline } from 'ionicons/icons';
import { ROLE_LABELS, SWITCH_TIMELINE_LABELS, skillName, type SkillTrend } from '@jobradar/core';
import { useNavigate } from 'react-router-dom';
import { EvidenceCard } from '../components/domain/EvidenceCard';
import { JobRow } from '../components/domain/JobRow';
import { SkillRow } from '../components/domain/SkillRow';
import { Sparkline } from '../components/charts/Sparkline';
import { EvidenceDots, LabelBadge, RequirementKey } from '../components/ui/Markers';
import { Page } from '../components/ui/Page';
import { Badge, Card, List, Overline, Row, SectionHeader } from '../components/ui/Primitives';
import { DataGate, PartialBanner } from '../components/ui/States';
import type { Analysis } from '../data/analyze';
import { greeting, plural } from '../lib/format';
import { TIER_LABEL } from '../lib/labels';
import { useProfile } from '../state/profile';

export default function Home() {
  const { profile } = useProfile();
  const role = profile.targetRoleLabel || ROLE_LABELS[profile.targetRoleId];
  return (
    <Page>
      <div className="jr-greet">
        <h1 className="jr-h1">
          {greeting()}
          {profile.name ? `, ${profile.name}` : ''}
        </h1>
        <p className="jr-greet__sub">
          {role} · switching {SWITCH_TIMELINE_LABELS[profile.switchTimeline]}
        </p>
        <p className="jr-small jr-muted">
          {profile.noticePeriodDays != null ? `Notice period ${profile.noticePeriodDays} days · ` : ''}
          {profile.weeklyLearningHours} h/week for learning
        </p>
      </div>
      <DataGate>{(a) => <HomeContent a={a} />}</DataGate>
    </Page>
  );
}

function pickTrends(a: Analysis): SkillTrend[] {
  return [...a.trends.values()]
    .filter((t) => ['growing', 'emerging', 'declining'].includes(t.label))
    .sort((x, y) => Math.abs(y.comparison?.deltaPP ?? 0) - Math.abs(x.comparison?.deltaPP ?? 0))
    .slice(0, 3);
}

function HomeContent({ a }: { a: Analysis }) {
  const nav = useNavigate();
  const ev = a.evidence;
  const today = a.reports[0];
  const newIds = today?.newJobIds ?? [];
  const newViews = newIds
    .map((id) => a.jobById.get(id)!)
    .filter(Boolean)
    .sort((x, y) => (y.match.overall ?? 0) - (x.match.overall ?? 0))
    .slice(0, 3);
  const topSkills = a.demand.skills.filter((s) => !['practices'].includes(skillCategory(s.skillId))).slice(0, 5);
  const trends = pickTrends(a);
  const topGap = a.gap.gaps.find((g) => g.tier === 'essential') ?? a.gap.gaps.find((g) => g.tier === 'valuable');

  return (
    <>
      <EvidenceCard evidence={ev} />
      {ev.scanSummary.state === 'partial' && <PartialBanner summary={ev.scanSummary} />}

      <section className="jr-stack">
        <SectionHeader
          title="New matches"
          subtitle={newViews.length ? `${plural(newIds.length, 'new posting')} since the last report` : undefined}
          action={
            <button type="button" className="jr-link" onClick={() => nav('/reports')}>
              Daily report
            </button>
          }
        />
        {newViews.length ? (
          <List>
            {newViews.map((v) => (
              <JobRow key={v.job.id} view={v} />
            ))}
          </List>
        ) : (
          <Card>
            <p className="jr-muted">No new postings matched since the last daily run.</p>
          </Card>
        )}
        {today && !today.notify.send && <p className="jr-small jr-muted">No notification sent today: nothing significant changed.</p>}
      </section>

      <section className="jr-stack">
        <SectionHeader
          title="Top in-demand skills"
          subtitle={`Share of the ${ev.scanSummary.valid} valid jobs mentioning each`}
          action={
            <button type="button" className="jr-link" onClick={() => nav('/tabs/market')}>
              See all
            </button>
          }
        />
        <List>
          {topSkills.map((s) => (
            <SkillRow key={s.skillId} demand={s} trend={a.trends.get(s.skillId)} />
          ))}
        </List>
        <RequirementKey showMentioned={false} />
      </section>

      <section className="jr-stack">
        <SectionHeader title="Trends, with evidence quality" subtitle="Labelled only when comparable samples support it" />
        {trends.length ? (
          <List>
            {trends.map((t) => (
              <Row
                key={t.skillId}
                title={
                  <>
                    {skillName(t.skillId)} <LabelBadge label={t.label} />
                  </>
                }
                subtitle={
                  <>
                    {t.summary}
                    <br />
                    <EvidenceDots quality={t.evidence} />
                  </>
                }
                meta={<Sparkline points={t.points} />}
                onClick={() => nav(`/skill/${t.skillId}`)}
              />
            ))}
          </List>
        ) : (
          <Card>
            <p>Baseline established; trend not yet available.</p>
            <p className="jr-small jr-muted">Trends appear after a second comparable scan.</p>
          </Card>
        )}
      </section>

      {topGap && (
        <section className="jr-stack">
          <SectionHeader title="Most important skill gap" />
          <Card className="jr-gapcard">
            <div className="jr-split">
              <Overline>Priority {topGap.priority}/100</Overline>
              <Badge tone={topGap.tier === 'essential' ? 'danger' : 'warning'}>{TIER_LABEL[topGap.tier]}</Badge>
            </div>
            <h3 className="jr-h2">{skillName(topGap.skillId)}</h3>
            <p className="jr-muted">
              Required in {topGap.raw.required}/{topGap.raw.n} jobs, preferred in {topGap.raw.preferred}. You don’t list it yet.
            </p>
            <button type="button" className="jr-btn jr-btn--secondary jr-btn--block" onClick={() => nav('/tabs/skills')}>
              See gap analysis
            </button>
          </Card>
        </section>
      )}

      <section className="jr-stack">
        <SectionHeader title="Quick actions" />
        <div className="jr-grid-2">
          <QuickAction icon={briefcaseOutline} label="Browse jobs" onClick={() => nav('/tabs/jobs')} />
          <QuickAction icon={playOutline} label="Run scan" onClick={() => nav('/scan')} />
          <QuickAction icon={radioOutline} label="Skill gaps" onClick={() => nav('/tabs/skills')} />
          <QuickAction icon={mapOutline} label="Roadmap" onClick={() => nav('/roadmap')} />
        </div>
      </section>
    </>
  );
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className="jr-quick" onClick={onClick}>
      <IonIcon icon={icon} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

import { getSkill } from '@jobradar/core';
function skillCategory(id: string): string {
  return getSkill(id)?.category ?? '';
}
