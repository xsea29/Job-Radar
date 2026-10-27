# Roadmap

- [x] **Stage 1** — product docs, design system, full interactive UI, deterministic engines + tests, labelled demo data, non-happy states, dark mode.
- [~] **Stage 2** — in progress.
  - [x] Postgres schema + migrations; persistence of scans, versions, evidence, snapshots (tested on PGlite)
  - [x] Public-ATS adapters (Greenhouse/Lever/Ashby), retry/backoff/rate-limit, HTML→text
  - [x] Dedupe, relevance filters, quota-aware 100-job selection, disclosed broadening, `n/100` validation
  - [x] `scan` CLI
  - [ ] **Verify adapters on live responses** (blocked: sandbox network policy)
  - [ ] REST API (profiles, jobs, scans, market, trends, gaps, matches, reports, roadmap, notifications) with auth, validation, pagination, rate limits
  - [ ] Daily worker: discover → re-verify availability → expire/changed → extract → rematch → snapshot → report → notify (queue, retries, idempotent, multi-instance safe)
  - [ ] Replace `demoSource` with an `apiSource` in the app
- [ ] **Stage 3** — verify with real permitted data; incomplete/failed-source and retry tests; native packaging; deployment, env vars, source terms and operating costs documented.

## Known Stage-1 limitations
* Data is synthetic by design; nothing is scraped or fetched (except optional GitHub public-repo import in onboarding, which calls api.github.com from the device).
* Resume import handles pasted text and .txt only; PDF/DOCX parsing needs the backend.
* Profile and progress live in `localStorage`; there is no account or sync yet.
* Push/email notifications are preferences only until the backend exists.
* The web bundle is ~1.5 MB because the synthetic generator ships with it; it disappears with the demo source.
* `react-router` v6 is pinned by Ionic 9's router; `npm audit` flags moderate advisories in that line and in dev tooling (vitest). No production secrets are involved at this stage.
