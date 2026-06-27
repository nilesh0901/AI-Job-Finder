-- AI Job Finder v2.1 — Schema additions
-- Run this in Supabase SQL Editor → New Query → Run
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.

-- ── Version2.0 columns (in case they weren't applied via the manual snippet) ──
alter table public.ats_resumes
  add column if not exists master_resume_snapshot text;

create table if not exists public.ats_resume_feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ats_resume_id uuid references public.ats_resumes(id) on delete cascade,
  job_id        uuid references public.jobs(id) on delete cascade,
  rating        smallint check (rating between 1 and 5),
  kept_changes  boolean,
  comments      text,
  created_at    timestamptz default now()
);

alter table public.ats_resume_feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ats_resume_feedback' and policyname = 'own feedback'
  ) then
    create policy "own feedback" on public.ats_resume_feedback
      for all using (auth.uid() = user_id);
  end if;
end $$;

-- ── v2.1-B: user preference columns ──────────────────────────────────────────
-- Custom skills typed by users (not in the preset list)
alter table public.user_profiles
  add column if not exists custom_skills text[] default '{}';

-- Job freshness preference: 1, 7, or 15 days
alter table public.user_profiles
  add column if not exists job_freshness_days int default 7;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_job_freshness_days_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_job_freshness_days_check
      check (job_freshness_days in (1, 7, 15));
  end if;
end $$;

-- ── v2.1-C: source tracking for jobs ─────────────────────────────────────────
alter table public.jobs
  add column if not exists source text default 'manual';

alter table public.jobs
  add column if not exists is_suggestion boolean default false;

-- Index for fast suggestion lookup
create index if not exists jobs_suggestions_idx
  on public.jobs (user_id, is_suggestion, added_at desc);
