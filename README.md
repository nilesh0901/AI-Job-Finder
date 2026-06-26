# AI Job Finder

> Kanban-style job application tracker with AI-powered cover letters, resume bullets, interview prep, and ATS-optimized resume generation — built for job seekers who want to stay organized and apply smarter.

---

## Versions

### v1 Series — Local App (Express + React + Gemini)
| Version | Status | Focus |
|---|---|---|
| **v1.0** | ✅ Complete | Initial release — Kanban board, URL scraper, Gemini AI generation, local storage |
| **v1.1** | ✅ Complete | Setup refinements and documentation |
| **v1.2** | ✅ Complete | Backend foundation for v2 — FastAPI, Groq AI, Supabase schema, v2 planning |
| **v1.3** | ✅ Complete | React v2 frontend — auth, Supabase integration, mobile-responsive UI |
| **v1.4** | 🚀 Latest | Multi-port support, CLAUDE.md guidance, production-ready v2 stack |

### v2 Series — Cloud App (FastAPI + React + Supabase + Groq)
| Version | Status | Description |
|---|---|---|
| **v2.0** | 🚧 In Progress | Multi-user cloud deployment — live authentication, database-backed state, ATS resume generation, PDF export |

---

## v1.0 — Local App

### What it does
- **Kanban board** — drag and drop jobs across Wishlist → Applied → Interviewing → Offer → Rejected
- **URL scraper** — paste any job posting URL and the app extracts the title, company, location, and full description automatically
- **4-in-1 AI generation** — one click generates a tailored cover letter, resume bullets, interview prep questions, and a company brief using Google Gemini
- **Notes** — per-job notes auto-saved on blur
- **Master resume** — paste your resume once in Settings; it's used as context for every AI generation
- **Local storage** — all data lives in `jobs.json` on your machine; nothing leaves your computer

### Tech stack (v1)
- **Frontend** — React + Vite, plain CSS, `@dnd-kit` for drag and drop
- **Backend** — Node.js, Express, ES modules
- **AI** — Google Gemini 2.0 Flash via `@google/generative-ai`
- **Scraper** — axios + cheerio (supports LinkedIn, Indeed, and generic job boards)
- **Storage** — `jobs.json` flat file (gitignored)

### Quick start (v1)

**Prerequisites:** Node.js 18+, a free [Gemini API key](https://aistudio.google.com/app/apikey)

```bash
# Clone the repo
git clone https://github.com/nilesh0901/AI-Job-Finder.git
cd AI-Job-Finder

# Install all dependencies (root + backend + frontend)
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..

# Add your Gemini key
echo "GEMINI_API_KEY=your_key_here" > backend/.env

# Start both servers
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — the board is ready.

> **Tip:** If AI generation returns a `"limit: 0"` error, your Google Cloud project has zero free-tier quota. Fix: go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → "Create API key in **new project**" — old projects often have quota zeroed.

### v1 API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/jobs` | Load all jobs |
| POST | `/api/jobs` | Create job |
| PATCH | `/api/jobs/:id` | Update status / notes / AI content |
| DELETE | `/api/jobs/:id` | Delete job |
| POST | `/api/scrape` | Scrape a job URL |
| POST | `/api/ai/generate` | Generate AI content + persist |
| GET | `/api/ai/test` | Test Gemini key |

---

## v2.0 — Cloud App (In Progress)

### What's new in v2
- **Multi-user** — sign up with Google or email/password; each user's data is private and isolated
- **Cloud database** — jobs, resumes, and AI content stored in Supabase Postgres; accessible from any device
- **ATS resume generation** — Gemini generates an ATS-optimized resume tailored to each job description, stored with full version history
- **PDF download** — download any ATS resume as a formatted PDF
- **Mobile-responsive** — works on phone, tablet, and desktop
- **Onboarding** — first-login wizard captures your field, experience, tech stack, and salary expectations to personalize AI output
- **No setup required** — just open the URL and sign up

### Tech stack (v2)
- **Frontend** — React + Vite, mobile-first dark theme, deployed on **Vercel**
- **Backend** — Python FastAPI + Uvicorn, deployed on **Railway**
- **Database** — **Supabase** Postgres with Row-Level Security (per-user data isolation)
- **Auth** — **Supabase Auth** — Google SSO + email/password, JWT sessions
- **Storage** — **Supabase Storage** — PDF resumes stored per user/job/version
- **AI** — Google Gemini 2.0 Flash (cover letters, bullets, interview prep, ATS resumes)
- **Scraper** — Python httpx + BeautifulSoup4 (port of v1 scraper)
- **PDF** — WeasyPrint (server-side PDF generation, no external service)

### Architecture

```
Browser (React on Vercel)
  ├─ supabase-js  →  Supabase (jobs CRUD, resume storage, auth)
  └─ fetch('/api/*')  →  FastAPI on Railway
                            ├─ POST /scrape
                            ├─ POST /ai/generate
                            ├─ POST /ai/ats-resume
                            ├─ POST /resume/pdf
                            └─ GET  /ai/test
```

### Free cloud services used

| Service | What it provides | Free limit |
|---|---|---|
| [Vercel](https://vercel.com) | React frontend hosting + CDN | Unlimited (Hobby) |
| [Railway](https://railway.app) | FastAPI backend hosting | $5/month credit |
| [Supabase](https://supabase.com) | Postgres + Auth + Storage | 500 MB DB, 1 GB storage, 50K MAU |
| [Google AI Studio](https://aistudio.google.com) | Gemini Flash API | Free tier |

### Database schema (v2)

```
user_profiles   — field, experience, tech stack, salary (from onboarding)
jobs            — Kanban job cards (one per user, RLS-protected)
master_resumes  — user's base resume (one per user)
ats_resumes     — generated ATS resumes (many per job, versioned)
```

### v2 build phases

| Phase | What gets built | Status |
|---|---|---|
| 1 — Provisioning | Supabase project, schema, auth providers, Railway + Vercel setup | ⬜ Pending |
| 2 — FastAPI backend | `/scrape`, `/ai/generate`, `/ai/ats-resume`, `/resume/pdf`, `/ai/test` | ⬜ Pending |
| 3 — React frontend | Fresh UI, auth, onboarding, responsive Kanban | ⬜ Pending |
| 4 — ATS Resume | Gemini ATS prompt, PDF generation, version history | ⬜ Pending |
| 5 — Deploy | Vercel + Railway live, GitHub tag v2.0.0 | ⬜ Pending |

---

## Roadmap

| Version | Features |
|---|---|
| v2.1 | RemoteOK job connector — search and import jobs directly from the board |
| v2.2 | Email digests, Google Calendar interview sync, application analytics |
| v2.3 | AI fit scores, A/B cover letters, auto-rejection detection |
| v2.4 | Browser extension, mobile PWA, shared boards |
| v3.0 | Tiered plans + Stripe billing |

---

## Project structure

```
AI Job Finder/
├─ backend/             ← v1 Node.js + Express backend
│   ├─ server.js
│   ├─ scraper.js
│   ├─ ai.js
│   └─ package.json
├─ frontend/            ← v1 React + Vite frontend
│   └─ src/
├─ backend-py/          ← v2 FastAPI + Uvicorn backend (Python)
├─ frontend-v2/         ← v2 React frontend (fresh, mobile-first)
├─ supabase/
│   └─ migrations/      ← SQL schema files
├─ docs/                ← GitHub Pages landing page
├─ v2-plan.md           ← detailed v2 build plan
└─ README.md
```

---

## About

Built by [Nilesh Kumar](https://github.com/nilesh0901) as a tool to bring structure and AI leverage to the job search process.

The core idea: most job seekers are disorganized across spreadsheets, browser tabs, and email threads. This app centralizes everything — tracking, AI content generation, and now ATS-optimized resumes — so you spend less time on busywork and more time actually preparing.

**Why FastAPI for v2?** The roadmap includes LangGraph agents, resume embeddings, and fit scoring — all Python-native. Choosing FastAPI now avoids a language migration later.

---

## Contributing

v2 is under active development. Issues and PRs welcome on [github.com/nilesh0901/AI-Job-Finder](https://github.com/nilesh0901/AI-Job-Finder).

---

## License

MIT
