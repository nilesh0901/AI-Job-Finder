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
npm run dev               # Vite on :5174 (set in vite.config.js)
```
Reads `frontend-v2/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (e.g. `http://localhost:8000`). For local dev the Vite proxy in `vite.config.js` forwards `/api/*` → `localhost:8000` (and strips the `/api` prefix), so `VITE_API_BASE_URL` can be left blank and `api.js` will use the relative `/api` fallback.

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
  - `main.py` — all routes: `GET /health`, `GET /ai/test`, `POST /scrape`, `POST /ai/generate`, `POST /ai/ats-resume`, `POST /ai/ats-score`, `POST /resume/pdf`. CORS allowlist: `http://localhost:5173`, `http://localhost:5174`, `http://localhost:3000`, plus `os.getenv("FRONTEND_URL", "")` and `allow_origin_regex=r"https://.*\.vercel\.app"` for preview deployments — the Vercel URL **must** be set in Railway env vars or production calls fail the preflight (see "Deployment gotchas" below).
  - `ai.py` — Groq client (`llama-3.3-70b-versatile`), `@lru_cache` on the client init. Exposes `generate_ai_content`, `generate_ats_resume`, `score_ats_resume`, `test_connection`.
  - `railway.toml` — forces nixpacks builder and `uvicorn main:app --host 0.0.0.0 --port $PORT` start command. Required because Railway's cached `railpack-plan.json` otherwise wins and runs `node server.js` instead of uvicorn.
  - `scraper.py` — Python equivalent of v1's scraper (httpx + BeautifulSoup4).
  - `pdf.py` — `resume_to_pdf(text)` → bytes via **fpdf2** (pure Python, no native libs). WeasyPrint was removed because Railway's nixpacks image lacks the GObject/Pango/Cairo chain it needs. fpdf2 uses core latin-1 fonts; `_sanitize()` maps smart-quotes, em-dashes, and `•` → `·` (middle dot) before encoding.
  - `requirements.txt` — uses `fpdf2==2.8.1` (not weasyprint).
  - `Procfile` — Railway deployment hint.

- **`frontend-v2/`** — React + Vite + Supabase JS SDK. Notable deps: `@dnd-kit/core` + `@dnd-kit/sortable` (Kanban drag), `react-diff-viewer-continued` (ATS resume side-by-side diff).
  - `src/lib/supabase.js` — anon client singleton.
  - `src/components/AuthProvider.jsx` — wraps `supabase.auth.onAuthStateChange`; provides `{ session, user }` via context. `session === undefined` means "auth is still resolving"; `null` means signed out; object means signed in.
  - `src/App.jsx` — gates rendering on `session` (splash → `<Login>` → `<Onboarding>` → `<Board>`). **All hooks must be called above any conditional `return`** — historical bug where `useEffect` after early returns caused a blank screen after login; if you see hook-order issues, fix this first. **Also: any `useEffect` that triggers a data load must depend on `session?.user?.id` (a stable string), not `session` (a fresh object). Supabase mints a new session object on every token refresh and tab-visibility change — depending on `session` causes data reloads and splash flashes on every tab switch.**
  - `src/api.js` — **CRUD (jobs / master_resumes / user_profiles / ats_resumes / ats_resume_feedback) goes directly to Supabase via supabase-js**, not through FastAPI. Only `scrape` / `ai/generate` / `ai/ats-resume` / `ai/ats-score` / `resume/pdf` hit the FastAPI backend. `scrapeJob()` throws on non-2xx; the other AI calls throw on `!r.ok` with the response text — propagate these to a visible UI error, never swallow. `saveATSResume` takes a `masterResumeSnapshot` param (3rd arg) — always pass the current master resume so the diff view is accurate for that version.
  - `src/index.css` — same Linear-dark design system as v1 (canvas `#010102`, surfaces 1–4, accent `--primary: #5e6ad2` used scarcely).
  - `.env` is **committed** (anon key only) and read at Vite build time — do not move secrets here. Service-role key lives in `backend-py/.env` only.

- **`supabase/migrations/`** — schema source of truth (run in order).
  - `0001_init.sql` — base schema: `user_profiles`, `jobs`, `master_resumes`, `ats_resumes`, `ats_resume_feedback`.
  - `0002_*` — `master_resume_snapshot text` column on `ats_resumes` (added Version2.0). Stores the exact master resume at generation time so the diff view stays accurate even after the master is edited.
  - `0003_location.sql` — adds `preferred_country text default 'India'`, `preferred_city text default ''`, `open_to_remote boolean default true` to `user_profiles` (Version2.1 / PR #18). Run this before deploying the India suggestions feature.
  - `ats_resume_feedback` — `rating smallint` (1–5), `kept_changes boolean`, `comments text`; RLS `using (auth.uid() = user_id)`.
  - **All tables have RLS enabled with `using (auth.uid() = user_id)` policies** — the browser talks to Postgres directly, so a buggy frontend physically cannot leak data across users.
  - Status check constraint on `jobs.status`: `wishlist | applied | interviewing | offer | rejected`.
  - Indexes: `jobs(user_id, status, added_at desc)`, `ats_resumes(job_id, version desc)`.

### v2 shipped features
- **ATS resume tab** (`JobDetailModal.jsx` → tab 4, Version2.0): Final/Diff toggle, `◎ ATS Score` button, star feedback widget (1–5 + kept-changes + comment), version history. ReactDiffViewer wrapped in `.ats-diff-scroll` (max-height 520px, scrollable) — don't revert to `overflow: hidden` on the parent.
- **ATS Score panel**: calls `POST /ai/ats-score` → `score_ats_resume()` in `ai.py`. Returns `overall_score`, `keyword_score`, `structure_score`, `keywords_found`, `keywords_missing`, `improvements`. Displayed as a dial + breakdown chips + fix tips.
- **master_resume_snapshot**: stored per ATS version in `ats_resumes.master_resume_snapshot`. Diff view uses this as `oldValue`; falls back to current `masterResume` state for older rows that lack it.
- **PDF export** (`POST /resume/pdf`): fpdf2 generates the PDF; `_upload_pdf_to_supabase()` in `main.py` auto-creates the `resumes` bucket on first call (idempotent `POST /storage/v1/bucket`), uploads the file, then mints a **signed URL** (1-hour expiry via `POST /storage/v1/object/sign/{bucket}/{path}`) — returns `{supabase_url}/storage/v1{signedURL}`. Public URLs were replaced with signed URLs because the bucket is private (personal resume data).
- **Suggestion cards — AI content fix** (`JobDetailModal.jsx`): suggestion jobs from RemoteOK/Arbeitnow/HN have `raw_description = null`. A `jobDescription` const now coalesces `job.raw_description || job.notes || job.title || ''` and is used in all three AI handlers (`handleGenerateAI`, `handleGenerateATS`, `handleScore`). Backend Pydantic models (`GenerateRequest`, `ATSResumeRequest`, `ATSScoreRequest`) accept `str | None = ""` so a missing description no longer causes a 422.
- **Suggested column first** (`Board.jsx`): SuggestionsRail `<div>` rendered before `{COLUMNS.map(...)}` on desktop; mobile tab order is `['suggested', ...COLUMNS]`.
- **Status pills removed** (`JobDetailModal.jsx`): the `STATUSES` constant, `status` state, `handleStatusChange`, and the `<div className="status-row">` block were all deleted from the modal.
- **India-region job suggestions + location preference** (Version2.1, PR #18):
  - `suggestions.py` completely rewritten: fans out to 5 sources — **Adzuna** (uses `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`; India endpoint `/v1/api/jobs/in/search/1`), **Jooble** (uses `JOOBLE_API_KEY`; POST with keywords + location), plus RemoteOK, Arbeitnow, HN. All sources are location-filtered via `_location_ok()` — keeps remote jobs (if `open_to_remote=true`) and jobs matching the user's country/city; drops unrelated regions.
  - `refresh_suggestions()` reads `preferred_country` (default `India`), `preferred_city`, `open_to_remote` from the user's profile row.
  - `Onboarding.jsx` now has **6 steps**: Field → Location → Experience → Tech Stack → Salary → Job Alerts. The Location step (step 1) has a country dropdown (default India), optional city input, and a remote-jobs toggle.
  - `Settings.jsx` has the same three location fields so existing users can update their preference.
  - `supabase/migrations/0003_location.sql` adds `preferred_country text default 'India'`, `preferred_city text default ''`, `open_to_remote boolean default true` to `user_profiles`. **Run this in the Supabase SQL editor before merging PR #18.**
  - `Env_example` documents `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (developer.adzuna.com), `JOOBLE_API_KEY` (jooble.org/api/about) — optional; sources skip gracefully if absent.
  - `index.css` adds `.remote-toggle` styles.

### v2 known gaps (in active build)
- `jobs.source` column does not exist yet. Source provenance is stashed in `jobs.notes` as text like `"Source: RemoteOK"` until a migration adds the column.
- New-user post-onboarding wishlist auto-seeding is pending (suggestions currently require a manual refresh trigger).

## Deployment gotchas (v2)

Two prod-only misconfigs we've hit more than once — check these first when something works locally but fails on Vercel:

- **`VITE_API_BASE_URL` on Vercel must start with `https://`.** Without the protocol, the browser treats it as a relative path and POSTs `/ai/generate` to the Vercel domain → Vercel returns **405 Method Not Allowed**. Set it to the full `https://your-app.up.railway.app` (no trailing slash). Vite bakes env vars at **build time**, so after editing → **Redeploy** from the Vercel dashboard; just saving the env var won't propagate.
- **`FRONTEND_URL` on Railway must equal the Vercel URL** (with `https://`, no trailing slash). It feeds the CORS allowlist in `main.py`. Missing/wrong value → CORS preflight rejection → browser console shows **"Failed to fetch"** with no body. Note: Supabase calls keep working in this state because they go to Supabase, not Railway — so a half-broken board (auth + CRUD fine, AI buttons dead) is the signature of a Railway CORS misconfig.
- **Supabase Auth → URL Configuration**: Site URL and Redirect URLs must include the Vercel URL (with `/**` wildcards). Otherwise Google SSO completes but redirects to `localhost:3000`.
- **Railway public domain**: the auto-assigned `*.railway.internal` hostname is private and unreachable from a browser. Use Settings → Networking → **Generate Domain** to get the public `*.up.railway.app` URL.

## PR discipline

**Always verify the last commit is on the branch before opening a PR.** The pattern that bit us three times: a fix was coded, the PR was opened, the user merged it — then the final commit arrived *after* merge, meaning production never got the fix. Checklist before `gh pr create`:
1. `git log --oneline -5` — confirm the fix commit is listed.
2. `git push` — confirm it reaches the remote.
3. Only then open the PR.

If a fix commit missed a PR that was already merged, create a **fresh branch off master** (e.g. `hotfix/...`), cherry-pick the missing commit(s) onto it, and open a new PR.

## Patterns and recurring bug classes

- **`toIntOrNull()` for numeric inputs.** `Onboarding.jsx` and `Settings.jsx` both define this helper. Any HTML `<input type="number">` value bound to a `useState` starts as `''`, and an empty string sent to a Postgres `int` column throws `22P02 invalid input syntax for type integer: ""`. Coerce every numeric field before `upsert` — `years_experience`, `expected_salary_min`, `expected_salary_max`.
- **Validate URLs before seeding `jobs` rows.** When inserting jobs server-side (via service-role Python bypassing RLS), HEAD-check each URL first. Dead-link suggestions erode end-user trust faster than missing data — there was an incident in v1.5 where 6 fabricated LinkedIn URLs shipped to the user's board.
- **Service-role operations stay in `backend-py/` or short-lived terminal scripts.** Never expose the `SUPABASE_SERVICE_ROLE_KEY` to the browser, never commit it, never paste it into chat. The frontend uses the anon key + RLS; bulk seeding and PDF uploads use the service-role key from Railway env.

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
- `test-connections.py` — quick Groq + Supabase reachability check at repo root.
- `push-v1.2.bat` / `setup-venv.bat` — Windows helper scripts. Read before modifying.

### Open PRs as of Version2.1
- **PR #17** (`hotfix/v2.1-storage`) — PDF storage fix: bucket auto-create + signed URLs. **Blocking production** — PDF download is broken until this merges.
- **PR #18** (`feat/location-india`) — India-region suggestions + location preference in onboarding/settings. Requires `0003_location.sql` to be run in Supabase SQL editor first.
