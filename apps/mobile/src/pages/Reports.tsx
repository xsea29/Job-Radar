import { IonIcon } from '@ionic/react';
import { notifications, notificationsOffOutline } from 'ionicons/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { skillName, type DailyReport } from '@jobradar/core';
import { JobRow } from '../components/domain/JobRow';
import { LabelBadge } from '../components/ui/Markers';
import { Page } from '../components/ui/Page';
import { Badge, Button, Card, List, Row, SectionHeader } from '../components/ui/Primitives';
import { DataGate, EmptyState } from '../components/ui/States';
import type { Analysis } from '../data/analyze';
import { dateTime, dayLabel, plural } from '../lib/format';

export function Reports() {
  return (
    <Page title="Daily reports" backHref="/tabs/more">
      <DataGate rows={5}>{(a) => <ReportList a={a} />}</DataGate>
    </Page>
  );
}

function ReportList({ a }: { a: Analysis }) {
  const nav = useNavigate();
  return (
    <>
      <div className="jr-stack">
        <h1 className="jr-h1">Daily intelligence</h1>
        <p className="jr-muted">One short report per day. You are only notified when something significant changes.</p>
      </div>
      <List>
        {a.reports.map((r, i) => (
          <Row
            key={r.date}
            leading={<IonIcon icon={r.notify.send ? notifications : notificationsOffOutline} style={{ fontSize: 22, color: r.notify.send ? 'var(--primary)' : 'var(--text-3)' }} aria-label={r.notify.send ? 'Notification sent' : 'No notification'} />}
            title={
              <>
                {i === 0 ? 'Today' : dayLabel(r.date + 'T12:00:00Z')} {i === 0 && <Badge tone="primary">Latest</Badge>}
              </>
            }
            subtitle={`${plural(r.newJobIds.length, 'new job')}${r.bestMatchIds[0] ? ` · best match ${a.jobById.get(r.bestMatchIds[0])?.match.overall ?? '–'}` : ''}${r.demandChanges.length ? ` · ${plural(r.demandChanges.length, 'demand change')}` : ''}`}
            onClick={() => nav(`/report/${r.date}`)}
          />
        ))}
      </List>
    </>
  );
}

export function ReportDetail() {
  const { date = '' } = useParams();
  return (
    <Page title="Report" backHref="/reports">
      <DataGate rows={4}>{(a) => <ReportContent a={a} date={date} />}</DataGate>
    </Page>
  );
}

function ReportContent({ a, date }: { a: Analysis; date: string }) {
  const nav = useNavigate();
  const r: DailyReport | undefined = a.reports.find((x) => x.date === date);
  if (!r) return <EmptyState title="No report for this date" body="Reports are kept for the last 7 days." />;
  const isToday = r === a.reports[0];
  return (
    <>
      <div className="jr-stack">
        <span className="jr-overline">{isToday ? 'Today’s report' : 'Report'}</span>
        <h1 className="jr-h1">{dayLabel(date + 'T12:00:00Z')}</h1>
        <p className="jr-small jr-muted">Generated from jobs first seen since {dateTime(r.since)}.</p>
      </div>

      <Card tone={r.notify.send ? 'primary' : undefined} className="jr-stack">
        <div className="jr-cluster">
          <IonIcon icon={r.notify.send ? notifications : notificationsOffOutline} style={{ fontSize: 20 }} />
          <strong>{r.notify.send ? 'Notification sent' : 'No notification sent'}</strong>
        </div>
        <ul className="jr-bullets" style={{ margin: 0 }}>
          {r.notify.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Card>

      <Card className="jr-stack">
        <span className="jr-overline">Recommended next action</span>
        <h2 className="jr-h2">{r.recommendedAction.title}</h2>
        <p className="jr-muted">{r.recommendedAction.detail}</p>
        {r.recommendedAction.skillId && <Button variant="secondary" onClick={() => nav(`/skill/${r.recommendedAction.skillId}`)}>See evidence</Button>}
      </Card>

      <section className="jr-stack">
        <SectionHeader title={`New relevant jobs (${r.newJobIds.length})`} />
        {r.newJobIds.length ? (
          <List>
            {[...r.newJobIds].sort((x, y) => (a.jobById.get(y)?.match.overall ?? 0) - (a.jobById.get(x)?.match.overall ?? 0)).slice(0, 6).map((id) => {
              const v = a.jobById.get(id);
              return v ? <JobRow key={id} view={v} /> : null;
            })}
          </List>
        ) : (
          <Card>
            <p className="jr-muted">No new relevant postings were found.</p>
          </Card>
        )}
      </section>

      {r.bestMatchIds.length > 0 && (
        <section className="jr-stack">
          <SectionHeader title="Best matches for your profile" />
          <List>
            {r.bestMatchIds.map((id) => {
              const v = a.jobById.get(id);
              return v ? <JobRow key={id} view={v} /> : null;
            })}
          </List>
        </section>
      )}

      <section className="jr-stack">
        <SectionHeader title="Newly observed requirements" />
        {r.newRequirements.length ? (
          <List>
            {r.newRequirements.map((n) => (
              <Row key={n.skillId} title={skillName(n.skillId)} subtitle={n.note} onClick={() => nav(`/skill/${n.skillId}`)} />
            ))}
          </List>
        ) : (
          <Card>
            <p className="jr-muted">Nothing in today’s postings stands out against the baseline sample.</p>
          </Card>
        )}
      </section>

      <section className="jr-stack">
        <SectionHeader title="Changes in employer demand" />
        {r.demandChanges.length ? (
          <List>
            {r.demandChanges.map((c) => (
              <Row key={c.skillId} title={<>{skillName(c.skillId)} <LabelBadge label={c.label} /></>} subtitle={c.summary} onClick={() => nav(`/skill/${c.skillId}`)} />
            ))}
          </List>
        ) : (
          <Card>
            <p className="jr-muted">No demand statistics changed beyond sampling noise. Demand figures update when a new comparable scan completes.</p>
          </Card>
        )}
      </section>

      {r.gapFocus && (
        <Card className="jr-stack">
          <span className="jr-overline">Skill gap worth addressing</span>
          <h3 className="jr-h3">{skillName(r.gapFocus.skillId)}</h3>
          <p className="jr-muted">{r.gapFocus.note}</p>
        </Card>
      )}

      <Card tone={r.sources.failed || r.sources.delayed ? 'warn' : undefined} className="jr-stack">
        <span className="jr-overline">Source health</span>
        <p>
          {r.sources.ok} OK · {r.sources.delayed} delayed · {r.sources.failed} failed
        </p>
        {r.sources.issues.map((i) => (
          <p key={i} className="jr-small">
            {i}
          </p>
        ))}
        <button type="button" className="jr-link" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/transparency')}>
          Data transparency
        </button>
      </Card>
    </>
  );
}
