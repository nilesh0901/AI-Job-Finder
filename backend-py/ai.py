"""
ai.py — AI content generation via Groq (llama-3.3-70b-versatile)
Covers: cover letter, resume bullets, interview prep, company brief, ATS resume
"""

import json
import os
import re
from functools import lru_cache
from groq import Groq

MODEL = "llama-3.3-70b-versatile"


@lru_cache(maxsize=1)
def _get_client() -> Groq:
    """Lazy-init Groq client — cached so we only create it once."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set in environment")
    return Groq(api_key=api_key)


async def test_connection() -> bool:
    """Quick ping to verify the Groq key is valid."""
    client = _get_client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": "Reply with exactly: ok"}],
        max_tokens=5,
    )
    return "ok" in response.choices[0].message.content.lower()


async def generate_ai_content(
    title: str,
    company: str,
    job_description: str,
    master_resume: str,
    user_profile: dict | None = None,
) -> dict:
    """
    Generate cover letter, resume bullets, interview questions, company brief.
    Returns dict with keys: coverLetter, resumeBullets, interviewQuestions, companyBrief
    """
    profile_context = _format_profile(user_profile) if user_profile else ""

    prompt = f"""You are an expert career coach and technical recruiter. Generate tailored job application content.

## Job Details
Title: {title}
Company: {company}
Description:
{job_description[:4000]}

## Candidate Background
{profile_context}
Master Resume:
{master_resume[:3000] if master_resume else "Not provided"}

## Instructions
Return ONLY a valid JSON object with exactly these 4 keys (no markdown fences, no extra text):
{{
  "coverLetter": "3-paragraph cover letter, professional tone, references specific job requirements",
  "resumeBullets": "5-7 tailored resume bullet points starting with strong action verbs, quantified where possible",
  "interviewQuestions": "8-10 likely interview questions with brief answer frameworks for each",
  "companyBrief": "2-paragraph company research brief: what they do, culture signals, why this role matters to them"
}}"""

    return await _call_groq(prompt)


async def generate_ats_resume(
    job_description: str,
    master_resume: str,
    user_profile: dict | None = None,
) -> str:
    """
    Generate a complete ATS-optimized resume tailored to a specific job description.
    Returns plain text resume.
    """
    profile_context = _format_profile(user_profile) if user_profile else ""

    prompt = f"""You are an expert resume writer specializing in ATS (Applicant Tracking System) optimization.

## Job Description
{job_description[:4000]}

## Candidate Background
{profile_context}
Master Resume:
{master_resume[:3000] if master_resume else "Not provided"}

## Instructions
Generate a complete, ATS-optimized resume tailored specifically to this job description.

Rules:
- Use standard section headers: SUMMARY, EXPERIENCE, SKILLS, EDUCATION, PROJECTS
- Mirror keywords and phrases from the job description naturally
- Use bullet points starting with strong action verbs
- Quantify achievements where the master resume provides numbers
- Keep formatting simple: no tables, no columns, no graphics (ATS cannot parse these)
- Include a skills section with keywords extracted from the job description
- 1-2 pages worth of content

Return ONLY the resume text. No explanations, no markdown fences."""

    client = _get_client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2048,
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()


# ── Private helpers ───────────────────────────────────────────────────────────

async def _call_groq(prompt: str) -> dict:
    """Call Groq and parse JSON response. Retries once on bad JSON."""
    client = _get_client()

    for attempt in range(2):
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant. Always respond with valid JSON only — no markdown, no explanation.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=2048,
            temperature=0.7,
            response_format={"type": "json_object"},  # Groq JSON mode
        )

        text = response.choices[0].message.content.strip()
        # Strip markdown fences just in case
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            if attempt == 0:
                continue
            raise ValueError(f"Groq returned invalid JSON after 2 attempts: {text[:200]}")


def _format_profile(profile: dict) -> str:
    if not profile:
        return ""
    lines = []
    if profile.get("full_name"):
        lines.append(f"Name: {profile['full_name']}")
    if profile.get("field"):
        lines.append(f"Field: {profile['field']}")
    if profile.get("domain"):
        lines.append(f"Domain: {profile['domain']}")
    if profile.get("years_experience"):
        lines.append(f"Experience: {profile['years_experience']} years")
    if profile.get("tech_stack"):
        lines.append(f"Tech stack: {', '.join(profile['tech_stack'])}")
    if profile.get("expected_salary_min") and profile.get("expected_salary_max"):
        currency = profile.get("expected_salary_currency", "USD")
        lines.append(
            f"Expected salary: {currency} {profile['expected_salary_min']:,} – {profile['expected_salary_max']:,}"
        )
    return "\n".join(lines)
