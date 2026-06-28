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
from fit_score import calculate_fit_score


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
    user_id: str | None = None   # optional — when provided, fit score is calculated server-side

class GenerateRequest(BaseModel):
    title: str
    company: str | None = ""
    jobDescription: str | None = ""
    masterResume: str | None = ""
    userProfile: dict | None = None

class ATSResumeRequest(BaseModel):
    jobDescription: str | None = ""
    masterResume: str | None = ""
    userProfile: dict | None = None

class ATSScoreRequest(BaseModel):
    resumeText: str
    jobDescription: str | None = ""

class PDFRequest(BaseModel):
    resumeText: str
    jobId: str
    userId: str

class SuggestionsRefreshRequest(BaseModel):
    user_id: str

class FitScoreRequest(BaseModel):
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
    Scrape a job posting URL and extract title, company, location, description,
    plus job_type, work_mode, seniority, salary_text, company_logo_url.
    If user_id is provided, also computes fit_score + fit_label.
    """
    try:
        data = await scrape_job(req.url)
        fit_score_data = {}
        if req.user_id:
            profile = await _fetch_user_profile(req.user_id)
            if profile:
                fit_score_data = calculate_fit_score(data, profile)
        return {"success": True, **data, **fit_score_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/fit-score")
async def recalculate_fit_scores(req: FitScoreRequest):
    """
    Recalculate fit scores for ALL non-suggestion jobs belonging to a user.
    Call this when the user updates their profile (skills, location, etc.).
    Updates jobs in-place via service-role key.
    """
    import httpx as _httpx

    supabase_url = os.getenv("SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise HTTPException(status_code=500, detail="Supabase env vars not set")

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    try:
        profile = await _fetch_user_profile(req.user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="User profile not found")

        async with _httpx.AsyncClient(timeout=30) as client:
            # Fetch all non-suggestion jobs for this user that have a description
            r = await client.get(
                f"{supabase_url}/rest/v1/jobs",
                headers=headers,
                params={
                    "user_id": f"eq.{req.user_id}",
                    "is_suggestion": "eq.false",
                    "select": "id,title,location,work_mode,seniority,salary_text,raw_description",
                },
            )
            if not r.is_success:
                raise HTTPException(status_code=500, detail=f"Failed to fetch jobs: {r.text}")
            jobs = r.json()

        updated = 0
        async with _httpx.AsyncClient(timeout=30) as client:
            for job in jobs:
                if not job.get("raw_description") and not job.get("title"):
                    continue
                fs = calculate_fit_score(job, profile)
                patch = {"fit_score": fs["score"], "fit_label": fs["label"]}
                r = await client.patch(
                    f"{supabase_url}/rest/v1/jobs",
                    headers={**headers, "Prefer": "return=minimal"},
                    params={"id": f"eq.{job['id']}", "user_id": f"eq.{req.user_id}"},
                    json=patch,
                )
                if r.is_success:
                    updated += 1

        return {"updated": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    return {"status": "ok", "sources": ["Adzuna", "Jooble", "RemoteOK", "Arbeitnow", "HackerNews"]}


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


# ── Supabase helpers ──────────────────────────────────────────────────────────

async def _fetch_user_profile(user_id: str) -> dict | None:
    """Fetch user_profiles row for fit score calculation (service-role key)."""
    import httpx as _httpx

    supabase_url = os.getenv("SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        return None

    async with _httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{supabase_url}/rest/v1/user_profiles",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            },
            params={"user_id": f"eq.{user_id}", "limit": "1"},
        )
        if r.is_success and r.json():
            return r.json()[0]
    return None


# ── Supabase Storage helper ───────────────────────────────────────────────────

BUCKET = "resumes"

async def _upload_pdf_to_supabase(pdf_bytes: bytes, user_id: str, job_id: str) -> str:
    """
    Upload PDF to Supabase Storage bucket 'resumes' and return a signed URL.
    Path: resumes/{user_id}/{job_id}/{uuid}.pdf

    The bucket is auto-created (private) on first use so deployment needs no
    manual Storage setup. Resumes contain personal data, so the bucket is
    private and we hand back a time-limited signed URL rather than a public one.
    """
    import httpx

    supabase_url = os.getenv("SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")

    file_name = f"{uuid.uuid4()}.pdf"
    path      = f"{user_id}/{job_id}/{file_name}"
    auth      = {"Authorization": f"Bearer {service_key}"}

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Ensure the bucket exists (idempotent — ignore "already exists").
        await client.post(
            f"{supabase_url}/storage/v1/bucket",
            headers={**auth, "Content-Type": "application/json"},
            json={"id": BUCKET, "name": BUCKET, "public": False},
        )

        # 2. Upload the PDF.
        up = await client.post(
            f"{supabase_url}/storage/v1/object/{BUCKET}/{path}",
            headers={**auth, "Content-Type": "application/pdf"},
            content=pdf_bytes,
        )
        if up.status_code not in (200, 201):
            raise RuntimeError(f"Supabase Storage upload failed: {up.text}")

        # 3. Mint a signed URL (valid 1 hour) — enough for an immediate download.
        sign = await client.post(
            f"{supabase_url}/storage/v1/object/sign/{BUCKET}/{path}",
            headers={**auth, "Content-Type": "application/json"},
            json={"expiresIn": 3600},
        )
        if sign.status_code != 200:
            raise RuntimeError(f"Supabase signed URL failed: {sign.text}")
        signed_path = sign.json().get("signedURL") or sign.json().get("signedUrl")

    if not signed_path:
        raise RuntimeError("Supabase did not return a signed URL")
    # signed_path is relative, e.g. "/object/sign/resumes/...?token=..."
    return f"{supabase_url}/storage/v1{signed_path}"
