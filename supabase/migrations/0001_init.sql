-- AI Job Finder v2 — Initial Schema
-- Run this in Supabase SQL Editor → New Query → Run

create table public.user_profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  full_name            text,
  field                text,
  years_experience     int,
  tech_stack           text[],
  domain               text,
  expected_salary_min  int,
  expected_salary_max  int,
  expected_salary_currency text default 'USD',
  onboarding_done      boolean default false,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  status           text not null check (status in ('wishlist','applied','interviewing','offer','rejected')),
  title            text not null,
  company          text,
  location         text,
  url              text,
  raw_description  text,
  notes            text default '',
  ai_content       jsonb default '{}'::jsonb,
  added_at         timestamptz default now(),
  updated_at       timestamptz default now()
);

create table public.master_resumes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  content    text not null,
  updated_at timestamptz default now()
);

create table public.ats_resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  version     int not null default 1,
  content     text not null,
  pdf_url     text,
  created_at  timestamptz default now()
);

alter table public.user_profiles  enable row level security;
alter table public.jobs           enable row level security;
alter table public.master_resumes enable row level security;
alter table public.ats_resumes    enable row level security;

create policy "own profile" on public.user_profiles  for all using (auth.uid() = user_id);
create policy "own jobs"    on public.jobs           for all using (auth.uid() = user_id);
create policy "own resume"  on public.master_resumes for all using (auth.uid() = user_id);
create policy "own ats"     on public.ats_resumes    for all using (auth.uid() = user_id);

create index jobs_user_status_idx on public.jobs (user_id, status, added_at desc);
create index ats_job_version_idx  on public.ats_resumes (job_id, version desc);
