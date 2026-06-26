# AI Job Finder — v2 Cloud Deployment Plan
> Last updated: 2026-06-26

## What Changed from v1
v1 is a fully working **local** app — Express (Node.js) backend + React frontend + `jobs.json` file storage + Gemini AI.  
v2 takes the same product **live as a multi-user cloud app**, replacing the local file store with Supabase Postgres and adding auth, PDF resume generation, and mobile-responsive UI.

---

## Confirmed Stack

| Layer | Tool | Free tier |
|---|---|---|
| Frontend | React (fresh, mobile-first) | Vercel Hobby — unlimited |
| Backend | FastAPI + Uvicorn (Python) | Railway — $5/month credit |
| Database | Supabase Postgres | 500 MB, free forever |
| Auth | Supabase Auth | 50K MAU, free |
| File storage | Supabase Storage | 1 GB, free |
| AI | Google Gemini Flash | Free tier |
| Frontend hosting | Vercel | Free, no cold starts, global CDN |
| Backend hosting | Railway | No 15-min sleep (unlike Render) |

**Total cost at launch: $0**

---

## All Free Cloud Services

### Hosting
- **Vercel** — React frontend. Global CDN, instant preview deploys on every branch push. Best free frontend host available.
- **Railway** — Python FastAPI backend. $5/month free credit. No cold starts. Persistent server process (unlike Vercel serverless for Python).
- **Render** (backup) — Free tier, but 15-min cold start. Use only if Railway runs out.

### Database, Auth, Storage
- **Supabase** — One free project gives you: Postgres DB + Auth (Google SSO + email/password) + File Storage + Row-Level Security. Replaces Firebase, Auth0, S3, and standalone Postgres in one console.

### AI
- **Google Gemini Flash** — Already in v1. Free tier handles early users.
- **Groq** (future fallback) — Free tier, extremely fast LLM inference.

### PDF Generation
- **WeasyPrint** / **ReportLab** — Python libraries that run inside FastAPI. No external service. Generate PDF on server → upload to Supabase Storage → return download URL.

### Monitoring (optional, free)
- **Sentry** — Error tracking for both React + FastAPI. Free for small apps.
- **Posthog** — Product analytics. Free up to 1M events/month.

---

## Target Architecture

```
Browser (React on Vercel)  ←  mobile + desktop responsive
  ├─ supabase-js  →  Supabase (jobs CRUD, resume history, auth, file storage)
  └─ fetch('/api/*')  →  FastAPI on Railway
                            ├─ POST /scrape           (URL → job data)
                            ├─ POST /ai/generate      (Gemini → cover letter, bullets, interview prep)
                            ├─ POST /ai/ats-resume    (Gemini → ATS resume text)
                            ├─ POST /resume/pdf        (ATS resume text → PDF → Supabase Storage)
                            └─ GET  /ai/test           (Gemini key health check)
```

Frontend talks to Supabase directly for all CRUD (jobs, profiles, resumes).  
FastAPI exists only for things that need a secret key (Gemini) or server-side fetch (URL scraping, PDF generation).

---

## Folder Layout (v2)

```
AI Job Finder/                     ← repo root
├─ backend/                        ← v1 Node.js (kept for reference)
│   └─ _legacy/                    ← renamed, not deleted
├─ backend-py/                     ← NEW: FastAPI backend
│   ├─ main.py                     ← FastAPI app, all routes
│   ├─ scraper.py                  ← port of backend/scraper.js → Python/httpx/BeautifulSoup
│   ├─ ai.py                       ← port of backend/ai.js → google-generativeai Python SDK
│   ├─ pdf.py                      ← NEW: ATS resume → PDF via WeasyPrint
│   ├─ requirements.txt            ← all Python deps
│   ├─ Procfile                    ← Railway start command
│   └─ .env                        ← local only (gitignored)
├─ frontend-v2/                    ← NEW: fresh React app
│   ├─ src/
│   │   ├─ lib/supabase.js         ← Supabase client singleton
│   │   ├─ components/
│   │   │   ├─ AuthProvider.jsx    ← session context (Google + email auth)
│   │   │   ├─ Login.jsx           ← login/register UI
│   │   │   ├─ Onboarding.jsx      ← first-login profile setup wizard
│   │   │   ├─ Board.jsx           ← Kanban board (responsive)
│   │   │   ├─ Column.jsx          ← droppable column
│   │   │   ├─ JobCard.jsx         ← draggable card
│   │   │   ├─ JobDetailModal.jsx  ← AI gen + ATS resume + version history
│   │   │   ├─ AddJobModal.jsx     ← URL scrape or manual paste
│   │   │   └─ Settings.jsx        ← profile + master resume
│   │   ├─ api.js                  ← supabase-js calls + fetch(/api/*)
│   │   └─ App.jsx                 ← root, session gate
│   ├─ index.html
│   └─ vite.config.js
├─ supabase/
│   └─ migrations/
│       └─ 0001_init.sql           ← schema (run in Supabase SQL editor)
├─ docs/                           ← GitHub Pages landing page
│   └─ index.html
├─ README.md                       ← project overview + v1/v2 docs
└─ vercel.json                     ← frontend deploy config
```

---

## Database Schema

```sql
-- Supabase Auth manages auth.users automatically.

create table public.user_profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  full_name            text,
  field                text,            -- e.g. "AI Engineering"
  years_experience     int,
  tech_stack           text[],          -- e.g. {Python, LangGraph, FastAPI}
  domain               text,            -- e.g. "Agentic AI / LLM Orchestration"
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
  content     text not null,        -- ATS resume text (editable)
  pdf_url     text,                 -- Supabase Storage URL for download
  created_at  timestamptz default now()
);

-- Row-Level Security: every user sees only their own rows
alter table public.user_profiles  enable row level security;
alter table public.jobs           enable row level security;
alter table public.master_resumes enable row level security;
alter table public.ats_resumes    enable row level security;

create policy "own profile" on public.user_profiles  for all using (auth.uid() = user_id);
create policy "own jobs"    on public.jobs           for all using (auth.uid() = user_id);
create policy "own resume"  on public.master_resumes for all using (auth.uid() = user_id);
create policy "own ats"     on public.ats_resumes    for all using (auth.uid() = user_id);

-- Indexes for performance
create index jobs_user_status_idx  on public.jobs (user_id, status, added_at desc);
create index ats_job_version_idx   on public.ats_resumes (job_id, version desc);
```

---

## Build Phases

### Phase 1 — Provisioning (30 min, manual — user does this)
- Create Supabase project → run schema SQL in SQL editor
- Enable Email + Google auth providers in Supabase
- Create Railway project → connect GitHub repo → set env vars
- Connect GitHub repo to Vercel → set env vars

### Phase 2 — FastAPI Backend (~2 hrs, Claude builds)
- `backend-py/` with `main.py`, `scraper.py`, `ai.py`, `pdf.py`, `requirements.txt`
- Routes: `/scrape`, `/ai/generate`, `/ai/ats-resume`, `/resume/pdf`, `/ai/test`
- Python equivalents of Node.js scraper (httpx + BeautifulSoup4) and AI module (google-generativeai)
- Local test: `uvicorn main:app --reload`
- Deploy to Railway

### Phase 3 — Fresh React Frontend (~4 hrs, Claude builds)
- New Vite React app in `frontend-v2/`
- Mobile-first dark theme (Linear-inspired, same design language as v1)
- Supabase Auth: Google SSO + email/password login screen
- Onboarding wizard (field, experience, tech stack, salary → saves to user_profiles)
- Responsive Kanban board (collapses to tabs/swipe on mobile)
- Rewritten `api.js` using supabase-js for CRUD + fetch for AI endpoints

### Phase 4 — ATS Resume Feature (~3 hrs, Claude builds)
- Gemini prompt: job description + master resume + user profile → ATS-optimized resume text
- New endpoint `POST /ai/ats-resume` in FastAPI
- `POST /resume/pdf`: WeasyPrint renders resume → uploads to Supabase Storage → returns URL
- `ats_resumes` table stores each version; UI shows history per job with diff view
- Download button in JobDetailModal

### Phase 5 — Deploy + GitHub Push (~1 hr)
- Push to `feature/v2-cloud` branch
- Vercel auto-deploys preview URL
- Smoke test: sign up → onboarding → add job → drag → generate AI → download PDF → log out → log back in → data persists
- Merge to master → tag `v2.0.0`
- GitHub Pages landing page at `nilesh0901.github.io/AI-Job-Finder/`

---

## Verification Checkpoints

| Phase | How to verify |
|---|---|
| 1 | Supabase SQL editor: `select * from jobs` returns 0 rows (no error). Google login button appears in Auth → Providers. |
| 2 | `curl http://localhost:8000/ai/test` → `{"ok": true}`. Scrape endpoint returns title/company for a real job URL. |
| 3 | Sign up with new email → board empty → add job → drag → log out → incognito → log back in → data persists. |
| 4 | In JobDetailModal: click "Generate ATS Resume" → see resume text → click "Download PDF" → file downloads. Supabase Storage shows the PDF. |
| 5 | Open live Vercel URL incognito → sign up → smoke test all features. Supabase dashboard → `jobs` table has 1 row. |

---

## Auth Decisions

| Question | Decision |
|---|---|
| Login methods | Google SSO + Email/Password (both via Supabase Auth) |
| First-login flow | Onboarding wizard: field → experience → tech stack → salary range |
| Session persistence | Supabase handles JWT refresh automatically |

---

## Out of Scope for v2.0 (Deferred)

- **RemoteOK connector** — first feature after v2.0 ships (v2.1)
- **Email digests, calendar integration** (v2.2)
- **AI fit scores, A/B cover letters, auto-rejection detection** (v2.3)
- **Browser extension, mobile PWA, shared boards** (v2.4)
- **Tiered plans + Stripe** (v3.0)
