import { useState } from 'react'
import { saveUserProfile } from '../api'

const STEPS = ['Field', 'Location', 'Experience', 'Tech Stack', 'Salary', 'Job Alerts']
// Countries with dedicated job-source coverage (Adzuna codes on the backend).
const COUNTRIES = ['India','United States','United Kingdom','Canada','Australia','Germany','Singapore','Netherlands','France']
const TECH_SUGGESTIONS = [
  'Python','JavaScript','TypeScript','Java','Go','C#','SQL','React','Node.js',
  'FastAPI','Django','Spring','PostgreSQL','MongoDB','Redis','Docker','Kubernetes',
  'AWS','GCP','Azure','LangChain','LangGraph','PyTorch','TensorFlow','Scikit-learn',
  'Pandas','Next.js','Vue.js','GraphQL','REST APIs','Git','CI/CD',
  'Figma','Excel','Tableau','Product Management','Salesforce',
]
const FRESHNESS_OPTIONS = [
  { days: 1,  label: 'Last 24 hours', desc: 'Only the freshest postings' },
  { days: 7,  label: 'Last 7 days',   desc: 'Best balance of volume + recency' },
  { days: 15, label: 'Last 15 days',  desc: 'Wider net, more options' },
]

// Each experience bucket maps to the midpoint year-count we persist as an int.
// The UI label shows the range; the DB stores a single int (matches Settings input).
const EXPERIENCE_BUCKETS = [
  { label: '0–1 yrs',  years: 1  },
  { label: '1–3 yrs',  years: 2  },
  { label: '3–5 yrs',  years: 4  },
  { label: '5–8 yrs',  years: 6  },
  { label: '8–12 yrs', years: 10 },
  { label: '12+ yrs',  years: 15 },
]

// Convert a string|number|empty-string into a safe int|null for the DB.
function toIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

export default function Onboarding({ onComplete }) {
  const [step, setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customSkillInput, setCustomSkillInput] = useState('')
  const [form, setForm]   = useState({
    full_name: '',
    field: '',
    domain: '',
    preferred_country: 'India',     // default audience is India
    preferred_city: '',
    open_to_remote: true,
    years_experience: null,         // int|null, never empty string
    tech_stack: [],
    custom_skills: [],              // free-text skills not in the preset list
    job_freshness_days: 7,         // 1 | 7 | 15
    expected_salary_min: '',        // raw input, coerced on finish()
    expected_salary_max: '',
    expected_salary_currency: 'USD',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleTech(tech) {
    set('tech_stack', form.tech_stack.includes(tech)
      ? form.tech_stack.filter(t => t !== tech)
      : [...form.tech_stack, tech])
  }

  function addCustomSkill() {
    const s = customSkillInput.trim()
    if (!s || form.custom_skills.includes(s)) { setCustomSkillInput(''); return }
    set('custom_skills', [...form.custom_skills, s])
    setCustomSkillInput('')
  }

  function removeCustomSkill(skill) {
    set('custom_skills', form.custom_skills.filter(s => s !== skill))
  }

  async function finish() {
    setSaving(true)
    setError('')
    try {
      // Coerce every numeric field — empty strings into int columns blow up Postgres
      const payload = {
        ...form,
        years_experience:    toIntOrNull(form.years_experience),
        expected_salary_min: toIntOrNull(form.expected_salary_min),
        expected_salary_max: toIntOrNull(form.expected_salary_max),
        job_freshness_days:  toIntOrNull(form.job_freshness_days) || 7,
        onboarding_done: true,
      }
      await saveUserProfile(payload)
      onComplete()
    } catch (e) {
      console.error('Onboarding save failed:', e)
      setError(e?.message || 'Could not save. Please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboard-wrap">
      <div className="onboard-card">
        {/* Progress */}
        <div className="onboard-progress">
          {STEPS.map((s, i) => (
            <div key={s} className={`onboard-dot ${i <= step ? 'active' : ''}`} />
          ))}
        </div>
        <p className="onboard-step-label">Step {step + 1} of {STEPS.length}</p>

        {/* Step 0 — Field */}
        {step === 0 && (
          <div className="onboard-step">
            <h2>What's your field?</h2>
            <p className="onboard-sub">This helps us tailor AI content to your industry.</p>
            <input className="input" placeholder="e.g. AI Engineering" value={form.field}
              onChange={e => set('field', e.target.value)} />
            <input className="input" placeholder="Domain (e.g. Agentic AI / LLM Orchestration)"
              value={form.domain} onChange={e => set('domain', e.target.value)} />
            <input className="input" placeholder="Your full name (optional)"
              value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          </div>
        )}

        {/* Step 1 — Location */}
        {step === 1 && (
          <div className="onboard-step">
            <h2>Where are you job hunting?</h2>
            <p className="onboard-sub">We use this to surface jobs in your region (defaults to India).</p>
            <select className="input" value={form.preferred_country}
              onChange={e => set('preferred_country', e.target.value)}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" placeholder="City (optional, e.g. Bengaluru)"
              value={form.preferred_city} onChange={e => set('preferred_city', e.target.value)} />
            <label className="remote-toggle">
              <input type="checkbox" checked={form.open_to_remote}
                onChange={e => set('open_to_remote', e.target.checked)} />
              <span>Also include worldwide remote jobs</span>
            </label>
          </div>
        )}

        {/* Step 2 — Experience */}
        {step === 2 && (
          <div className="onboard-step">
            <h2>Years of experience?</h2>
            <p className="onboard-sub">Used to calibrate seniority in cover letters.</p>
            <div className="exp-grid">
              {EXPERIENCE_BUCKETS.map(b => (
                <button key={b.label}
                  type="button"
                  className={`exp-btn ${form.years_experience === b.years ? 'active' : ''}`}
                  onClick={() => set('years_experience', b.years)}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Tech Stack */}
        {step === 3 && (
          <div className="onboard-step">
            <h2>Your tech stack</h2>
            <p className="onboard-sub">Select all that apply — these go into your resume bullets.</p>
            <div className="tech-grid">
              {TECH_SUGGESTIONS.map(tech => (
                <button key={tech}
                  className={`tech-chip ${form.tech_stack.includes(tech) ? 'active' : ''}`}
                  onClick={() => toggleTech(tech)}>
                  {tech}
                </button>
              ))}
            </div>
            {form.tech_stack.length > 0 && (
              <p className="tech-selected">{form.tech_stack.length} selected</p>
            )}

            <div className="custom-skill-row">
              <input
                className="input onboard-input"
                type="text"
                placeholder="Add other skill…"
                value={customSkillInput}
                onChange={e => setCustomSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill() } }}
              />
              <button type="button" className="btn-ghost" onClick={addCustomSkill}>+ Add</button>
            </div>
            {form.custom_skills.length > 0 && (
              <div className="tech-grid" style={{ marginTop: 10 }}>
                {form.custom_skills.map(skill => (
                  <button key={skill} type="button" className="tech-chip active"
                    onClick={() => removeCustomSkill(skill)}>
                    {skill} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4 — Salary */}
        {step === 4 && (
          <div className="onboard-step">
            <h2>Expected salary range</h2>
            <p className="onboard-sub">Optional — helps filter job fit later.</p>
            <div className="salary-row">
              <select className="input" value={form.expected_salary_currency}
                onChange={e => set('expected_salary_currency', e.target.value)}>
                <option>USD</option><option>EUR</option><option>GBP</option>
                <option>INR</option><option>CAD</option><option>AUD</option>
              </select>
            </div>
            <div className="salary-row">
              <input className="input" type="number" placeholder="Min (e.g. 80000)"
                value={form.expected_salary_min}
                onChange={e => set('expected_salary_min', e.target.value)} />
              <span className="salary-dash">–</span>
              <input className="input" type="number" placeholder="Max (e.g. 120000)"
                value={form.expected_salary_max}
                onChange={e => set('expected_salary_max', e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 5 — Job Alerts / freshness */}
        {step === 5 && (
          <div className="onboard-step">
            <h2>How recent should suggested jobs be?</h2>
            <p className="onboard-sub">We'll only show you jobs posted within this window.</p>
            <div className="freshness-options">
              {FRESHNESS_OPTIONS.map(opt => (
                <button key={opt.days} type="button"
                  className={`freshness-card ${form.job_freshness_days === opt.days ? 'selected' : ''}`}
                  onClick={() => set('job_freshness_days', opt.days)}>
                  <span className="freshness-label">{opt.label}</span>
                  <span className="freshness-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="form-error onboard-error">{error}</p>}

        {/* Nav buttons */}
        <div className="onboard-nav">
          {step > 0 && (
            <button type="button" className="btn-ghost" onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          <button type="button" className="btn-ghost skip"
            onClick={step < STEPS.length - 1 ? () => setStep(s => s + 1) : finish}
            disabled={saving}>
            Skip
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" onClick={() => setStep(s => s + 1)}>Next</button>
          ) : (
            <button type="button" className="btn-primary" onClick={finish} disabled={saving}>
              {saving ? 'Saving…' : 'Get started →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
