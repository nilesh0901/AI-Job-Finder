# AI Job Finder

> Kanban-style job application tracker with AI-powered cover letters, resume bullets, interview prep, ATS-optimized resumes, and live job suggestions — built for job seekers who want to stay organized and apply smarter.

The repo holds **two parallel versions** of the same product:

| Version | Status | Stack | Best for |
|---|---|---|---|
| **v1** — local app | ✅ Shipped (frozen) | Express + React + `jobs.json` + Google Gemini | Running offline on a single machine |
| **v2** — cloud app | ✅ Live | FastAPI + React + Supabase + Groq | Multi-user, accessible from any device |

v2 is the actively developed version. v1 remains a self-contained local app.

---

## v2 — Cloud App

Multi-user, hosted, and database-backed. Sign up with Google or email and your board follows you across devices.

### Features

- **Multi-user auth** — Google SSO + email/password via Supabase Auth; every user's data is isolated by Postgres Row-Level Security.
- **Kanban board** — drag jobs across Wishlist → Applied → Interviewing → Offer → Rejected. Fully mobile-responsive with a tabbed layout on small screens.
- **Add by URL or manually** — paste a job posting URL and the scraper extracts title, company, location, and description; login-walled sites (LinkedIn/Indeed) return a clear "paste manually" message.
- **4-in-1 AI generation** — one click produces a tailored cover letter, resume bullets, interview prep, and a company brief, grounded in your master resume.
- **ATS resume tailoring** — surgically rewrites your master resume for a specific job (additive skills, rephrased bullets, never fabricated facts), with:
  - **Final / Diff toggle** — side-by-side comparison against the master resume used at generation time
  - **ATS Score panel** — overall / keyword / structure scores, matched & missing keywords, and concrete fix tips
  - **Star feedback** — rate each version (1–5), record whether you kept the changes, and leave a comment
  - **Version history** — every generation is stored and re-openable
  - **PDF export** — download any version as a formatted PDF
- **Job suggestions** — a Suggested rail seeds your board with live openings pulled from **RemoteOK**, **Arbeitnow**, and **Hacker News "Who is Hiring"**, filtered by your profile keywords and freshness preference, URL-validated and de-duplicated against your board. Drag a suggestion into any column to promote it to a tracked job.
- **Onboarding** — a first-login wizard captures your field, experience, tech stack (including free-text custom skills), salary expectations, and how recent you want suggested jobs to be.

### Tech stack

- **Frontend** — React + Vite, Linear-inspired dark theme, `@dnd-kit` drag-and-drop, `react-diff-viewer-continued`; deployed on **Vercel**.
- **Backend** — Python **FastAPI** + Uvicorn; deployed on **Railway**.
- **Database / Auth / Storage** — **Supabase** (Postgres + RLS + Auth + Storage).
- **AI** — **Groq** `llama-3.3-70b-versatile`.
- **Scraper** — `httpx` + BeautifulSoup4.
- **PDF** — WeasyPrint (server-side, no external service).

### Architecture

```
Browser (React on Vercel)
  ├─ supabase-js  →  Supabase Postgres + Auth + Storage   (all CRUD, RLS-protected)
  └─ fetch(/api/*)  →  FastAPI on Railway                 (only secret-key / server-side work)
                          ├─ POST /scrape
                          ├─ POST /ai/generate
                          ├─ POST /ai/ats-resume
                          ├─ POST /ai/ats-score
                          ├─ POST /resume/pdf
                          ├─ POST /suggestions/refresh
                          ├─ GET  /suggestions/status
                          └─ GET  /ai/test
```

CRUD (jobs, resumes, profiles, ATS versions, feedback) goes directly from the browser to Supabase. The FastAPI backend only handles work that needs a secret key or server-side fetch (AI, scraping, PDF generation, job suggestions).

### Database schema

| Table | Purpose |
|---|---|
| `user_profiles` | Onboarding answers — field, domain, experience, `tech_stack`, `custom_skills`, salary, `job_freshness_days` |
| `jobs` | Kanban cards — status, details, `source`, `is_suggestion` |
| `master_resumes` | One base resume per user |
| `ats_resumes` | Versioned ATS resumes per job, with `master_resume_snapshot` |
| `ats_resume_feedback` | Per-version rating (1–5), kept-changes flag, comments |

All tables have RLS enabled with `auth.uid() = user_id` policies. Migrations live in [`supabase/migrations/`](supabase/migrations/) — run them in order in the Supabase SQL editor.

### Local development

**Backend** (`backend-py/`) — needs Python 3.11+:
```bash
cd backend-py
python -m venv venv && .\venv\Scripts\activate      # Windows
pip install -r requirements.txt
# .env from Env_example: GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL
uvicorn main:app --reload --port 8000
```

**Frontend** (`frontend-v2/`) — needs Node 18+:
```bash
cd frontend-v2
npm install
# .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
npm run dev          # http://localhost:5174
```
In dev, the Vite proxy forwards `/api/*` → `localhost:8000`, so `VITE_API_BASE_URL` can be left blank.

Quick reachability check (Groq + Supabase): `python test-connections.py` at the repo root.

### Free services used

| Service | Provides | Free limit |
|---|---|---|
| [Vercel](https://vercel.com) | Frontend hosting + CDN | Hobby tier |
| [Railway](https://railway.app) | FastAPI backend hosting | $5/month credit |
| [Supabase](https://supabase.com) | Postgres + Auth + Storage | 500 MB DB, 1 GB storage, 50K MAU |
| [Groq](https://console.groq.com) | LLM inference | ~6K requests/day |

---

## v1 — Local App

A fully offline, single-user version. All data lives in `jobs.json` on your machine.

### Features
- Kanban board with drag-and-drop across the five statuses
- URL scraper (og:meta → board-specific selectors → generic fallback)
- 4-in-1 AI generation (cover letter, resume bullets, interview prep, company brief) via Google Gemini
- Per-job notes, master resume context, results persisted locally

### Tech stack
- **Frontend** — React + Vite, plain CSS, `@dnd-kit`
- **Backend** — Node.js + Express (ES modules)
- **AI** — Google Gemini 2.0 Flash
- **Storage** — `jobs.json` flat file (gitignored)

### Quick start
**Prerequisites:** Node 18+, a free [Gemini API key](https://aistudio.google.com/app/apikey).
```bash
git clone https://github.com/nilesh0901/AI-Job-Finder.git
cd AI-Job-Finder
npm install && cd backend && npm install && cd ../frontend && npm install && cd ..
echo "GEMINI_API_KEY=your_key_here" > backend/.env
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

> **Tip:** If AI generation returns `"limit: 0"`, your Google Cloud project has zero free-tier quota. Fix at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → "Create API key in **new project**".

---

## Roadmap

| Version | Status | Features |
|---|---|---|
| v2.0 | ✅ Shipped | ATS score panel, diff view, star feedback, master-resume snapshot |
| v2.1 | ✅ Shipped | Scraper hardening, onboarding upgrade, job suggestions agent + Suggested rail |
| v2.2 | Planned | Email digests, Google Calendar interview sync, application analytics |
| v2.3 | Planned | AI fit scores, A/B cover letters, auto-rejection detection |
| v2.4 | Planned | Browser extension, mobile PWA, shared boards |
| v3.0 | Planned | Tiered plans + Stripe billing |

---

## Project structure

```
AI Job Finder/
├─ backend/             ← v1 Node.js + Express backend
├─ frontend/            ← v1 React + Vite frontend
├─ backend-py/          ← v2 FastAPI backend (main.py, ai.py, scraper.py, suggestions.py, pdf.py)
├─ frontend-v2/         ← v2 React frontend
├─ supabase/migrations/ ← SQL schema (0001_init.sql, 0002_v2_1.sql)
├─ TESTING_AGENT.md     ← automated QA test plan for the live app
├─ v2-plan.md / v2.1-plan.md  ← build plans
└─ README.md
```

---

## About

Built by [Nilesh Kumar](https://github.com/nilesh0901) to bring structure and AI leverage to the job search. Most job seekers are scattered across spreadsheets, browser tabs, and email threads — this app centralizes tracking, AI content generation, ATS-optimized resumes, and live job discovery in one place.

**Why FastAPI for v2?** The roadmap includes LangGraph agents, resume embeddings, and fit scoring — all Python-native — so FastAPI now avoids a language migration later.

## License

MIT
