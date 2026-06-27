"""
suggestions.py — Job Suggestions Agent for AI Job Finder v2.1

Fetches jobs from free public APIs (RemoteOK, Arbeitnow, HN Algolia),
filters by user preferences, validates URLs, deduplicates against existing
board jobs, and inserts up to 10 suggestions per source into the jobs table.

Uses the SUPABASE_SERVICE_ROLE_KEY (server-side only — never expose to browser).
RLS is bypassed for inserts; suggestions land in the user's board with
is_suggestion=true and status='wishlist'.
"""

import asyncio
import os
import re
from datetime import datetime, timezone, timedelta

import httpx
from supabase import create_client, Client

REMOTEOK_URL = "https://remoteok.com/api"
ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api"
HN_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"

HEADERS = {
    "User-Agent": "AIJobFinder/2.1 (job suggestions agent; contact nilesh.k0901@gmail.com)",
    "Accept": "application/json",
}

MAX_PER_SOURCE = 10


def _get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(url, key)


async def _validate_url(client: httpx.AsyncClient, url: str) -> bool:
    """HEAD-check a URL. Returns True if the job page is reachable (2xx or 3xx)."""
    try:
        r = await client.head(url, timeout=8.0, follow_redirects=True)
        return r.status_code < 400
    except Exception:
        return False


def _cutoff_dt(freshness_days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=freshness_days)


async def _fetch_remoteok(keywords: list[str], freshness_days: int) -> list[dict]:
    """Fetch jobs from the RemoteOK public API."""
    results: list[dict] = []
    cutoff = _cutoff_dt(freshness_days)

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.get(REMOTEOK_URL)
            r.raise_for_status()
            jobs = r.json()
            # First item is a metadata/legal notice — skip it
            if jobs and isinstance(jobs[0], dict) and "legal" in jobs[0]:
                jobs = jobs[1:]
        except Exception as e:
            print(f"[suggestions] RemoteOK fetch failed: {e}")
            return []

        kw_lower = [k.lower() for k in keywords]

        for job in jobs:
            if not isinstance(job, dict):
                continue

            epoch = job.get("epoch", 0)
            if epoch:
                posted = datetime.fromtimestamp(epoch, tz=timezone.utc)
                if posted < cutoff:
                    continue

            searchable = (
                f"{job.get('position','')} {job.get('description','')} "
                f"{' '.join(job.get('tags', []))}"
            ).lower()
            if not any(kw in searchable for kw in kw_lower):
                continue

            url = job.get("url", "")
            if not url or not await _validate_url(client, url):
                continue

            results.append({
                "title": (job.get("position", "") or "")[:200],
                "company": (job.get("company", "") or "")[:200],
                "url": url,
                "location": "Remote",
                "source": "RemoteOK",
                "notes": f"Source: RemoteOK | Tags: {', '.join(job.get('tags', [])[:5])}",
            })

            if len(results) >= MAX_PER_SOURCE:
                break

    return results


async def _fetch_arbeitnow(keywords: list[str], freshness_days: int) -> list[dict]:
    """Fetch jobs from the Arbeitnow public API (no auth required)."""
    results: list[dict] = []
    cutoff = _cutoff_dt(freshness_days)

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.get(ARBEITNOW_URL, params={"page": 1})
            r.raise_for_status()
            jobs = r.json().get("data", [])
        except Exception as e:
            print(f"[suggestions] Arbeitnow fetch failed: {e}")
            return []

        kw_lower = [k.lower() for k in keywords]

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

            url = job.get("url", "")
            if not url or not await _validate_url(client, url):
                continue

            results.append({
                "title": (job.get("title", "") or "")[:200],
                "company": (job.get("company_name", "") or "")[:200],
                "url": url,
                "location": (job.get("location", "Remote") or "Remote")[:200],
                "source": "Arbeitnow",
                "notes": f"Source: Arbeitnow | Tags: {', '.join(job.get('tags', [])[:5])}",
            })

            if len(results) >= MAX_PER_SOURCE:
                break

    return results


async def _fetch_hn(keywords: list[str], freshness_days: int) -> list[dict]:
    """Fetch hiring posts from HN Algolia search."""
    results: list[dict] = []
    cutoff = _cutoff_dt(freshness_days)
    query = " OR ".join(keywords[:4]) + " hiring"

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

            urls = re.findall(r'https?://[^\s<>"\']+', text)
            url = urls[0] if urls else f"https://news.ycombinator.com/item?id={hit.get('objectID','')}"

            title_raw = hit.get("title") or text.split("\n")[0][:150]
            title = (title_raw or "HN Job Posting")[:200]

            if not await _validate_url(client, url):
                continue

            results.append({
                "title": title,
                "company": (hit.get("author", "") or "")[:200],
                "url": url,
                "location": "Remote / Various",
                "source": "HackerNews",
                "notes": f"Source: HackerNews | {hit.get('created_at','')}",
            })

            if len(results) >= MAX_PER_SOURCE:
                break

    return results


def _get_existing_urls(supabase: Client, user_id: str) -> set[str]:
    """Return the set of job URLs already on this user's board."""
    response = supabase.table("jobs").select("url").eq("user_id", user_id).execute()
    return {row["url"] for row in (response.data or []) if row.get("url")}


async def refresh_suggestions(user_id: str) -> dict:
    """
    Main entry point called by POST /suggestions/refresh.

    1. Load user profile (keywords = field + domain + tech_stack + custom_skills)
    2. Fan out to RemoteOK, Arbeitnow, HN Algolia in parallel
    3. Dedup against existing board jobs
    4. Insert up to 10 per source as wishlist suggestions

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
        keywords = ["software engineer", "developer"]  # safe fallback

    freshness_days = profile.get("job_freshness_days") or 7

    remote_ok_jobs, arbeitnow_jobs, hn_jobs = await asyncio.gather(
        _fetch_remoteok(keywords, freshness_days),
        _fetch_arbeitnow(keywords, freshness_days),
        _fetch_hn(keywords, freshness_days),
    )

    existing_urls = _get_existing_urls(supabase, user_id)

    all_candidates = remote_ok_jobs + arbeitnow_jobs + hn_jobs
    # Dedup against the board AND within this batch
    seen: set[str] = set(existing_urls)
    new_jobs: list[dict] = []
    for j in all_candidates:
        if j["url"] in seen:
            continue
        seen.add(j["url"])
        new_jobs.append(j)

    if not new_jobs:
        return {"inserted": 0, "sources": {"remoteok": 0, "arbeitnow": 0, "hackernews": 0}}

    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "user_id": user_id,
            "title": j["title"],
            "company": j["company"],
            "url": j["url"],
            "location": j.get("location", ""),
            "status": "wishlist",
            "notes": j.get("notes", ""),
            "source": j.get("source", ""),
            "is_suggestion": True,
            "added_at": now,
        }
        for j in new_jobs
    ]

    supabase.table("jobs").insert(rows).execute()

    source_counts = {
        "remoteok": sum(1 for j in new_jobs if j.get("source") == "RemoteOK"),
        "arbeitnow": sum(1 for j in new_jobs if j.get("source") == "Arbeitnow"),
        "hackernews": sum(1 for j in new_jobs if j.get("source") == "HackerNews"),
    }

    return {"inserted": len(rows), "sources": source_counts}
