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

    return {
        "title":          (title or "")[:200],
        "company":        (company or "")[:200],
        "location":       (location or "")[:200],
        "rawDescription": raw_description,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _meta(soup: BeautifulSoup, attr: str, value: str) -> str:
    tag = soup.find("meta", {attr: value})
    return (tag.get("content") or "").strip() if tag else ""

def _text(soup: BeautifulSoup, selector: str) -> str:
    el = soup.select_one(selector)
    return el.get_text(strip=True) if el else ""
