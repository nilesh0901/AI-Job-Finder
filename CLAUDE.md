# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Run both servers (recommended)
```
npm run dev
```

### Run individually
```
npm run dev:backend    # Express on port 3001 (node --watch)
npm run dev:frontend   # Vite React on port 5173
```

### Install dependencies after cloning
```
cd backend && npm install
cd ../frontend && npm install
cd .. && npm install
```

## Architecture

Two-process local app — no auth, no database, single user.

**Backend** (`backend/`) — Node.js ES modules (`"type": "module"`), Express on port 3001.
- `server.js` — all routes inline, reads/writes `jobs.json` synchronously with `fs.readFileSync`/`fs.writeFileSync`. Initializes `jobs.json` on first run.
- `scraper.js` — `scrapeJob(url)`: tries og:meta → board-specific selectors (LinkedIn/Indeed) → generic h1 fallback. Returns `{ title, company, location, rawDescription }` or throws.
- `ai.js` — `generateAIContent(...)`: single Gemini `generateContent` call returning JSON with keys `coverLetter`, `resumeBullets`, `interviewQuestions`, `companyBrief`. Strips markdown fences before `JSON.parse`, retries once on malformed JSON.
- `jobs.json` — auto-created as `{ "jobs": [] }`. Each job: `{ id, status, title, company, location, url, rawDescription, addedAt, updatedAt, notes, aiContent }`. Status is one of `wishlist | applied | interviewing | offer | rejected`.
- `.env` — `GEMINI_API_KEY` and `PORT=3001`. Never commit this file.

**Frontend** (`frontend/`) — Vite + React, plain CSS (no Tailwind, no TypeScript).
- `src/api.js` — all `fetch()` wrappers. Vite proxies `/api/*` → `localhost:3001` (configured in `vite.config.js`).
- `src/App.jsx` — top-level state: `jobs[]`, `view` (`board`|`settings`), `selectedJob`, `showAdd`. No router — single string toggle.
- `src/components/Board.jsx` — wraps `DndContext`. `onDragEnd` does optimistic state update then `PATCH /api/jobs/:id`. Uses `DragOverlay` for ghost card.
- `src/components/Column.jsx` — `useDroppable({ id: columnId })`.
- `src/components/JobCard.jsx` — `useDraggable({ id: job.id })`.
- `src/components/AddJobModal.jsx` — two modes: URL scrape (calls `POST /api/scrape`, auto-falls back to paste on failure) and manual paste.
- `src/components/JobDetailModal.jsx` — AI generation, 4 tabs (Cover Letter / Resume Bullets / Interview Prep / Company Brief), notes auto-saved on blur. Reads master resume from `localStorage["masterResume"]`.
- `src/components/Settings.jsx` — saves resume to `localStorage["masterResume"]`; shows step-by-step Gemini key setup instructions + test button.
- `src/index.css` — all styles. Linear dark design system: CSS custom properties (`--canvas`, `--surface-1` through `--surface-4`, `--primary` #5e6ad2, `--ink` etc.). No component-scoped CSS files.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/jobs` | Load all jobs |
| POST | `/api/jobs` | Create job |
| PATCH | `/api/jobs/:id` | Update status/notes/aiContent |
| DELETE | `/api/jobs/:id` | Delete job |
| POST | `/api/scrape` | Scrape a URL |
| POST | `/api/ai/generate` | Generate AI content + persist to jobs.json |
| GET | `/api/ai/test` | Test Gemini key validity |

## AI Model

Google Gemini 1.5 Flash via `@google/generative-ai`. Key in `backend/.env`. The prompt requests a single JSON object with four string keys. AI-generated content is persisted in `job.aiContent` inside `jobs.json` so it survives page refresh.

## Design System

Linear-inspired dark theme. Key tokens in `index.css :root`: canvas `#010102`, surfaces `--surface-1` through `--surface-4`, accent `--primary: #5e6ad2` (used scarcely — CTA, focus ring, links only). Font: Inter (Google Fonts). Border radii: `--r-md` 8px for buttons/inputs, `--r-lg` 12px for cards, `--r-xl` 16px for modals.
