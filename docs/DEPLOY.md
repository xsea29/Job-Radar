# Running JobRadar with real, continuously updated data

## What runs
One server process (`npm run serve -w @jobradar/api`) does everything; no external cron is needed:

| What | When | Effect |
|---|---|---|
| **Daily run** | `DAILY_AT` (default 06:00 `Asia/Kolkata`) | Fetch all boards → dedupe, filter, extract skills → store new/changed postings → mark vanished postings expired → record the scan (+ a demand snapshot if ≥ 7 days since the last) → per-user matches, report and notification decisions. A run missed while the server was down is **caught up on start**; failures retry after 15 min (up to 3 times). |
| **Refresh** | every `REFRESH_EVERY_MINUTES` (default 60, minimum 5, `0` = off) | Fetch all boards → store new/changed postings → expire vanished ones. No scan record, no reports. |
| **First start** | immediately | With an empty database the daily run happens straight away, so the app never opens empty. |
| **Live push** | after every run | Connected apps get a small "evidence-updated" signal (`GET /v1/events`, server-sent events) and re-fetch. The app also polls every 5 min as a fallback. |

"Real time" here means: new postings reach the app within one refresh interval (plus seconds of push), because that is how often the public job-board APIs are read. It is not a per-second feed, and checking more often than every few minutes is not polite to the sources.

## Where the data comes from (and why not HTML scraping)
The server reads the **public job-board APIs** of Greenhouse, Lever and Ashby (`docs/SOURCES.md`): structured JSON the vendors publish for exactly this purpose, with the employer's own text, dates and locations. That is more reliable than scraping page HTML (no layout breakage, no JavaScript rendering, no anti-bot arms race) and avoids sites whose terms forbid automated collection. LinkedIn and Naukri are deliberately not scraped. Companies are listed in `apps/api/config/boards.verified.json`; edit it (or re-run `npm run discover`) and the next run picks the change up without a restart.

## Run locally (real data, one command)
```bash
npm install
npm run live        # API + scheduler + app → http://localhost:5173  (API on :8787)
```
The first start fetches the real boards (about a minute), then the app shows **Live data** and updates itself every `REFRESH_EVERY_MINUTES` (15 here). Data is stored in `.data/pglite`.

## Deploy the server
Needs Node 22+ (or Docker) and PostgreSQL 14+ for production.
```bash
cp .env.example .env            # set JWT_SECRET (openssl rand -base64 48), DATABASE_URL, CORS_ORIGIN
JWT_SECRET=… docker compose up -d      # API + scheduler + Postgres
curl localhost:8787/v1/health          # {"ok":true,"lastRun":{…},"liveClients":0}
```
Any host that runs a container or a Node process works (Fly.io, Render, Railway, a VPS). **Run exactly one scheduler-enabled instance** (extra instances are safe, since runs are claimed in the database, but add no benefit). Put it behind HTTPS: Android blocks cleartext HTTP, and browsers block mixed content.

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs login tokens. Required, ≥ 32 chars. |
| `DATABASE_URL` | PostgreSQL. Omit to use a local on-disk database. |
| `CORS_ORIGIN` | Allowed app origins, comma-separated: your web origin, `https://localhost` (Android app), `capacitor://localhost` (iOS app). |
| `DAILY_AT`, `TIMEZONE` | When the daily run happens. |
| `REFRESH_EVERY_MINUTES` | Refresh cadence; `0` disables. |
| `BOARDS_FILE`, `TARGET_ROLE`, `TARGET_YEARS` | Which boards, and which role/experience window the evidence base is built for. |

## Deploy to Render (cron jobs + API + Postgres)
`render.yaml` in the repo root is a Render **Blueprint**. It creates:

| Service | Type | What it does |
|---|---|---|
| `jobradar-api` | web (Docker, always-on) | REST API + the live-update stream. The in-process scheduler is **off**; it watches the run ledger and pushes a refresh signal when a cron job finishes. On a brand-new deployment it does one initial run so the app is not empty. |
| `jobradar-daily` | cron job | `30 0 * * *` UTC = **06:00 IST**: full scan, demand snapshot (if due), reports, notification decisions. |
| `jobradar-refresh` | cron job | `10,40 * * * *`: store new/changed postings, expire vanished ones. |
| `jobradar-db` | Postgres | Region `singapore` (nearest to India). |

**Steps**
1. Push the repo to GitHub (it is on `main`).
2. Render dashboard → **New → Blueprint** → select the repo → review → **Apply**. Fill `CORS_ORIGIN` (your web app's origin, plus `https://localhost,capacitor://localhost` for the native apps).
3. Wait for the first deploy. The web service runs the initial run by itself (about a minute); check `https://<your-api>.onrender.com/v1/health`: it shows `lastRun`.
4. Build the app against it: `VITE_API_URL=https://<your-api>.onrender.com npm run build -w @jobradar/mobile`.

**Things to know**
* The web service must be a paid always-on instance (`starter`): free web services sleep and would drop the live stream. The free Postgres plan expires after 30 days, so `render.yaml` uses a paid one; change it for a trial. Render cron jobs are billed per run time with a monthly minimum per job. Check current prices on Render's pricing page.
* Plan names and field names in `render.yaml` follow Render's Blueprint spec as I know it; I could not run Render from here, so if the dashboard flags a field when you apply, adjust it there.
* Render cron schedules are UTC only. To change the daily time, edit the `schedule` (IST = UTC + 5:30).
* A cron job and the other cron job never overlap: runs are claimed in the database (one at a time, once per key). A duplicate or late trigger exits 0 with `{"skipped":"already-ran"}`; a crashed run's slot is retaken after 30 minutes; a failed run exits 1 so Render marks it failed.
* Use Render's **internal** database URL (the blueprint does). For an external connection add `?sslmode=require`.
* Edit `config/boards.verified.json` and redeploy to change which companies are tracked.
* Prefer one always-on box over cron jobs? Set `SCHEDULER=on` on the web service (default), delete the two cron entries, and the in-process scheduler does the same work.

**Verified here** (not on Render itself): the web service with `SCHEDULER=off` against a real PostgreSQL 16 server bootstrapped an empty database; `refresh` and `daily` run as separate processes against the same database; a client on the web service's event stream received the refresh signal from the other process; duplicate triggers were no-ops; the API served real data (matches, gaps) from that database. The Docker image itself was not built (no Docker daemon in the sandbox).

## Point the app at the server
```bash
VITE_API_URL=https://api.example.com npm run build -w @jobradar/mobile   # static web app in apps/mobile/dist
```
Host `dist/` on any static host, or wrap it natively with Capacitor (`npm run cap:sync -w @jobradar/mobile`, then `npx cap add android|ios`). Building the Android/iOS binaries needs the Android SDK / Xcode on a machine that has them.

## Operating notes
* **Cost:** a small VM or container (≈ 0.5 vCPU / 512 MB) plus a small Postgres is enough; each refresh downloads a few MB per board and stores only relevant postings.
* **Storage growth:** each daily run stores one scan with its per-candidate results (thousands of rows). Prune old `scan_results` for non-snapshot scans if disk matters.
* **Failures are visible:** per-board health is in `source_boards`, surfaced in the app's Data transparency screen; failed boards never expire their postings.
* **Not built yet:** refresh-token rotation, shared rate-limit store for multi-instance, push/email providers (decisions and delivery history are recorded; only in-app is ever marked sent).
