import { play, stop } from 'ionicons/icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { REJECTION_LABELS, ROLE_LABELS, type QuotaRow, type RejectionReason } from '@jobradar/core';
import { QuotaBars } from '../components/charts/QuotaBars';
import { Page } from '../components/ui/Page';
import { Badge, Button, Card, List, Overline, ProgressBar, Row } from '../components/ui/Primitives';
import { ErrorState, PageSkeleton } from '../components/ui/States';
import { evidenceSource } from '../data/source';
import { IS_DEMO } from '../data/source';
import { useProfile } from '../state/profile';
import { useSettings } from '../state/settings';

type Phase = 'idle' | 'running' | 'done' | 'cancelled' | 'failed';

const ease = (p: number) => 1 - Math.pow(1 - p, 1.6);
const TICKS = 64;

export default function Scan() {
  return IS_DEMO ? <DemoScan /> : <LiveScanInfo />;
}

function DemoScan() {
  const { profile } = useProfile();
  const { settings, update } = useSettings();
  const nav = useNavigate();

  const loc = useLocation();
  const auto = new URLSearchParams(loc.search).get('auto') === '1';
  const sc = settings.scenario === 'partial' ? 'partial' : 'complete';
  const q = useQuery({
    queryKey: ['scan-target', profile.targetRoleId, sc],
    queryFn: () => evidenceSource.load({ roleId: profile.targetRoleId, scenario: sc }),
    staleTime: Infinity,
  });
  const [phase, setPhase] = useState<Phase>('idle');
  const [tick, setTick] = useState(0);
  const started = useRef(false);

  const p = tick / TICKS;
  const failScenario = settings.scenario === 'error';

  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 130);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    if (failScenario && p >= 0.3) setPhase('failed');
    else if (p >= 1) {
      setPhase('done');
      if (settings.scenario === 'empty') update({ scenario: 'complete' });
    }
  }, [phase, p, failScenario, settings.scenario, update]);

  const start = () => {
    setTick(0);
    setPhase('running');
  };
  useEffect(() => {
    if (auto && q.data && !started.current) {
      started.current = true;
      start();
    }
  }, [auto, q.data]);

  const ds = q.data;
  const frame = useMemo(() => {
    if (!ds) return null;
    const s = ds.scanSummary;
    const e = phase === 'done' ? 1 : ease(Math.min(1, p));
    const r = (n: number) => Math.round(n * e);
    const connected = ds.sources.filter((x) => x.status !== 'not_connected');
    const quotas: QuotaRow[] = s.quotas.map((x) => ({ ...x, valid: r(x.valid), shortfall: x.target - r(x.valid) }));
    const rejected = Object.entries(s.rejectedByReason).map(([k, v]) => [k as RejectionReason, r(v as number)] as const);
    const notes = ds.scan.broadening.filter((_, i) => phase === 'done' || p >= 0.5 + i * 0.12);
    return {
      valid: r(s.valid),
      retrieved: r(s.retrieved),
      duplicates: r(s.duplicates),
      inaccessible: r(s.inaccessible),
      rejected: r(s.rejected),
      rejectedByReason: rejected,
      remaining: Math.max(0, s.target - r(s.valid)),
      quotas,
      notes,
      sources: connected.map((src, i) => {
        const lo = i / connected.length;
        const hi = (i + 1) / connected.length;
        const state = phase === 'done' ? 'done' : p < lo ? 'waiting' : p < hi ? 'fetching' : 'done';
        return { src, state };
      }),
    };
  }, [ds, p, phase]);

  const exp = `${Math.max(0, profile.yearsExperience - 1)}–${profile.yearsExperience + 2} yrs`;

  return (
    <Page title="Run scan" backHref="/tabs/home">
      {q.isPending ? (
        <PageSkeleton rows={3} />
      ) : q.isError || !ds || !frame ? (
        <ErrorState message="Couldn’t load the scan plan." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="jr-stack">
            <h1 className="jr-h1">{phase === 'idle' ? 'Collect job descriptions' : phase === 'running' ? 'Scanning…' : phase === 'done' ? (ds.scanSummary.state === 'complete' ? 'Scan complete' : 'Scan finished: partial') : phase === 'failed' ? 'Scan stopped' : 'Scan cancelled'}</h1>
            <p className="jr-muted">Retrieves distinct, relevant postings from authorised sources and counts only those that pass validation.</p>
          </div>

          <Card tone="accent" className="jr-small">
            <strong>Simulated scan.</strong> This demo replays a stored scan. No network requests are made and no real source is contacted.
          </Card>

          <Card className="jr-stack">
            <Overline>Search criteria</Overline>
            <dl className="jr-dl">
              <dt>Role</dt>
              <dd>{profile.targetRoleLabel || ROLE_LABELS[profile.targetRoleId]}</dd>
              <dt>Region</dt>
              <dd>{profile.locations.countries.join(', ') || 'India'}{profile.locations.remote ? ' + remote' : ''}</dd>
              <dt>Experience</dt>
              <dd>{exp}</dd>
              <dt>Published</dt>
              <dd>last {settings.scan.postedWithinDays} days</dd>
              <dt>Target</dt>
              <dd>
                {settings.scan.target} jobs ({settings.scan.startup} / {settings.scan.mid} / {settings.scan.large})
              </dd>
            </dl>
            <p className="jr-small jr-muted">If the target isn’t reached, the search is widened in disclosed steps. Role family, country and your minimum experience are never relaxed.</p>
          </Card>

          {phase === 'idle' && (
            <Button block icon={play} onClick={start}>
              Start scan
            </Button>
          )}
          {phase === 'failed' && <ErrorState message="Every source was unreachable (simulated error). Nothing was counted, so no statistics changed." onRetry={() => { update({ scenario: 'complete' }); setPhase('idle'); }} />}

          {phase !== 'idle' && phase !== 'failed' && (
            <>
              <Card className="jr-stack">
                <div className="jr-split">
                  <Overline>Valid job descriptions</Overline>
                  <Badge tone={phase === 'running' ? 'info' : ds.scanSummary.state === 'complete' ? 'success' : 'warning'}>
                    {phase === 'running' ? 'In progress' : phase === 'cancelled' ? 'Cancelled' : ds.scanSummary.state === 'complete' ? 'Complete' : 'Partial'}
                  </Badge>
                </div>
                <div className="jr-evidence__big">
                  <span className="mono jr-evidence__num">
                    {frame.valid}/{ds.scanSummary.target}
                  </span>
                </div>
                <ProgressBar value={frame.valid} max={ds.scanSummary.target} label={`${frame.valid} of ${ds.scanSummary.target} valid`} tone={phase === 'done' && ds.scanSummary.state === 'partial' ? 'warning' : 'primary'} />
                <div className="jr-counters">
                  <Counter label="Retrieved" v={frame.retrieved} />
                  <Counter label="Duplicates" v={frame.duplicates} />
                  <Counter label="Inaccessible" v={frame.inaccessible} />
                  <Counter label="Rejected" v={frame.rejected} />
                  <Counter label="Remaining" v={frame.remaining} />
                </div>
                {phase === 'done' && ds.scanSummary.state === 'partial' && (
                  <p className="jr-small jr-warn-text">
                    Only {ds.scanSummary.valid} of {ds.scanSummary.target} valid descriptions could be collected. This is not a completed {ds.scanSummary.target}-job scan, and all statistics use {ds.scanSummary.valid} as the denominator.
                  </p>
                )}
              </Card>

              <Card className="jr-stack">
                <Overline>By company type</Overline>
                <QuotaBars quotas={frame.quotas} />
              </Card>

              <section className="jr-stack">
                <h2 className="jr-h3">Sources</h2>
                <List>
                  {frame.sources.map(({ src, state }) => (
                    <Row
                      key={src.id}
                      title={src.name}
                      subtitle={state === 'done' && src.status !== 'ok' ? src.note : src.access}
                      meta={
                        <Badge tone={state === 'waiting' ? 'neutral' : state === 'fetching' ? 'info' : src.status === 'ok' ? 'success' : src.status === 'delayed' ? 'warning' : 'danger'}>
                          {state === 'waiting' ? 'Waiting' : state === 'fetching' ? 'Fetching' : src.status === 'ok' ? 'Done' : src.status === 'delayed' ? 'Delayed' : 'Failed'}
                        </Badge>
                      }
                    />
                  ))}
                </List>
              </section>

              {frame.rejectedByReason.length > 0 && p > 0.2 && (
                <Card className="jr-stack">
                  <Overline>Rejected jobs</Overline>
                  {frame.rejectedByReason.map(([k, v]) => (
                    <div key={k} className="jr-split">
                      <span className="jr-small">{REJECTION_LABELS[k]}</span>
                      <span className="mono jr-small">{v}</span>
                    </div>
                  ))}
                </Card>
              )}

              {frame.notes.length > 0 && (
                <Card tone="warn" className="jr-stack">
                  <Overline>Search was widened</Overline>
                  <ul className="jr-bullets" style={{ margin: 0 }}>
                    {frame.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </Card>
              )}

              {phase === 'running' && (
                <Button block variant="secondary" icon={stop} onClick={() => setPhase('cancelled')}>
                  Cancel scan
                </Button>
              )}
              {(phase === 'done' || phase === 'cancelled') && (
                <div className="jr-stack">
                  {phase === 'cancelled' && <p className="jr-small jr-muted">Cancelled at {frame.valid} valid jobs. Cancelled runs are never saved as a scan.</p>}
                  {phase === 'done' && (
                    <Button block onClick={() => nav('/tabs/home', { replace: true })}>
                      View results
                    </Button>
                  )}
                  <Button block variant="secondary" onClick={() => nav('/transparency')}>
                    Data transparency
                  </Button>
                  <Button block variant="ghost" onClick={start}>
                    Run again
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}

function Counter({ label, v }: { label: string; v: number }) {
  return (
    <div className="jr-counter">
      <span className="mono jr-counter__v">{v}</span>
      <span className="jr-small jr-muted">{label}</span>
    </div>
  );
}

function LiveScanInfo() {
  const nav = useNavigate();
  return (
    <Page title="Scans" backHref="/tabs/home">
      <div className="jr-stack">
        <h1 className="jr-h1">Scans run on the server</h1>
        <p className="jr-muted">Real scans read public job boards and take a while, so they run on a schedule (daily) rather than on your phone. The latest result, its failures and every widening step are in Data transparency.</p>
      </div>
      <Button block onClick={() => nav('/transparency')}>
        Open data transparency
      </Button>
    </Page>
  );
}
