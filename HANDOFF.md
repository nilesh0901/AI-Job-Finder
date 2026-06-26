# AI Job Finder — Session Handoff Report
**Date:** 2026-06-27  
**Session:** v1.0 → v2.0 planning + v1.2 backend groundwork  
**Status:** FastAPI backend complete and locally verified ✅

---

## What Was Done This Session

### 1. Stack Decision (Finalized)
Evaluated three options and settled on the right stack for the goals:

| Rejected | Reason |
|---|---|
| Streamlit | Not production-grade, no drag-drop UI, no proper Google SSO |
| Node.js + Express (v1 continuation) | Can't support future Python ML/AI features |

**Chosen stack:**
- **Frontend:** React (fresh, mobile-first) → hosted on Vercel
- **Backend:** FastAPI + Uvicorn (Python) → hosted on Railway
- **Database + Auth + Storage:** Supabase (Postgres + RLS + Auth + File Storage)
- **AI:** Groq — `llama-3.3-70b-versatile` (free, fast, 6K req/day)
- **PDF generation:** WeasyPrint (server-side, no external service)

---

### 2. Plan Saved
Full v2 build plan written to `v2-plan.md` covering:
- 5 build phases with time estimates
- Complete DB schema (4 tables with RLS)
- Folder structure
- Verification checkpoints per phase
- Roadmap through v2.4 and v3.0

---

### 3. README.md Written
Comprehensive `README.md` at repo root covering:
- v1 (local) — quick start, API reference, tech stack
- v2 (cloud) — what's new, architecture diagram, DB schema, build phases
- Roadmap v2.1 → v3.0
- Free cloud services table with limits
- About section (Nilesh's background and motivation)

---

### 4. Supabase — Phase 1 ✅ COMPLETE
- Project created at `https://eoudzvwbrrqnhtulehfc.supabase.co`
- Schema deployed — all 4 tables live with Row-Level Security:
  - `user_profiles` — onboarding data (field, experience, tech stack, salary)
  - `jobs` — Kanban job cards, per-user
  - `master_resumes` — user's base resume
  - `ats_resumes` — generated ATS resumes with version history
- **Email/password auth:** ✅ enabled
- **Google SSO:** ✅ enabled and configured
- **Sign-up API:** ✅ verified accepting registrations
- Connection test script: `test-connections.py` (run `python test-connections.py`)

---

### 5. FastAPI Backend — Phase 2 ✅ COMPLETE
All files written to `backend-py/`:

| File | Purpose |
|---|---|
| `main.py` | FastAPI app, all 6 routes, CORS, lifespan |
| `scraper.py` | Job URL scraper — httpx + BeautifulSoup4, supports LinkedIn/Indeed/generic |
| `ai.py` | Groq AI generation — cover letter, bullets, interview prep, ATS resume |
| `pdf.py` | WeasyPrint PDF generation from ATS resume text |
| `requirements.txt` | All Python dependencies (pinned versions) |
| `Procfile` | Railway start command: `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| `.env` | Local secrets (gitignored) — needs GROQ_API_KEY filled in |
| `.env.example` / `Env_example` | Template for env vars |
| `.gitignore` | Ignores venv/, __pycache__, .env |

**API endpoints built:**
```
GET  /health          — Railway health check
GET  /ai/test         — Verify Groq API key
POST /scrape          — Extract job data from URL
POST /ai/generate     — Cover letter + bullets + interview prep + company brief
POST /ai/ats-resume   — Full ATS-optimized resume text
POST /resume/pdf      — ATS resume → PDF → Supabase Storage → download URL
```

**Local verification:**
- `pip install -r requirements.txt` ✅ all packages installed
- `uvicorn main:app --reload --port 8000` ✅ server starts clean
- Interactive docs at `http://localhost:8000/docs` ✅

**AI switch mid-session:** Switched from Google Gemini to Groq (`llama-3.3-70b-versatile`) because Gemini key validation was painful. Groq is faster, free tier is cleaner (6K req/day), and uses JSON mode for reliable structured output.

**Windows fix applied:** Removed `lxml` from requirements (needs C++ compiler on Windows) → switched to Python's built-in `html.parser` in BeautifulSoup. Same parse quality for our use case.

---

### 6. Tooling Created
- `setup-venv.bat` — double-click to create venv + install packages + run connection test
- `test-connections.py` — verifies Supabase tables, auth, and sign-up API end-to-end

---

## What's Pending

### Immediate (before next session starts)
- [ ] Get Groq API key from [console.groq.com](https://console.groq.com) → paste into `backend-py/.env`
- [ ] Run `GET /ai/test` → confirm `{"ok": true}`
- [ ] Set Railway root directory to `backend-py`, start command to `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Phase 3 — React Frontend (next session)
Fresh React app in `frontend-v2/`:
- Supabase Auth (Google SSO + email/password login screen)
- Onboarding wizard (field → experience → tech stack → salary)
- Responsive Kanban board (mobile collapses to tab view)
- `api.js` rewritten to use supabase-js for CRUD + fetch for AI endpoints
- Mobile-first CSS, same Linear dark design language as v1

### Phase 4 — ATS Resume UI
- "Generate ATS Resume" button in job detail modal
- Resume version history (v1, v2, v3 per job)
- PDF download button → calls `/resume/pdf` → returns Supabase Storage URL
- Create `resumes` bucket in Supabase Storage (public read, authenticated write)

### Phase 5 — Deploy
- Railway: deploy `backend-py/` → get public URL
- Vercel: deploy `frontend-v2/` → set `VITE_API_BASE_URL` to Railway URL
- GitHub: merge `feature/v2-cloud` → master → tag `v2.0.0`
- GitHub Pages: `docs/index.html` landing page

---

## Environment Variables Reference

### `backend-py/.env` (local, gitignored)
```
GROQ_API_KEY=gsk_...                    ← get from console.groq.com
SUPABASE_URL=https://eoudzvwbrrqnhtulehfc.supabase.co
SUPABASE_ANON_KEY=eyJhbG...             ← Supabase → Project Settings → API → anon key
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...     ← Supabase → Project Settings → API → service_role key
FRONTEND_URL=https://your-app.vercel.app
PORT=8000
```

### Railway environment (set in Railway dashboard)
Same variables as above — copy paste from `.env` into Railway → Variables tab.

### Vercel environment (set in Vercel dashboard)
```
VITE_SUPABASE_URL=https://eoudzvwbrrqnhtulehfc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
VITE_API_BASE_URL=https://your-app.up.railway.app
```

---

## Key Decisions Made
| Decision | Choice | Reason |
|---|---|---|
| Frontend | React (fresh) | Mobile-first rebuild, Kanban UI, Vercel-native |
| Backend | FastAPI + Uvicorn | Python for future ML, async, auto-docs |
| Database | Supabase Postgres | SQL + RLS + Auth + Storage in one free project |
| Auth | Supabase Auth | Google SSO + email/password, 50K MAU free |
| AI | Groq llama-3.3-70b | Fast, free, JSON mode, reliable |
| PDF | WeasyPrint | No external service, pure Python |
| Frontend host | Vercel | Best free React hosting, no cold starts |
| Backend host | Railway | $5/month free credit, no sleep on free tier |

---

## Repo
GitHub: [nilesh0901/AI-Job-Finder](https://github.com/nilesh0901/AI-Job-Finder)  
Branch strategy: `master` = stable, `feature/v2-cloud` = v2 in-progress
