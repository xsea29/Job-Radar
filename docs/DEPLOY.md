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
