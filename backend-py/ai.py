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

    Cover letter has creative latitude (it's a persuasive narrative).
    Bullets / questions / brief are grounded — facts must come from the master resume
    or the job description; no inventing numbers, employers, or credentials.

    Returns dict with keys: coverLetter, resumeBullets, interviewQuestions, companyBrief
    """
    profile_context = _format_profile(user_profile) if user_profile else ""

    prompt = f"""You are an expert career coach writing job-application materials for a real candidate.

## TARGET JOB
Role: {title}
Company: {company}
Job Description:
{job_description[:4000]}

## CANDIDATE
{profile_context}
Master Resume:
{master_resume[:3500] if master_resume else "Not provided — be conservative; do not invent experience."}

## GROUND RULES (apply to ALL four outputs)
- Use ONLY accomplishments, employers, projects, and metrics that exist in the master resume.
- Never invent numbers, percentages, team sizes, revenue, model parameters, or scale.
- Never invent employers, titles, projects, certifications, or schools.
- If the master resume lacks specific evidence for a JD requirement, focus on transferable
  work the candidate has actually done — do not fabricate a parallel.
- No placeholder brackets like [Your Name] or [Company]. Use real names.

## PER-OUTPUT INSTRUCTIONS

coverLetter (creative latitude — this is the persuasive piece):
- 3 paragraphs, 220–320 words total.
- Paragraph 1 (hook): open with a specific detail from the job description (a responsibility,
  product area, or stated challenge) and the candidate's most-relevant background — no generic
  "I am writing to apply for…" openers.
- Paragraph 2 (evidence): pick 2–3 concrete accomplishments from the master resume that map
  directly to JD requirements. Use the candidate's real numbers and project names.
- Paragraph 3 (close): forward-looking; one sentence connecting candidate's goals to the role
  + one concrete next step ("I'd welcome a conversation about…").
- Voice: warm, confident, specific. Avoid clichés ("passionate", "team player", "synergy").
- Address it to "Hiring Team" unless the JD names a hiring manager.

resumeBullets:
- 5–7 bullets, each starting with a strong past-tense action verb.
- Each bullet must reflect work the candidate ACTUALLY did (in the master resume) — rephrased
  to mirror JD keywords where natural.
- Keep the candidate's real numbers; do not change "10M requests/day" to "100M" to look bigger.
- Quantify only when the master resume provides the number.

interviewQuestions:
- 8–10 likely questions for THIS specific role at THIS specific company.
- Mix: 2–3 behavioral, 3–4 technical-deep (drawn from the JD's stack/responsibilities),
  1–2 system-design, 1–2 about company/role fit.
- After each question add "Strategy: " with a 1–2 sentence framework for answering
  (point to a specific master-resume project where relevant).
- Format: "Q1: <question>\\nStrategy: <strategy>\\n\\nQ2: ..."

companyBrief:
- 2 paragraphs, 220–300 words total.
- Paragraph 1: what the company does (product, customer, business model) — ground only in
  generally-known public facts; do not invent recent news or financials.
- Paragraph 2: why this specific role matters to the company, signals about engineering
  culture or how the team likely works (inferred from the JD's language and stack),
  and 2 smart questions the candidate could ask the interviewer.

## OUTPUT
Return ONLY a valid JSON object with exactly these 4 string keys — no markdown fences,
no explanation outside the JSON:
{{"coverLetter": "...", "resumeBullets": "...", "interviewQuestions": "...", "companyBrief": "..."}}"""

    return await _call_groq(prompt)


async def generate_ats_resume(
    job_description: str,
    master_resume: str,
    user_profile: dict | None = None,
) -> str:
    """
    Surgically tailor the candidate's master resume for a specific job.

    This is a CONSTRAINED EDIT, not a free-form rewrite:
      - Education, certifications, company names, titles, dates, numbers → locked
      - Skills section → additive only (up to 5 new JD keywords with supporting evidence)
      - Experience / Projects bullets → rephrased for JD keyword alignment, never invented
      - Summary → may be rewritten using only facts already in the master resume
    The master resume is the single source of truth; the model is forbidden to fabricate.
    """
    if not master_resume or not master_resume.strip():
        raise ValueError(
            "Master resume is required for surgical ATS tailoring. "
            "Add your resume in Settings before generating."
        )

    profile_context = _format_profile(user_profile) if user_profile else ""

    system_prompt = (
        "You are an ATS resume optimizer. Your ONLY job is to make minimal, surgical edits "
        "to the candidate's existing master resume so it scores higher in ATS for a specific "
        "job description. You NEVER fabricate experience, achievements, credentials, or numbers. "
        "Treat the master resume as the single source of truth. You are a careful editor, "
        "not a writer."
    )

    user_prompt = f"""Tailor the candidate's master resume for the target job below.
This is a SURGICAL EDIT — produce a new version that is as close to the original as possible,
changed only in ways the rules below permit.

## TARGET JOB DESCRIPTION
{job_description[:4000]}

## CANDIDATE PROFILE
{profile_context}

## MASTER RESUME (single source of truth — do not invent beyond this)
{master_resume[:6000]}

## EDITING RULES

LOCKED — copy these EXACTLY from the master resume; do not modify:
- Education section in full (degrees, institutions, locations, dates, GPAs, honors, coursework)
- Certifications section in full (names, issuers, dates, IDs)
- Company names, job titles, employment dates, and work locations
- Every numeric fact already in the resume (years, percentages, dollar amounts, team sizes,
  user counts, model parameters, latency numbers, revenue, anything quantitative)
- Candidate's name, email, phone, LinkedIn, GitHub, portfolio links

ALLOWED edits (be conservative — change as little as possible):
1. SKILLS section — additive only:
   • You may ADD up to 5 keywords from the job description IF they are plausibly supported
     by experience already documented in the master resume.
   • NEVER remove skills the candidate already lists.
   • NEVER add a skill with zero supporting evidence elsewhere in the resume.
   • Group additions next to related existing skills, do not create a "tailored" or "JD" section.

2. WORK EXPERIENCE bullets — rephrase, do not rewrite:
   • Same facts, same numbers, same accomplishments — only the WORDING changes to mirror
     JD language where it fits naturally.
   • You may REORDER bullets within a single role to surface the most JD-relevant ones first.
   • Do not ADD bullets that don't have a corresponding bullet in the master.
   • Do not DELETE bullets.
   • Do not merge or split bullets.

3. PROJECTS section — same treatment as work experience:
   • Rephrase for keyword alignment, reorder for relevance, do not invent projects.
   • Reuse the project names from the master verbatim.

4. SUMMARY / OBJECTIVE — may be rewritten (one short paragraph, ≤ 3 sentences):
   • Position the candidate for this specific role.
   • Use ONLY facts already present elsewhere in the master resume.
   • No new claims, no new metrics, no new credentials.

FORBIDDEN — these are hallucinations, do not commit them:
- Inventing companies, jobs, projects, titles, dates, or scope the candidate did not have
- Inventing numbers, metrics, percentages, scale (team size, revenue, users, accuracy, latency, etc.)
- Adding skills the master resume gives no evidence for
- Removing or shortening the education or certifications section
- Changing the chronological accuracy of work history
- Adding fake certifications, awards, publications, patents
- Dropping bullets, awards, or sections to make the document look "cleaner"

OUTPUT FORMAT:
- Plain text resume only.
- Standard ATS-friendly section headers in UPPERCASE on their own line:
  SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION, CERTIFICATIONS (only include sections
  present in the master resume).
- One blank line between sections.
- Bullet points start with "- " (hyphen + space), consistent throughout.
- No tables, no columns, no emojis, no markdown bold/italic (no **, no __).
- Return ONLY the resume text. No preamble like "Here is your tailored resume:". No commentary.

Produce the tailored resume now."""

    client = _get_client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2400,
        temperature=0.3,   # low → less creative drift / hallucination
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
