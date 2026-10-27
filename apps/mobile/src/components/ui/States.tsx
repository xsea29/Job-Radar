import { IonIcon } from '@ionic/react';
import { alertCircle, radioOutline, warning } from 'ionicons/icons';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScanSummary } from '@jobradar/core';
import type { Analysis } from '../../data/analyze';
import { useAnalysis } from '../../data/queries';
import { Button, Card } from './Primitives';

export function EmptyState({ icon = radioOutline, title, body, action }: { icon?: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="jr-state" role="status">
      <span className="jr-state__icon">
        <IonIcon icon={icon} aria-hidden="true" />
      </span>
      <h2 className="jr-h3">{title}</h2>
      <p className="jr-muted">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="jr-state jr-state--error" role="alert">
      <span className="jr-state__icon">
        <IonIcon icon={alertCircle} aria-hidden="true" />
      </span>
      <h2 className="jr-h3">Something went wrong</h2>
      <p className="jr-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="jr-skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="jr-skel-stack" role="status" aria-label="Loading">
      <Skeleton h={30} w="60%" />
      <Skeleton h={16} w="80%" />
      <Skeleton h={168} r={20} />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={64} r={16} />
      ))}
    </div>
  );
}

export function PartialBanner({ summary }: { summary: ScanSummary }) {
  const nav = useNavigate();
  return (
    <Card tone="warn" className="jr-partial">
      <div className="jr-partial__row">
        <IonIcon icon={warning} aria-hidden="true" />
        <div>
          <strong>Partial scan: {summary.label} valid jobs</strong>
          <p className="jr-small">Statistics below use these {summary.valid} jobs as the denominator. This is not a completed {summary.target}-job scan.</p>
          <button type="button" className="jr-link" onClick={() => nav('/transparency')}>
            See what was missed
          </button>
        </div>
      </div>
    </Card>
  );
}

/** Handles loading / error / no-scan states, then renders the screen. */
export function DataGate({ children, rows }: { children: (a: Analysis) => ReactNode; rows?: number }) {
  const q = useAnalysis();
  const nav = useNavigate();
  if (q.isPending) return <PageSkeleton rows={rows} />;
  if (q.isError) return <ErrorState message={q.error instanceof Error ? q.error.message : 'Unknown error'} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <EmptyState
        title="No scan yet"
        body="Run your first scan to collect up to 100 real job descriptions that match your target role. Nothing is shown until there is evidence behind it."
        action={
          <Button onClick={() => nav('/scan')} icon={radioOutline}>
            Run first scan
          </Button>
        }
      />
    );
  }
  return <>{children(q.data)}</>;
}
