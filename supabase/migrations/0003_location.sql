-- AI Job Finder v2.1 — Location preferences
-- Run this in Supabase SQL Editor → New Query → Run
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.

-- Location preference for job suggestions. Defaults to India (primary audience).
alter table public.user_profiles
  add column if not exists preferred_country text default 'India';

alter table public.user_profiles
  add column if not exists preferred_city text default '';

-- Whether worldwide-remote roles should be included alongside local jobs.
alter table public.user_profiles
  add column if not exists open_to_remote boolean default true;
