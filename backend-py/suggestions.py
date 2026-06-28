"""
suggestions.py — Job Suggestions Agent for AI Job Finder v2.1+

Sources (all keyless unless noted):
  - Indeed RSS  — India-specific, no auth, most reliable for IN jobs
  - Remotive    — Free API, remote tech roles worldwide
  - RemoteOK    — Free API, remote tech roles
  - Arbeitnow   — Free API, EU-centric but keeps remote rows
  - HN Algolia  — "who is hiring" posts
  - Adzuna      — India-specific; needs ADZUNA_APP_ID/_KEY (skipped if unset)
  - Jooble      — India-specific; needs JOOBLE_API_KEY (skipped if unset)

Key design notes:
  - URL validation runs CONCURRENTLY (semaphore-capped) to avoid sequential timeouts
  - URL validation is skipped for sources that return canonical verified links
    (Indeed RSS redirect URLs are valid by construction; Remotive links are stable)
  - SUPABASE_SERVICE_ROLE_KEY used server-side only — never exposed to browser
"""

import asyncio
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

import httpx
from supabase import create_client, Client

REMOTEOK_URL   = "https://remoteok.com/api"
ARBEITNOW_URL  = "https://www.arbeitnow.com/api/job-board-api"
HN_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"
ADZUNA_BASE    = "https://api.adzuna.com/v1/api/jobs"
JOOBLE_BASE    = "https://jooble.org/api"
REMOTIVE_URL   = "https://remotive.com/api/remote-jobs"
INDEED_RSS_URL = "https://www.indeed.co.in/rss"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/xml, */*",
}

MAX_PER_SOURCE   = 10
VALIDATE_CONCURRENCY = 8   # max parallel HEAD requests

ADZUNA_COUNTRY_CODES = {
    "india": "in", "in": "in",
    "united states": "us", "usa": "us", "us": "us", "america": "us",
    "united kingdom": "gb", "uk": "gb", "england": "gb", "gb": "gb",
    "canada": "ca", "ca": "ca",
    "australia": "au", "au": "au",
    "germany": "de", "de": "de",
    "singapore": "sg", "sg": "sg",
    "netherlands": "nl", "nl": "nl",
    "france": "fr", "fr": "fr",
}

_TAG_RE      = re.compile(r"<[^>]+>")
_REMOTE_WORDS = ("remote", "worldwide", "anywhere", "global", "work from home", "wfh", "distributed")


def _get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(url, key)


def _adzuna_code(country: str) -> str:
    return ADZUNA_COUNTRY_CODES.get((country or "india").strip().lower(), "in")


def _clean(text: str) -> str:
    return _TAG_RE.sub("", text or "").strip()


def _is_remote(location_text: str) -> bool:
    loc = (location_text or "").lower()
    return any(w in loc for w in _REMOTE_WORDS)


def _location_ok(location_text: str, city: str, country: str, open_to_remote: bool) -> bool:
    loc = (location_text or "").lower()
    if open_to_remote and _is_remote(loc):
        return True
    if country and country.strip().lower() in loc:
        return True
    if city and city.strip().lower() in loc:
        return True
    return False


def _cutoff_dt(freshness_days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=freshness_days)


async def _validate_urls_batch(client: httpx.AsyncClient, urls: list[str]) -> list[bool]:
    """Validate a batch of URLs concurrently. Returns list of booleans (same order)."""
    sem = asyncio.Semaphore(VALIDATE_CONCURRENCY)

    async def _check(url: str) -> bool:
        async with sem:
            try:
                r = await client.head(url, timeout=6.0, follow_redirects=True)
                return r.status_code < 400
            except Exception:
                return False

    return list(await asyncio.gather(*[_check(u) for u in urls]))


# ── Indeed RSS (India) ────────────────────────────────────────────────────────

async def _fetch_indeed(keywords: list[str], city: str, country: str,
                        freshness_days: int) -> list[dict]:
    """Fetch India jobs from Indeed's public RSS feed. No API key required."""
    results: list[dict] = []
    query = " ".join(keywords[:5])
    location = city or country or "India"

    params = {
        "q": query,
        "l": location,
        "fromage": str(freshness_days),
        "limit": "25",
        "sort": "date",
    }

    async with httpx.AsyncClient(headers={**HEADERS, "Accept": "text/xml"}, timeout=20.0) as client:
        try:
            r = await client.get(INDEED_RSS_URL, params=params)
            r.raise_for_status()
            root = ET.fromstring(r.text)
        except Exception as e:
            print(f"[suggestions] Indeed RSS fetch failed: {e}")
            return []

        ns = {"dc": "http://purl.org/dc/elements/1.1/"}
        items = root.findall(".//item")
        for item in items:
            title   = (item.findtext("title") or "").strip()
            link    = (item.findtext("link") or "").strip()
            company = (item.findtext("dc:creator", namespaces=ns) or "").strip()
            loc_txt = (item.findtext("dc:publisher", namespaces=ns) or location).strip()

            if not title or not link:
                continue

            results.append({
                "title":    _clean(title)[:200],
                "company":  _clean(company)[:200],
                "url":      link,
                "location": _clean(loc_txt or location)[:200],
                "source":   "Indeed",
                "notes":    f"Source: Indeed",
            })
            if len(results) >= MAX_PER_SOURCE:
                break

    return results


# ── Remotive ─────────────────────────────────────────────────────────────────

async def _fetch_remotive(keywords: list[str]) -> list[dict]:
    """Fetch remote tech jobs from Remotive's public API. No auth required."""
    results: list[dict] = []
    query = " ".join(keywords[:3])

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.get(REMOTIVE_URL, params={"search": query, "limit": 25})
            r.raise_for_status()
            jobs = r.json().get("jobs", [])
        except Exception as e:
            print(f"[suggestions] Remotive fetch failed: {e}")
            return []

        for job in jobs:
            url   = job.get("url", "")
            title = (job.get("title") or "").strip()
            if not url or not title:
                continue

            results.append({
                "title":    title[:200],
                "company":  (job.get("company_name") or "")[:200],
                "url":      url,
                "location": (job.get("candidate_required_location") or "Remote")[:200],
                "source":   "Remotive",
                "notes":    f"Source: Remotive | {job.get('job_type', '')}",
            })
            if len(results) >= MAX_PER_SOURCE:
                break

    return results


# ── RemoteOK ──────────────────────────────────────────────────────────────────

async def _fetch_remoteok(keywords: list[str], freshness_days: int,
                          city: str, country: str, open_to_remote: bool) -> list[dict]:
    results: list[dict] = []
    cutoff   = _cutoff_dt(freshness_days)
    kw_lower = [k.lower() for k in keywords]
    candidates: list[dict] = []

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.get(REMOTEOK_URL)
            r.raise_for_status()
            jobs = r.json()
            if jobs and isinstance(jobs[0], dict) and "legal" in jobs[0]:
                jobs = jobs[1:]
        except Exception as e:
            print(f"[suggestions] RemoteOK fetch failed: {e}")
            return []

        for job in jobs:
            if not isinstance(job, dict):
                continue
            epoch = job.get("epoch", 0)
            if epoch:
                if datetime.fromtimestamp(epoch, tz=timezone.utc) < cutoff:
                    continue
            searchable = (
                f"{job.get('position','')} {job.get('description','')} "
                f"{' '.join(job.get('tags', []))}"
            ).lower()
            if not any(kw in searchable for kw in kw_lower):
                continue
            location = job.get("location") or "Remote"
            if not _location_ok(location, city, country, open_to_remote):
                continue
            url = job.get("url", "")
            if not url:
                continue
            candidates.append({
                "title":    (job.get("position", "") or "")[:200],
                "company":  (job.get("company", "") or "")[:200],
                "url":      url,
                "location": location[:200],
                "source":   "RemoteOK",
                "notes":    f"Source: RemoteOK | Tags: {', '.join(job.get('tags', [])[:5])}",
            })
            if len(candidates) >= MAX_PER_SOURCE * 2:
                break

        if candidates:
            valid = await _validate_urls_batch(client, [c["url"] for c in candidates])
            results = [c for c, ok in zip(candidates, valid) if ok][:MAX_PER_SOURCE]

    return results


# ── Arbeitnow ─────────────────────────────────────────────────────────────────

async def _fetch_arbeitnow(keywords: list[str], freshness_days: int,
                           city: str, country: str, open_to_remote: bool) -> list[dict]:
    results: list[dict] = []
    cutoff   = _cutoff_dt(freshness_days)
    kw_lower = [k.lower() for k in keywords]
    candidates: list[dict] = []

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.get(ARBEITNOW_URL, params={"page": 1})
            r.raise_for_status()
            jobs = r.json().get("data", [])
        except Exception as e:
            print(f"[suggestions] Arbeitnow fetch failed: {e}")
            return []

        for job in jobs:
            created_at = job.get("created_at", "")
            if created_at:
                try:
                    posted = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                    if posted.tzinfo is None:
                        posted = posted.replace(tzinfo=timezone.utc)
                    if posted < cutoff:
                        continue
                except Exception:
                    pass
            searchable = (
                f"{job.get('title','')} {job.get('description','')} "
                f"{' '.join(job.get('tags', []))}"
            ).lower()
            if not any(kw in searchable for kw in kw_lower):
                continue
            location = job.get("location") or ("Remote" if job.get("remote") else "")
            if not _location_ok(location, city, country, open_to_remote):
                continue
            url = job.get("url", "")
            if not url:
                continue
            candidates.append({
                "title":    (job.get("title", "") or "")[:200],
                "company":  (job.get("company_name", "") or "")[:200],
                "url":      url,
                "location": (location or "Remote")[:200],
                "source":   "Arbeitnow",
                "notes":    f"Source: Arbeitnow | Tags: {', '.join(job.get('tags', [])[:5])}",
            })
            if len(candidates) >= MAX_PER_SOURCE * 2:
                break

        if candidates:
            valid = await _validate_urls_batch(client, [c["url"] for c in candidates])
            results = [c for c, ok in zip(candidates, valid) if ok][:MAX_PER_SOURCE]

    return results


# ── HN Algolia ────────────────────────────────────────────────────────────────

async def _fetch_hn(keywords: list[str], freshness_days: int,
                    city: str, country: str, open_to_remote: bool) -> list[dict]:
    results: list[dict] = []
    cutoff = _cutoff_dt(freshness_days)
    region = city or country or ""
    query  = " OR ".join(keywords[:4]) + " hiring"
    if region:
        query += f" {region}"

    candidates: list[dict] = []

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.get(HN_ALGOLIA_URL, params={
                "query": query,
                "tags": "comment,story",
                "numericFilters": f"created_at_i>{int(cutoff.timestamp())}",
                "hitsPerPage": 30,
            })
            r.raise_for_status()
            hits = r.json().get("hits", [])
        except Exception as e:
            print(f"[suggestions] HN Algolia fetch failed: {e}")
            return []

        for hit in hits:
            text = (hit.get("comment_text") or hit.get("title") or "").lower()
            if "hiring" not in text and "looking for" not in text:
                continue
            if not _location_ok(text, city, country, open_to_remote):
                continue
            urls = re.findall(r'https?://[^\s<>"\']+', text)
            url  = urls[0] if urls else f"https://news.ycombinator.com/item?id={hit.get('objectID','')}"
            title_raw = hit.get("title") or text.split("\n")[0][:150]
            candidates.append({
                "title":    (title_raw or "HN Job Posting")[:200],
                "company":  (hit.get("author", "") or "")[:200],
                "url":      url,
                "location": region or "Remote / Various",
                "source":   "HackerNews",
                "notes":    f"Source: HackerNews | {hit.get('created_at','')}",
            })
            if len(candidates) >= MAX_PER_SOURCE * 2:
                break

        if candidates:
            valid = await _validate_urls_batch(client, [c["url"] for c in candidates])
            results = [c for c, ok in zip(candidates, valid) if ok][:MAX_PER_SOURCE]

    return results


# ── Adzuna (keyed) ────────────────────────────────────────────────────────────

async def _fetch_adzuna(keywords: list[str], country_code: str, city: str,
                        freshness_days: int) -> list[dict]:
    app_id  = os.getenv("ADZUNA_APP_ID")
    app_key = os.getenv("ADZUNA_APP_KEY")
    if not app_id or not app_key:
        print("[suggestions] Adzuna skipped — ADZUNA_APP_ID/ADZUNA_APP_KEY not set")
        return []

    candidates: list[dict] = []
    params = {
        "app_id": app_id, "app_key": app_key,
        "results_per_page": 25,
        "what_or": " ".join(keywords[:6]),
        "max_days_old": freshness_days,
        "content-type": "application/json",
    }
    if city:
        params["where"] = city

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.get(f"{ADZUNA_BASE}/{country_code}/search/1", params=params)
            r.raise_for_status()
            jobs = r.json().get("results", [])
        except Exception as e:
            print(f"[suggestions] Adzuna fetch failed: {e}")
            return []

        for job in jobs:
            link    = job.get("redirect_url", "")
            company = (job.get("company") or {}).get("display_name", "")
            location = (job.get("location") or {}).get("display_name", "") or city or country_code
            category = (job.get("category") or {}).get("label", "")
            if not link:
                continue
            candidates.append({
                "title":    _clean(job.get("title", ""))[:200],
                "company":  _clean(company)[:200],
                "url":      link,
                "location": _clean(location)[:200],
                "source":   "Adzuna",
                "notes":    f"Source: Adzuna | {category}".strip(" |"),
            })

        if candidates:
            valid = await _validate_urls_batch(client, [c["url"] for c in candidates])
            return [c for c, ok in zip(candidates, valid) if ok][:MAX_PER_SOURCE]

    return []


# ── Jooble (keyed) ────────────────────────────────────────────────────────────

async def _fetch_jooble(keywords: list[str], location: str, freshness_days: int) -> list[dict]:
    api_key = os.getenv("JOOBLE_API_KEY")
    if not api_key:
        print("[suggestions] Jooble skipped — JOOBLE_API_KEY not set")
        return []

    cutoff   = _cutoff_dt(freshness_days)
    payload  = {"keywords": ", ".join(keywords[:6]), "location": location or "India"}
    candidates: list[dict] = []

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.post(f"{JOOBLE_BASE}/{api_key}", json=payload)
            r.raise_for_status()
            jobs = r.json().get("jobs", [])
        except Exception as e:
            print(f"[suggestions] Jooble fetch failed: {e}")
            return []

        for job in jobs:
            link    = job.get("link", "")
            updated = job.get("updated", "")
            if not link:
                continue
            if updated:
                try:
                    posted = datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
                    if posted.tzinfo is None:
                        posted = posted.replace(tzinfo=timezone.utc)
                    if posted < cutoff:
                        continue
                except Exception:
                    pass
            candidates.append({
                "title":    _clean(job.get("title", ""))[:200],
                "company":  _clean(job.get("company", ""))[:200],
                "url":      link,
                "location": _clean(job.get("location", "") or location)[:200],
                "source":   "Jooble",
                "notes":    f"Source: Jooble | {job.get('type', '')}".strip(" |"),
            })

        if candidates:
            valid = await _validate_urls_batch(client, [c["url"] for c in candidates])
            return [c for c, ok in zip(candidates, valid) if ok][:MAX_PER_SOURCE]

    return []


def _get_existing_urls(supabase: Client, user_id: str) -> set[str]:
    response = supabase.table("jobs").select("url").eq("user_id", user_id).execute()
    return {row["url"] for row in (response.data or []) if row.get("url")}


async def refresh_suggestions(user_id: str) -> dict:
    """
    Main entry point called by POST /suggestions/refresh.

    Fan-out order (most India-relevant first):
      Indeed RSS → Remotive → Adzuna (keyed) → Jooble (keyed) →
      RemoteOK → Arbeitnow → HN

    Returns { inserted: int, sources: dict }
    """
    if not user_id:
        raise ValueError("user_id is required")

    supabase = _get_supabase()

    profile_resp = (
        supabase.table("user_profiles").select("*").eq("user_id", user_id).maybe_single().execute()
    )
    profile = (profile_resp.data if profile_resp else None) or {}

    keywords: list[str] = []
    if profile.get("field"):
        keywords.append(profile["field"])
    if profile.get("domain"):
        keywords.append(profile["domain"])
    keywords.extend(profile.get("tech_stack") or [])
    keywords.extend(profile.get("custom_skills") or [])
    keywords = list(dict.fromkeys(k for k in keywords if k))[:15]
    if not keywords:
        keywords = ["software engineer", "developer"]

    freshness_days    = profile.get("job_freshness_days") or 14   # widened from 7→14 for better coverage
    preferred_country = profile.get("preferred_country") or "India"
    preferred_city    = profile.get("preferred_city") or ""
    open_to_remote    = profile.get("open_to_remote")
    if open_to_remote is None:
        open_to_remote = True
    country_code   = _adzuna_code(preferred_country)
    jooble_location = preferred_city or preferred_country

    (
        indeed_jobs, remotive_jobs, adzuna_jobs, jooble_jobs,
        remoteok_jobs, arbeitnow_jobs, hn_jobs,
    ) = await asyncio.gather(
        _fetch_indeed(keywords, preferred_city, preferred_country, freshness_days),
        _fetch_remotive(keywords),
        _fetch_adzuna(keywords, country_code, preferred_city, freshness_days),
        _fetch_jooble(keywords, jooble_location, freshness_days),
        _fetch_remoteok(keywords, freshness_days, preferred_city, preferred_country, open_to_remote),
        _fetch_arbeitnow(keywords, freshness_days, preferred_city, preferred_country, open_to_remote),
        _fetch_hn(keywords, freshness_days, preferred_city, preferred_country, open_to_remote),
    )

    print(f"[suggestions] raw: indeed={len(indeed_jobs)} remotive={len(remotive_jobs)} "
          f"adzuna={len(adzuna_jobs)} jooble={len(jooble_jobs)} "
          f"remoteok={len(remoteok_jobs)} arbeitnow={len(arbeitnow_jobs)} hn={len(hn_jobs)}")

    existing_urls = _get_existing_urls(supabase, user_id)

    # Dedup: India sources first, then remote supplements
    all_candidates = (
        indeed_jobs + adzuna_jobs + jooble_jobs +
        remotive_jobs + remoteok_jobs + arbeitnow_jobs + hn_jobs
    )
    seen: set[str] = set(existing_urls)
    new_jobs: list[dict] = []
    for j in all_candidates:
        if j["url"] in seen:
            continue
        seen.add(j["url"])
        new_jobs.append(j)

    def _count(name: str) -> int:
        return sum(1 for j in new_jobs if j.get("source") == name)

    source_counts = {
        "indeed":     _count("Indeed"),
        "remotive":   _count("Remotive"),
        "adzuna":     _count("Adzuna"),
        "jooble":     _count("Jooble"),
        "remoteok":   _count("RemoteOK"),
        "arbeitnow":  _count("Arbeitnow"),
        "hackernews": _count("HackerNews"),
    }

    if not new_jobs:
        return {"inserted": 0, "sources": source_counts}

    now  = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "user_id":       user_id,
            "title":         j["title"],
            "company":       j["company"],
            "url":           j["url"],
            "location":      j.get("location", ""),
            "status":        "wishlist",
            "notes":         j.get("notes", ""),
            "source":        j.get("source", ""),
            "is_suggestion": True,
            "added_at":      now,
        }
        for j in new_jobs
    ]

    supabase.table("jobs").insert(rows).execute()
    print(f"[suggestions] inserted {len(rows)} jobs for user {user_id}")

    return {"inserted": len(rows), "sources": source_counts}
