import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { setupIonicReact } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/ionic-theme.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/screens.css';
import { ProfileProvider } from './state/profile';
import { RoadmapProgressProvider } from './state/roadmap';
import { SettingsProvider } from './state/settings';

setupIonicReact({ mode: 'md', animated: true });

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <SettingsProvider>
      <ProfileProvider>
        <RoadmapProgressProvider>
          <App />
        </RoadmapProgressProvider>
      </ProfileProvider>
    </SettingsProvider>
  </QueryClientProvider>,
);
