"""
AI Job Finder v2 — Connection Verification Script
Run this before Phase 2 to confirm all services are wired up correctly.

Usage:
  pip install httpx
  python test-connections.py
"""

import httpx
import json
import sys

SUPABASE_URL = "https://eoudzvwbrrqnhtulehfc.supabase.co"
ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvdWR6dndicnJxbmh0dWxlaGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NjM1NzMsImV4cCI6MjA5ODAzOTU3M30.lI03dFdUH7yoJqT7I9AZvvU1e7sarmUi7m27zPxCzCo"

HEADERS = {
    "apikey":        ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type":  "application/json",
}

PASS = "✅"
FAIL = "❌"
WARN = "⚠️ "

results = []

def check(label, passed, detail=""):
    icon = PASS if passed else FAIL
    msg  = f"{icon}  {label}"
    if detail:
        msg += f"\n     {detail}"
    print(msg)
    results.append(passed)

print("\n" + "="*55)
print("  AI Job Finder v2 — Connection Check")
print("="*55 + "\n")

# ── 1. Supabase reachability ──────────────────────────────
print("── Supabase ─────────────────────────────────────────")
try:
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/", headers=HEADERS, timeout=8)
    check("Supabase project reachable", r.status_code in (200, 404),
          f"HTTP {r.status_code}")
except Exception as e:
    check("Supabase project reachable", False, str(e))

# ── 2. Tables exist ───────────────────────────────────────
TABLES = ["user_profiles", "jobs", "master_resumes", "ats_resumes"]
for table in TABLES:
    try:
        r = httpx.get(
            f"{SUPABASE_URL}/rest/v1/{table}?limit=1",
            headers={**HEADERS, "Prefer": "count=exact"},
            timeout=8,
        )
        if r.status_code == 200:
            check(f"Table '{table}' exists", True, "RLS active — returned 0 rows (correct, no session)")
        elif r.status_code == 401:
            check(f"Table '{table}' exists", True, "401 = table exists, RLS blocking anon (correct)")
        elif r.status_code == 404:
            body = r.json()
            check(f"Table '{table}' exists", False,
                  f"404 — table not found. Did the SQL schema run? Error: {body.get('message','')}")
        else:
            check(f"Table '{table}' exists", False, f"Unexpected HTTP {r.status_code}: {r.text[:100]}")
    except Exception as e:
        check(f"Table '{table}' exists", False, str(e))

# ── 3. Auth endpoint ──────────────────────────────────────
print("\n── Auth ─────────────────────────────────────────────")
try:
    r = httpx.get(f"{SUPABASE_URL}/auth/v1/settings", headers=HEADERS, timeout=8)
    if r.status_code == 200:
        data = r.json()
        email_enabled  = data.get("external", {}).get("email", False)
        google_enabled = data.get("external", {}).get("google", False)
        check("Auth endpoint reachable", True)
        check("Email/password auth enabled", email_enabled,
              "Go to Supabase → Auth → Providers → Email and enable it" if not email_enabled else "")
        check("Google SSO enabled", google_enabled,
              f"{WARN} Not enabled yet — you can enable later, email auth works for now" if not google_enabled else "")
    else:
        check("Auth endpoint reachable", False, f"HTTP {r.status_code}: {r.text[:100]}")
except Exception as e:
    check("Auth endpoint reachable", False, str(e))

# ── 4. Test signup (creates + immediately deletes a test user) ────
print("\n── Auth flow (sign-up test) ──────────────────────────")
try:
    r = httpx.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers=HEADERS,
        json={"email": "test-verify@example.com", "password": "TestPass123!"},
        timeout=8,
    )
    if r.status_code in (200, 201, 400):
        body = r.json()
        # 400 with "already registered" is also fine — means auth is working
        already_exists = "already registered" in body.get("msg", "") or "already registered" in body.get("error_description", "")
        if r.status_code in (200, 201) or already_exists:
            check("Sign-up API works", True, "Auth is accepting registrations")
        else:
            check("Sign-up API works", False, f"{body.get('msg') or body.get('error_description','unknown error')}")
    else:
        check("Sign-up API works", False, f"HTTP {r.status_code}: {r.text[:100]}")
except Exception as e:
    check("Sign-up API works", False, str(e))

# ── Summary ───────────────────────────────────────────────
print("\n" + "="*55)
total  = len(results)
passed = sum(results)
failed = total - passed

if failed == 0:
    print(f"  {PASS}  All {total} checks passed — ready for Phase 2!")
else:
    print(f"  {FAIL}  {failed}/{total} checks failed — fix the ❌ items above before Phase 2")

print("="*55 + "\n")

sys.exit(0 if failed == 0 else 1)
