import { SKILLS, SKILL_CATEGORIES, getSkill } from '@jobradar/core';
import { useMemo, useState } from 'react';
import { Chip, Collapsible } from '../ui/Primitives';
import { SearchField } from '../ui/SearchField';

/** Searchable, category-grouped skill selector shared by onboarding, settings and filters. */
export function SkillPicker({ selected, onToggle, suggested = [], placeholder = 'Search skills, e.g. React, Docker, SQL' }: { selected: ReadonlySet<string>; onToggle: (id: string) => void; suggested?: string[]; placeholder?: string }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query) return [];
    return SKILLS.filter((s) => s.name.toLowerCase().includes(query) || [...s.aliases, ...(s.caseSensitiveAliases ?? [])].some((a) => a.toLowerCase().includes(query))).slice(0, 30);
  }, [query]);

  return (
    <div className="jr-stack">
      <SearchField value={q} onChange={setQ} placeholder={placeholder} label="Search skills" />
      {selected.size > 0 && (
        <div className="jr-stack" style={{ gap: 8 }}>
          <span className="jr-overline">Selected ({selected.size})</span>
          <div className="jr-cluster">
            {[...selected].map((id) => (
              <Chip key={id} selected onClick={() => onToggle(id)} ariaLabel={`Remove ${getSkill(id)?.name ?? id}`}>
                {getSkill(id)?.name ?? id}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {query ? (
        results.length ? (
          <div className="jr-cluster">
            {results.map((s) => (
              <Chip key={s.id} selected={selected.has(s.id)} onClick={() => onToggle(s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="jr-muted">No skill matches “{q}”. The taxonomy covers {SKILLS.length} skills.</p>
        )
      ) : (
        <>
          {suggested.length > 0 && (
            <div className="jr-stack" style={{ gap: 8 }}>
              <span className="jr-overline">Common</span>
              <div className="jr-cluster">
                {suggested.map((id) => (
                  <Chip key={id} selected={selected.has(id)} onClick={() => onToggle(id)}>
                    {getSkill(id)?.name ?? id}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <div className="jr-card jr-card--flush">
            {SKILL_CATEGORIES.map((c) => (
              <Collapsible key={c.id} title={c.label} meta={<span className="jr-small jr-muted">{SKILLS.filter((s) => s.category === c.id).length}</span>}>
                <div className="jr-cluster">
                  {SKILLS.filter((s) => s.category === c.id).map((s) => (
                    <Chip key={s.id} selected={selected.has(s.id)} onClick={() => onToggle(s.id)}>
                      {s.name}
                    </Chip>
                  ))}
                </div>
              </Collapsible>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
