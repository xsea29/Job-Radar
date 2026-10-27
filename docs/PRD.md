# JobRadar — Product Requirements (concise)

## Problem
Engineers are told to learn trending tools without evidence those tools are required for the roles they want. JobRadar answers, from real postings: what is required vs. merely preferred, how it differs across startups / mid-sized / large companies, what is growing, stable or fading, and what *this user* should do next.

## Users
Developers planning a job switch or career path — any role family (frontend, backend, full-stack, generalist, or custom), not just React developers.

## Principles
1. Evidence over opinion: no skill statistic without stored source records.
2. Honest scope: show sample size, source coverage, failures and limits.
3. Explainable scoring: documented formulas, configurable weights, visible breakdowns.
4. Personal: every match and recommendation uses the user's profile and the observed demand.
5. Not a job portal, course marketplace or chatbot.

## Core journeys
| # | Journey | Screens |
|---|---|---|
| 1 | Onboard and define a target profile (skippable, editable, resume/GitHub import) | Onboarding → Summary |
| 2 | Run a scan and see exactly how many valid jobs were collected | Scan, Home, Data transparency |
| 3 | Understand market demand and trust it (drill to evidence) | Market → Skill detail → Job detail |
| 4 | Find and assess jobs | Jobs (filters) → Job detail (3-part match) |
| 5 | See and close my gaps | Skills (gap) → Roadmap |
| 6 | Stay informed daily without noise | Home, Daily report |
| 7 | Control my data | Settings (export / delete) |

## Scope by stage
* **Stage 1 (done):** complete interactive UI; deterministic engines; labelled demo data; tests.
* **Stage 2:** database + migrations, authorised source adapters, retrieval/normalisation/dedupe, extraction with evidence (rules + schema-validated AI assist), 100-job sampling & validation, snapshots, matching/gap APIs, daily worker, notifications, auth.
* **Stage 3:** integration tests with real permitted data, scheduled-job/retry tests, mobile packaging, deployment docs and cost notes.

## Key rules (implemented in `packages/core`)
* **Valid scan** = 100 distinct, relevant, retrievable descriptions. Duplicates, inaccessible, rejected and fabricated jobs never count. Shortfalls are reported as `n/100`. Broadening is bounded and disclosed; role family, country and experience floor are never relaxed.
* **Company size**: startup < 200 employees, mid 200–2,999, large 3,000+ (or listed multinational with 1,000+ employees in 3+ countries); within 15% of a boundary = “approximate”; no data = *unclassified* (excluded from quotas, never guessed).
* **Skill labels**: foundational, established, growing, emerging, specialized, declining, uncertain — derived by rules from comparable-sample evidence (see Data transparency screen for thresholds).
* **Match** = required (40%) + preferred (10%) + experience (15%) + role (15%) + location (10%) + salary (10%), renormalised over scored components. Skill match, experience eligibility and overall suitability are shown separately.
* **Gap priority** = 100 × (0.20 role relevance + 0.25 prevalence + 0.30 required frequency + 0.15 gap size + 0.10 sustained demand), each input normalised 0–1. Tools that imply a concept (Jest ⇒ unit testing) and similar skills (Node.js ↔ Java, AWS ↔ GCP) reduce the gap instead of adding “learn X” noise.
* **Daily report** notifies only for a strong new match (≥ threshold), a statistically meaningful demand change, or a source failing ≥ 2 days.

## Out of scope / never
Auto-applying to jobs, collecting applicants' contact data, bypassing logins/CAPTCHAs/robots restrictions, fabricating jobs or history.
