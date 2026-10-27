import { REJECTION_LABELS, DEFAULT_TREND_CONFIG, TAXONOMY_VERSION, type JobSource, type RejectionReason, type ScanRun } from '@jobradar/core';
import { QuotaBars } from '../components/charts/QuotaBars';
import { Page } from '../components/ui/Page';
import { Badge, Card, Collapsible, List, Overline, Row, SectionHeader } from '../components/ui/Primitives';
import { DataGate, PartialBanner } from '../components/ui/States';
import type { Analysis } from '../data/analyze';
import { dateRange, dateTime, plural, relativeDays } from '../lib/format';

export default function Transparency() {
  return (
    <Page title="Data transparency" backHref="/tabs/more">
      <DataGate rows={5}>{(a) => <Content a={a} />}</DataGate>
    </Page>
  );
}

const SOURCE_TONE: Record<JobSource['status'], 'success' | 'warning' | 'danger' | 'neutral'> = { ok: 'success', delayed: 'warning', failed: 'danger', not_connected: 'neutral' };
const SOURCE_TEXT: Record<JobSource['status'], string> = { ok: 'OK', delayed: 'Delayed', failed: 'Failed', not_connected: 'Not connected' };

function Content({ a }: { a: Analysis }) {
  const ev = a.evidence;
  const s = ev.scanSummary;
  const jobs = ev.sampleJobs;
  const fresh = jobs.filter((j) => j.status === 'active').length;
  const closed = jobs.filter((j) => j.status === 'expired').length;
  const changed = jobs.filter((j) => j.status === 'changed').length;
  const unclassified = a.demandJobs.filter((j) => j.companyCategory === 'unclassified').length;
  const lowConf = a.companies.filter((c) => c.company.classification.confidence === 'low' && c.sampleJobs.length > 0).length;
  const tc = DEFAULT_TREND_CONFIG;

  return (
    <>
      <div className="jr-stack">
        <h1 className="jr-h1">What this is based on</h1>
        <p className="jr-muted">The sample, the sources, what failed, and what the numbers can’t tell you.</p>
      </div>
      {s.state === 'partial' && <PartialBanner summary={s} />}

      <Card className="jr-stack">
        <div className="jr-split">
          <Overline>Current evidence base</Overline>
          <Badge tone={s.state === 'complete' ? 'success' : 'warning'}>{s.state === 'complete' ? 'Complete' : 'Partial'}</Badge>
        </div>
        <span className="jr-bignum mono">
          {s.label}
          <small> valid, unique, relevant</small>
        </span>
        <dl className="jr-dl">
          <dt>Collected</dt>
          <dd>{dateRange(ev.scan.startedAt, ev.scan.finishedAt)}</dd>
          <dt>Retrieved</dt>
          <dd>{s.retrieved} candidates</dd>
          <dt>Duplicates</dt>
          <dd>{s.duplicates} removed (matched on content hash or company + title + city)</dd>
          <dt>Inaccessible</dt>
          <dd>{s.inaccessible} (see failed retrievals)</dd>
          <dt>Rejected</dt>
          <dd>{s.rejected}</dd>
          <dt>Remaining</dt>
          <dd>{s.remaining}</dd>
        </dl>
        {Object.keys(s.rejectedByReason).length > 0 && (
          <ul className="jr-bullets" style={{ margin: 0 }}>
            {Object.entries(s.rejectedByReason).map(([k, v]) => (
              <li key={k}>
                {REJECTION_LABELS[k as RejectionReason]}: {v as number}
              </li>
            ))}
          </ul>
        )}
        <QuotaBars quotas={s.quotas} />
        {s.warnings.map((w) => (
          <p key={w} className="jr-small jr-warn-text">
            {w}
          </p>
        ))}
        {ev.scan.broadening.length > 0 && (
          <div className="jr-callout">
            <strong>Search criteria were widened</strong>
            <ul className="jr-bullets" style={{ margin: 0 }}>
              {ev.scan.broadening.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <section className="jr-stack">
        <SectionHeader title="Freshness" subtitle="Status of the postings in the evidence base" />
        <Card className="jr-split3">
          <Fresh label="Active" v={fresh} />
          <Fresh label="Changed" v={changed} />
          <Fresh label="Closed" v={closed} />
        </Card>
        <p className="jr-small jr-muted">Closed or changed postings stay in the statistics for the scan they were collected in, and are flagged wherever they appear. Last daily check: {dateTime(ev.botRanAt)}.</p>
      </section>

      <section className="jr-stack">
        <SectionHeader title="Sources" subtitle="Only sources we’re permitted to use. No logins, CAPTCHAs or robots.txt restrictions are bypassed." />
        <List>
          {ev.sources.map((src) => (
            <Row
              key={src.id}
              title={
                <>
                  {src.name} <Badge tone={SOURCE_TONE[src.status]}>{SOURCE_TEXT[src.status]}</Badge>
                </>
              }
              subtitle={
                <>
                  {src.access}
                  <br />
                  {src.status === 'not_connected' ? src.note : `Checked ${src.lastCheckedAt ? dateTime(src.lastCheckedAt) : '—'} · last success ${src.lastSuccessAt ? relativeDays(src.lastSuccessAt) : '—'} · ${src.jobsValid} valid jobs in sample`}
                  {src.status !== 'ok' && src.status !== 'not_connected' && (
                    <>
                      <br />
                      <span className="jr-warn-text">{src.note}</span>
                    </>
                  )}
                </>
              }
            />
          ))}
        </List>
      </section>

      <section className="jr-stack">
        <SectionHeader title="Scan history" subtitle="Comparable samples are used for trends" />
        <List>
          {ev.scanHistory.map((r) => (
            <HistoryRow key={r.id} r={r} />
          ))}
        </List>
      </section>

      <section className="jr-stack">
        <SectionHeader title={`Failed retrievals (${ev.failedRetrievals.length})`} subtitle="Never counted as scanned" />
        {ev.failedRetrievals.length ? (
          <List>
            {ev.failedRetrievals.map((f) => (
              <Row key={f.id} title={<span className="mono jr-wrap" style={{ fontSize: 12 }}>{f.target}</span>} subtitle={`${f.reason} · ${dateTime(f.at)}`} meta={<Badge tone={f.retryable ? 'info' : 'neutral'}>{f.retryable ? 'Will retry' : 'Skipped'}</Badge>} />
            ))}
          </List>
        ) : (
          <Card>
            <p className="jr-muted">No failed retrievals in the current scan.</p>
          </Card>
        )}
      </section>

      <Card flush>
        <Collapsible title="Limitations of this data" defaultOpen>
          <ul className="jr-bullets" style={{ margin: 0 }}>
            <li>The sample covers postings from sources we can legitimately access, not the whole market. It over-represents companies that publish via public applicant-tracking boards.</li>
            <li>Company size comes from headcount data that may be out of date. {lowConf} sampled {plural(lowConf, 'company', 'companies')} sit near a size boundary; {unclassified} jobs are unclassified.</li>
            <li>“Required” and “preferred” are inferred from wording and section headings by rules; the confidence and the sentence are always shown.</li>
            <li>A posting being live doesn’t mean the role is still open or that the employer is hiring right now.</li>
            <li>Salary is shown only when published, which is a minority of postings.</li>
            <li>The sample is {s.valid} jobs. Differences of a few points between groups can be noise; segments under 8 jobs are flagged.</li>
          </ul>
        </Collapsible>
        <Collapsible title="How skills are extracted">
          <p className="jr-small">
            Deterministic rules (<strong>rules-v1</strong>, taxonomy <strong>{TAXONOMY_VERSION}</strong>) match curated aliases without merging distinct technologies (React ≠ React Native, PostgreSQL ≠ SQL). Requirement level follows the section and explicit cues. AI-assisted extraction, when enabled, must return schema-validated output and never overrides stored evidence.
          </p>
        </Collapsible>
        <Collapsible title="How trends are decided">
          <ul className="jr-bullets" style={{ margin: 0 }}>
            <li>Samples are compared only if role, region, experience band and company mix (within {Math.round(tc.maxMixDistance * 100)} points) match and each has at least {tc.minSample} jobs.</li>
            <li>A change is “meaningful” only if it is at least {Math.round(tc.minDelta * 100)} percentage points and passes a two-proportion test (z ≥ {tc.zThreshold}).</li>
            <li>“Declining” needs a sustained drop across three comparable samples. One lower reading is labelled uncertain.</li>
            <li>With no comparable history: “baseline established; trend not yet available”.</li>
          </ul>
        </Collapsible>
        <Collapsible title="Demo data disclosure">
          <p className="jr-small">All jobs, companies and URLs in this build are synthetic. Earlier snapshots used for trends are synthetic aggregates; no past job descriptions are invented. Demo records are never mixed with production evidence.</p>
        </Collapsible>
      </Card>
    </>
  );
}

function Fresh({ label, v }: { label: string; v: number }) {
  return (
    <div className="jr-split3__item">
      <span className="jr-small jr-muted">{label}</span>
      <span className="mono jr-split3__val">{v}</span>
    </div>
  );
}

function HistoryRow({ r }: { r: ScanRun }) {
  return (
    <Row
      title={
        <>
          <span className="mono">
            {r.valid}/{r.target}
          </span>
          <Badge tone={r.state === 'complete' ? 'success' : 'warning'}>{r.state === 'complete' ? 'Complete' : 'Partial'}</Badge>
          {r.current && <Badge tone="primary">Current</Badge>}
        </>
      }
      subtitle={
        <>
          {dateRange(r.startedAt, r.finishedAt)} · {r.quotas.startup}/{r.quotas.mid}/{r.quotas.large} startup/mid/large
          {r.broadening.length > 0 && (
            <>
              <br />
              {r.broadening[0]}
            </>
          )}
        </>
      }
    />
  );
}
