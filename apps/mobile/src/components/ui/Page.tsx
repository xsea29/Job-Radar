import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/react';
import { useState, type ReactNode } from 'react';
import { DEMO_NOTICE } from '@jobradar/demo';
import { Sheet } from './Sheet';
import { Button } from './Primitives';
import { IS_DEMO } from '../../data/source';

export function Logo() {
  return (
    <span className="jr-logo" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
        <circle cx="16" cy="16" r="10.5" />
        <circle cx="16" cy="16" r="4.6" />
        <path d="M16 16 24 8" />
      </svg>
    </span>
  );
}

/** Visible on every screen while the app is showing synthetic data. */
export function DemoPill() {
  const [open, setOpen] = useState(false);
  if (!IS_DEMO) return <span className="jr-live-pill" title="Showing real, retrieved job postings">Live data</span>;
  return (
    <>
      <button type="button" className="jr-demo-pill" onClick={() => setOpen(true)} aria-label="Demo data. Tap to learn what this means">
        Demo data
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="You are viewing demo data">
        <p>{DEMO_NOTICE}</p>
        <ul className="jr-bullets">
          <li>Every company, posting and URL is fictional. Links go to non-existent hosts.</li>
          <li>Skill counts, trends and match scores are real calculations over those synthetic postings.</li>
          <li>Earlier snapshots used for trends are synthetic aggregates, not invented job descriptions.</li>
          <li>Demo records are never mixed with production evidence.</li>
        </ul>
        <Button variant="secondary" block onClick={() => setOpen(false)}>
          Got it
        </Button>
      </Sheet>
    </>
  );
}

interface PageProps {
  /** Pushed pages show a back button and a title; root tabs show the brand. */
  title?: string;
  backHref?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Page({ title, backHref, headerRight, children, className = '' }: PageProps) {
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <div className="jr-header">
            {backHref ? (
              <IonButtons className="jr-header__back">
                <IonBackButton defaultHref={backHref} text="" aria-label="Back" />
              </IonButtons>
            ) : (
              <Logo />
            )}
            <div className="jr-header__title">{backHref ? title : 'JobRadar'}</div>
            {headerRight}
            <DemoPill />
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <main className={`jr-page ${className}`}>{children}</main>
      </IonContent>
    </IonPage>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="jr-page-title">
      <h1 className="jr-h1">{title}</h1>
      {subtitle && <p className="jr-muted">{subtitle}</p>}
    </div>
  );
}
