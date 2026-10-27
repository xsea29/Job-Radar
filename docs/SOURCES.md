# Data sources (Stage 2)

JobRadar reads **public applicant-tracking-system (ATS) job boards** only. Each is a documented, unauthenticated, read-only API published by the vendor so that employers' own postings can be consumed by third parties. No login, CAPTCHA, paywall or robots restriction is involved or bypassed.

| ATS | Endpoint used | Docs |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | developers.greenhouse.io/job-board.html |
| Lever | `GET https://api.lever.co/v0/postings/{site}?mode=json` (EU tenants: `api.eu.lever.co`) | github.com/lever/postings-api |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true` | developers.ashbyhq.com |

**Not connected** (no authorised access, never scraped): Naukri, LinkedIn Jobs, and any site whose terms forbid automated collection.

## How requests behave
Identify as `JobRadarBot/0.1`; send no credentials; ≥ 400 ms between requests to the same host; 20 s timeout; up to 4 attempts with exponential backoff, honouring `Retry-After`, retrying only network errors, 408/425/429 and 5xx (other 4xx fail fast). A board that cannot be read is recorded as a failure (and counted as *inaccessible*), never silently skipped or papered over.

## Choosing companies
There is no global index of boards. You supply the list (`apps/api/config/boards.json`, see `boards.example.json`): one entry per company with the board **token** (the slug in its public board URL). Company *size* is classified only from firmographics **you** provide (`employees`, `listed`, `countries`, `fundingStage`); omit them and the company is **unclassified** and excluded from the 35/30/35 quotas instead of guessed. Aim for many boards: a 100-job India-specific sample typically needs dozens of companies, and the scan will report `n/100` if the list is too small.

## What is verified and what is not
* **Tested offline** with hand-written fixtures that follow the vendors' documented formats (parsing, error handling, retries, dedupe, filters, quotas, broadening, persistence).
* **Not yet verified against live responses** — the development sandbox blocks these hosts. Field names (notably Greenhouse `pay_input_ranges`, Lever `salaryRange`/`workplaceType`, Ashby `compensation`/`workplaceType`) are parsed defensively and must be confirmed on the first real run. Unknown shapes raise an error rather than being guessed.
* Whether a vendor's terms allow your intended use is your call to confirm per source; this repo only implements the documented public APIs.
