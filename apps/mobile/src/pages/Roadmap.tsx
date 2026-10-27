import { IonIcon } from '@ionic/react';
import { checkmark } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import type { RoadmapItem, RoadmapPhase } from '@jobradar/core';
import { skillName } from '@jobradar/core';
import { Page } from '../components/ui/Page';
import { Badge, Button, Card, Collapsible, ProgressBar } from '../components/ui/Primitives';
import { DataGate, EmptyState } from '../components/ui/States';
import { TIER_LABEL } from '../lib/labels';
import { useProfile } from '../state/profile';
import { useRoadmapProgress } from '../state/roadmap';

export default function Roadmap() {
  return (
    <Page title="Learning roadmap" backHref="/tabs/more">
      <DataGate rows={3}>{(a) => <Content phases={a.roadmap} n={a.demand.n} />}</DataGate>
    </Page>
  );
}

function Content({ phases, n }: { phases: RoadmapPhase[]; n: number }) {
  const nav = useNavigate();
  const { profile } = useProfile();
  const { isDone } = useRoadmapProgress();
  const all = phases.flatMap((p) => p.items.flatMap((i) => i.milestones));
  const done = all.filter((m) => isDone(m.id)).length;
  const hours = phases.reduce((s, p) => s + p.totalHours, 0);

  if (all.length === 0) return <EmptyState title="Nothing to learn right now" body="Your profile already covers what these jobs ask for. Re-run a scan to check again." />;

  return (
    <>
      <div className="jr-stack">
        <h1 className="jr-h1">Your roadmap</h1>
        <p className="jr-muted">Built only from gaps found in {n} real job descriptions, not from a course catalogue.</p>
      </div>
      <Card className="jr-stack">
        <div className="jr-split">
          <span className="jr-overline">Progress</span>
          <span className="mono jr-small">
            {done}/{all.length} milestones
          </span>
        </div>
        <ProgressBar value={done} max={all.length} label={`${done} of ${all.length} milestones complete`} />
        <p className="jr-small jr-muted">
          About {hours} hours in total, ≈ {phases[phases.length - 1]?.weeks[1]} weeks at your {profile.weeklyLearningHours} h/week budget. Change it in settings.
        </p>
      </Card>

      {phases.map((p) =>
        p.items.length ? (
          <section key={p.id} className="jr-stack">
            <div className="jr-section-header">
              <div>
                <h2 className="jr-h3">{p.title}</h2>
                <p className="jr-small jr-muted">{p.subtitle}</p>
              </div>
              <Badge tone="neutral">
                Weeks {p.weeks[0]}–{p.weeks[1]}
              </Badge>
            </div>
            <Card flush>
              {p.items.map((i) => (
                <ItemCard key={i.id} item={i} onEvidence={() => nav(`/skill/${i.skillId}`)} />
              ))}
            </Card>
          </section>
        ) : null,
      )}
      <p className="jr-small jr-muted">Hour estimates are rough guides for self-study, not promises. Progress is saved on this device.</p>
    </>
  );
}

function ItemCard({ item, onEvidence }: { item: RoadmapItem; onEvidence: () => void }) {
  const { isDone, toggle } = useRoadmapProgress();
  const done = item.milestones.filter((m) => isDone(m.id)).length;
  return (
    <Collapsible
      defaultOpen={done > 0 && done < item.milestones.length}
      title={
        <span className="jr-gaptitle">
          <span>{item.title}</span>
          <span className="jr-small jr-muted">{item.why}</span>
        </span>
      }
      meta={
        <span className="jr-gapscore">
          <span className="mono jr-small">
            {done}/{item.milestones.length}
          </span>
          <Badge tone="neutral">{item.hours} h</Badge>
        </span>
      }
    >
      <div className="jr-cluster">
        <Badge tone={item.tier === 'essential' ? 'danger' : 'neutral'}>{TIER_LABEL[item.tier]}</Badge>
        <Badge tone="neutral">{skillName(item.skillId)}</Badge>
      </div>
      <div className="jr-callout">
        <strong>Next step</strong>
        <span className="jr-small">{item.nextStep}</span>
        <strong style={{ marginTop: 6 }}>Practical project</strong>
        <span className="jr-small">{item.project}</span>
      </div>
      <div className="jr-stack" style={{ gap: 4 }}>
        {item.milestones.map((m) => {
          const d = isDone(m.id);
          return (
            <button key={m.id} type="button" role="checkbox" aria-checked={d} className={`jr-check ${d ? 'is-done' : ''}`} onClick={() => toggle(m.id)}>
              <span className="jr-check__box">{d && <IonIcon icon={checkmark} />}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
      <Button variant="ghost" onClick={onEvidence}>
        See the evidence
      </Button>
    </Collapsible>
  );
}
