# Deploy on Render as a plain Web Service (no Blueprint)

> **Read this first: the free web service sleeps.** Render stops a free web service after ~15 minutes without requests, and a sleeping process cannot run a schedule. So the recommended setup **does not rely on the web service for the scheduled data runs**:
>
> | Part | Where it runs | Does sleep matter? |
> |---|---|---|
> | Daily + hourly data runs | **GitHub Actions** (`.github/workflows/jobradar-runs.yml`), straight against the database | No: runs on GitHub's servers on a timer |
> | API + live updates | Render web service (`SCHEDULER=off`) | Only slows the first request after a nap (about 30–60 s while it wakes). Data is already fresh. |
> | Keeping it warm (optional) | UptimeRobot ping every 5 min | Removes the cold start |
>
> Set it up in this order: database (§1) → GitHub Actions (§A) → web service (§2–§3, with `SCHEDULER=off`) → optional warm ping (§B).

## A. Scheduled runs on GitHub Actions (keeps data fresh even when Render sleeps)
1. **Use an externally reachable database.** Render Postgres: copy the **External Database URL**; Neon: the **direct** connection string. It must end with `?sslmode=require`.
2. On GitHub open the repo → **Settings → Secrets and variables → Actions → New repository secret**. Name `DATABASE_URL`, value that string.
3. Open the **Actions** tab. If asked, enable workflows. Select **JobRadar data runs → Run workflow → daily**. This loads the first real data (about a minute). Check the run is green and its log ends with a line like `{"mode":"daily",...,"validPostings":83,...}`.
4. From now on it runs by itself: **daily at 06:00 IST** and **hourly at :10**.

Good to know:
* GitHub's scheduler is best-effort: runs can start a few minutes late, or occasionally be skipped under load. The jobs are idempotent, claim their slot in the database, and a missed run is caught up by the next one, so nothing breaks.
* GitHub turns scheduled workflows **off after 60 days without any repository activity** (a commit resets it). If runs stop, open the Actions tab and re-enable the workflow.
* Usage is about a minute per run (≈ 750 runs a month): free for public repos; for a private repo check your monthly free minutes.
* To change which companies are tracked, edit `apps/api/config/boards.verified.json` and push; the next run uses it.
* Re-run any time from **Actions → JobRadar data runs → Run workflow**.

## B. Optional: keep the web service awake (no cold start)
Create a free monitor at https://uptimerobot.com: type **HTTP(s)**, URL `https://<your-service>.onrender.com/v1/health`, interval **5 minutes**. Requests every 5 minutes stop Render from putting the service to sleep, so the app opens instantly and the live stream stays connected. Check Render's current free-plan terms (monthly instance hours). Without this the app still works, it just waits for the service to wake on the first visit.

## C. Trigger endpoint: run the scanner by calling a URL
The server has an endpoint that starts the scanner for new jobs whenever something calls it: a free cron service (cron-job.org), UptimeRobot, a GitHub Action, or plain `curl`. It also **wakes a sleeping Render service**, so one pinger can both keep it alive and fetch new jobs.

**Enable it:** add the environment variable `CRON_SECRET` on the Render service (16+ characters, e.g. `openssl rand -hex 24`). Without it the endpoint is disabled (HTTP 501).

**Call it** (replace the address and secret):
```bash
# find new jobs (refresh): returns right away
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-service>.onrender.com/v1/cron/scan

# same, but wait for the result (up to 90 s)
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-service>.onrender.com/v1/cron/scan?wait=true"

# full daily run (scan + snapshot + reports); once per UTC day
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-service>.onrender.com/v1/cron/scan?mode=daily"

# for services that cannot set headers (the secret then appears in URLs and logs; prefer the header)
https://<your-service>.onrender.com/v1/cron/scan?key=<CRON_SECRET>
```
GET and POST both work. The secret can also be sent as an `X-Cron-Secret` header.

| Response | Meaning |
|---|---|
| `202 {"status":"started"}` | The scan was started and is running in the background. |
| `200 {"status":"done","result":{...}}` | With `wait=true`: finished; `result` has `newPostings`, `newlyExpired`, `validPostings`, `failedBoards`. |
| `200 {"status":"already-ran"}` | This time slot already ran (a repeat call is a safe no-op). |
| `200 {"status":"busy"}` | Another run is in progress right now. |
| `401` / `501` / `400` / `429` | Wrong or missing secret / endpoint disabled / bad `mode` / too many bad attempts. |

**It cannot be used to hammer the job boards:** a refresh is allowed once per `CRON_SLOT_MINUTES` (default 10) and a daily run once per UTC day; extra calls return `already-ran` without fetching anything. Check progress any time at `/v1/health` (`lastRun`).

**Wire it to a free scheduler, e.g. cron-job.org:** create a job, URL `https://<your-service>.onrender.com/v1/cron/scan`, schedule every 30 minutes, under Advanced add the header `Authorization: Bearer <CRON_SECRET>`. A call that arrives while Render is asleep wakes the service (about 30–60 s); if the cron service gives up before it answers, the next call a few minutes later gets through. For a 06:00 IST daily run add a second job with `?mode=daily` at 00:30 UTC.

Note that a call on a free Render instance runs the scan on its limited CPU and memory (a run peaked around 320 MB here); GitHub Actions (§A) does the heavy lifting off Render and is the more robust choice. §A and §C can be used together: they share the same once-per-slot claims, so they never double-run.

---

---

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
| `CRON_SECRET` | optional: a secret that enables the trigger endpoint (§C) |
| `SCHEDULER` | `off` (the data runs happen in GitHub Actions; with `off` the service still does ONE initial run if the database is empty) |
| `DAILY_AT` | `06:00` |
| `TIMEZONE` | `Asia/Kolkata` |
| `REFRESH_EVERY_MINUTES` | `60` |
| `BOARDS_FILE` | `config/boards.verified.json` |
| `TARGET_ROLE` | `fullstack` |
| `TARGET_YEARS` | `4` |

Click **Create Web Service**. The first build takes a few minutes.

(Not using GitHub Actions? Set `SCHEDULER` to `on` and the service schedules itself, but then it only works while awake: use the Starter plan or the warm ping in §B. `DAILY_AT`, `TIMEZONE` and `REFRESH_EVERY_MINUTES` only matter in that case.)

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
* Free web services **sleep after ~15 minutes without requests**. With the GitHub Actions setup in §A the data keeps updating anyway; only the first request after a nap is slow while the service wakes, and open apps reconnect on their own.
* To remove the cold start, use the warm ping in §B.
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
