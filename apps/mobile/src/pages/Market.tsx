import { useMemo, useState } from 'react';
import { SKILL_CATEGORIES, getSkill, skillName, type CompanyCategory } from '@jobradar/core';
import { SkillRow } from '../components/domain/SkillRow';
import { RequirementKey } from '../components/ui/Markers';
import { Page, PageTitle } from '../components/ui/Page';
import { Button, Chip, List, Segmented } from '../components/ui/Primitives';
import { SearchField } from '../components/ui/SearchField';
import { DataGate, EmptyState, PartialBanner } from '../components/ui/States';
import type { Analysis } from '../data/analyze';
import { ROLE_LABELS } from '@jobradar/core';

type Scope = 'all' | CompanyCategory;
type Sort = 'mentions' | 'required' | 'change';

export default function Market() {
  return (
    <Page>
      <DataGate rows={6}>{(a) => <MarketContent a={a} />}</DataGate>
    </Page>
  );
}

function MarketContent({ a }: { a: Analysis }) {
  const [scope, setScope] = useState<Scope>('all');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('mentions');
  const [limit, setLimit] = useState(25);
  const ev = a.evidence;
  const cur = ev.snapshots[ev.snapshots.length - 1]!;
  const catN = a.demand.categoryN;

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = a.demand.skills
      .filter((s) => (cat === 'all' ? true : getSkill(s.skillId)?.category === cat))
      .filter((s) => (query ? skillName(s.skillId).toLowerCase().includes(query) : true))
      .map((s) => {
        const scoped = scope === 'all' ? undefined : { n: s.byCategory[scope].n, jobs: s.byCategory[scope].jobs, required: s.byCategory[scope].required, preferred: s.byCategory[scope].preferred };
        return { s, scoped, jobs: scoped?.jobs ?? s.jobs, required: scoped?.required ?? s.required };
      })
      .filter((r) => r.jobs > 0);
    list.sort((x, y) => {
      if (sort === 'required') return y.required - x.required || y.jobs - x.jobs;
      if (sort === 'change') return Math.abs(a.trends.get(y.s.skillId)?.comparison?.deltaPP ?? 0) - Math.abs(a.trends.get(x.s.skillId)?.comparison?.deltaPP ?? 0) || y.jobs - x.jobs;
      return y.jobs - x.jobs || y.required - x.required;
    });
    return list;
  }, [a, scope, q, cat, sort]);

  const denominator = scope === 'all' ? a.demand.n : catN[scope];

  return (
    <>
      <PageTitle title="Market intelligence" subtitle={`${a.demand.n} valid jobs · ${ROLE_LABELS[ev.roleId]} · India · ${cur.label}`} />
      {ev.scanSummary.state === 'partial' && <PartialBanner summary={ev.scanSummary} />}

      <Segmented
        label="Company type"
        value={scope}
        onChange={(v) => {
          setScope(v);
          setLimit(25);
        }}
        options={[
          { value: 'all', label: `All (${a.demand.n})` },
          { value: 'startup', label: `Startup (${catN.startup})` },
          { value: 'mid', label: `Mid (${catN.mid})` },
          { value: 'large', label: `Large (${catN.large})` },
        ]}
      />
      <SearchField value={q} onChange={setQ} placeholder="Search skills" />
      <div className="jr-chips-scroll" role="group" aria-label="Skill category">
        <Chip selected={cat === 'all'} onClick={() => setCat('all')}>
          All categories
        </Chip>
        {SKILL_CATEGORIES.map((c) => (
          <Chip key={c.id} selected={cat === c.id} onClick={() => setCat(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>
      <div className="jr-split">
        <span className="jr-small jr-muted">
          {rows.length} skills · of {denominator} jobs
        </span>
        <Segmented
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'mentions', label: 'Mentions' },
            { value: 'required', label: 'Required' },
            { value: 'change', label: 'Change' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No skills match" body="Try a different search, category or company type." action={<Button variant="secondary" onClick={() => { setQ(''); setCat('all'); setScope('all'); }}>Clear filters</Button>} />
      ) : (
        <>
          <List>
            {rows.slice(0, limit).map((r) => (
              <SkillRow key={r.s.skillId} demand={r.s} trend={a.trends.get(r.s.skillId)} scope={r.scoped} />
            ))}
          </List>
          {rows.length > limit && (
            <Button variant="secondary" block onClick={() => setLimit(limit + 25)}>
              Show more ({rows.length - limit} left)
            </Button>
          )}
        </>
      )}
      <RequirementKey />
      <p className="jr-small jr-muted">
        Counts read “jobs mentioning the skill / jobs in the selected group”. “Required” means it appears under a requirements heading or with an explicit must-have cue; skills seen only in responsibilities or company blurbs count as “mentioned”.
      </p>
    </>
  );
}
