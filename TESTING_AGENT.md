# AI Job Finder — Automated Testing Agent
**Last updated:** 2026-06-29 — covers v2.0 → v2.2

> Paste this entire file as a prompt into Claude (Cowork or Claude Code). Claude will
> use Claude in Chrome to run a full functional test of the live app and return a
> structured report. Run after every deployment.

---

## Instructions for Claude

You are a QA testing agent for AI Job Finder v2. Open the live app URL below in Chrome
and test every feature listed. Use `Claude in Chrome` tools to navigate, click, fill forms,
and verify outcomes. Record PASS / FAIL / SKIP for each test case. At the end, produce a
markdown report (see template below).

**Live URL:** `https://ai-job-finder-jzpw4czvm-nilesh0901s-projects.vercel.app/` ← replace with actual Vercel URL

**Test account credentials:** use a dedicated test Google account (not Nilesh's personal account).
If testing email/password, use: `test@gmail.com` / `Test1234` (create in Supabase Auth first).

---

## Test Suite

### Module 1: Authentication

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1.1 | Page load | Navigate to app URL | Splash/login screen renders; no JS errors in console |
| 1.2 | Google SSO | Click "Continue with Google", complete OAuth | Redirected to onboarding or board; user email shown |
| 1.3 | Email signup | Click email signup, enter test@example.com + password | Verification email sent OR direct login |
| 1.4 | Email login | Log in with email/password | Board loads with user's data |
| 1.5 | Sign out | Click sign out | Returns to login screen; board data not visible |

### Module 2: Onboarding

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.1 | First-time flow | Sign in with fresh account | Onboarding wizard appears |
| 2.2 | Step navigation | Complete all steps | Each step advances; back button works |
| 2.3 | Tech stack chips | Select 3+ chips | Selected chips highlighted; count shown |
| 2.4 | Add custom skill | Type skill name, press Enter or click Add | Chip appears in the list |
| 2.5 | Salary fields | Enter min/max salary | Numeric values accepted; empty string handled gracefully |
| 2.6 | Job freshness | Select 7 days | Preference saved |
| 2.7 | Submit | Click Finish | Board loads; suggestions column visible |

### Module 3: Board — Add Job

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 3.1 | Open add dialog | Click "+ Add Job" | Modal appears |
| 3.2 | Scrape valid URL | Paste a RemoteOK job URL, click Scrape | Title/company autofill within 5s |
| 3.3 | Scrape login-walled URL | Paste a LinkedIn job URL | Error message: "requires login — paste manually" |
| 3.4 | Manual entry | Fill title, company, status, click Save | Job card appears in correct column |
| 3.5 | Empty URL | Click Scrape with empty URL | Validation error shown |
| 3.6 | Fit score on scrape | Scrape a job URL (profile must have tech_stack set) | Fit score (0–10) and fit label appear on the saved card |
| 3.7 | Scraped meta fields | After scrape, save the job | Card shows work_mode, job_type, seniority chips if detected |
| 3.8 | Company logo | Scrape a well-known company URL | Company logo (28px) or letter-placeholder appears on card |

### Module 4: Kanban Board

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 4.1 | Columns visible | Load board with jobs | All 5 status columns + Suggested column visible |
| 4.2 | Drag-and-drop | Drag a card to another column | Card moves; status updated in DB |
| 4.3 | Mobile layout | Resize browser to 375px wide | Tab switcher appears; single column shown |
| 4.4 | Mobile tab switch | Tap each tab | Correct column cards shown |
| 4.5 | Promote suggestion | Drag a Suggested card into Wishlist column | Card moves to Wishlist; `is_suggestion` cleared; no longer in Suggested rail |
| 4.6 | Mark viewed on open | Click any job card to open modal, close it | Card is now marked viewed (viewed_at set in DB) |
| 4.7 | Hide Viewed toggle | With ≥1 viewed job, click "Hide viewed (N)" button in board controls | Toggle turns active-blue; viewed cards disappear from all columns |
| 4.8 | Unhide Viewed | Click "Showing unviewed (N hidden)" | All cards reappear; toggle resets |
| 4.9 | Toggle not shown | Board with zero viewed jobs | No Hide Viewed toggle rendered |
| 4.10 | Mobile fit badge | Open mobile view; cards with fit scores | Fit badge visible on mobile card layout |

### Module 5: Job Detail Modal

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | Open modal | Click a job card | Modal opens with correct title/company |
| 5.2 | Status change | Select new status in dropdown | Status updates; card moves on board |
| 5.3 | Notes autosave | Type in notes field, click away | Notes saved (persists on refresh) |
| 5.4 | Cover letter tab | Click tab, click Generate (master resume set) | Cover letter renders within 15s |
| 5.5 | Resume bullets | Click Bullets tab, Generate | 5–7 bullets render |
| 5.6 | Interview prep | Click Interview tab, Generate | 8–10 Q&A pairs render |
| 5.7 | Company brief | Click Brief tab, Generate | 2-paragraph brief renders |

### Module 6: ATS Resume

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 6.1 | Generate ATS | Open job modal → ATS tab → Generate | Tailored resume renders; no blank output |
| 6.2 | Diff view | Click ⇄ Compare | Side-by-side diff of original vs. tailored |
| 6.3 | ATS score | Click ◎ ATS Score | Score dial + keywords panel render |
| 6.4 | Score range | Check overall_score value | Score is integer 0–100 |
| 6.5 | Feedback | Give 4-star rating, click Submit | Toast confirmation; feedback saved |
| 6.6 | PDF download | Click Download PDF | PDF file downloads and opens |
| 6.7 | No master resume | Remove master resume, try Generate | Error message shown: "Add your resume in Settings" |

### Module 7: Settings

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 7.1 | Open settings | Click settings icon | Settings panel opens |
| 7.2 | Edit master resume | Paste text, click Save | Saves without error |
| 7.3 | Edit custom skills | Add a new skill chip | Skill saved to profile |
| 7.4 | Edit salary | Change salary range, save | New values persist on reload |

### Module 8: Suggestions

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 8.1 | Refresh button | Click ↻ in Suggested column | Loading state shows; jobs appear within 30s |
| 8.2 | Source labels | Check cards in Suggested column | Each card shows source (Indeed / Remotive / RemoteOK / Arbeitnow / HackerNews) |
| 8.3 | External link | Click "↗" on a suggestion card | Opens correct job URL in new tab |
| 8.4 | Promote suggestion | Drag suggestion card to "Applied" column | Card moves to Applied; is_suggestion cleared; no longer in Suggested |
| 8.5 | No duplicates | Refresh twice | Already-added jobs don't appear again |
| 8.6 | Indeed source | Check cards after refresh | At least some cards sourced from "Indeed" (India RSS) |
| 8.7 | Remotive source | Check cards after refresh | At least some cards sourced from "Remotive" (remote tech) |
| 8.8 | Zero results handled | Profile with obscure keywords that match nothing | Returns `inserted: 0` without error; no crash |
| 8.9 | Empty board refresh | New user with no jobs, click refresh | Suggestions appear; no dedup error |

### Module 9: Fit Score Engine (v2.2)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 9.1 | Fit badge on card | Add a job via URL scrape (profile has tech_stack) | Coloured fit badge (e.g. "8.5 Great fit!") appears on the Kanban card |
| 9.2 | No badge without score | Add a job manually (no scrape) | No fit badge on card — badge is only shown when fit_score is non-null |
| 9.3 | Label colour mapping | Verify badge colours across labels | Perfect ≥9.5 → purple; Great ≥8.0 → green; Good ≥6.5 → blue; Fair ≥5.0 → yellow; Low <5 → grey |
| 9.4 | work_mode chip | Scrape a remote job | "remote" chip appears in card meta chips row |
| 9.5 | job_type chip | Scrape a full-time job | "full-time" chip appears in card meta chips row |
| 9.6 | seniority chip | Scrape a senior role | "senior" chip appears in card meta chips row |
| 9.7 | salary_text chip | Scrape a job with salary info | Salary chip appears in card meta chips row |
| 9.8 | Company logo | Scrape Stripe / Notion / any big-brand job | Company logo renders at 28px; broken image replaced by letter placeholder |
| 9.9 | Letter placeholder | Scrape a job where logo URL is absent | First letter of company name shown in placeholder circle |
| 9.10 | Fit score on suggestion | Click ↻ refresh suggestions (profile has tech_stack) | Suggested cards include fit badges |

---

## Report Template

After testing, output this exact structure:

```
# AI Job Finder v2.2 — QA Report
Date: [DATE]
Tester: Claude QA Agent
App URL: [URL]
Browser: Chrome [VERSION]

## Summary
- Total tests: [N] (v2.2 adds Modules 9 + expanded 3, 4, 8)
- Passed: [N]
- Failed: [N]
- Skipped: [N]

## Results

| Module | Test ID | Status | Notes |
|--------|---------|--------|-------|
| Auth | 1.1 | ✅ PASS | |
| Auth | 1.2 | ❌ FAIL | [what happened] |
...

## Critical Failures (blocking)
[List any FAIL that prevents core user flow]

## Minor Issues
[List cosmetic or non-blocking issues]

## Recommendations
[Up to 5 action items for the next session]
```
