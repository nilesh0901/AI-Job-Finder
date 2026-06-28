"""
fit_score.py — Pure keyword-matching fit score (job vs user profile).
No external API calls; runs synchronously after every /scrape.

Score breakdown (out of 10):
  40% — tech stack overlap  (profile skills found in job text)
  20% — location / work-mode match
  20% — experience / seniority alignment
  20% — salary expectation match

Returns { score: float, label: str, reasons: list[str] }
"""

import re

_SENIORITY_YEARS = {
    "junior": (0, 3),
    "mid":    (2, 6),
    "senior": (4, 12),
    "lead":   (7, 99),
}

_LABEL_THRESHOLDS = [
    (9.5, "Fitly Perfect!"),
    (8.0, "Great fit!"),
    (6.5, "Good fit"),
    (5.0, "Fair match"),
    (0.0, "Low match"),
]


def calculate_fit_score(job: dict, profile: dict) -> dict:
    """
    job keys:     raw_description, title, work_mode, location, seniority, salary_text
    profile keys: tech_stack, custom_skills, years_experience,
                  preferred_country, open_to_remote,
                  expected_salary_min, expected_salary_max
    """
    reasons: list[str] = []
    total = 0.0

    text = (
        (job.get("rawDescription") or job.get("raw_description") or "")
        + " "
        + (job.get("title") or "")
    ).lower()

    # ── 40 %: Tech stack overlap ────────────────────────────────────────
    raw_skills = (profile.get("tech_stack") or []) + (profile.get("custom_skills") or [])
    skills = [s.lower().strip() for s in raw_skills if s]

    if skills:
        matched = [s for s in skills if s in text]
        ratio = len(matched) / len(skills)
        total += ratio * 4.0
        if matched:
            reasons.append(f"Skills match: {', '.join(matched[:4])}")
        else:
            reasons.append("No skill overlap found in job description")
    else:
        total += 2.0   # neutral when profile has no skills yet

    # ── 20 %: Location / work-mode ──────────────────────────────────────
    work_mode    = (job.get("work_mode") or "").lower()
    job_location = (job.get("location") or "").lower()
    pref_country = (profile.get("preferred_country") or "India").lower()
    open_remote  = bool(profile.get("open_to_remote", True))

    if work_mode == "remote" and open_remote:
        total += 2.0
        reasons.append("Remote — matches your preference")
    elif pref_country and pref_country in job_location:
        total += 2.0
        reasons.append(f"Location matches {profile.get('preferred_country', 'your country')}")
    elif not work_mode and open_remote:
        total += 1.0   # unknown location, partial credit
    else:
        reasons.append("Location may not match your preference")

    # ── 20 %: Experience / seniority ────────────────────────────────────
    yoe          = int(profile.get("years_experience") or 0)
    job_seniority = (job.get("seniority") or "").lower()

    if job_seniority and job_seniority in _SENIORITY_YEARS:
        lo, hi = _SENIORITY_YEARS[job_seniority]
        if lo <= yoe <= hi:
            total += 2.0
            reasons.append(f"Experience level aligned ({job_seniority})")
        elif abs(yoe - lo) <= 1 or abs(yoe - hi) <= 1:
            total += 1.0
            reasons.append(f"Close experience match ({job_seniority})")
        else:
            reasons.append(f"Experience gap ({yoe} yrs vs {job_seniority})")
    else:
        total += 1.0   # seniority unknown — neutral

    # ── 20 %: Salary ────────────────────────────────────────────────────
    salary_text = job.get("salary_text") or ""
    sal_min = int(profile.get("expected_salary_min") or 0)
    sal_max = int(profile.get("expected_salary_max") or 0)

    if not salary_text or not sal_min:
        total += 1.0   # unknown salary — neutral
    else:
        nums = re.findall(r"\d[\d,]*", salary_text)
        if nums:
            try:
                job_sal = int(nums[0].replace(",", ""))
                mid = (sal_min + sal_max) / 2 if sal_max else sal_min
                if mid * 0.7 <= job_sal <= mid * 1.5:
                    total += 2.0
                    reasons.append("Salary within your expected range")
                elif job_sal >= sal_min * 0.8:
                    total += 1.0
                    reasons.append("Salary slightly below expectation")
                else:
                    reasons.append("Salary below your expectation")
            except (ValueError, ZeroDivisionError):
                total += 1.0
        else:
            total += 1.0

    # ── Normalise to 0–10 and label ─────────────────────────────────────
    score = round(min(max(total, 0.0), 10.0), 1)

    label = "Low match"
    for threshold, lbl in _LABEL_THRESHOLDS:
        if score >= threshold:
            label = lbl
            break

    return {"score": score, "label": label, "reasons": reasons}
