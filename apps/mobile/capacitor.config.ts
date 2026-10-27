import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built web app (dist/) for Android and iOS.
 *   npm run cap:sync            # build + copy web assets
 *   npx cap add android|ios     # one-off: create the native project
 *   npx cap open android|ios
 * Native platform folders are git-ignored until Stage 3 packaging.
 */
const config: CapacitorConfig = {
  appId: 'app.jobradar.mobile',
  appName: 'JobRadar',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};

export default config;
