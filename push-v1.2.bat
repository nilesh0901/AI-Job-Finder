@echo off
echo ================================================
echo   AI Job Finder — Pushing v1.2 to GitHub
echo ================================================
echo.

cd /d "%~dp0"

echo [1/5] Checking git status...
git status

echo.
echo [2/5] Staging all changes...
git add .

echo.
echo [3/5] Committing...
git commit -m "v1.2: FastAPI backend, Supabase schema, Groq AI, v2 plan

- Add backend-py/ with FastAPI + Uvicorn backend
  - main.py: 6 API routes (scrape, ai/generate, ai/ats-resume, resume/pdf, ai/test, health)
  - scraper.py: httpx + BeautifulSoup4 job URL scraper (port of v1 Node.js scraper)
  - ai.py: Groq llama-3.3-70b-versatile for cover letters, bullets, ATS resumes
  - pdf.py: WeasyPrint server-side PDF generation
  - requirements.txt: all Python deps pinned
  - Procfile: Railway start command
- Add supabase/migrations/0001_init.sql schema (4 tables, RLS policies)
- Add README.md: full v1 + v2 docs, stack, architecture, roadmap
- Add v2-plan.md: detailed 5-phase build plan
- Add HANDOFF.md: session summary and what's pending
- Add test-connections.py: Supabase connection verification script
- Add setup-venv.bat: one-click Python env setup for Windows"

echo.
echo [4/5] Pushing to origin master...
git push origin master

echo.
echo [5/5] Creating v1.2 tag...
git tag -a v1.2.0 -m "v1.2.0: FastAPI backend + Supabase schema groundwork for v2 cloud app"
git push origin v1.2.0

echo.
echo ================================================
echo   Done! Check github.com/nilesh0901/AI-Job-Finder
echo ================================================
echo.
pause
