@echo off
echo ================================================
echo   AI Job Finder — Pushing v1.2 to GitHub
echo ================================================
echo.

cd /d "%~dp0"

echo [1/6] Current branch and status...
git branch
git status

echo.
echo [2/6] Switching to master branch...
git checkout master

echo.
echo [3/6] Staging all changes...
git add .

echo.
echo [4/6] Committing...
git commit -m "v1.2: FastAPI backend, Supabase schema, Groq AI, v2 plan

- Add backend-py/ with FastAPI + Uvicorn backend (Python)
  - main.py: 6 API routes (scrape, ai/generate, ai/ats-resume, resume/pdf, ai/test, health)
  - scraper.py: httpx + BeautifulSoup4 job URL scraper
  - ai.py: Groq llama-3.3-70b-versatile for cover letters, bullets, ATS resumes
  - pdf.py: WeasyPrint server-side PDF generation
  - requirements.txt: all Python deps pinned
  - Procfile: Railway start command
- Add supabase/migrations/0001_init.sql (4 tables with RLS policies)
- Add README.md: full v1 + v2 docs, stack, architecture, roadmap
- Add v2-plan.md: 5-phase build plan
- Add HANDOFF.md: session handoff report
- Add test-connections.py: Supabase verification script
- Add setup-venv.bat: one-click Python venv setup for Windows
- Switch AI from Gemini to Groq llama-3.3-70b-versatile"

echo.
echo [5/6] Pushing to GitHub master...
git push origin master

echo.
echo [6/6] Tagging as v1.2.0...
git tag -a v1.2.0 -m "v1.2.0: FastAPI backend + Supabase schema groundwork for v2 cloud app"
git push origin v1.2.0

echo.
echo ================================================
echo   Done! Check github.com/nilesh0901/AI-Job-Finder
echo ================================================
echo.
pause
