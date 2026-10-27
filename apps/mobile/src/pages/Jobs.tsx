import { IonIcon } from '@ionic/react';
import { optionsOutline } from 'ionicons/icons';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, getSkill, type CompanyCategory, type WorkArrangement } from '@jobradar/core';
import { SkillPicker } from '../components/domain/SkillPicker';
import { JobRow } from '../components/domain/JobRow';
import { Page, PageTitle } from '../components/ui/Page';
import { Button, Chip, List, Segmented } from '../components/ui/Primitives';
import { SearchField } from '../components/ui/SearchField';
import { Sheet } from '../components/ui/Sheet';
import { DataGate, EmptyState, PartialBanner } from '../components/ui/States';
import { CategoryMark } from '../components/ui/Markers';
import type { Analysis, JobView } from '../data/analyze';
import { ARRANGEMENT_LABEL } from '../lib/labels';

interface Filters {
  cats: CompanyCategory[];
  arrangements: WorkArrangement[];
  cities: string[];
  salaryMinLpa: number;
  fit: 'all' | 'fit';
  skills: string[];
  posted: 'any' | '7' | '14';
  sample: 'all' | 'in_scan' | 'new_since_scan';
  hideClosed: boolean;
}

const NO_FILTERS: Filters = { cats: [], arrangements: [], cities: [], salaryMinLpa: 0, fit: 'all', skills: [], posted: 'any', sample: 'all', hideClosed: false };
type Sort = 'match' | 'newest' | 'salary';

function countActive(f: Filters): number {
  return (f.cats.length ? 1 : 0) + (f.arrangements.length ? 1 : 0) + (f.cities.length ? 1 : 0) + (f.salaryMinLpa ? 1 : 0) + (f.fit !== 'all' ? 1 : 0) + (f.skills.length ? 1 : 0) + (f.posted !== 'any' ? 1 : 0) + (f.sample !== 'all' ? 1 : 0) + (f.hideClosed ? 1 : 0);
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

export default function Jobs() {
  return (
    <Page>
      <DataGate rows={6}>{(a) => <JobsContent a={a} />}</DataGate>
    </Page>
  );
}

function JobsContent({ a }: { a: Analysis }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('match');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(30);
  const now = new Date(a.evidence.botRanAt).getTime();
  const active = countActive(filters);

  const result = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = a.jobs.filter(({ job, match }: JobView) => {
      if (query && !(`${job.title} ${job.companyName} ${job.skills.map((s) => s.canonicalName).join(' ')}`.toLowerCase().includes(query))) return false;
      if (filters.cats.length && !filters.cats.includes(job.companyCategory as CompanyCategory)) return false;
      if (filters.arrangements.length && !(job.workArrangement && filters.arrangements.includes(job.workArrangement))) return false;
      if (filters.cities.length && !(job.city && filters.cities.includes(job.city))) return false;
      if (filters.salaryMinLpa) {
        const top = job.salary?.max ?? job.salary?.min;
        if (top == null || top < filters.salaryMinLpa * 100_000) return false;
      }
      if (filters.fit === 'fit' && !['eligible', 'stretch', 'unknown'].includes(match.experience.status)) return false;
      if (filters.skills.length && !filters.skills.every((s) => job.skills.some((x) => x.skillId === s && x.requirement !== 'mentioned'))) return false;
      if (filters.posted !== 'any' && now - new Date(job.postedAt ?? job.firstSeenAt).getTime() > Number(filters.posted) * 86_400_000) return false;
      if (filters.sample !== 'all' && job.sample !== filters.sample) return false;
      if (filters.hideClosed && job.status === 'expired') return false;
      return true;
    });
    list.sort((x, y) => {
      if (sort === 'newest') return new Date(y.job.firstSeenAt).getTime() - new Date(x.job.firstSeenAt).getTime();
      if (sort === 'salary') return (y.job.salary?.max ?? -1) - (x.job.salary?.max ?? -1);
      return (y.match.overall ?? -1) - (x.match.overall ?? -1);
    });
    return list;
  }, [a, q, filters, sort, now]);

  return (
    <>
      <PageTitle title="Jobs" subtitle={`${a.jobs.length} postings · ${a.evidence.sampleJobs.length} in the evidence base, ${a.evidence.newJobs.length} new since the scan`} />
      {a.evidence.scanSummary.state === 'partial' && <PartialBanner summary={a.evidence.scanSummary} />}
      <div className="jr-searchrow">
        <SearchField value={q} onChange={setQ} placeholder="Search title, company or skill" />
        <button type="button" className="jr-filterbtn" onClick={() => setOpen(true)} aria-label={`Filters${active ? `, ${active} active` : ''}`}>
          <IonIcon icon={optionsOutline} />
          {active > 0 && <span className="jr-filterbtn__n">{active}</span>}
        </button>
      </div>
      <div className="jr-split">
        <span className="jr-small jr-muted">
          {Math.min(limit, result.length)} of {result.length}
        </span>
        <Segmented
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'match', label: 'Best match' },
            { value: 'newest', label: 'Newest' },
            { value: 'salary', label: 'Salary' },
          ]}
        />
      </div>
      {active > 0 && (
        <div className="jr-chips-scroll" aria-label="Active filters">
          {filters.cats.map((c) => (
            <Chip key={c} selected onClick={() => setFilters({ ...filters, cats: toggle(filters.cats, c) })}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
          {filters.arrangements.map((c) => (
            <Chip key={c} selected onClick={() => setFilters({ ...filters, arrangements: toggle(filters.arrangements, c) })}>
              {ARRANGEMENT_LABEL[c]}
            </Chip>
          ))}
          {filters.cities.map((c) => (
            <Chip key={c} selected onClick={() => setFilters({ ...filters, cities: toggle(filters.cities, c) })}>
              {c}
            </Chip>
          ))}
          {filters.skills.map((c) => (
            <Chip key={c} selected onClick={() => setFilters({ ...filters, skills: toggle(filters.skills, c) })}>
              {getSkill(c)?.name}
            </Chip>
          ))}
          <Chip onClick={() => setFilters(NO_FILTERS)}>Clear all</Chip>
        </div>
      )}
      {result.length === 0 ? (
        <EmptyState title="No jobs match" body="Your filters are narrower than the data. Loosen a filter or clear them all." action={<Button variant="secondary" onClick={() => { setFilters(NO_FILTERS); setQ(''); }}>Clear filters</Button>} />
      ) : (
        <>
          <List>
            {result.slice(0, limit).map((v) => (
              <JobRow key={v.job.id} view={v} showDate />
            ))}
          </List>
          {result.length > limit && (
            <Button variant="secondary" block onClick={() => setLimit(limit + 30)}>
              Show more ({result.length - limit} left)
            </Button>
          )}
        </>
      )}
      <p className="jr-small jr-muted">Match scores are estimates of fit, not predictions of interviews or offers. Missing data is not counted against you.</p>
      <FilterSheet open={open} onClose={() => setOpen(false)} a={a} filters={filters} setFilters={setFilters} resultCount={result.length} />
    </>
  );
}

function FilterSheet({ open, onClose, a, filters, setFilters, resultCount }: { open: boolean; onClose: () => void; a: Analysis; filters: Filters; setFilters: (f: Filters) => void; resultCount: number }) {
  const cities = useMemo(() => [...new Set(a.jobs.map((j) => j.job.city).filter((c): c is string => !!c))].sort(), [a]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="tall"
      title="Filters"
      footer={
        <>
          <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>
            Reset
          </Button>
          <Button block onClick={onClose}>
            Show {resultCount} jobs
          </Button>
        </>
      }
    >
      <FilterGroup title="Company size">
        {(['startup', 'mid', 'large'] as CompanyCategory[]).map((c) => (
          <Chip key={c} selected={filters.cats.includes(c)} onClick={() => setFilters({ ...filters, cats: toggle(filters.cats, c) })}>
            <CategoryMark category={c} /> {CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup title="Work arrangement">
        {(['remote', 'hybrid', 'onsite'] as WorkArrangement[]).map((c) => (
          <Chip key={c} selected={filters.arrangements.includes(c)} onClick={() => setFilters({ ...filters, arrangements: toggle(filters.arrangements, c) })}>
            {ARRANGEMENT_LABEL[c]}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup title="Location">
        {cities.map((c) => (
          <Chip key={c} selected={filters.cities.includes(c)} onClick={() => setFilters({ ...filters, cities: toggle(filters.cities, c) })}>
            {c}
          </Chip>
        ))}
      </FilterGroup>
      <div className="jr-stack" style={{ gap: 8 }}>
        <span className="jr-overline">Minimum published salary</span>
        <div className="jr-cluster">
          {[0, 20, 30, 40].map((v) => (
            <Chip key={v} selected={filters.salaryMinLpa === v} onClick={() => setFilters({ ...filters, salaryMinLpa: v })}>
              {v === 0 ? 'Any' : `₹${v}+ LPA`}
            </Chip>
          ))}
        </div>
        <span className="jr-small jr-muted">Only some postings publish salary. A salary filter hides the rest.</span>
      </div>
      <div className="jr-stack" style={{ gap: 8 }}>
        <span className="jr-overline">Experience</span>
        <Segmented label="Experience fit" value={filters.fit} onChange={(v) => setFilters({ ...filters, fit: v })} options={[{ value: 'all', label: 'All roles' }, { value: 'fit', label: 'Within reach for me' }]} />
      </div>
      <div className="jr-stack" style={{ gap: 8 }}>
        <span className="jr-overline">Published</span>
        <Segmented label="Published" value={filters.posted} onChange={(v) => setFilters({ ...filters, posted: v })} options={[{ value: 'any', label: 'Any time' }, { value: '14', label: 'Last 14 days' }, { value: '7', label: 'Last 7 days' }]} />
      </div>
      <div className="jr-stack" style={{ gap: 8 }}>
        <span className="jr-overline">Source of record</span>
        <Segmented label="Sample" value={filters.sample} onChange={(v) => setFilters({ ...filters, sample: v })} options={[{ value: 'all', label: 'All' }, { value: 'in_scan', label: 'In evidence base' }, { value: 'new_since_scan', label: 'New since scan' }]} />
      </div>
      <FilterGroup title="Status">
        <Chip selected={filters.hideClosed} onClick={() => setFilters({ ...filters, hideClosed: !filters.hideClosed })}>
          Hide closed postings
        </Chip>
      </FilterGroup>
      <div className="jr-stack" style={{ gap: 8 }}>
        <span className="jr-overline">Must list these skills (required or preferred)</span>
        <SkillPicker selected={new Set(filters.skills)} onToggle={(id) => setFilters({ ...filters, skills: toggle(filters.skills, id) })} suggested={a.demand.skills.slice(0, 14).map((s) => s.skillId)} />
      </div>
    </Sheet>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="jr-stack" style={{ gap: 8 }}>
      <span className="jr-overline">{title}</span>
      <div className="jr-cluster">{children}</div>
    </div>
  );
}
