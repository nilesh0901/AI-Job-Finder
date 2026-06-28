-- v2.2 migration: Fit Score + Job Card metadata columns
-- Run in Supabase SQL editor BEFORE deploying version2.2.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fit_score     numeric(4,1);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fit_label     text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type      text;        -- full-time / part-time / contract
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_mode     text;        -- remote / onsite / hybrid
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS seniority     text;        -- junior / mid / senior / lead
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_text   text;        -- raw salary string from scraper
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_logo_url text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS viewed_at     timestamptz;
