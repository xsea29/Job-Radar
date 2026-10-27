# Roadmap

- [x] **Stage 1** — product docs, design system, full interactive UI, deterministic engines + tests, labelled demo data, non-happy states, dark mode.
- [x] **Stage 2** — done.
  - [x] Postgres schema + migrations; persistence of scans, versions, evidence, snapshots
  - [x] Public-ATS adapters, retry/backoff/rate-limit, HTML→text; verified on live responses
  - [x] Dedupe (hash + near-duplicate), relevance filters, quota-aware 100-job selection, disclosed broadening, `n/100` validation
  - [x] Real scan: 88/100 valid distinct postings (partial, honestly labelled)
  - [x] Daily worker: idempotent per day, advisory-locked, expires vanished postings (never from failed boards), snapshots only every ≥ 7 days, per-user matches/reports/notification decisions with delivery history
  - [x] REST API: auth, profile, evidence, market, jobs, matches, gap+roadmap, reports, notification prefs, learning progress, scans
  - [x] App `apiSource` (set `VITE_API_URL`); live mode shows "Live data"
  - [ ] Open product decision: reach 100 via more boards or by treating Backend/Frontend roles as relevant to a Full-Stack target
- [ ] **Stage 3** — verify with real permitted data; incomplete/failed-source and retry tests; native packaging; deployment, env vars, source terms and operating costs documented.

## Known Stage-1 limitations
* Data is synthetic by design; nothing is scraped or fetched (except optional GitHub public-repo import in onboarding, which calls api.github.com from the device).
* Resume import handles pasted text and .txt only; PDF/DOCX parsing needs the backend.
* Profile and progress live in `localStorage`; there is no account or sync yet.
* Push/email: decisions and delivery history are recorded, but no provider is wired, so only the in-app channel is ever marked `sent`.
* App auth/sync UI is not built: in live mode the profile stays on-device (the authenticated profile/match/gap/report endpoints exist and are tested).
* Access tokens only (1 h); no refresh-token rotation yet. Rate limiting is in-memory (single instance).
* The web bundle is ~1.5 MB because the synthetic generator ships with it; it disappears with the demo source.
* `react-router` v6 is pinned by Ionic 9's router; `npm audit` flags moderate advisories in that line and in dev tooling (vitest). No production secrets are involved at this stage.
