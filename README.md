# JobRadar

Evidence-based job-market intelligence for software engineers. JobRadar analyses **real job descriptions** (target: 100 distinct, verifiable postings per scan, split 35 startups / 30 mid-sized / 35 large companies) to show which skills employers actually require, which are growing or fading, and what *you* should learn next.

> **Status: Stage 1 (UI first) complete.** The full mobile UI is interactive and driven by a clearly-labelled **demo dataset**. The extraction, aggregation, trend, matching and gap engines are real, tested code; the backend, authorised-source ingestion, database and scheduler are Stage 2. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
| `docs/` | PRD, information architecture & design system, architecture & Stage 2 plan. |

## How honesty is enforced

* **Denominators are always visible.** Every count reads `jobs/denominator` (`31/43`, never an implied 100). A partial scan says `63/100` and “not a completed scan”.
* **Statistics are deterministic aggregations** over stored job records, each keeping the ids of the jobs it came from; the UI links every figure to its evidence (sentence, wording, confidence, extraction method, taxonomy version).
* **Required ≠ mentioned.** Requirement level comes from the section and explicit cues; responsibilities-only or company-blurb mentions stay “mentioned”.
* **Trends need comparable samples** (same role/region/experience band/company mix, ≥30 jobs) and a significance test; one lower reading is “uncertain”, never “declining”. No history ⇒ “baseline established; trend not yet available”.
* **Missing data isn't a penalty.** Unknown salary/experience/location components are “not scored” and their weight is redistributed.
* **Demo data is labelled everywhere** (header pill on every screen) and uses non-resolving `.invalid` URLs.

See [docs/PRD.md](docs/PRD.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
