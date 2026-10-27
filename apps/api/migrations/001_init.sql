-- JobRadar schema v1.
-- Principles: normalised; history preserved (snapshots, versions, scans never
-- overwritten); every statistic traceable to rows; demo and live data are
-- separated by `provenance` and never mixed.

-- ───────────────────────── users & profiles ─────────────────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TABLE skills (
  id                text PRIMARY KEY,
  name              text NOT NULL,
  category          text NOT NULL,
  foundational      boolean NOT NULL DEFAULT false,
  taxonomy_version  text NOT NULL
);

CREATE TABLE skill_aliases (
  id              bigserial PRIMARY KEY,
  skill_id        text NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  alias           text NOT NULL,
  case_sensitive  boolean NOT NULL DEFAULT false,
  UNIQUE (skill_id, alias, case_sensitive)
);

CREATE TABLE user_profiles (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_title         text,
  years_experience      numeric(4,1) NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
  target_role_id        text NOT NULL CHECK (target_role_id IN ('frontend','backend','fullstack','software')),
  target_role_label     text,
  current_salary        bigint CHECK (current_salary >= 0),
  expected_salary_min   bigint CHECK (expected_salary_min >= 0),
  expected_salary_max   bigint CHECK (expected_salary_max >= 0),
  salary_currency       text NOT NULL DEFAULT 'INR',
  notice_period_days    int CHECK (notice_period_days >= 0),
  switch_timeline       text NOT NULL DEFAULT '3-6' CHECK (switch_timeline IN ('asap','1-3','3-6','6-12','exploring')),
  weekly_learning_hours int NOT NULL DEFAULT 5 CHECK (weekly_learning_hours BETWEEN 0 AND 80),
  locations             jsonb NOT NULL DEFAULT '{}'::jsonb,
  company_categories    text[] NOT NULL DEFAULT '{}',
  industries            text[] NOT NULL DEFAULT '{}',
  preferred_skill_ids   text[] NOT NULL DEFAULT '{}',
  resume_object_key     text,
  imports               jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_salary_max IS NULL OR expected_salary_min IS NULL OR expected_salary_min <= expected_salary_max)
);

CREATE TABLE user_skills (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id  text NOT NULL REFERENCES skills(id),
  level     text NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
  source    text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','resume','github')),
  PRIMARY KEY (user_id, skill_id)
);

-- ───────────────────────── companies & sources ─────────────────────────
CREATE TABLE companies (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                        text NOT NULL UNIQUE,
  name                        text NOT NULL,
  industry                    text,
  hq_city                     text,
  employees                   int CHECK (employees > 0),
  funding_stage               text,
  listed                      boolean,
  countries                   int,
  category                    text NOT NULL CHECK (category IN ('startup','mid','large','unclassified')),
  classification_basis        text NOT NULL,
  classification_confidence   text NOT NULL CHECK (classification_confidence IN ('high','medium','low')),
  classification_explanation  text NOT NULL,
  provenance                  text NOT NULL DEFAULT 'live' CHECK (provenance IN ('demo','live')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_sources (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('ats_api','licensed_feed','careers_pages','not_connected')),
  access_note  text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true
);

CREATE TABLE source_boards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             text NOT NULL REFERENCES job_sources(id),
  token                 text NOT NULL,
  company_id            uuid NOT NULL REFERENCES companies(id),
  region                text,
  enabled               boolean NOT NULL DEFAULT true,
  last_checked_at       timestamptz,
  last_success_at       timestamptz,
  consecutive_failures  int NOT NULL DEFAULT 0,
  last_error            text,
  UNIQUE (source_id, token)
);

-- ───────────────────────── postings & versions ─────────────────────────
CREATE TABLE job_postings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_board_id       uuid NOT NULL REFERENCES source_boards(id),
  external_id           text NOT NULL,
  company_id            uuid NOT NULL REFERENCES companies(id),
  title                 text NOT NULL,
  normalized_role       text CHECK (normalized_role IN ('frontend','backend','fullstack','software')),
  employment_type       text NOT NULL DEFAULT 'unknown',
  city                  text,
  country               text,
  work_arrangement      text CHECK (work_arrangement IN ('remote','hybrid','onsite')),
  experience_min        numeric(4,1),
  experience_max        numeric(4,1),
  experience_raw        text,
  salary_min            numeric(14,2),
  salary_max            numeric(14,2),
  salary_currency       text,
  salary_period         text CHECK (salary_period IN ('year','month')),
  posted_at             timestamptz,
  source_url            text NOT NULL,
  apply_url             text,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','changed','unverified')),
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_verified_at      timestamptz NOT NULL DEFAULT now(),
  content_hash          text NOT NULL,
  canonical_key         text NOT NULL,
  current_snapshot_id   uuid,
  provenance            text NOT NULL DEFAULT 'live' CHECK (provenance IN ('demo','live')),
  UNIQUE (source_board_id, external_id)
);
CREATE INDEX job_postings_hash_idx ON job_postings (content_hash);
CREATE INDEX job_postings_key_idx ON job_postings (canonical_key);
CREATE INDEX job_postings_filter_idx ON job_postings (normalized_role, country, status, posted_at DESC);
CREATE INDEX job_postings_company_idx ON job_postings (company_id);

CREATE TABLE job_description_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  content_hash  text NOT NULL,
  description   text NOT NULL,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, content_hash)
);
ALTER TABLE job_postings
  ADD CONSTRAINT job_postings_current_snapshot_fk FOREIGN KEY (current_snapshot_id) REFERENCES job_description_snapshots(id) DEFERRABLE INITIALLY DEFERRED;

-- ───────────────────────── extraction & evidence ─────────────────────────
CREATE TABLE job_skills (
  id                bigserial PRIMARY KEY,
  snapshot_id       uuid NOT NULL REFERENCES job_description_snapshots(id) ON DELETE CASCADE,
  job_id            uuid NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  skill_id          text NOT NULL REFERENCES skills(id),
  requirement       text NOT NULL CHECK (requirement IN ('required','preferred','mentioned')),
  confidence        numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  original_wording  text NOT NULL,
  is_alternative    boolean NOT NULL DEFAULT false,
  method            text NOT NULL,
  taxonomy_version  text NOT NULL,
  UNIQUE (snapshot_id, skill_id)
);
CREATE INDEX job_skills_skill_idx ON job_skills (skill_id, requirement);
CREATE INDEX job_skills_job_idx ON job_skills (job_id);

CREATE TABLE skill_evidence (
  id            bigserial PRIMARY KEY,
  job_skill_id  bigint NOT NULL REFERENCES job_skills(id) ON DELETE CASCADE,
  sentence      text NOT NULL,
  sent_start    int NOT NULL,
  sent_end      int NOT NULL,
  match_start   int NOT NULL,
  match_end     int NOT NULL,
  matched_text  text NOT NULL,
  section       text NOT NULL,
  requirement   text NOT NULL CHECK (requirement IN ('required','preferred','mentioned')),
  confidence    numeric(3,2) NOT NULL,
  CHECK (sent_start <= match_start AND match_end <= sent_end)
);
CREATE INDEX skill_evidence_job_skill_idx ON skill_evidence (job_skill_id);

-- ───────────────────────── scans ─────────────────────────
CREATE TABLE scan_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  role_id          text NOT NULL,
  region           text NOT NULL,
  target           int NOT NULL CHECK (target > 0),
  quota_startup    int NOT NULL,
  quota_mid        int NOT NULL,
  quota_large      int NOT NULL,
  state            text NOT NULL CHECK (state IN ('running','complete','partial','failed','cancelled')),
  started_at       timestamptz NOT NULL,
  finished_at      timestamptz,
  retrieved        int NOT NULL DEFAULT 0,
  valid            int NOT NULL DEFAULT 0,
  duplicates       int NOT NULL DEFAULT 0,
  inaccessible     int NOT NULL DEFAULT 0,
  rejected         int NOT NULL DEFAULT 0,
  surplus_valid    int NOT NULL DEFAULT 0,
  criteria         jsonb NOT NULL,
  broadening       jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings         jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance       text NOT NULL DEFAULT 'live' CHECK (provenance IN ('demo','live')),
  CHECK (valid <= target)
);

CREATE TABLE scan_results (
  scan_id        uuid NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
  candidate_key  text NOT NULL,
  job_id         uuid REFERENCES job_postings(id),
  -- the exact description version that was counted (history-safe)
  snapshot_id    uuid REFERENCES job_description_snapshots(id),
  status         text NOT NULL CHECK (status IN ('valid','duplicate','inaccessible','rejected','surplus')),
  reason         text,
  detail         text,
  duplicate_of   text,
  title          text,
  company_name   text,
  PRIMARY KEY (scan_id, candidate_key),
  CHECK (status <> 'valid' OR (job_id IS NOT NULL AND snapshot_id IS NOT NULL))
);
CREATE INDEX scan_results_job_idx ON scan_results (job_id);

CREATE TABLE scan_source_reports (
  scan_id      uuid NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
  board_key    text NOT NULL,
  status       text NOT NULL CHECK (status IN ('ok','failed','partial')),
  fetched      int NOT NULL,
  skipped      jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempts     int NOT NULL,
  http_status  int,
  error        text,
  retryable    boolean,
  at           timestamptz NOT NULL,
  PRIMARY KEY (scan_id, board_key)
);

-- ───────────────────────── demand snapshots (history for trends) ─────────────────────────
CREATE TABLE skill_demand_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id          uuid UNIQUE REFERENCES scan_runs(id) ON DELETE CASCADE,
  label            text NOT NULL,
  start_date       timestamptz NOT NULL,
  end_date         timestamptz NOT NULL,
  n                int NOT NULL CHECK (n >= 0),
  role_id          text NOT NULL,
  region           text NOT NULL,
  experience_band  text NOT NULL,
  company_mix      jsonb NOT NULL,
  provenance       text NOT NULL DEFAULT 'live' CHECK (provenance IN ('demo','live')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skill_demand_counts (
  snapshot_id  uuid NOT NULL REFERENCES skill_demand_snapshots(id) ON DELETE CASCADE,
  skill_id     text NOT NULL REFERENCES skills(id),
  jobs         int NOT NULL CHECK (jobs >= 0),
  required     int NOT NULL CHECK (required >= 0),
  preferred    int NOT NULL CHECK (preferred >= 0),
  PRIMARY KEY (snapshot_id, skill_id),
  CHECK (required + preferred <= jobs)
);

-- ───────────────────────── personalised outputs ─────────────────────────
CREATE TABLE job_matches (
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id             uuid NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  overall            numeric(5,2),
  skill_match        numeric(5,2),
  experience_status  text,
  components         jsonb NOT NULL,
  config_hash        text NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE learning_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_id     uuid REFERENCES scan_runs(id) ON DELETE SET NULL,
  plan        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE learning_progress (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_id  text NOT NULL,
  done_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, milestone_id)
);

CREATE TABLE daily_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date  date NOT NULL,
  payload      jsonb NOT NULL,
  notify       boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);

CREATE TABLE notification_preferences (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app           boolean NOT NULL DEFAULT true,
  push             boolean NOT NULL DEFAULT true,
  email            boolean NOT NULL DEFAULT false,
  only_significant boolean NOT NULL DEFAULT true,
  match_threshold  int NOT NULL DEFAULT 70 CHECK (match_threshold BETWEEN 0 AND 100)
);

CREATE TABLE notification_deliveries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date  date,
  channel      text NOT NULL CHECK (channel IN ('in_app','push','email')),
  status       text NOT NULL CHECK (status IN ('queued','sent','failed','suppressed')),
  reason       text,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_deliveries_user_idx ON notification_deliveries (user_id, created_at DESC);
