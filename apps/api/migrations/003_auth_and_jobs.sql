-- Password auth (scrypt hash) and a lightweight job-run ledger for the worker.
ALTER TABLE users ADD COLUMN password_hash text;

CREATE TABLE worker_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('daily','scan')),
  run_key     text NOT NULL,                -- idempotency key, e.g. 'daily:2026-10-27'
  state       text NOT NULL CHECK (state IN ('running','succeeded','failed')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (kind, run_key)
);

-- Scans may be saved without creating a demand snapshot (daily refreshes);
-- trends only compare snapshots, taken at most every few days.
ALTER TABLE scan_runs ADD COLUMN snapshot_created boolean NOT NULL DEFAULT true;
