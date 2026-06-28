"""
suggestions.py — Job Suggestions Agent for AI Job Finder v2.1

Fetches jobs from multiple sources, filters by the user's keywords + location
preference, validates URLs, deduplicates against existing board jobs, and
inserts up to 10 suggestions per source into the jobs table.

Sources:
  - Adzuna   — region-specific (India by default); needs ADZUNA_APP_ID/_KEY
  - Jooble   — region-specific (India by default); needs JOOBLE_API_KEY
  - RemoteOK — worldwide remote (kept for remote-friendly roles)
  - Arbeitnow— EU-centric; only remote rows kept
  - HN Algolia — "who is hiring" posts, location injected into the query

Adzuna/Jooble are the India-coverage workhorses; the keyless sources stay as a
remote-friendly supplement. Missing API keys simply skip that source.

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
ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs"
JOOBLE_BASE = "https://jooble.org/api"

HEADERS = {
    "User-Agent": "AIJobFinder/2.1 (job suggestions agent; contact nilesh.k0901@gmail.com)",
    "Accept": "application/json",
}

MAX_PER_SOURCE = 10

# Country name → Adzuna two-letter code. Defaults to India.
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

_TAG_RE = re.compile(r"<[^>]+>")
_REMOTE_WORDS = ("remote", "worldwide", "anywhere", "global", "work from home", "wfh")


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


def _location_ok(location_text: str, city: str, country: str, open_to_remote: bool) -> bool:
    """
    Keep a job if it matches the user's region, or is remote and the user is
    open to remote. Used to gate the worldwide/EU keyless sources so an Indian
    user isn't flooded with US-only or Germany-onsite roles.
    """
    loc = (location_text or "").lower()
    if open_to_remote and any(w in loc for w in _REMOTE_WORDS):
        return True
    if country and country.strip().lower() in loc:
        return True
    if city and city.strip().lower() in loc:
        return True
    return False


async def _validate_url(client: httpx.AsyncClient, url: str) -> bool:
    """HEAD-check a URL. Returns True if the job page is reachable (2xx or 3xx).
    Only used for Adzuna/Jooble where redirect_url quality varies."""
    try:
        r = await client.head(url, timeout=8.0, follow_redirects=True)
        ok = r.status_code < 400
        if not ok:
            print(f"[suggestions] URL validation failed ({r.status_code}): {url[:80]}")
        return ok
    except Exception as e:
        print(f"[suggestions] URL validation error ({e}): {url[:80]}")
        return False


def _cutoff_dt(freshness_days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=freshness_days)


# ── Region sources (India workhorses) ─────────────────────────────────────────

async def _fetch_adzuna(keywords: list[str], country_code: str, city: str,
                        freshness_days: int) -> list[dict]:
    """Fetch region-specific jobs from Adzuna. Skips if keys are unset."""
    app_id = os.getenv("ADZUNA_APP_ID")
    app_key = os.getenv("ADZUNA_APP_KEY")
    if not app_id or not app_key:
        print("[suggestions] Adzuna skipped — ADZUNA_APP_ID/ADZUNA_APP_KEY not set")
        return []

    results: list[dict] = []
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "results_per_page": 25,
        "what_or": " ".join(keywords[:6]),
        "max_days_old": freshness_days,
        "content-type": "application/json",
    }
    if city:
        params["where"] = city

    url = f"{ADZUNA_BASE}/{country_code}/search/1"

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.get(url, params=params)
            r.raise_for_status()
            jobs = r.json().get("results", [])
        except Exception as e:
            print(f"[suggestions] Adzuna fetch failed: {e}")
            return []

        for job in jobs:
            link = job.get("redirect_url", "")
            if not link or not await _validate_url(client, link):
                continue
            company = (job.get("company") or {}).get("display_name", "")
            location = (job.get("location") or {}).get("display_name", "") or city or country_code
            category = (job.get("category") or {}).get("label", "")
            results.append({
                "title": _clean(job.get("title", ""))[:200],
                "company": _clean(company)[:200],
                "url": link,
                "location": _clean(location)[:200],
                "source": "Adzuna",
                "notes": f"Source: Adzuna | {category}".strip(" |"),
            })
            if len(results) >= MAX_PER_SOURCE:
                break

    return results


async def _fetch_jooble(keywords: list[str], location: str, freshness_days: int) -> list[dict]:
    """Fetch region-specific jobs from Jooble. Skips if the key is unset."""
    api_key = os.getenv("JOOBLE_API_KEY")
    if not api_key:
        print("[suggestions] Jooble skipped — JOOBLE_API_KEY not set")
        return []

    results: list[dict] = []
    cutoff = _cutoff_dt(freshness_days)
    payload = {"keywords": ", ".join(keywords[:6]), "location": location or "India"}

    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        try:
            r = await client.post(f"{JOOBLE_BASE}/{api_key}", json=payload)
            r.raise_for_status()
            jobs = r.json().get("jobs", [])
        except Exception as e:
            print(f"[suggestions] Jooble fetch failed: {e}")
            return []

        for job in jobs:
            link = job.get("link", "")
            if not link:
                continue

            updated = job.get("updated", "")
            if updated:
                try:
                    posted = datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
                    if posted.tzinfo is None:
                        posted = posted.replace(tzinfo=timezone.utc)
                    if posted < cutoff:
                        continue
                except Exception:
                    pass

            if not await _validate_url(client, link):
                continue

            results.append({
                "title": _clean(job.get("title", ""))[:200],
                "company": _clean(job.get("company", ""))[:200],
                "url": link,
                "location": _clean(job.get("location", "") or location)[:200],
                "source": "Jooble",
                "notes": f"Source: Jooble | {job.get('type', '')}".strip(" |"),
            })
            if len(results) >= MAX_PER_SOURCE:
                break

    return results


# ── Keyless remote-friendly supplement ────────────────────────────────────────

async def _fetch_remoteok(keywords: list[str], freshness_days: int,
                          city: str, country: str, open_to_remote: bool) -> list[dict]:
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

        print(f"[suggestions] RemoteOK raw jobs: {len(jobs)}")
        kw_lower = [k.lower() for k in keywords]
        skipped_freshness = skipped_kw = skipped_loc = 0

        for job in jobs:
            if not isinstance(job, dict):
                continue

            epoch = job.get("epoch", 0)
            if epoch:
                posted = datetime.fromtimestamp(epoch, tz=timezone.utc)
                if posted < cutoff:
                    skipped_freshness += 1
                    continue

            searchable = (
                f"{job.get('position','')} {job.get('description','')} "
                f"{' '.join(job.get('tags', []))}"
            ).lower()
            if not any(kw in searchable for kw in kw_lower):
                skipped_kw += 1
                continue

            location = job.get("location") or "Remote"
            if not _location_ok(location, city, country, open_to_remote):
                skipped_loc += 1
                continue

            url = job.get("url", "")
            if not url:
                continue

            results.append({
                "title": (job.get("position", "") or "")[:200],
                "company": (job.get("company", "") or "")[:200],
                "url": url,
                "location": location[:200],
                "source": "RemoteOK",
                "notes": f"Source: RemoteOK | Tags: {', '.join(job.get('tags', [])[:5])}",
            })

            if len(results) >= MAX_PER_SOURCE:
                break

    print(f"[suggestions] RemoteOK kept={len(results)} skipped(freshness={skipped_freshness}, kw={skipped_kw}, loc={skipped_loc})")
    return results


async def _fetch_arbeitnow(keywords: list[str], freshness_days: int,
                           city: str, country: str, open_to_remote: bool) -> list[dict]:
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

        print(f"[suggestions] Arbeitnow raw jobs: {len(jobs)}")
        kw_lower = [k.lower() for k in keywords]
        skipped_freshness = skipped_kw = skipped_loc = 0

        for job in jobs:
            created_at = job.get("created_at", "")
            if created_at:
                try:
                    posted = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                    if posted.tzinfo is None:
                        posted = posted.replace(tzinfo=timezone.utc)
                    if posted < cutoff:
                        skipped_freshness += 1
                        continue
                except Exception:
                    pass

            searchable = (
                f"{job.get('title','')} {job.get('description','')} "
                f"{' '.join(job.get('tags', []))}"
            ).lower()
            if not any(kw in searchable for kw in kw_lower):
                skipped_kw += 1
                continue

            location = job.get("location") or ("Remote" if job.get("remote") else "")
            if not _location_ok(location, city, country, open_to_remote):
                skipped_loc += 1
                continue

            url = job.get("url", "")
            if not url:
                continue

            results.append({
                "title": (job.get("title", "") or "")[:200],
                "company": (job.get("company_name", "") or "")[:200],
                "url": url,
                "location": (location or "Remote")[:200],
                "source": "Arbeitnow",
                "notes": f"Source: Arbeitnow | Tags: {', '.join(job.get('tags', [])[:5])}",
            })

            if len(results) >= MAX_PER_SOURCE:
                break

    print(f"[suggestions] Arbeitnow kept={len(results)} skipped(freshness={skipped_freshness}, kw={skipped_kw}, loc={skipped_loc})")
    return results


async def _fetch_hn(keywords: list[str], freshness_days: int,
                    city: str, country: str, open_to_remote: bool) -> list[dict]:
    """Fetch hiring posts from HN Algolia search, biased to the user's region."""
    results: list[dict] = []
    cutoff = _cutoff_dt(freshness_days)
    region = city or country or ""
    query = " OR ".join(keywords[:4]) + " hiring"
    if region:
        query += f" {region}"

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

        print(f"[suggestions] HN raw hits: {len(hits)}")
        skipped_hiring = skipped_loc = 0

        for hit in hits:
            text = (hit.get("comment_text") or hit.get("title") or "").lower()
            if "hiring" not in text and "looking for" not in text:
                skipped_hiring += 1
                continue

            # Region gate: keep if the post mentions the region, or is remote.
            if not _location_ok(text, city, country, open_to_remote):
                skipped_loc += 1
                continue

            urls = re.findall(r'https?://[^\s<>"\']+', text)
            url = urls[0] if urls else f"https://news.ycombinator.com/item?id={hit.get('objectID','')}"

            title_raw = hit.get("title") or text.split("\n")[0][:150]
            title = (title_raw or "HN Job Posting")[:200]

            results.append({
                "title": title,
                "company": (hit.get("author", "") or "")[:200],
                "url": url,
                "location": region or "Remote / Various",
                "source": "HackerNews",
                "notes": f"Source: HackerNews | {hit.get('created_at','')}",
            })

            if len(results) >= MAX_PER_SOURCE:
                break

    print(f"[suggestions] HN kept={len(results)} skipped(not-hiring={skipped_hiring}, loc={skipped_loc})")
    return results


def _get_existing_urls(supabase: Client, user_id: str) -> set[str]:
    """Return the set of job URLs already on this user's board."""
    response = supabase.table("jobs").select("url").eq("user_id", user_id).execute()
    return {row["url"] for row in (response.data or []) if row.get("url")}


async def refresh_suggestions(user_id: str) -> dict:
    """
    Main entry point called by POST /suggestions/refresh.

    1. Load user profile (keywords + location preference)
    2. Fan out to Adzuna, Jooble, RemoteOK, Arbeitnow, HN in parallel
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

    # Location preference (defaults: India, open to remote).
    preferred_country = profile.get("preferred_country") or "India"
    preferred_city = profile.get("preferred_city") or ""
    open_to_remote = profile.get("open_to_remote")
    if open_to_remote is None:
        open_to_remote = True
    country_code = _adzuna_code(preferred_country)
    jooble_location = preferred_city or preferred_country

    print(f"[suggestions] user={user_id[:8]}... keywords={keywords[:5]} "
          f"country={preferred_country} city='{preferred_city}' "
          f"remote={open_to_remote} freshness={freshness_days}d")

    adzuna_jobs, jooble_jobs, remote_ok_jobs, arbeitnow_jobs, hn_jobs = await asyncio.gather(
        _fetch_adzuna(keywords, country_code, preferred_city, freshness_days),
        _fetch_jooble(keywords, jooble_location, freshness_days),
        _fetch_remoteok(keywords, freshness_days, preferred_city, preferred_country, open_to_remote),
        _fetch_arbeitnow(keywords, freshness_days, preferred_city, preferred_country, open_to_remote),
        _fetch_hn(keywords, freshness_days, preferred_city, preferred_country, open_to_remote),
    )

    print(f"[suggestions] raw totals — adzuna={len(adzuna_jobs)} jooble={len(jooble_jobs)} "
          f"remoteok={len(remote_ok_jobs)} arbeitnow={len(arbeitnow_jobs)} hn={len(hn_jobs)}")

    existing_urls = _get_existing_urls(supabase, user_id)

    # Region sources first so they win ties on dedup against remote supplements.
    all_candidates = adzuna_jobs + jooble_jobs + remote_ok_jobs + arbeitnow_jobs + hn_jobs
    # Dedup against the board AND within this batch
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
        "adzuna": _count("Adzuna"),
        "jooble": _count("Jooble"),
        "remoteok": _count("RemoteOK"),
        "arbeitnow": _count("Arbeitnow"),
        "hackernews": _count("HackerNews"),
    }

    if not new_jobs:
        return {"inserted": 0, "sources": source_counts}

    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "user_id": user_id,
            "title": j["title"],
            "company": j["company"],
            "url": j["url"],
            "location": j.get("location", ""),
            "status": "wishlist",
            "notes": j.get("notes", ""),  # "Source: X | ..." provenance stored here; no source column yet
            "is_suggestion": True,
            "added_at": now,
        }
        for j in new_jobs
    ]

    supabase.table("jobs").insert(rows).execute()

    return {"inserted": len(rows), "sources": source_counts}
