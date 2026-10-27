import { IonRange, IonToggle } from '@ionic/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_MATCH_WEIGHTS, ROLE_LABELS, SWITCH_TIMELINE_LABELS, getSkill, type MatchWeights, type UserProfile } from '@jobradar/core';
import { Page } from '../components/ui/Page';
import { Badge, Button, Card, Chip, List, Overline, Row, SectionHeader, Segmented } from '../components/ui/Primitives';
import { Sheet } from '../components/ui/Sheet';
import { lpaRange } from '../lib/format';
import { useProfile } from '../state/profile';
import { IS_DEMO } from '../data/source';
import { useSettings, type DemoScenario, type ThemePref } from '../state/settings';
import { AboutStep, CompensationStep, InterestsStep, PreferencesStep, ResumeStep, RoleStep, SkillsStep, Stepper, TimelineStep, type StepProps } from './onboarding/steps';

type Section = 'about' | 'role' | 'skills' | 'interests' | 'prefs' | 'pay' | 'time' | 'resume';

const SECTIONS: Record<Section, { title: string; render: (p: StepProps) => React.ReactNode }> = {
  about: { title: 'About you', render: (p) => <AboutStep {...p} /> },
  role: { title: 'Target role', render: (p) => <RoleStep {...p} /> },
  skills: { title: 'Skills', render: (p) => <SkillsStep {...p} /> },
  interests: { title: 'Technologies you want to use', render: (p) => <InterestsStep {...p} /> },
  prefs: { title: 'Locations & companies', render: (p) => <PreferencesStep {...p} /> },
  pay: { title: 'Compensation', render: (p) => <CompensationStep {...p} /> },
  time: { title: 'Timeline & learning time', render: (p) => <TimelineStep {...p} /> },
  resume: { title: 'Resume', render: (p) => <ResumeStep {...p} /> },
};

const WEIGHT_LABELS: Record<keyof MatchWeights, string> = {
  required: 'Required skills',
  preferred: 'Preferred skills',
  experience: 'Experience',
  role: 'Role alignment',
  location: 'Location',
  salary: 'Salary',
};

export default function Settings() {
  const { profile, update, deleteAll } = useProfile();
  const { settings, update: updateSettings, reset } = useSettings();
  const nav = useNavigate();
  const [section, setSection] = useState<Section | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const n = settings.notifications;
  const setN = (p: Partial<typeof n>) => updateSettings({ notifications: { ...n, ...p } });
  const sc = settings.scan;
  const setScan = (p: Partial<typeof sc>) => updateSettings({ scan: { ...sc, ...p } });
  const quotaSum = sc.startup + sc.mid + sc.large;

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jobradar-my-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page title="Profile & settings" backHref="/tabs/more">
      <div className="jr-stack">
        <h1 className="jr-h1">{profile.name || 'Your profile'}</h1>
        <p className="jr-muted">
          {profile.currentRole || 'Role not set'} · {profile.yearsExperience} yrs → {profile.targetRoleLabel || ROLE_LABELS[profile.targetRoleId]}
        </p>
      </div>

      <section className="jr-stack">
        <SectionHeader title="Profile" />
        <List>
          <Row title="About you" subtitle={`${profile.currentRole || 'Role not set'} · ${profile.yearsExperience} yrs`} onClick={() => setSection('about')} />
          <Row title="Target role" subtitle={profile.targetRoleLabel || ROLE_LABELS[profile.targetRoleId]} onClick={() => setSection('role')} />
          <Row title="Skills" subtitle={`${profile.skills.length} listed${profile.imports.github ? ` · GitHub @${profile.imports.github}` : ''}`} onClick={() => setSection('skills')} />
          <Row title="Technologies you want to use" subtitle={profile.preferredSkillIds.map((id) => getSkill(id)?.name).join(', ') || 'Not set'} onClick={() => setSection('interests')} />
          <Row title="Locations & companies" subtitle={`${profile.locations.cities.join(', ') || 'Any city'} · ${profile.companyCategories.length ? profile.companyCategories.join(', ') : 'all company types'}`} onClick={() => setSection('prefs')} />
          <Row title="Compensation" subtitle={profile.salary.expectedMin || profile.salary.expectedMax ? lpaRange(profile.salary.expectedMin, profile.salary.expectedMax) : 'Not set'} onClick={() => setSection('pay')} />
          <Row title="Timeline & learning time" subtitle={`Switching ${SWITCH_TIMELINE_LABELS[profile.switchTimeline]} · ${profile.weeklyLearningHours} h/week`} onClick={() => setSection('time')} />
          <Row title="Resume" subtitle={profile.resumeText ? 'Text saved on this device' : 'Not stored'} onClick={() => setSection('resume')} />
        </List>
      </section>

      <section className="jr-stack">
        <SectionHeader title="Notifications" subtitle="Delivery history is kept in the daily reports." />
        <Card flush>
          <Toggle label="In-app daily report" checked={n.inApp} onChange={(v) => setN({ inApp: v })} />
          <Toggle label="Push notifications" hint="Needs the native app" checked={n.push} onChange={(v) => setN({ push: v })} />
          <Toggle label="Email digest" hint="Off by default" checked={n.email} onChange={(v) => setN({ email: v })} />
          <Toggle label="Only when something significant changes" hint="Skips repetitive, low-value alerts" checked={n.onlyWhenSignificant} onChange={(v) => setN({ onlyWhenSignificant: v })} />
          <div className="jr-toggle-row">
            <div>
              <strong>Notify for matches from</strong>
              <span className="jr-small jr-muted">New jobs scoring at least this</span>
            </div>
            <Stepper value={n.matchThreshold} min={50} max={95} step={5} onChange={(v) => setN({ matchThreshold: v })} />
          </div>
        </Card>
      </section>

      <section className="jr-stack">
        <SectionHeader title="Scan configuration" subtitle="Applied on the next scan. Defaults follow the product spec." />
        <Card className="jr-stack">
          <div className="jr-split">
            <span>Target valid jobs</span>
            <Stepper value={sc.target} min={20} max={200} step={10} onChange={(v) => setScan({ target: v })} />
          </div>
          <div className="jr-split">
            <span>Startups</span>
            <Stepper value={sc.startup} min={0} max={100} step={5} onChange={(v) => setScan({ startup: v })} />
          </div>
          <div className="jr-split">
            <span>Mid-sized</span>
            <Stepper value={sc.mid} min={0} max={100} step={5} onChange={(v) => setScan({ mid: v })} />
          </div>
          <div className="jr-split">
            <span>Large / MNC</span>
            <Stepper value={sc.large} min={0} max={100} step={5} onChange={(v) => setScan({ large: v })} />
          </div>
          {quotaSum !== sc.target && (
            <p className="jr-small jr-warn-text" role="alert">
              Company-type targets add up to {quotaSum}, not {sc.target}. The scan will still run but its distribution won’t match the target.
            </p>
          )}
          <Overline>Published within</Overline>
          <Segmented label="Published within" value={String(sc.postedWithinDays)} onChange={(v) => setScan({ postedWithinDays: Number(v) })} options={[{ value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '60', label: '60 days' }]} />
        </Card>
      </section>

      <section className="jr-stack">
        <SectionHeader title="Match scoring" subtitle="Weights are relative. Components with missing data are left out, not penalised." />
        <Card className="jr-stack">
          {(Object.keys(WEIGHT_LABELS) as (keyof MatchWeights)[]).map((k) => (
            <div key={k} className="jr-stack" style={{ gap: 2 }}>
              <div className="jr-split">
                <span className="jr-small">
                  <strong>{WEIGHT_LABELS[k]}</strong>
                </span>
                <span className="mono jr-small">{Math.round(settings.matchWeights[k] * 100)}</span>
              </div>
              <IonRange aria-label={WEIGHT_LABELS[k]} min={0} max={60} step={5} value={Math.round(settings.matchWeights[k] * 100)} onIonInput={(e) => updateSettings({ matchWeights: { ...settings.matchWeights, [k]: Number(e.detail.value) / 100 } })} />
            </div>
          ))}
          <Button variant="secondary" onClick={() => updateSettings({ matchWeights: { ...DEFAULT_MATCH_WEIGHTS } })}>
            Reset to defaults
          </Button>
        </Card>
      </section>

      <section className="jr-stack">
        <SectionHeader title="Appearance" />
        <Segmented label="Theme" value={settings.theme} onChange={(v: ThemePref) => updateSettings({ theme: v })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </section>

      {IS_DEMO && <section className="jr-stack">
        <SectionHeader title="Demo controls" subtitle="Only in the demo build: preview the app’s non-happy states." />
        <Card tone="accent" className="jr-stack">
          <div className="jr-cluster">
            {(
              [
                ['complete', 'Complete 100/100'],
                ['partial', 'Partial 63/100'],
                ['empty', 'No scan yet'],
                ['error', 'Service error'],
                ['slow', 'Slow loading'],
              ] as [DemoScenario, string][]
            ).map(([v, label]) => (
              <Chip key={v} selected={settings.scenario === v} onClick={() => updateSettings({ scenario: v })}>
                {label}
              </Chip>
            ))}
          </div>
          <p className="jr-small">Switch scenario, then open Home, Market or Jobs to see how each state looks.</p>
        </Card>
      </section>}

      <section className="jr-stack">
        <SectionHeader title="Data & privacy" subtitle="Your profile is stored on this device only in the demo build." />
        <List>
          <Row title="Export my data" subtitle="Download profile and settings as JSON" onClick={exportData} chevron={false} meta={<Badge tone="neutral">JSON</Badge>} />
          <Row title="Delete resume text" subtitle={profile.resumeText ? 'Remove the saved resume text' : 'Nothing stored'} onClick={() => update({ resumeText: undefined })} chevron={false} />
          <Row title={<span style={{ color: 'var(--danger)' }}>Delete all my data</span>} subtitle="Profile, settings and progress. Can’t be undone." onClick={() => setConfirmDelete(true)} />
        </List>
        <p className="jr-small jr-muted">JobRadar never auto-applies to jobs and never collects applicants’ contact details.</p>
      </section>

      {section && <SectionEditor key={section} section={section} profile={profile} onSave={(p) => { update(p); setSection(null); }} onClose={() => setSection(null)} />}

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete all your data?">
        <p>This removes your profile, skills, roadmap progress and settings from this device. You’ll go back to onboarding.</p>
        <Button variant="danger" block onClick={() => { deleteAll(); reset(); setConfirmDelete(false); nav('/onboarding', { replace: true }); }}>
          Delete everything
        </Button>
        <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>
          Keep my data
        </Button>
      </Sheet>
    </Page>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="jr-toggle-row">
      <div>
        <strong>{label}</strong>
        {hint && <span className="jr-small jr-muted">{hint}</span>}
      </div>
      <IonToggle aria-label={label} checked={checked} onIonChange={(e) => onChange(e.detail.checked)} />
    </div>
  );
}

function SectionEditor({ section, profile, onSave, onClose }: { section: Section; profile: UserProfile; onSave: (p: UserProfile) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const def = SECTIONS[section];
  return (
    <Sheet
      open
      onClose={onClose}
      size="tall"
      title={def.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button block onClick={() => onSave(draft)}>
            Save changes
          </Button>
        </>
      }
    >
      {def.render({ draft, patch: (p) => setDraft((d) => ({ ...d, ...p })) })}
    </Sheet>
  );
}
