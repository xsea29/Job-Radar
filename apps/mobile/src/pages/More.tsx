import { IonIcon } from '@ionic/react';
import { businessOutline, documentTextOutline, mapOutline, settingsOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { Page, PageTitle } from '../components/ui/Page';
import { Card, List, Row } from '../components/ui/Primitives';
import { useProfile } from '../state/profile';
import { ROLE_LABELS } from '@jobradar/core';

export default function More() {
  const nav = useNavigate();
  const { profile } = useProfile();
  const icon = (i: string) => (
    <span className="jr-iconbox">
      <IonIcon icon={i} aria-hidden="true" />
    </span>
  );
  return (
    <Page>
      <PageTitle title="More" subtitle={`${profile.name || 'Your profile'} · ${ROLE_LABELS[profile.targetRoleId]}`} />
      <List>
        <Row leading={icon(documentTextOutline)} title="Daily intelligence report" subtitle="New jobs, market changes, next action" onClick={() => nav('/reports')} />
        <Row leading={icon(mapOutline)} title="Learning roadmap" subtitle="Built from the gaps in real job descriptions" onClick={() => nav('/roadmap')} />
        <Row leading={icon(businessOutline)} title="Company insights" subtitle="Sampled companies, sizes and requirements" onClick={() => nav('/companies')} />
        <Row leading={icon(shieldCheckmarkOutline)} title="Data transparency" subtitle="Sources, scan history, failures, limits" onClick={() => nav('/transparency')} />
        <Row leading={icon(settingsOutline)} title="Profile & settings" subtitle="Skills, locations, notifications, scan setup" onClick={() => nav('/settings')} />
      </List>
      <Card tone="accent">
        <strong>About the data in this build</strong>
        <p className="jr-small" style={{ marginTop: 4 }}>
          JobRadar is in its UI-first stage. All companies and postings are synthetic and labelled “Demo data”. The extraction, statistics, trend, match and gap engines are the real code that will run on authorised sources.
        </p>
      </Card>
    </Page>
  );
}
