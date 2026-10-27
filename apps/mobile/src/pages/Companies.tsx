import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_LABELS, skillName, type CompanyCategory } from '@jobradar/core';
import { QuotaBars } from '../components/charts/QuotaBars';
import { JobRow } from '../components/domain/JobRow';
import { CategoryMark, CategoryTag } from '../components/ui/Markers';
import { Page } from '../components/ui/Page';
import { Badge, Card, Chip, Collapsible, List, Row, SectionHeader } from '../components/ui/Primitives';
import { SearchField } from '../components/ui/SearchField';
import { DataGate, EmptyState } from '../components/ui/States';
import type { Analysis } from '../data/analyze';
import { plural } from '../lib/format';
import { useParams } from 'react-router-dom';

export function Companies() {
  return (
    <Page title="Company insights" backHref="/tabs/more">
      <DataGate rows={5}>{(a) => <CompaniesContent a={a} />}</DataGate>
    </Page>
  );
}

function CompaniesContent({ a }: { a: Analysis }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | CompanyCategory>('all');
  const list = useMemo(
    () => a.companies.filter((c) => (cat === 'all' || c.company.category === cat) && c.company.name.toLowerCase().includes(q.trim().toLowerCase())),
    [a, q, cat],
  );
  const s = a.evidence.scanSummary;
  return (
    <>
      <div className="jr-stack">
        <h1 className="jr-h1">Sampled companies</h1>
        <p className="jr-muted">
          {a.companies.length} companies across {a.jobs.length} postings. {s.valid} of them make up the evidence base.
        </p>
      </div>
      <Card className="jr-stack">
        <span className="jr-overline">Evidence base by company type</span>
        <QuotaBars quotas={s.quotas} />
        {!s.quotasMet && <p className="jr-small jr-warn-text">Some categories are below their target. Statistics for those groups carry less weight.</p>}
        <Collapsible title="How company size is classified">
          <p className="jr-small">
            By headcount: <strong>startup</strong> under 200 employees, <strong>mid-sized</strong> 200–2,999, <strong>large</strong> 3,000+ (or a listed multinational with 1,000+ employees across 3+ countries). Headcounts within 15% of a boundary are flagged “approximate”. If a company has no reliable size data it is left <strong>unclassified</strong> and excluded from the quotas rather than guessed. Targets (35 / 30 / 35) are configurable in settings.
          </p>
        </Collapsible>
      </Card>
      <SearchField value={q} onChange={setQ} placeholder="Search companies" />
      <div className="jr-chips-scroll">
        {(['all', 'startup', 'mid', 'large'] as const).map((c) => (
          <Chip key={c} selected={cat === c} onClick={() => setCat(c)}>
            {c === 'all' ? 'All' : <><CategoryMark category={c} /> {CATEGORY_LABELS[c]}</>}
          </Chip>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState title="No companies match" body="Try another name or company type." />
      ) : (
        <List>
          {list.map((c) => (
            <Row
              key={c.company.id}
              leading={<CategoryMark category={c.company.category} size={14} />}
              title={
                <>
                  {c.company.name}
                  {c.company.classification.confidence === 'low' && <Badge tone="warning" title={c.company.classification.explanation}>approx. size</Badge>}
                </>
              }
              subtitle={`${c.company.industry} · ${c.company.hqCity}${c.company.employees ? ` · ~${c.company.employees.toLocaleString('en-IN')} people` : ''}`}
              meta={<span className="jr-small">{plural(c.jobs.length, 'job')}</span>}
              onClick={() => nav(`/company/${c.company.id}`)}
            />
          ))}
        </List>
      )}
    </>
  );
}

export function CompanyDetail() {
  const { companyId = '' } = useParams();
  return (
    <Page title="Company" backHref="/companies">
      <DataGate rows={3}>{(a) => <CompanyContent a={a} id={companyId} />}</DataGate>
    </Page>
  );
}

function CompanyContent({ a, id }: { a: Analysis; id: string }) {
  const c = a.companyById.get(id);
  if (!c) return <EmptyState title="Company not found" body="It isn’t part of the current dataset." />;
  const { company } = c;
  const cl = company.classification;
  const nSample = c.sampleJobs.length;
  return (
    <>
      <div className="jr-stack">
        <CategoryTag category={company.category} />
        <h1 className="jr-h1">{company.name}</h1>
        <p className="jr-muted">
          {company.industry} · HQ {company.hqCity}
        </p>
      </div>
      <Card className="jr-stack">
        <div className="jr-split">
          <h2 className="jr-h3">Size classification</h2>
          <Badge tone={cl.confidence === 'high' ? 'success' : 'warning'}>{cl.confidence} confidence</Badge>
        </div>
        <p>{cl.explanation}</p>
        <dl className="jr-dl">
          <dt>Basis</dt>
          <dd>{cl.basis.replace(/_/g, ' ')}</dd>
          {company.employees != null && (
            <>
              <dt>Employees</dt>
              <dd>~{company.employees.toLocaleString('en-IN')} (demo figure)</dd>
            </>
          )}
          {company.fundingStage && (
            <>
              <dt>Stage</dt>
              <dd>{company.fundingStage}</dd>
            </>
          )}
          {company.countries && (
            <>
              <dt>Countries</dt>
              <dd>{company.countries}</dd>
            </>
          )}
        </dl>
      </Card>

      <section className="jr-stack">
        <SectionHeader title="Common requirements" subtitle={nSample ? `From this company’s ${plural(nSample, 'job')} in the evidence base` : undefined} />
        {nSample === 0 ? (
          <Card>
            <p className="jr-muted">No postings from this company are in the evidence base yet, so there are no requirements to summarise.</p>
          </Card>
        ) : (
          <Card className="jr-stack">
            {nSample < 3 && <p className="jr-small jr-warn-text">Only {plural(nSample, 'posting')}. This shows what these roles asked for, not what the company “always” wants.</p>}
            <div className="jr-cluster">
              {c.topSkills.map((s) => (
                <Badge key={s.skillId} tone="primary">
                  {skillName(s.skillId)} · {s.jobs}/{nSample}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </section>

      <section className="jr-stack">
        <SectionHeader title={`Openings (${c.jobs.length})`} />
        <List>
          {c.jobs.map((v) => (
            <JobRow key={v.job.id} view={v} showDate />
          ))}
        </List>
      </section>
    </>
  );
}
