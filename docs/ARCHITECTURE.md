# Architecture

## Stage 1 (now)
```
 apps/mobile (Ionic React)
   pages ─ components ─ state (profile/settings/roadmap, localStorage)
        │
   data/queries.ts (TanStack Query) → data/source.ts  EvidenceSource  ◄── seam
        │                                   │
   data/analyze.ts ── @jobradar/core ◄──────┘  demoSource → @jobradar/demo (synthetic)
```
`analyze()` turns evidence + profile into demand tables, trends, gap analysis, matches, roadmap and reports using the **same functions the backend will run**.

## Stage 2 plan
* **API:** NestJS (TypeScript), REST + OpenAPI; shares `@jobradar/core`. Auth with short-lived access tokens + rotating refresh; per-route rate limits; Zod/class-validator validation; pagination.
* **DB:** PostgreSQL with migrations. Entities: users, user_profiles, user_skills, companies (+ classification basis/confidence), job_sources, job_postings, job_description_snapshots (versions, content hash), skills + aliases (taxonomy version), job_skills + evidence (sentence, offsets, confidence, method), scan_runs + scan_results (candidate status/rejection), skill_demand_snapshots (aggregates per comparable sample), job_matches, learning_plans/progress, notification_preferences/deliveries. Unique constraints on (source, external id) and content hash; indexes for filters.
* **Ingestion:** `SourceAdapter` interface per authorised source (public ATS boards, licensed feeds, robots-permitted careers pages) → fetch → parse → normalise → dedupe → extract. Each adapter declares its terms; sources without authorised access stay “not connected”.
* **Workers:** queue (BullMQ/Redis or pg-boss) with retries, idempotent job ids, per-source rate limits; scheduler that works across instances (single-flight lock). Daily workflow: discover → verify availability → dedupe/expire → extract → rematch → update snapshots → build report → notify (only if significant).
* **AI assist:** optional, schema-validated structured extraction; never invents jobs, requirements or statistics; failures mark a job *partially processed*; all numbers stay deterministic SQL/TS aggregation.
* **Security/privacy:** secrets server-side only; resume files optional in object storage with deletion; no PII in logs; account/data deletion endpoint.
* **Ops:** structured logs, metrics, error reporting; deployment/env/cost docs in Stage 3.
