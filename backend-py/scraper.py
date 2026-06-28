"""
scraper.py — Job posting URL scraper
Python port of backend/scraper.js using httpx + BeautifulSoup4

v2.1-A hardening:
- Browser-like headers (UA + Accept-Language + Accept) so sites don't 403 / return a login wall
- 15s timeout, redirects followed (LinkedIn/Indeed 301 to login)
- Real description body preferred over og:description
- Login-wall detection → ValueError with a copy-paste hint
- Title site-suffix stripping (" | LinkedIn", " - Indeed", …)

Response contract is preserved: returns { title, company, location, rawDescription }.
The /scrape route wraps this in { success: True, ... }; on ValueError it returns
{ success: False, error: <message> } so the frontend can show it inline.
"""

import re

import httpx
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# If any of these appear at the very start of the extracted body, the page is a login wall.
_WALL_SIGNALS = ["sign in to", "log in to", "create an account", "join linkedin", "please log in"]

_TITLE_SEPARATORS = [" | ", " - ", " – ", " — "]


async def scrape_job(url: str) -> dict:
    """
    Returns dict: { title, company, location, rawDescription }
    Raises httpx.HTTPError on network/HTTP failure.
    Raises ValueError on a login wall or when no meaningful content is found.
    """
    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers=HEADERS,
    ) as client:
        response = await client.get(url)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove noise
    for tag in soup.select("script, style, nav, footer, header, [role='navigation']"):
        tag.decompose()

    # ── Title ────────────────────────────────────────────────────────────
    title = (
        _meta(soup, "property", "og:title")
        or _text(soup, "[data-testid='jobsearch-JobInfoHeader-title']")
        or _text(soup, ".job-details-jobs-unified-top-card__job-title")
        or _text(soup, "h1")
        or (soup.title.string.strip() if soup.title and soup.title.string else "")
    )
    # Strip site suffixes like " | LinkedIn" or " - Indeed"
    for sep in _TITLE_SEPARATORS:
        if sep in title:
            title = title.split(sep)[0].strip()
            break

    # ── Company ──────────────────────────────────────────────────────────
    company = (
        _meta(soup, "name", "author")
        or _meta(soup, "property", "og:site_name")
        or _text(soup, "[data-testid='inlineHeader-companyName']")
        or _text(soup, ".job-details-jobs-unified-top-card__company-name")
        or _text(soup, "[class*='company']")
    )

    # ── Location ─────────────────────────────────────────────────────────
    location = (
        _text(soup, "[data-testid='job-location']")
        or _text(soup, "[class*='location']")
        or _text(soup, "[class*='workplace']")
    )

    # ── Description ──────────────────────────────────────────────────────
    raw_description = (
        _meta(soup, "property", "og:description")
        or _meta(soup, "name", "description")
        or ""
    )

    desc_selectors = [
        "[data-testid='jobsearch-jobDescriptionText']",
        ".job-description",
        "[class*='job-description']",
        "[class*='jobDescription']",
        "[class*='description']",
        "article",
        "main",
    ]
    for sel in desc_selectors:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(" ", strip=True)
            if len(text) > len(raw_description):
                raw_description = text

    # Last resort: full body text
    if len(raw_description) < 200:
        body = soup.find("body")
        if body:
            raw_description = " ".join(body.get_text().split())

    raw_description = raw_description[:6000]

    # ── Login-wall detection ─────────────────────────────────────────────
    head = raw_description[:500].lower()
    if any(sig in head for sig in _WALL_SIGNALS):
        raise ValueError(
            "This job site requires login to view the posting. "
            "Paste the job description manually into the description field."
        )

    if not title and not raw_description:
        raise ValueError("Could not extract meaningful content from this URL")

    # ── Job type ─────────────────────────────────────────────────────────
    text_lower = (title + " " + raw_description).lower()
    job_type = None
    if any(t in text_lower for t in ("full-time", "full time", "permanent", "fulltime")):
        job_type = "full-time"
    elif any(t in text_lower for t in ("part-time", "part time", "parttime")):
        job_type = "part-time"
    elif any(t in text_lower for t in ("contract", "freelance", "contractor", "consulting")):
        job_type = "contract"

    # ── Work mode ────────────────────────────────────────────────────────
    work_mode = None
    if any(t in text_lower for t in ("remote", "work from home", "wfh", "work-from-home", "distributed")):
        work_mode = "remote"
    elif "hybrid" in text_lower:
        work_mode = "hybrid"
    elif any(t in text_lower for t in ("on-site", "onsite", "in-office", "in office", "on site")):
        work_mode = "onsite"

    # ── Seniority (title takes priority over description) ────────────────
    title_lower = title.lower()
    seniority = None
    if any(t in title_lower for t in ("vp ", "vice president", "director", "head of", "chief", "cto", "ceo")):
        seniority = "lead"
    elif any(t in title_lower for t in ("lead ", "principal", "staff ", "architect")):
        seniority = "lead"
    elif any(t in title_lower for t in ("senior", "sr.", " sr ")):
        seniority = "senior"
    elif any(t in title_lower for t in ("junior", "jr.", " jr ", "entry", "associate", "intern", "graduate")):
        seniority = "junior"
    elif any(t in title_lower for t in ("mid-level", "mid level", "intermediate", "ii ", "iii ")):
        seniority = "mid"
    else:
        # Fallback: scan description for experience-year clues
        if re.search(r"\b([5-9]|1[0-9])\+?\s*years?\b", text_lower):
            seniority = "senior"
        elif re.search(r"\b([0-2])\+?\s*years?\b", text_lower) or "entry level" in text_lower:
            seniority = "junior"
        elif re.search(r"\b([3-4])\+?\s*years?\b", text_lower):
            seniority = "mid"

    # ── Salary text ──────────────────────────────────────────────────────
    salary_text = None
    _SALARY_RE = re.compile(
        r"(?:[\$€£₹]\s*[\d,]+(?:\s*[-–]\s*[\$€£₹]?\s*[\d,]+)?"
        r"(?:\s*(?:per\s+)?(?:year|annum|yr|month|mo))?)"
        r"|(?:[\d,]+\s*(?:[-–]\s*[\d,]+\s*)?(?:LPA|lpa|lakh|lakhs))"
        r"|(?:[\d,]+\s*[-–]\s*[\d,]+\s*(?:USD|EUR|GBP|INR|K|k))",
        re.IGNORECASE,
    )
    m = _SALARY_RE.search(raw_description[:4000])
    if m:
        salary_text = m.group(0).strip()[:100]

    # ── Company logo ─────────────────────────────────────────────────────
    company_logo_url = _meta(soup, "property", "og:image") or ""
    if not company_logo_url:
        favicon_tag = soup.find("link", rel=lambda r: r and "icon" in " ".join(r).lower())
        if favicon_tag:
            href = favicon_tag.get("href", "")
            if href.startswith("http"):
                company_logo_url = href
            elif href.startswith("//"):
                company_logo_url = "https:" + href

    return {
        "title":           (title or "")[:200],
        "company":         (company or "")[:200],
        "location":        (location or "")[:200],
        "rawDescription":  raw_description,
        "job_type":        job_type,
        "work_mode":       work_mode,
        "seniority":       seniority,
        "salary_text":     salary_text,
        "company_logo_url": company_logo_url or None,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _meta(soup: BeautifulSoup, attr: str, value: str) -> str:
    tag = soup.find("meta", {attr: value})
    return (tag.get("content") or "").strip() if tag else ""

def _text(soup: BeautifulSoup, selector: str) -> str:
    el = soup.select_one(selector)
    return el.get_text(strip=True) if el else ""
