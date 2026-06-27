# AI Job Finder — Session Handoff
**Last updated:** 2026-06-27  
**Current version:** v2.1 ✅ Shipped → v2.2 planning

---

## Quick Status

| Layer | Status | Notes |
|---|---|---|
| Supabase schema | ✅ Live | All tables + RLS deployed |
| FastAPI backend | ✅ Live on Railway | 8 routes, Groq AI, WeasyPrint PDF |
| React frontend | ✅ Live on Vercel | Kanban, mobile, auth, ATS tab |
| v2.0 ATS features | ✅ Shipped | Score dial, diff view, star feedback |
| v2.1 suggestions | ✅ Shipped | Scraper fix, onboarding upgrade, suggestions agent + UI |

---

## v2.0 — What's Shipped (Do Not Touch)

### Supabase tables (all with RLS)
- `user_profiles` — onboarding answers (field, domain, tech_stack, years_experience, salary, currency)
- `jobs` — Kanban cards per user (status: wishlist / applied / interviewing / offer / rejected)
- `master_resumes` — one per user, stored as text
- `ats_resumes` — versioned per job; has `master_resume_snapshot text` column for accurate diff
- `ats_resume_feedback` — rating (1–5), kept_changes bool, comments text

### Backend routes (`backend-py/main.py`)
```
GET  /health
GET  /ai/test
POST /scrape
POST /ai/generate       → cover letter + bullets + interview prep + company brief
POST /ai/ats-resume     → surgical ATS tailored resume text
POST /ai/ats-score      → keyword/structure score breakdown
POST /resume/pdf        → WeasyPrint PDF → Supabase Storage → download URL
```

### Frontend (`frontend-v2/`)
- `src/App.jsx` — auth gate (splash → login → onboarding → board); **all hooks above conditional returns**; `useEffect` depends on `session?.user?.id` (not `session`)
- `src/api.js` — CRUD via supabase-js; AI/scrape/PDF via fetch to FastAPI
- `src/components/Board.jsx` — 5-column Kanban desktop + mobile tab view
- `src/components/JobDetailModal.jsx` — 5 AI tabs; ATS tab has generate, score, diff, feedback, PDF
- `src/components/AuthProvider.jsx` — Supabase auth state listener
- `src/components/Onboarding.jsx` — multi-step wizard
- `src/lib/supabase.js` — anon client singleton
- `src/index.css` — Linear dark design system

### Recurring bug patterns to avoid
- `toIntOrNull()` before any int upsert — empty string → Postgres `22P02` crash
- `useEffect` depending on `session` object causes reload loops on every tab switch → use `session?.user?.id`
- All hooks must be called **above** any conditional `return` in App.jsx

---

## v2.1 — Tasks to Implement

Plan is in `v2.1-plan.md` (root of repo). Hand it to VS Code Claude Code with:
> "Read v2.1-plan.md and implement all tasks in order A → G. Do not touch v1 files."

### Task order (strict — B's migration must run before D/E/F)

| Task | File(s) | Status |
|---|---|---|
| **A** — Fix URL scraper | `backend-py/scraper.py`, `main.py` | ✅ Done |
| **B** — Upgrade onboarding + migration | `Onboarding.jsx`, `Settings.jsx`, `supabase/migrations/0002_v2_1.sql` | ✅ Done |
| **C** — Verify migration ran | Supabase dashboard SQL editor | ✅ Done |
| **D** — Suggestions agent | `backend-py/suggestions.py` (new file) | ✅ Done |
| **E** — Suggestions API endpoints | `backend-py/main.py`, `frontend-v2/src/api.js` | ✅ Done |
| **F** — Suggestions Rail UI | `frontend-v2/src/components/Board.jsx`, `index.css` | ✅ Done |
| **G** — Testing agent doc | `TESTING_AGENT.md` (new file at root) | ✅ Done |

### New Supabase columns (migration 0002 adds these)
```sql
user_profiles.custom_skills   text[]  DEFAULT '{}'
user_profiles.job_freshness_days  int DEFAULT 7  CHECK IN (1,7,15)
jobs.source                   text    DEFAULT 'manual'
jobs.is_suggestion            boolean DEFAULT false
```
Run the migration SQL in Supabase dashboard → SQL editor before starting task D.

### New API endpoints (task E)
```
POST /suggestions/refresh   → body: { user_id }  → { inserted, sources }
GET  /suggestions/status    → { status: "ok", sources: [...] }
```

### New frontend function (task E)
```js
// src/api.js
export async function refreshSuggestions(userId) { ... }
```

### Suggestions column CSS class names (task F)
`.column-suggested`, `.suggestion-card`, `.job-card-source`, `.job-card-link`, `.suggestions-empty`, `.btn-refresh`

---

## Deployment Config (do not change without reason)

### Railway (backend)
- Root directory: `backend-py/`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT` (set in `railway.toml`)
- Required env vars: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`
- `FRONTEND_URL` must equal the Vercel URL exactly (with `https://`, no trailing slash)

### Vercel (frontend)
- Root: `frontend-v2/`
- `VITE_API_BASE_URL` must start with `https://` — without it, POSTs go to Vercel → 405
- Rebuild required after any env var change (Vite bakes vars at build time)

### Supabase Auth
- Site URL + Redirect URLs must include Vercel URL with `/**` wildcard
- Google OAuth app must be **Published** (not Testing) for all users to sign in

---

## Pending User Action

- [ ] **Publish Google OAuth app**: Google Cloud Console → APIs & Services → OAuth consent screen → **Publish App**
  - Changes status from Testing → Production
  - All Google accounts can sign in without approval
  - Zero impact on Railway/Supabase/Vercel free tier costs

---

## Key Files Reference

| File | Purpose |
|---|---|
| `v2.1-plan.md` | Full v2.1 implementation spec (hand to VS Code extension) |
| `TESTING_AGENT.md` | QA prompt for automated site testing (created by task G) |
| `test-connections.py` | Quick Groq + Supabase smoke test |
| `backend-py/.env` | Local secrets — never commit, never paste in chat |
| `supabase/migrations/0001_init.sql` | v2.0 schema source of truth |
| `supabase/migrations/0002_v2_1.sql` | v2.1 migration (created by task B) |
| `setup-venv.bat` | Windows: create venv + install deps |
| `master_resume.txt` | Nilesh's personal resume text — NOT linked to app; each user stores their own in Supabase |

---

## Groq Model
`llama-3.3-70b-versatile` — free tier ~6K req/day. If quota hits, check [console.groq.com](https://console.groq.com).
