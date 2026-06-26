# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Which version are you working on?

This repo holds **two parallel versions side by side** — same product, different stacks. Read the user's intent before touching code.

| Version | Status | Stack | Use when |
|---|---|---|---|
| **v1** (`backend/` + `frontend/`) | ✅ Shipped, frozen | Express + Node + `jobs.json` + Gemini | User says "the local app", "v1", touches `backend/server.js`, or wants to run offline |
| **v2** (`backend-py/` + `frontend-v2/`) | 🚧 Active build | FastAPI + Python + Supabase + **Groq** (NOT Gemini) | User says "v2", "cloud", "login", "multi-user", or mentions auth/Supabase/Postgres |

**Do not back-port v2 features into v1.** v1 is treated as a frozen reference. New work goes in v2.

## Commands

### v1 — local single-user (Express + React)
```
npm run dev               # both v1 servers via concurrently
npm run dev:backend       # Express on :3001 (node --watch)
npm run dev:frontend      # Vite React on :5173
```
First run: `npm install` in root, `backend/`, and `frontend/`.

### v2 — cloud multi-user (FastAPI + React + Supabase)

Backend (`backend-py/`):
```
cd backend-py
.\venv\Scripts\activate            # Windows; setup-venv.bat creates it the first time
uvicorn main:app --reload --port 8000
```
Backend reads `backend-py/.env` (copy from `Env_example`). Required keys: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `FRONTEND_URL` for CORS.

Frontend (`frontend-v2/`):
```
cd frontend-v2
npm install
npm run dev               # Vite on :5173
```
Reads `frontend-v2/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (e.g. `http://localhost:8000`).

Quick connection smoke test (Groq + Supabase reachable): `python test-connections.py` at repo root.

## Architecture

### v1 architecture
- `backend/server.js` — Express ES modules on :3001; routes inline; sync `fs.readFileSync`/`writeFileSync` on `jobs.json`; auto-creates the file on first run.
- `backend/scraper.js` — `scrapeJob(url)`: og:meta → board-specific selectors (LinkedIn/Indeed) → generic h1 fallback.
- `backend/ai.js` — single Gemini `generateContent` call returning JSON with `coverLetter` / `resumeBullets` / `interviewQuestions` / `companyBrief`. Strips markdown fences, retries once on malformed JSON.
- `backend/jobs.json` — **gitignored runtime data**. Never commit; never read into responses meant for shared/public output.
- `backend/.env` — `GEMINI_API_KEY`, `PORT=3001`.
- Frontend (`frontend/src/`) — Vite + React, plain CSS, `@dnd-kit` drag-and-drop. State lifted to `App.jsx` (no router; `view` is a string toggle). Master resume in `localStorage["masterResume"]`. AI results persisted into `job.aiContent` so they survive refresh.

### v2 architecture
Three pieces, hosted separately:

- **`backend-py/`** — FastAPI on :8000.
  - `main.py` — all routes: `GET /health`, `GET /ai/test`, `POST /scrape`, `POST /ai/generate`, `POST /ai/ats-resume`, `POST /resume/pdf`. CORS allowlist includes `http://localhost:5173` and `FRONTEND_URL` env.
  - `ai.py` — Groq client (`llama-3.3-70b-versatile`), `@lru_cache` on the client init. Exposes `generate_ai_content`, `generate_ats_resume`, `test_connection`.
  - `scraper.py` — Python equivalent of v1's scraper (httpx + BeautifulSoup4).
  - `pdf.py` — `resume_to_pdf(text)` → bytes via **WeasyPrint**. Uploaded to Supabase Storage bucket `resumes` at `{user_id}/{job_id}/{uuid}.pdf` using the service-role key.
  - `Procfile` — Railway deployment hint.

- **`frontend-v2/`** — React + Vite + Supabase JS SDK.
  - `src/lib/supabase.js` — anon client singleton.
  - `src/components/AuthProvider.jsx` — wraps `supabase.auth.onAuthStateChange`; provides `{ session, user }` via context. `session === undefined` means "auth is still resolving"; `null` means signed out; object means signed in.
  - `src/App.jsx` — gates rendering on `session` (splash → `<Login>` → `<Onboarding>` → `<Board>`). **All hooks must be called above any conditional `return`** — historical bug where `useEffect` after early returns caused a blank screen after login; if you see hook-order issues, fix this first.
  - `src/api.js` — **CRUD (jobs / master_resumes / user_profiles / ats_resumes) goes directly to Supabase via supabase-js**, not through FastAPI. Only `scrape` / `ai/generate` / `ai/ats-resume` / `resume/pdf` hit the FastAPI backend.
  - `src/index.css` — same Linear-dark design system as v1 (canvas `#010102`, surfaces 1–4, accent `--primary: #5e6ad2` used scarcely).
  - `.env` is **committed** (anon key only) and read at Vite build time — do not move secrets here. Service-role key lives in `backend-py/.env` only.

- **`supabase/migrations/0001_init.sql`** — schema source of truth.
  - Tables: `user_profiles` (onboarding answers), `jobs` (the Kanban cards), `master_resumes` (one per user), `ats_resumes` (versioned, tied to a job).
  - **All tables have RLS enabled with `using (auth.uid() = user_id)` policies** — the browser talks to Postgres directly, so a buggy frontend physically cannot leak data across users.
  - Status check constraint on `jobs.status`: `wishlist | applied | interviewing | offer | rejected`.
  - Indexes: `jobs(user_id, status, added_at desc)`, `ats_resumes(job_id, version desc)`.

### v2 known gaps (in active build)
- `jobs.source` column does not exist yet. SuggestionsRail (v1.4) will add it via a follow-up migration. Until then, source provenance is stashed in `jobs.notes` as text like `"Source: LinkedIn"`.
- No SuggestionsRail UI yet — empty board shows zero suggestions; v1.4 plan covers fan-out across Indeed (MCP) / ZipRecruiter (MCP) / RemoteOK / HN / web search.
- ATS resume diff modal (the side-by-side view) is planned but not implemented; `generateATSResume` already returns the rewritten text.

## AI Model

- **v1: Google Gemini 2.0 Flash** via `@google/generative-ai` (`gemini-1.5-flash` is deprecated in v1beta — don't reintroduce). If `/api/ai/test` returns `"limit: 0"`, the key authenticates but its GCP project has zero free-tier quota. Fix: aistudio.google.com/app/apikey → "Create API key in **new project**".
- **v2: Groq `llama-3.3-70b-versatile`** via the `groq` Python SDK. Free tier: ~6K req/day. Client is cached with `@lru_cache(maxsize=1)`. The prompt template returns a single JSON object — `ai.py` is responsible for fence-stripping and parse retry.

## Design System

Linear-inspired dark theme, identical across v1 and v2. Key tokens in `index.css :root`: canvas `#010102`, surfaces `--surface-1` through `--surface-4`, accent `--primary: #5e6ad2` (used scarcely — CTA, focus ring, links only). Font: Inter. Border radii: `--r-md` 8px (buttons/inputs), `--r-lg` 12px (cards), `--r-xl` 16px (modals). Don't introduce a second chromatic accent and don't switch to true `#000` black.

## Repo & Plans

- GitHub: [nilesh0901/AI-Job-Finder](https://github.com/nilesh0901/AI-Job-Finder) (private). Default branch `master`. PRs use `gh` CLI.
- `README.md` — public-facing project overview (v1 + v2). Update when shipping user-visible features.
- `HANDOFF.md` — most recent session handoff notes; read this first if resuming work after a gap.
- `v2-plan.md` — root-level v2 build plan with phases and verification checkpoints.
- `~/.claude/plans/plug-a-web-application-typed-nygaard.md` — original v2 deployment plan written in plan mode. Now superseded by `v2-plan.md` + `HANDOFF.md`; treat as historical.
- `test-connections.py` — quick Groq + Supabase reachability check at repo root.
- `push-v1.2.bat` / `setup-venv.bat` — Windows helper scripts. Read before modifying.
