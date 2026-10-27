import { IonIcon } from '@ionic/react';
import { play } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import type { Evidence } from '../../data/source';
import { dateRange, dateTime } from '../../lib/format';
import { Badge, Button, Card, Overline, ProgressBar } from '../ui/Primitives';

export function sourceHealthText(sources: Evidence['sources']): string {
  const connected = sources.filter((s) => s.status !== 'not_connected');
  const ok = connected.filter((s) => s.status === 'ok').length;
  const delayed = connected.filter((s) => s.status === 'delayed').length;
  const failed = connected.filter((s) => s.status === 'failed').length;
  return `${ok} of ${connected.length} sources OK${delayed ? `, ${delayed} delayed` : ''}${failed ? `, ${failed} failed` : ''}`;
}

/** The "evidence base" card: the denominator behind every number in the app. */
export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const nav = useNavigate();
  const s = evidence.scanSummary;
  const complete = s.state === 'complete';
  return (
    <Card className="jr-evidence">
      <div className="jr-split">
        <Overline>Evidence base</Overline>
        <Badge tone={complete ? 'primary' : 'warning'}>{complete ? 'Scan complete' : 'Partial scan'}</Badge>
      </div>
      <div className="jr-evidence__big">
        <span className="mono jr-evidence__num">{s.label}</span>
        <span className="jr-muted">valid job descriptions</span>
      </div>
      <ProgressBar value={s.valid} max={s.target} label={`${s.valid} of ${s.target} valid job descriptions`} tone={complete ? 'primary' : 'warning'} />
      <p className="jr-small jr-evidence__text">
        {complete
          ? `Collected ${dateRange(evidence.scan.startedAt, evidence.scan.finishedAt)} from authorised sources. Every skill figure traces to these jobs.`
          : `Collected ${dateRange(evidence.scan.startedAt, evidence.scan.finishedAt)}. Only ${s.valid} of ${s.target} valid descriptions could be retrieved, so this is not a completed scan.`}
      </p>
      <p className="jr-small jr-muted">
        Daily bot ran {dateTime(evidence.botRanAt)} · {sourceHealthText(evidence.sources)}
      </p>
      <div className="jr-grid-2">
        <Button onClick={() => nav('/tabs/jobs')}>View jobs</Button>
        <Button variant="secondary" icon={play} onClick={() => nav('/scan')}>
          Run scan
        </Button>
      </div>
    </Card>
  );
}

export const IconPlay = () => <IonIcon icon={play} />;
