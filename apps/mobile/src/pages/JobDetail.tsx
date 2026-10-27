import { IonIcon } from '@ionic/react';
import { checkmarkCircle, ellipseOutline, openOutline, removeCircleOutline } from 'ionicons/icons';
import { Fragment, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { coverageFor, skillName, type ExtractedSkill, type Requirement } from '@jobradar/core';
import { Excerpt, Quote } from '../components/domain/Excerpt';
import { CategoryTag, ScoreRing } from '../components/ui/Markers';
import { Page } from '../components/ui/Page';
import { Badge, Button, Card, Chip, Collapsible, ProgressBar, Segmented } from '../components/ui/Primitives';
import { Sheet } from '../components/ui/Sheet';
import { DataGate, EmptyState } from '../components/ui/States';
import type { Analysis, JobView } from '../data/analyze';
import { dateTime, lpaRange, relativeDays, shortDate } from '../lib/format';
import { STATUS_LABEL, jobLocation } from '../lib/labels';
import { useProfile } from '../state/profile';

export default function JobDetail() {
  const { jobId = '' } = useParams();
  return (
    <Page title="Job details" backHref="/tabs/jobs">
      <DataGate rows={3}>{(a) => <Content a={a} jobId={jobId} />}</DataGate>
    </Page>
  );
}

const SUITABILITY: Record<string, string> = { strong: 'Strong fit', good: 'Good fit', partial: 'Partial fit', weak: 'Weak fit' };
const EXP_LABEL: Record<string, { text: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
  eligible: { text: 'Eligible', tone: 'success' },
  stretch: { text: 'Stretch', tone: 'info' },
  under: { text: 'Under-experienced', tone: 'warning' },
  over: { text: 'Above range', tone: 'neutral' },
  unknown: { text: 'Not stated', tone: 'neutral' },
};

function Content({ a, jobId }: { a: Analysis; jobId: string }) {
  const view = a.jobById.get(jobId);
  if (!view) return <EmptyState title="Job not found" body="This posting is not in the current dataset." />;
  return <Detail a={a} view={view} />;
}

function Detail({ view }: { a: Analysis; view: JobView }) {
  const { job, match } = view;
  const nav = useNavigate();
  const { profile } = useProfile();
  const [tab, setTab] = useState<Requirement>('required');
  const [highlight, setHighlight] = useState(true);
  const [evSkill, setEvSkill] = useState<ExtractedSkill | null>(null);
  const [orig, setOrig] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<Requirement, ExtractedSkill[]> = { required: [], preferred: [], mentioned: [] };
    for (const s of job.skills) g[s.requirement].push(s);
    return g;
  }, [job]);
  const exp = EXP_LABEL[match.experience.status]!;

  return (
    <>
      <div className="jr-stack">
        <div className="jr-cluster">
          <CategoryTag category={job.companyCategory} />
          <span className="jr-small jr-muted">· {job.industry}</span>
        </div>
        <h1 className="jr-h1">{job.title}</h1>
        <button type="button" className="jr-link" style={{ alignSelf: 'flex-start', fontSize: 16 }} onClick={() => nav(`/company/${job.companyId}`)}>
          {job.companyName}
        </button>
        <div className="jr-cluster">
          <Badge tone="neutral">{jobLocation(job.city, job.workArrangement)}</Badge>
          <Badge tone="neutral">{job.employmentType === 'full-time' ? 'Full-time' : 'Contract'}</Badge>
          {job.experience && <Badge tone="neutral">{job.experience.raw}</Badge>}
          <Badge tone={job.salary ? 'primary' : 'neutral'}>{job.salary ? lpaRange(job.salary.min, job.salary.max) : 'Salary not published'}</Badge>
          <Badge tone={job.status === 'active' ? 'success' : job.status === 'expired' ? 'danger' : 'warning'}>{STATUS_LABEL[job.status]}</Badge>
        </div>
        <p className="jr-small jr-muted">
          First seen {shortDate(job.firstSeenAt)} · last verified {dateTime(job.lastVerifiedAt)}
          {job.postedAt ? ` · published ${relativeDays(job.postedAt)}` : ''}
        </p>
      </div>

      {/* ───── Match: three separate outputs ───── */}
      <Card className="jr-stack">
        <div className="jr-split">
          <h2 className="jr-h3">How you match</h2>
          <span className="jr-small jr-muted">Estimate, not a prediction</span>
        </div>
        <div className="jr-match3">
          <div className="jr-match3__item">
            <span className="jr-overline">Skill match</span>
            <span className="jr-match3__val mono">{match.skillMatch == null ? '—' : `${match.skillMatch}%`}</span>
            <span className="jr-small jr-muted">
              {match.skills.matchedRequired.length} of {grouped.required.length} required
            </span>
          </div>
          <div className="jr-match3__item">
            <span className="jr-overline">Experience</span>
            <Badge tone={exp.tone}>{exp.text}</Badge>
            <span className="jr-small jr-muted">{match.experience.note}</span>
          </div>
          <div className="jr-match3__item jr-match3__overall">
            <span className="jr-overline">Overall</span>
            <ScoreRing value={match.overall} size={64} />
            <span className="jr-small">{match.suitability ? SUITABILITY[match.suitability] : 'Not scored'}</span>
          </div>
        </div>
        <div className="jr-stack" style={{ gap: 10 }}>
          {match.components.map((c) => (
            <div key={c.key} className="jr-comp">
              <div className="jr-split">
                <span className="jr-comp__label">{c.label}</span>
                <span className="jr-small jr-muted">
                  {c.score == null ? 'Not scored' : `${Math.round(c.score * 100)}% × weight ${Math.round(c.effectiveWeight * 100)}%`}
                </span>
              </div>
              <ProgressBar value={c.score == null ? 0 : c.score * 100} max={100} label={`${c.label} ${c.score == null ? 'not scored' : Math.round(c.score * 100) + '%'}`} />
              <span className="jr-small jr-muted">{c.note}</span>
            </div>
          ))}
        </div>
        {match.explanation.length > 0 && (
          <ul className="jr-bullets" style={{ margin: 0 }}>
            {match.explanation.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Card>

      {/* ───── Extracted skills ───── */}
      <section className="jr-stack">
        <div className="jr-section-header">
          <div>
            <h2 className="jr-h3">Skills extracted from this posting</h2>
            <p className="jr-small jr-muted">Tap a skill to see the sentence it came from.</p>
          </div>
        </div>
        <Segmented
          label="Requirement level"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'required', label: `Required (${grouped.required.length})` },
            { value: 'preferred', label: `Preferred (${grouped.preferred.length})` },
            { value: 'mentioned', label: `Mentioned (${grouped.mentioned.length})` },
          ]}
        />
        <div className="jr-cluster">
          {grouped[tab].length === 0 && <span className="jr-muted">None in this category.</span>}
          {grouped[tab].map((s) => {
            const cov = coverageFor(s.skillId, profile.skills);
            const icon = cov.kind === 'direct' || cov.kind === 'implied' ? checkmarkCircle : cov.kind === 'none' ? ellipseOutline : removeCircleOutline;
            return (
              <button key={s.skillId} type="button" className={`jr-skillchip ${cov.kind === 'direct' || cov.kind === 'implied' ? 'is-have' : ''}`} onClick={() => setEvSkill(s)}>
                <IonIcon icon={icon} aria-hidden="true" />
                {s.canonicalName}
                {s.isAlternative && <small>or</small>}
              </button>
            );
          })}
        </div>
        <p className="jr-small jr-muted">
          <IonIcon icon={checkmarkCircle} style={{ verticalAlign: '-2px', color: 'var(--success)' }} /> you list it · <IonIcon icon={removeCircleOutline} style={{ verticalAlign: '-2px' }} /> covered by a similar skill · <IonIcon icon={ellipseOutline} style={{ verticalAlign: '-2px' }} /> not on your profile
        </p>
      </section>

      {/* ───── Description ───── */}
      <section className="jr-stack">
        <div className="jr-section-header">
          <h2 className="jr-h3">Original description</h2>
          <Chip selected={highlight} onClick={() => setHighlight(!highlight)}>
            Highlight skills
          </Chip>
        </div>
        <Card>
          <p className="jr-small jr-muted" style={{ marginBottom: 10 }}>
            Synthetic demo text. In production this is the retrieved description, shown only where the source permits it.
          </p>
          <Description job={job} highlight={highlight} onPick={(id) => setEvSkill(job.skills.find((s) => s.skillId === id) ?? null)} />
        </Card>
      </section>

      {/* ───── Provenance ───── */}
      <Card className="jr-stack">
        <h2 className="jr-h3">Source & verification</h2>
        <dl className="jr-dl">
          <dt>Source</dt>
          <dd>{job.sourceName}</dd>
          <dt>Original URL</dt>
          <dd className="mono jr-wrap">{job.sourceUrl}</dd>
          <dt>Record</dt>
          <dd>{job.sample === 'in_scan' ? 'In the evidence base' : 'Found by the daily bot after the scan (not yet in the statistics)'}</dd>
          <dt>Content hash</dt>
          <dd className="mono">{job.contentHash}</dd>
        </dl>
        <Button block icon={openOutline} onClick={() => setOrig(true)}>
          Open original posting
        </Button>
        <Collapsible title="How skills were extracted">
          <p className="jr-small">
            Method <strong>{job.skills[0]?.method ?? 'rules-v1'}</strong>, taxonomy <strong>{job.skills[0]?.taxonomyVersion}</strong>. Requirement level comes from the section a skill appears in (requirements, nice-to-have, responsibilities) and explicit cues such as “is a plus”. Skills in benefits sections are ignored.
          </p>
        </Collapsible>
      </Card>

      <Sheet open={!!evSkill} onClose={() => setEvSkill(null)} title={evSkill?.canonicalName ?? ''}>
        {evSkill && <EvidenceBody skill={evSkill} onOpenSkill={() => { const id = evSkill.skillId; setEvSkill(null); nav(`/skill/${id}`); }} />}
      </Sheet>
      <Sheet open={orig} onClose={() => setOrig(false)} title="Original posting">
        <p>This is a demo record, so its link points to a placeholder host that does not exist:</p>
        <p className="mono jr-wrap jr-small">{job.sourceUrl}</p>
        <p>With real data this button opens the employer’s own page, where you apply. JobRadar never applies on your behalf.</p>
        <Button variant="secondary" block onClick={() => setOrig(false)}>
          Close
        </Button>
      </Sheet>
    </>
  );
}

function EvidenceBody({ skill, onOpenSkill }: { skill: ExtractedSkill; onOpenSkill: () => void }) {
  return (
    <>
      <div className="jr-cluster">
        <Badge tone={skill.requirement === 'required' ? 'primary' : skill.requirement === 'preferred' ? 'info' : 'neutral'}>{skill.requirement}</Badge>
        <Badge tone="neutral">{Math.round(skill.confidence * 100)}% confidence</Badge>
        {skill.isAlternative && <Badge tone="accent">one of several alternatives</Badge>}
      </div>
      {skill.evidence.map((e, i) => (
        <Fragment key={i}>
          <Quote>
            <Excerpt sentence={e.sentence} from={e.matchStart - e.start} to={e.matchEnd - e.start} />
          </Quote>
          <p className="jr-small jr-muted">
            Wording “{e.matchedText}” · section: {e.section} · classified {e.requirement}
          </p>
        </Fragment>
      ))}
      <p className="jr-small jr-muted">
        Canonical skill: {skillName(skill.skillId)} · method {skill.method} · taxonomy {skill.taxonomyVersion}
        {skill.isAlternative ? '. Listed as “X or Y”, so any one of the alternatives satisfies it.' : ''}
      </p>
      <Button variant="secondary" block onClick={onOpenSkill}>
        See market evidence for this skill
      </Button>
    </>
  );
}

function Description({ job, highlight, onPick }: { job: JobView['job']; highlight: boolean; onPick: (skillId: string) => void }) {
  const spans = useMemo(() => {
    const out: { start: number; end: number; req: Requirement; skillId: string }[] = [];
    for (const s of job.skills) for (const e of s.evidence) out.push({ start: e.matchStart, end: e.matchEnd, req: e.requirement, skillId: s.skillId });
    return out.sort((x, y) => x.start - y.start);
  }, [job]);
  if (!highlight) return <pre className="jr-desc">{job.description}</pre>;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((sp, i) => {
    if (sp.start < cursor) return;
    nodes.push(job.description.slice(cursor, sp.start));
    nodes.push(
      <button key={i} type="button" className={`jr-hl jr-hl--${sp.req}`} onClick={() => onPick(sp.skillId)}>
        {job.description.slice(sp.start, sp.end)}
      </button>,
    );
    cursor = sp.end;
  });
  nodes.push(job.description.slice(cursor));
  return <pre className="jr-desc">{nodes}</pre>;
}

