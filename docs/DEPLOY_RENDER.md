# Deploy on Render as a plain Web Service (no Blueprint)

You create two things by hand: a **database** and a **Web Service**. The Web Service runs everything: API, live updates and the scheduler (daily 06:00 IST + refresh every 60 min).

## 1. Database (pick one)
A free web service has no permanent disk, so the data must live in Postgres.

**A. Render Postgres** (simplest): New + → PostgreSQL → name `jobradar-db`, region **Singapore** → Free → Create. Copy the **Internal Database URL**. Free Render databases expire after 30 days; if that happens, create a new one and update `DATABASE_URL` (the app refills itself from the job boards on the next start; history and trends restart).

**B. Neon** (https://neon.tech, free tier, longer-lived): create a project, copy the **direct** connection string (not the "pooled" one). It must end with `?sslmode=require`. If the connection fails, remove `&channel_binding=require` from the string.

## 2. Web Service
New + → **Web Service** → connect GitHub → pick `xsea29/Job-Radar`.

| Field | Value |
|---|---|
| Name | `jobradar-api` |
| Region | Singapore (same as the database) |
| Branch | `main` |
| Root Directory | *(leave empty)* |
| Runtime / Language | **Node** |
| Build Command | `npm ci --workspace=@jobradar/api --include-workspace-root --omit=dev` |
| Start Command | `cd apps/api && node --import tsx src/cli/serve.ts` |
| Instance type | Free (for a trial) or Starter (always on) |
| Health Check Path (Advanced) | `/v1/health` |

## 3. Environment variables (Environment tab)
| Key | Value |
|---|---|
| `DATABASE_URL` | the connection string from step 1 |
| `JWT_SECRET` | any random string of 32+ characters (Render's "Generate" button, or `openssl rand -base64 48`) |
| `CORS_ORIGIN` | `https://localhost,capacitor://localhost` plus your app's address, e.g. `,http://localhost:5173` for local testing |
| `NODE_VERSION` | `22` |
| `NODE_OPTIONS` | `--max-old-space-size=320` |
| `SCHEDULER` | `on` |
| `DAILY_AT` | `06:00` |
| `TIMEZONE` | `Asia/Kolkata` |
| `REFRESH_EVERY_MINUTES` | `60` |
| `BOARDS_FILE` | `config/boards.verified.json` |
| `TARGET_ROLE` | `fullstack` |
| `TARGET_YEARS` | `4` |

Click **Create Web Service**. The first build takes a few minutes.

## 4. Check it
* Logs should show `JobRadar API on :10000 · scheduler on …`, then within about a minute `daily 2026-..: {...validPostings...}` (the first real data fetch fills the empty database by itself).
* Open `https://<your-service>.onrender.com/v1/health` → `{"ok":true,...}`; `lastRun` fills in after the first run.
* `https://<your-service>.onrender.com/v1/market` → real skill counts.

## 5. Use it in the app
```bash
VITE_API_URL=https://<your-service>.onrender.com npm run dev -w @jobradar/mobile      # try it
VITE_API_URL=https://<your-service>.onrender.com npm run build -w @jobradar/mobile    # build it
```
The header shows **Live data** instead of **Demo data**.

## Free instance: what to expect
* Free web services **sleep after ~15 minutes without requests**. While asleep nothing is fetched and the live stream is closed. When a request wakes it, the scheduler resumes: it catches up the daily run if today's hasn't happened and does a refresh, so data is current again within a minute or two of the first visit, but not updated while nobody uses the app.
* To keep it awake on the free plan, an external pinger (for example UptimeRobot) can call `/v1/health` every 5 minutes. A free service has a monthly hour allowance (about 750 h), enough for one service running all month. Check Render's current terms.
* Free instances have little CPU (about 0.1), so a run will be slower than my local measurement. A run peaked around 320 MB of memory here against a 512 MB limit. I could not test on Render's free tier from here.
* For continuous 24/7 updates use the Starter instance.

## Changing things later
* Companies tracked: edit `apps/api/config/boards.verified.json`, push to `main`; Render redeploys.
* Schedule: edit `DAILY_AT`, `TIMEZONE`, `REFRESH_EVERY_MINUTES` in Environment (refresh minimum 5; `0` turns refreshes off).

## Troubleshooting
* **Build fails:** read the build log; most often the Build Command was mistyped (it must run from the repo root, so keep Root Directory empty).
* **CORS error in the browser:** the app's exact address (scheme + host + port) is not in `CORS_ORIGIN`.
* **`ECONNREFUSED` / SSL errors to the database:** use the *Internal* URL for Render Postgres, or add `?sslmode=require` to an external URL.
* **Restarts or out-of-memory:** upgrade the instance type.
* **`/v1/market` says no scan yet:** wait a minute for the first run, or check the logs for a `daily … failed` line.
