// One command to run the whole thing locally with REAL data:
//   npm run live
// Starts the API (with its scheduler + live stream) and the app pointed at it.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

mkdirSync('.data', { recursive: true });
const secretFile = '.data/dev-jwt-secret';
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(48).toString('base64url'), { mode: 0o600 });

const apiPort = process.env.PORT ?? '8787';
const env = {
  ...process.env,
  JWT_SECRET: process.env.JWT_SECRET ?? readFileSync(secretFile, 'utf8'),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  PORT: apiPort,
  REFRESH_EVERY_MINUTES: process.env.REFRESH_EVERY_MINUTES ?? '15',
  PGLITE_DIR: process.env.PGLITE_DIR ?? '.data/pglite',
};

const run = (name, args, extra = {}) => {
  const p = spawn('npm', args, { env: { ...env, ...extra }, stdio: 'inherit' });
  p.on('exit', (code) => {
    console.log(`[${name}] exited (${code})`);
    process.exit(code ?? 1);
  });
  return p;
};

console.log(`\nJobRadar live: API http://localhost:${apiPort}  ·  app http://localhost:5173\nFirst start fetches the real boards (about a minute); the app then updates by itself.\n`);
run('api', ['run', 'serve', '-w', '@jobradar/api']);
run('app', ['run', 'dev', '-w', '@jobradar/mobile'], { VITE_API_URL: `http://localhost:${apiPort}` });
