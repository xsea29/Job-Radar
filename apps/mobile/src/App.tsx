import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { briefcase, briefcaseOutline, ellipsisHorizontalCircle, ellipsisHorizontalCircleOutline, home, homeOutline, radio, radioOutline, statsChart, statsChartOutline } from 'ionicons/icons';
import { Navigate, Route, useLocation } from 'react-router-dom';
import { useProfile } from './state/profile';
import Home from './pages/Home';
import Market from './pages/Market';
import Jobs from './pages/Jobs';
import Skills from './pages/Skills';
import More from './pages/More';
import SkillDetail from './pages/SkillDetail';
import JobDetail from './pages/JobDetail';
import Roadmap from './pages/Roadmap';
import { Companies, CompanyDetail } from './pages/Companies';
import { Reports, ReportDetail } from './pages/Reports';
import Transparency from './pages/Transparency';
import Settings from './pages/Settings';
import Scan from './pages/Scan';
import Onboarding from './pages/Onboarding';

function Tabs() {
  const { profile } = useProfile();
  const loc = useLocation();
  if (!profile.onboardingComplete) return <Navigate to="/onboarding" replace />;
  const at = (p: string) => loc.pathname.startsWith(p);
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/tabs/home" element={<Home />} />
        <Route path="/tabs/market" element={<Market />} />
        <Route path="/tabs/jobs" element={<Jobs />} />
        <Route path="/tabs/skills" element={<Skills />} />
        <Route path="/tabs/more" element={<More />} />
      </IonRouterOutlet>
      <IonTabBar slot="bottom">
        <IonTabButton tab="home" href="/tabs/home">
          <IonIcon icon={at('/tabs/home') ? home : homeOutline} />
          <IonLabel>Home</IonLabel>
        </IonTabButton>
        <IonTabButton tab="market" href="/tabs/market">
          <IonIcon icon={at('/tabs/market') ? statsChart : statsChartOutline} />
          <IonLabel>Market</IonLabel>
        </IonTabButton>
        <IonTabButton tab="jobs" href="/tabs/jobs">
          <IonIcon icon={at('/tabs/jobs') ? briefcase : briefcaseOutline} />
          <IonLabel>Jobs</IonLabel>
        </IonTabButton>
        <IonTabButton tab="skills" href="/tabs/skills">
          <IonIcon icon={at('/tabs/skills') ? radio : radioOutline} />
          <IonLabel>Skills</IonLabel>
        </IonTabButton>
        <IonTabButton tab="more" href="/tabs/more">
          <IonIcon icon={at('/tabs/more') ? ellipsisHorizontalCircle : ellipsisHorizontalCircleOutline} />
          <IonLabel>More</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}

function Start() {
  const { profile } = useProfile();
  return <Navigate to={profile.onboardingComplete ? '/tabs/home' : '/onboarding'} replace />;
}

export default function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route path="/" element={<Start />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/tabs/*" element={<Tabs />} />
          <Route path="/skill/:skillId" element={<SkillDetail />} />
          <Route path="/job/:jobId" element={<JobDetail />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/company/:companyId" element={<CompanyDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/report/:date" element={<ReportDetail />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/transparency" element={<Transparency />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/scan" element={<Scan />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
