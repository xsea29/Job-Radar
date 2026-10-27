import { IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonToolbar } from '@ionic/react';
import { arrowBack, checkmarkCircle, flashOutline, shieldCheckmarkOutline, statsChartOutline } from 'ionicons/icons';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS, SWITCH_TIMELINE_LABELS, getSkill, type UserProfile } from '@jobradar/core';
import { DEMO_PROFILE } from '@jobradar/demo';
import { DemoPill, Logo } from '../components/ui/Page';
import { Badge, Button, Card, ProgressBar } from '../components/ui/Primitives';
import { lpaRange } from '../lib/format';
import { useProfile } from '../state/profile';
import { AboutStep, CompensationStep, InterestsStep, PreferencesStep, ResumeStep, RoleStep, SkillsStep, TimelineStep, type StepProps } from './onboarding/steps';

interface StepDef {
  id: string;
  title: string;
  help: string;
  optional?: boolean;
  render: (p: StepProps) => ReactNode;
  valid?: (d: UserProfile) => string | null;
}

const STEPS: StepDef[] = [
  { id: 'about', title: 'About you', help: 'A few basics so the numbers can be personal.', render: (p) => <AboutStep {...p} /> },
  {
    id: 'role',
    title: 'Your target role',
    help: 'Everything is analysed against jobs for this role.',
    render: (p) => <RoleStep {...p} />,
    valid: (d) => (d.targetRoleLabel != null && !d.targetRoleLabel.trim() ? 'Type the role you’re aiming for, or pick one above.' : null),
  },
  { id: 'skills', title: 'Your skills', help: 'Languages, frameworks, databases and tools you’ve used.', optional: true, render: (p) => <SkillsStep {...p} /> },
  { id: 'interests', title: 'What you’d like to use', help: 'Technologies you’re drawn to.', optional: true, render: (p) => <InterestsStep {...p} /> },
  { id: 'prefs', title: 'Where and with whom', help: 'Locations, work arrangement and company types.', render: (p) => <PreferencesStep {...p} /> },
  {
    id: 'pay',
    title: 'Compensation',
    help: 'Optional and private.',
    optional: true,
    render: (p) => <CompensationStep {...p} />,
    valid: (d) => (d.salary.expectedMin != null && d.salary.expectedMax != null && d.salary.expectedMin > d.salary.expectedMax ? 'Minimum can’t be higher than maximum.' : null),
  },
  { id: 'time', title: 'Timeline', help: 'How soon, and how much time you have to prepare.', render: (p) => <TimelineStep {...p} /> },
  { id: 'resume', title: 'Resume', help: 'Optional shortcut for finding skills.', optional: true, render: (p) => <ResumeStep {...p} /> },
];

export default function Onboarding() {
  const { profile, replace } = useProfile();
  const nav = useNavigate();
  const [draft, setDraft] = useState<UserProfile>({ ...profile, onboardingComplete: false });
  const [step, setStep] = useState(0); // 0 = welcome, 1..n = STEPS, n+1 = summary
  const total = STEPS.length + 1; // steps + summary
  const patch = (p: Partial<UserProfile>) => setDraft((d) => ({ ...d, ...p }));
  const isWelcome = step === 0;
  const isSummary = step === STEPS.length + 1;
  const def = !isWelcome && !isSummary ? STEPS[step - 1]! : null;
  const error = def?.valid?.(draft) ?? null;

  const finish = () => {
    replace({ ...draft, onboardingComplete: true });
    nav('/scan?auto=1', { replace: true });
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <div className="jr-header">
            {step > 0 ? (
              <button type="button" className="jr-icon-btn" onClick={() => setStep(step - 1)} aria-label="Previous step">
                <IonIcon icon={arrowBack} />
              </button>
            ) : (
              <Logo />
            )}
            <div className="jr-header__title">{isWelcome ? 'JobRadar' : `Step ${step} of ${total}`}</div>
            <DemoPill />
          </div>
          {step > 0 && (
            <div className="jr-ob-progress">
              <ProgressBar value={step} max={total} label={`Step ${step} of ${total}`} />
            </div>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <main className="jr-page">
          {isWelcome && <Welcome onStart={() => setStep(1)} onSample={() => { setDraft({ ...DEMO_PROFILE, onboardingComplete: false }); setStep(total); }} />}
          {def && (
            <>
              <div className="jr-stack">
                <h1 className="jr-h1">{def.title}</h1>
                <p className="jr-muted">{def.help}</p>
              </div>
              {def.render({ draft, patch })}
              {error && (
                <p className="jr-small jr-warn-text" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
          {isSummary && <Summary draft={draft} goto={setStep} />}
        </main>
      </IonContent>
      {!isWelcome && (
        <IonFooter className="ion-no-border">
          <div className="jr-ob-foot">
            {isSummary ? (
              <Button block onClick={finish} icon={flashOutline}>
                Start my first scan
              </Button>
            ) : (
              <>
                {def?.optional && (
                  <Button variant="ghost" onClick={() => setStep(step + 1)}>
                    Skip
                  </Button>
                )}
                <Button block disabled={!!error} onClick={() => setStep(step + 1)}>
                  Continue
                </Button>
              </>
            )}
          </div>
        </IonFooter>
      )}
    </IonPage>
  );
}

function Welcome({ onStart, onSample }: { onStart: () => void; onSample: () => void }) {
  const points = [
    { icon: statsChartOutline, title: 'Evidence, not hype', body: 'Skills are counted in up to 100 real job descriptions that match you. Every figure links back to the jobs.' },
    { icon: shieldCheckmarkOutline, title: 'Honest about gaps', body: 'If only 63 jobs could be collected, you’ll see 63/100, never a rounded-up claim.' },
    { icon: flashOutline, title: 'Personal to you', body: 'Your target role, skills and preferences shape every match and recommendation.' },
  ];
  return (
    <>
      <div className="jr-stack">
        <h1 className="jr-h1">Know what employers actually ask for.</h1>
        <p className="jr-muted" style={{ fontSize: 16 }}>
          JobRadar analyses real job descriptions so you can plan a switch with evidence instead of trends. Setup takes about two minutes, and most steps can be skipped.
        </p>
      </div>
      <div className="jr-stack">
        {points.map((p) => (
          <Card key={p.title} className="jr-point">
            <span className="jr-iconbox">
              <IonIcon icon={p.icon} aria-hidden="true" />
            </span>
            <div>
              <strong>{p.title}</strong>
              <p className="jr-small jr-muted">{p.body}</p>
            </div>
          </Card>
        ))}
      </div>
      <Card tone="accent">
        <strong>This build uses demo data</strong>
        <p className="jr-small" style={{ marginTop: 4 }}>
          Jobs and companies are synthetic and labelled so. The analysis code that produces the numbers is real.
        </p>
      </Card>
      <div className="jr-stack">
        <Button block onClick={onStart}>
          Set up my profile
        </Button>
        <Button block variant="secondary" onClick={onSample}>
          Use the sample profile (Sagar)
        </Button>
      </div>
    </>
  );
}

function Summary({ draft, goto }: { draft: UserProfile; goto: (s: number) => void }) {
  const loc = draft.locations;
  const arrangement = [loc.remote && 'Remote', loc.hybrid && 'Hybrid', loc.onsite && 'On-site'].filter(Boolean).join(', ') || 'Any';
  const rows: { step: number; label: string; value: ReactNode }[] = [
    { step: 1, label: 'You', value: `${draft.name || 'Unnamed'} · ${draft.currentRole || 'role not set'} · ${draft.yearsExperience} yrs` },
    { step: 2, label: 'Target role', value: draft.targetRoleLabel || ROLE_LABELS[draft.targetRoleId] },
    {
      step: 3,
      label: 'Skills',
      value: draft.skills.length ? (
        <span className="jr-cluster">
          {draft.skills.slice(0, 10).map((s) => (
            <Badge key={s.skillId} tone="primary">
              {getSkill(s.skillId)?.name}
            </Badge>
          ))}
          {draft.skills.length > 10 && <Badge tone="neutral">+{draft.skills.length - 10}</Badge>}
        </span>
      ) : (
        'None added. Everything will show as a gap.'
      ),
    },
    { step: 4, label: 'Wants to use', value: draft.preferredSkillIds.map((id) => getSkill(id)?.name).join(', ') || 'Not set' },
    { step: 5, label: 'Where & who', value: `${loc.cities.join(', ') || 'Any city'} · ${arrangement} · ${draft.companyCategories.length ? draft.companyCategories.join(', ') : 'all company types'}` },
    { step: 6, label: 'Expected pay', value: draft.salary.expectedMin || draft.salary.expectedMax ? lpaRange(draft.salary.expectedMin, draft.salary.expectedMax) : 'Not set' },
    { step: 7, label: 'Timeline', value: `Switching ${SWITCH_TIMELINE_LABELS[draft.switchTimeline]}${draft.noticePeriodDays != null ? ` · ${draft.noticePeriodDays}-day notice` : ''} · ${draft.weeklyLearningHours} h/week` },
  ];
  return (
    <>
      <div className="jr-stack">
        <span className="jr-badge jr-badge--success" style={{ alignSelf: 'flex-start' }}>
          <IonIcon icon={checkmarkCircle} /> Ready
        </span>
        <h1 className="jr-h1">Your profile</h1>
        <p className="jr-muted">Check it over. You can change anything later in settings.</p>
      </div>
      <Card flush>
        {rows.map((r) => (
          <div key={r.label} className="jr-sumrow">
            <div className="jr-sumrow__main">
              <span className="jr-overline">{r.label}</span>
              <span>{r.value}</span>
            </div>
            <button type="button" className="jr-link" onClick={() => goto(r.step)}>
              Edit
            </button>
          </div>
        ))}
      </Card>
      <p className="jr-small jr-muted">Next, JobRadar collects job descriptions that fit this profile. Nothing is applied for on your behalf.</p>
    </>
  );
}
