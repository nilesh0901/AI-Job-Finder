"""
main.py — FastAPI application entry point
All routes for AI Job Finder v2 backend

Run locally:
    uvicorn main:app --reload --port 8000

Endpoints:
    POST /scrape              — extract job info from a URL
    POST /ai/generate         — generate cover letter, bullets, interview prep, company brief
    POST /ai/ats-resume       — generate ATS-optimized resume for a job
    POST /resume/pdf          — convert ATS resume text → PDF (returns Supabase Storage URL)
    GET  /ai/test             — verify Gemini API key has quota
    GET  /health              — Railway health check
"""

import os
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

from scraper import scrape_job
from ai import generate_ai_content, generate_ats_resume, score_ats_resume, test_connection
from pdf import resume_to_pdf
from suggestions import refresh_suggestions


# ── App setup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("AI Job Finder v2 backend starting...")
    yield
    print("Backend shutting down.")

app = FastAPI(
    title="AI Job Finder v2",
    version="2.0.0",
    description="FastAPI backend for AI-powered job tracking and resume generation",
    lifespan=lifespan,
)

# CORS — allow the React frontend (Vercel) and local dev
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    os.getenv("FRONTEND_URL", ""),  # production Vercel URL in Railway env vars
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    # Vercel preview deployments get unique subdomains — match all *.vercel.app
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class ScrapeRequest(BaseModel):
    url: str

class GenerateRequest(BaseModel):
    title: str
    company: str | None = ""
    jobDescription: str
    masterResume: str | None = ""
    userProfile: dict | None = None

class ATSResumeRequest(BaseModel):
    jobDescription: str
    masterResume: str | None = ""
    userProfile: dict | None = None

class ATSScoreRequest(BaseModel):
    resumeText: str
    jobDescription: str

class PDFRequest(BaseModel):
    resumeText: str
    jobId: str
    userId: str

class SuggestionsRefreshRequest(BaseModel):
    user_id: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Railway uses this to confirm the server is running."""
    return {"status": "ok", "version": "2.0.0"}


@app.get("/ai/test")
async def ai_test():
    """Verify the Gemini API key is valid and has quota."""
    try:
        ok = await test_connection()
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/scrape")
async def scrape(req: ScrapeRequest):
    """
    Scrape a job posting URL and extract title, company, location, description.
    Falls back gracefully — never crashes the frontend.
    """
    try:
        data = await scrape_job(req.url)
        return {"success": True, **data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/ai/generate")
async def ai_generate(req: GenerateRequest):
    """
    Generate cover letter, resume bullets, interview questions, company brief.
    All tailored to the specific job + candidate profile.
    """
    if not req.jobDescription:
        raise HTTPException(status_code=400, detail="jobDescription is required")
    try:
        content = await generate_ai_content(
            title=req.title or "Unknown Role",
            company=req.company or "",
            job_description=req.jobDescription,
            master_resume=req.masterResume or "",
            user_profile=req.userProfile,
        )
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/ats-resume")
async def ai_ats_resume(req: ATSResumeRequest):
    """
    Generate a complete ATS-optimized resume tailored to a job description.
    Returns the resume as plain text (client stores it, then can request PDF).
    """
    if not req.jobDescription:
        raise HTTPException(status_code=400, detail="jobDescription is required")
    try:
        resume_text = await generate_ats_resume(
            job_description=req.jobDescription,
            master_resume=req.masterResume or "",
            user_profile=req.userProfile,
        )
        return {"resumeText": resume_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/ats-score")
async def ai_ats_score(req: ATSScoreRequest):
    """Score a tailored ATS resume against the job description."""
    if not req.resumeText or not req.jobDescription:
        raise HTTPException(status_code=400, detail="resumeText and jobDescription are required")
    try:
        result = await score_ats_resume(req.resumeText, req.jobDescription)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/suggestions/refresh")
async def suggestions_refresh(body: SuggestionsRefreshRequest):
    """
    Fetch and insert job suggestions for a user (RemoteOK / Arbeitnow / HackerNews).
    Runs server-side with the service-role key; bypasses RLS to insert into the
    user's board with is_suggestion=true.
    """
    try:
        result = await refresh_suggestions(body.user_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/suggestions/status")
async def suggestions_status():
    """Health check for the suggestions agent."""
    return {"status": "ok", "sources": ["RemoteOK", "Arbeitnow", "HackerNews"]}


@app.post("/resume/pdf")
async def resume_pdf(req: PDFRequest):
    """
    Convert ATS resume plain text → PDF → upload to Supabase Storage.
    Returns a public download URL.
    """
    if not req.resumeText:
        raise HTTPException(status_code=400, detail="resumeText is required")

    try:
        # 1. Generate PDF bytes
        pdf_bytes = resume_to_pdf(req.resumeText)

        # 2. Upload to Supabase Storage
        url = await _upload_pdf_to_supabase(pdf_bytes, req.userId, req.jobId)

        return {"pdfUrl": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Supabase Storage helper ───────────────────────────────────────────────────

async def _upload_pdf_to_supabase(pdf_bytes: bytes, user_id: str, job_id: str) -> str:
    """
    Upload PDF to Supabase Storage bucket 'resumes'.
    Path: resumes/{user_id}/{job_id}/{uuid}.pdf
    Returns public URL.
    """
    import httpx

    supabase_url = os.getenv("SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")

    file_name = f"{uuid.uuid4()}.pdf"
    path      = f"{user_id}/{job_id}/{file_name}"
    bucket    = "resumes"

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{supabase_url}/storage/v1/object/{bucket}/{path}",
            headers={
                "Authorization": f"Bearer {service_key}",
                "Content-Type":  "application/pdf",
            },
            content=pdf_bytes,
            timeout=30,
        )
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Supabase Storage upload failed: {r.text}")

    # Return public URL
    return f"{supabase_url}/storage/v1/object/public/{bucket}/{path}"
