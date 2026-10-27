# JobRadar

Evidence-based job-market intelligence for software engineers. JobRadar analyses **real job descriptions** (target: 100 distinct, verifiable postings per scan, split 35 startups / 30 mid-sized / 35 large companies) to show which skills employers actually require, which are growing or fading, and what *you* should learn next.

> **Status.** Stage 1 (UI first) is complete: the mobile UI is interactive and runs on a clearly-labelled **demo dataset**. Stage 2 is done: public-ATS ingestion (Greenhouse, Lever, Ashby), scan validation, PostgreSQL schema/persistence, daily worker, REST API and app↔API wiring, **verified on real postings (88/100 on the first real scan)**. See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/SOURCES.md](docs/SOURCES.md).

## Run it

Requires Node 22+.

```bash
npm install
npm run dev          # http://localhost:5173 (open with a phone-size viewport)
npm test             # core + demo + mobile unit tests
npm run typecheck && npm run lint
npm run build        # production web build → apps/mobile/dist
```

On first launch you go through onboarding (or tap **Use the sample profile**). **More → Profile & settings → Demo controls** switches the app between *Complete 100/100*, *Partial 63/100*, *No scan yet*, *Service error* and *Slow loading* so every non-happy state can be reviewed.

### Run a real scan (needs network access to the ATS hosts)

```bash
npm run discover -w @jobradar/api            # tests the candidate companies in config/boards.candidates*.json
                                              # against the live APIs → writes config/boards.json (verified boards only)
npm run migrate -w @jobradar/api                                       # DATABASE_URL=postgres://… or local PGlite in .data/
npm run scan -w @jobradar/api -- --boards config/boards.json --role fullstack --years 4
```

It prints `n/100`, rejections by reason, duplicates, failures and every disclosed broadening step, and stores the scan, postings, versions, evidence and a demand snapshot. Without network access it fails honestly (`0/100 partial`). Behind a proxy set `NODE_USE_ENV_PROXY=1` (and `NODE_EXTRA_CA_CERTS`); see [docs/SOURCES.md](docs/SOURCES.md). A real run on 21 verified boards produced `88/100` (partial).

### Run the backend and point the app at it

```bash
export JWT_SECRET="$(openssl rand -base64 48)"           # required, ≥ 32 chars
npm run daily -w @jobradar/api                           # fetch → extract → store → expire vanished postings → reports (once per UTC day; run from cron)
npm run serve -w @jobradar/api                           # REST API on :8787 (DATABASE_URL=postgres://… in production)
VITE_API_URL=http://localhost:8787 npm run dev           # app now shows real data ("Live data" pill) instead of the demo
```

API (all JSON, `/v1`): `auth/register|login`, `DELETE me`, `evidence`, `market`, `jobs` (+`/:id`), `scans` (+`POST scans/run`), `profile`, `matches`, `gap` (with roadmap), `reports`, `notifications/preferences`, `learning/progress`, `health`. Validation (zod), pagination, scrypt-hashed passwords, HS256 bearer tokens, auth rate limiting, no request bodies in logs.

Android/iOS packaging uses Capacitor (`apps/mobile/capacitor.config.ts`):

```bash
cd apps/mobile && npm run cap:sync && npx cap add android   # or ios
```

## Repository layout

| Path | What it is |
|---|---|
| `apps/mobile` | Ionic React + Vite + TypeScript app (Capacitor-ready). Screens in `src/pages`, design-system components in `src/components`, data seam in `src/data`. |
| `packages/core` | **Real domain logic**, shared with the future backend: taxonomy, skill extractor, demand aggregation, trend classification, match scoring, gap prioritisation, scan validation, company-size classification, roadmap, daily report. |
| `packages/demo` | **Synthetic** demo data: fictional companies, generated job descriptions (which are then run through the *real* extractor), earlier-snapshot aggregates, sources, scans. Never mix with production evidence. |
| `packages/ingest` | Public-ATS adapters (Greenhouse/Lever/Ashby), polite HTTP client, HTML→text, location/role normalisation, and the pure scan orchestrator (dedupe → relevance filters → quota-aware selection → disclosed broadening → `n/100` validation). |
| `apps/api` | PostgreSQL migrations (`migrations/001_init.sql`), DB layer (`pg` in production, PGlite for dev/tests), scan persistence, and the `scan` CLI. |
| `docs/` | PRD, information architecture & design system, architecture, data sources. |

## How honesty is enforced

* **Denominators are always visible.** Every count reads `jobs/denominator` (`31/43`, never an implied 100). A partial scan says `63/100` and “not a completed scan”.
* **Statistics are deterministic aggregations** over stored job records, each keeping the ids of the jobs it came from; the UI links every figure to its evidence (sentence, wording, confidence, extraction method, taxonomy version).
* **Required ≠ mentioned.** Requirement level comes from the section and explicit cues; responsibilities-only or company-blurb mentions stay “mentioned”.
* **Trends need comparable samples** (same role/region/experience band/company mix, ≥30 jobs) and a significance test; one lower reading is “uncertain”, never “declining”. No history ⇒ “baseline established; trend not yet available”.
* **Missing data isn't a penalty.** Unknown salary/experience/location components are “not scored” and their weight is redistributed.
* **Demo data is labelled everywhere** (header pill on every screen) and uses non-resolving `.invalid` URLs.

See [docs/PRD.md](docs/PRD.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
