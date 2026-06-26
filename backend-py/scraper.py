"""
scraper.py — Job posting URL scraper
Python port of backend/scraper.js using httpx + BeautifulSoup4
"""

import httpx
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

async def scrape_job(url: str) -> dict:
    async with httpx.AsyncClient(
        timeout=10.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
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
        or soup.title.string.split("|")[0].strip() if soup.title else ""
    )

    # ── Company ──────────────────────────────────────────────────────────
    company = (
        _meta(soup, "name", "author")
        or _text(soup, "[data-testid='inlineHeader-companyName']")
        or _text(soup, ".job-details-jobs-unified-top-card__company-name")
        or _text(soup, "[class*='company']")
    )

    # ── Location ─────────────────────────────────────────────────────────
    location = (
        _text(soup, "[data-testid='job-location']")
        or _text(soup, "[class*='location']")
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
