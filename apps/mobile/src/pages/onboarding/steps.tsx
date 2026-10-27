import { cloudUploadOutline, logoGithub } from 'ionicons/icons';
import { useRef, useState } from 'react';
import { ROLE_LABELS, SKILLS, SWITCH_TIMELINE_LABELS, getSkill, normalizeRole, type CompanyCategory, type RoleId, type SkillLevel, type SwitchTimeline, type UserProfile } from '@jobradar/core';
import { SkillPicker } from '../../components/domain/SkillPicker';
import { CategoryMark } from '../../components/ui/Markers';
import { Badge, Button, Card, Chip, Collapsible, Field, Segmented } from '../../components/ui/Primitives';
import { ImportError, skillsFromGithub, skillsFromText, type SkillSuggestion } from '../../lib/importers';

export interface StepProps {
  draft: UserProfile;
  patch: (p: Partial<UserProfile>) => void;
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

// ─────────────────────────────────────────────────────────────── About
export function AboutStep({ draft, patch }: StepProps) {
  const roles = ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full-Stack Developer', 'SDE-2', 'QA / SDET', 'Student / fresher'];
  return (
    <div className="jr-stack jr-stack--lg">
      <Field label="What should we call you? (optional)" htmlFor="ob-name">
        <input id="ob-name" className="jr-input" value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="First name" autoComplete="given-name" />
      </Field>
      <Field label="Your current role" htmlFor="ob-role" hint="Free text. This only helps us describe your goal back to you.">
        <input id="ob-role" className="jr-input" value={draft.currentRole} onChange={(e) => patch({ currentRole: e.target.value })} placeholder="e.g. Software Engineer" />
        <div className="jr-cluster" style={{ marginTop: 6 }}>
          {roles.map((r) => (
            <Chip key={r} selected={draft.currentRole === r} onClick={() => patch({ currentRole: r })}>
              {r}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Years of professional experience">
        <Stepper value={draft.yearsExperience} min={0} max={40} onChange={(v) => patch({ yearsExperience: v })} unit="yrs" />
      </Field>
    </div>
  );
}

export function Stepper({ value, min, max, step = 1, onChange, unit }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div className="jr-stepper" role="group" aria-label="Adjust value">
      <button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <output aria-live="polite">
        {value}
        {unit ? ` ${unit}` : ''}
      </output>
      <button type="button" aria-label="Increase" onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Role
const ROLE_OPTIONS: { id: RoleId; blurb: string }[] = [
  { id: 'frontend', blurb: 'Interfaces, components, performance, accessibility' },
  { id: 'backend', blurb: 'APIs, data, services, reliability' },
  { id: 'fullstack', blurb: 'Both sides of the product, end to end' },
  { id: 'software', blurb: 'Generalist software engineering roles' },
];

export function RoleStep({ draft, patch }: StepProps) {
  const custom = draft.targetRoleLabel != null;
  return (
    <div className="jr-stack">
      {ROLE_OPTIONS.map((r) => {
        const selected = !custom && draft.targetRoleId === r.id;
        return (
          <button key={r.id} type="button" role="radio" aria-checked={selected} className={`jr-option ${selected ? 'is-selected' : ''}`} onClick={() => patch({ targetRoleId: r.id, targetRoleLabel: undefined })}>
            <strong>{ROLE_LABELS[r.id]}</strong>
            <span className="jr-small jr-muted">{r.blurb}</span>
          </button>
        );
      })}
      <button type="button" role="radio" aria-checked={custom} className={`jr-option ${custom ? 'is-selected' : ''}`} onClick={() => patch({ targetRoleLabel: draft.targetRoleLabel ?? '' })}>
        <strong>Something else</strong>
        <span className="jr-small jr-muted">We’ll compare against the closest role family and keep your label.</span>
      </button>
      {custom && (
        <Field label="Your target role" htmlFor="ob-custom-role" hint={`Closest match: ${ROLE_LABELS[draft.targetRoleId]}`}>
          <input
            id="ob-custom-role"
            className="jr-input"
            value={draft.targetRoleLabel ?? ''}
            onChange={(e) => patch({ targetRoleLabel: e.target.value, targetRoleId: normalizeRole(e.target.value) ?? 'software' })}
            placeholder="e.g. Platform Engineer, Mobile Developer"
          />
        </Field>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Skills
const LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Working' },
  { value: 'advanced', label: 'Advanced' },
];

const COMMON = ['javascript', 'typescript', 'python', 'java', 'react', 'nodejs', 'sql', 'postgresql', 'docker', 'aws', 'git', 'rest', 'html-css', 'mongodb', 'kubernetes', 'go'];

export function SkillsStep({ draft, patch }: StepProps) {
  const have = new Map(draft.skills.map((s) => [s.skillId, s.level]));
  const setLevel = (id: string, level: SkillLevel) => patch({ skills: draft.skills.map((s) => (s.skillId === id ? { ...s, level } : s)) });
  const toggleSkill = (id: string) => patch({ skills: have.has(id) ? draft.skills.filter((s) => s.skillId !== id) : [...draft.skills, { skillId: id, level: 'intermediate' }] });
  const addMany = (ids: string[]) => patch({ skills: [...draft.skills, ...ids.filter((id) => !have.has(id)).map((id) => ({ skillId: id, level: 'intermediate' as SkillLevel }))] });

  return (
    <div className="jr-stack jr-stack--lg">
      <SkillPicker selected={new Set(have.keys())} onToggle={toggleSkill} suggested={COMMON} />
      {draft.skills.length > 0 && (
        <div className="jr-stack">
          <h3 className="jr-h3">How well do you know them?</h3>
          <Card flush>
            {draft.skills.map((s) => (
              <div key={s.skillId} className="jr-levelrow">
                <span className="jr-levelrow__name">{getSkill(s.skillId)?.name ?? s.skillId}</span>
                <Segmented label={`Level for ${getSkill(s.skillId)?.name}`} value={s.level} onChange={(v) => setLevel(s.skillId, v)} options={LEVELS} />
              </div>
            ))}
          </Card>
          <p className="jr-small jr-muted">Be honest: gap analysis treats “Beginner” as something to deepen, not as a strength.</p>
        </div>
      )}
      <Card flush>
        <Collapsible title="Import from resume text or GitHub">
          <ImportPanel existing={new Set(have.keys())} onAdd={addMany} onGithub={(u) => patch({ imports: { ...draft.imports, github: u } })} />
        </Collapsible>
      </Card>
    </div>
  );
}

function ImportPanel({ existing, onAdd, onGithub }: { existing: Set<string>; onAdd: (ids: string[]) => void; onGithub: (u: string) => void }) {
  const [text, setText] = useState('');
  const [user, setUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ source: string; items: SkillSuggestion[]; note?: string } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const show = (source: string, items: SkillSuggestion[], note?: string) => {
    const fresh = items.filter((i) => !existing.has(i.skillId));
    setFound({ source, items: fresh, note });
    setPicked(fresh.slice(0, 12).map((i) => i.skillId));
    setError(null);
  };

  return (
    <div className="jr-stack">
      <Field label="Paste resume text" htmlFor="imp-text" hint="Skills are found in your browser with the same matcher that reads job descriptions. Nothing is uploaded.">
        <textarea id="imp-text" className="jr-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the skills / experience section of your resume" />
      </Field>
      <Button variant="secondary" disabled={text.trim().length < 20} onClick={() => show('resume text', skillsFromText(text))}>
        Find skills in text
      </Button>
      <hr className="jr-hr" />
      <Field label="GitHub username" htmlFor="imp-gh" hint="Reads public repository languages and topics only.">
        <input id="imp-gh" className="jr-input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="octocat" autoCapitalize="off" autoCorrect="off" />
      </Field>
      <Button
        variant="secondary"
        icon={logoGithub}
        disabled={busy || !user.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await skillsFromGithub(user);
            show('GitHub', r.suggestions, `${r.repoCount} public non-fork repositories scanned.`);
            onGithub(user.trim());
          } catch (e) {
            setError(e instanceof ImportError ? e.message : 'Something went wrong while importing.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Reading GitHub…' : 'Import from GitHub'}
      </Button>
      {error && (
        <p className="jr-small jr-warn-text" role="alert">
          {error}
        </p>
      )}
      {found && (
        <div className="jr-stack" aria-live="polite">
          <div className="jr-split">
            <strong>Found in {found.source}</strong>
            <Badge tone="neutral">{found.items.length} new</Badge>
          </div>
          {found.note && <p className="jr-small jr-muted">{found.note}</p>}
          {found.items.length === 0 ? (
            <p className="jr-muted">Nothing new to add.</p>
          ) : (
            <>
              <p className="jr-small jr-muted">Suggestions only. Untick anything that isn’t really yours.</p>
              <div className="jr-cluster">
                {found.items.map((i) => (
                  <Chip key={i.skillId} selected={picked.includes(i.skillId)} onClick={() => setPicked(toggle(picked, i.skillId))}>
                    {getSkill(i.skillId)?.name} · {i.count}
                  </Chip>
                ))}
              </div>
              <Button
                disabled={picked.length === 0}
                onClick={() => {
                  onAdd(picked);
                  setFound(null);
                }}
              >
                Add {picked.length} skill{picked.length === 1 ? '' : 's'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Interests
export function InterestsStep({ draft, patch }: StepProps) {
  return (
    <div className="jr-stack">
      <p className="jr-muted">Languages and tools you’d like to work with next, even if you haven’t yet. We’ll use this to favour matching jobs, never to hide evidence.</p>
      <SkillPicker selected={new Set(draft.preferredSkillIds)} onToggle={(id) => patch({ preferredSkillIds: toggle(draft.preferredSkillIds, id) })} suggested={COMMON} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Preferences
const CITIES = ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Chennai', 'Gurugram', 'Kolkata', 'Ahmedabad', 'Noida'];
const INDUSTRIES = ['Fintech', 'SaaS', 'E-commerce', 'Healthtech', 'AI / Data', 'Logistics', 'Edtech', 'Developer tools', 'Banking', 'Mobility', 'Media', 'Enterprise IT'];

export function PreferencesStep({ draft, patch }: StepProps) {
  const [city, setCity] = useState('');
  const loc = draft.locations;
  const setLoc = (p: Partial<UserProfile['locations']>) => patch({ locations: { ...loc, ...p } });
  const cats: { id: CompanyCategory; label: string; blurb: string }[] = [
    { id: 'startup', label: 'Startups', blurb: 'under 200 people' },
    { id: 'mid', label: 'Mid-sized', blurb: '200–2,999' },
    { id: 'large', label: 'Large / MNC', blurb: '3,000+' },
  ];
  const allCities = [...new Set([...CITIES, ...loc.cities])];
  return (
    <div className="jr-stack jr-stack--lg">
      <div className="jr-stack" style={{ gap: 8 }}>
        <h3 className="jr-h3">Where?</h3>
        <div className="jr-cluster">
          <Chip selected={loc.countries.includes('India')} onClick={() => setLoc({ countries: toggle(loc.countries, 'India') })}>
            India
          </Chip>
          {loc.countries.filter((c) => c !== 'India').map((c) => (
            <Chip key={c} selected onClick={() => setLoc({ countries: toggle(loc.countries, c) })}>
              {c}
            </Chip>
          ))}
        </div>
        <div className="jr-cluster">
          {allCities.map((c) => (
            <Chip key={c} selected={loc.cities.includes(c)} onClick={() => setLoc({ cities: toggle(loc.cities, c) })}>
              {c}
            </Chip>
          ))}
        </div>
        <form
          className="jr-addrow"
          onSubmit={(e) => {
            e.preventDefault();
            const v = city.trim();
            if (v) {
              setLoc({ cities: loc.cities.includes(v) ? loc.cities : [...loc.cities, v] });
              setCity('');
            }
          }}
        >
          <input className="jr-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Add another city" aria-label="Add another city" />
          <Button type="submit" variant="secondary" disabled={!city.trim()}>
            Add
          </Button>
        </form>
        <span className="jr-overline" style={{ marginTop: 6 }}>
          Work arrangement
        </span>
        <div className="jr-cluster">
          <Chip selected={loc.remote} onClick={() => setLoc({ remote: !loc.remote })}>
            Remote
          </Chip>
          <Chip selected={loc.hybrid} onClick={() => setLoc({ hybrid: !loc.hybrid })}>
            Hybrid
          </Chip>
          <Chip selected={loc.onsite} onClick={() => setLoc({ onsite: !loc.onsite })}>
            On-site
          </Chip>
        </div>
      </div>
      <div className="jr-stack" style={{ gap: 8 }}>
        <h3 className="jr-h3">What kind of company?</h3>
        <div className="jr-cluster">
          <Chip selected={draft.companyCategories.length === 0} onClick={() => patch({ companyCategories: [] })}>
            All
          </Chip>
          {cats.map((c) => (
            <Chip key={c.id} selected={draft.companyCategories.includes(c.id)} onClick={() => patch({ companyCategories: toggle(draft.companyCategories, c.id) })}>
              <CategoryMark category={c.id} /> {c.label}
            </Chip>
          ))}
        </div>
        <p className="jr-small jr-muted">Sizes: startups under 200 people, mid-sized 200–2,999, large 3,000+. The market view always shows all three so you can compare.</p>
      </div>
      <div className="jr-stack" style={{ gap: 8 }}>
        <h3 className="jr-h3">Industries (optional)</h3>
        <div className="jr-cluster">
          {INDUSTRIES.map((i) => (
            <Chip key={i} selected={draft.industries.includes(i)} onClick={() => patch({ industries: toggle(draft.industries, i) })}>
              {i}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Compensation
const toL = (v?: number) => (v == null ? '' : String(v / 100_000));
const fromL = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Math.round(Number(s) * 100_000));

export function CompensationStep({ draft, patch }: StepProps) {
  const sal = draft.salary;
  const set = (p: Partial<UserProfile['salary']>) => patch({ salary: { ...sal, ...p } });
  const bad = sal.expectedMin != null && sal.expectedMax != null && sal.expectedMin > sal.expectedMax;
  return (
    <div className="jr-stack jr-stack--lg">
      <p className="jr-muted">All optional. Figures stay on your device and are only used to compare against published salary ranges (which only some postings include).</p>
      <Field label="Current annual salary (LPA)" htmlFor="sal-cur" hint="Never shown to anyone.">
        <input id="sal-cur" className="jr-input" inputMode="decimal" value={toL(sal.current)} onChange={(e) => set({ current: fromL(e.target.value) })} placeholder="e.g. 18" />
      </Field>
      <div className="jr-grid-2">
        <Field label="Expected min (LPA)" htmlFor="sal-min">
          <input id="sal-min" className="jr-input" inputMode="decimal" value={toL(sal.expectedMin)} onChange={(e) => set({ expectedMin: fromL(e.target.value) })} placeholder="28" />
        </Field>
        <Field label="Expected max (LPA)" htmlFor="sal-max">
          <input id="sal-max" className="jr-input" inputMode="decimal" value={toL(sal.expectedMax)} onChange={(e) => set({ expectedMax: fromL(e.target.value) })} placeholder="35" />
        </Field>
      </div>
      {bad && (
        <p className="jr-small jr-warn-text" role="alert">
          Your minimum is higher than your maximum.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Timeline
export function TimelineStep({ draft, patch }: StepProps) {
  const notice = [0, 15, 30, 60, 90];
  return (
    <div className="jr-stack jr-stack--lg">
      <div className="jr-stack" style={{ gap: 8 }}>
        <h3 className="jr-h3">When do you want to switch?</h3>
        <div className="jr-cluster">
          {(Object.keys(SWITCH_TIMELINE_LABELS) as SwitchTimeline[]).map((t) => (
            <Chip key={t} selected={draft.switchTimeline === t} onClick={() => patch({ switchTimeline: t })}>
              {t === 'asap' ? 'ASAP' : t === 'exploring' ? 'Just exploring' : `${t.replace('-', '–')} months`}
            </Chip>
          ))}
        </div>
      </div>
      <div className="jr-stack" style={{ gap: 8 }}>
        <h3 className="jr-h3">Notice period</h3>
        <div className="jr-cluster">
          {notice.map((d) => (
            <Chip key={d} selected={draft.noticePeriodDays === d} onClick={() => patch({ noticePeriodDays: d })}>
              {d === 0 ? 'Immediate' : `${d} days`}
            </Chip>
          ))}
          <Chip selected={draft.noticePeriodDays == null} onClick={() => patch({ noticePeriodDays: undefined })}>
            Skip
          </Chip>
        </div>
      </div>
      <Field label="Hours per week you can spend learning" hint="Used to size the roadmap.">
        <Stepper value={draft.weeklyLearningHours} min={1} max={40} onChange={(v) => patch({ weeklyLearningHours: v })} unit="h/week" />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Resume
export function ResumeStep({ draft, patch }: StepProps) {
  const [text, setText] = useState(draft.resumeText ?? '');
  const [keep, setKeep] = useState(!!draft.resumeText);
  const [msg, setMsg] = useState<string | null>(null);
  const [found, setFound] = useState<SkillSuggestion[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const have = new Set(draft.skills.map((s) => s.skillId));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(txt|md|text)$/i.test(f.name) && f.type !== 'text/plain') {
      setMsg('PDF and Word parsing arrives with the backend. For now, paste the text or upload a .txt file.');
      return;
    }
    setMsg(null);
    setText(await f.text());
  };

  return (
    <div className="jr-stack jr-stack--lg">
      <p className="jr-muted">Optional. Used once to suggest skills. It is processed in your browser, never uploaded, and not stored unless you choose to.</p>
      <Field label="Resume text" htmlFor="rs-text">
        <textarea id="rs-text" className="jr-textarea" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume here" />
      </Field>
      <input ref={fileRef} type="file" accept=".txt,.md,text/plain" hidden onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Upload resume text file" />
      <div className="jr-grid-2">
        <Button variant="secondary" icon={cloudUploadOutline} onClick={() => fileRef.current?.click()}>
          Upload .txt
        </Button>
        <Button
          disabled={text.trim().length < 20}
          onClick={() => {
            const s = skillsFromText(text).filter((x) => !have.has(x.skillId));
            setFound(s);
            patch({ resumeText: keep ? text : undefined, imports: { ...draft.imports, resume: true } });
          }}
        >
          Find skills
        </Button>
      </div>
      {msg && <p className="jr-small jr-warn-text">{msg}</p>}
      <label className="jr-toggle-row jr-card" style={{ padding: '12px 16px' }}>
        <div>
          <strong>Keep resume text on this device</strong>
          <span className="jr-small jr-muted">Off by default. Delete it any time in settings.</span>
        </div>
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--primary)' }} />
      </label>
      {found && (
        <div className="jr-stack" aria-live="polite">
          <strong>{found.length ? `${found.length} skills not yet on your profile` : 'No new skills found'}</strong>
          <div className="jr-cluster">
            {found.slice(0, 24).map((f) => (
              <Chip key={f.skillId} onClick={() => { patch({ skills: [...draft.skills, { skillId: f.skillId, level: 'intermediate' }] }); setFound(found.filter((x) => x.skillId !== f.skillId)); }}>
                + {getSkill(f.skillId)?.name}
              </Chip>
            ))}
          </div>
          <p className="jr-small jr-muted">Tap to add. You can set levels in the Skills step.</p>
        </div>
      )}
    </div>
  );
}

export const SKILL_COUNT = SKILLS.length;
