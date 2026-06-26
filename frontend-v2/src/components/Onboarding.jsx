import { useState } from 'react'
import { saveUserProfile } from '../api'

const STEPS = ['Field', 'Experience', 'Tech Stack', 'Salary']
const TECH_SUGGESTIONS = [
  'Python','JavaScript','TypeScript','React','Node.js','FastAPI','Django',
  'PostgreSQL','MongoDB','Redis','Docker','Kubernetes','AWS','GCP','Azure',
  'LangChain','LangGraph','PyTorch','TensorFlow','Scikit-learn','Pandas',
  'Next.js','Vue.js','GraphQL','REST APIs','Git','CI/CD',
]

export default function Onboarding({ onComplete }) {
  const [step, setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [form, setForm]   = useState({
    full_name: '',
    field: '',
    domain: '',
    years_experience: '',
    tech_stack: [],
    expected_salary_min: '',
    expected_salary_max: '',
    expected_salary_currency: 'USD',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleTech(tech) {
    set('tech_stack', form.tech_stack.includes(tech)
      ? form.tech_stack.filter(t => t !== tech)
      : [...form.tech_stack, tech])
  }

  async function finish() {
    setSaving(true)
    try {
      await saveUserProfile({ ...form, onboarding_done: true })
      onComplete()
    } catch (e) {
      console.error(e)
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

        {/* Step 1 — Experience */}
        {step === 1 && (
          <div className="onboard-step">
            <h2>Years of experience?</h2>
            <p className="onboard-sub">Used to calibrate seniority in cover letters.</p>
            <div className="exp-grid">
              {['0–1', '1–3', '3–5', '5–8', '8–12', '12+'].map((label, i) => (
                <button key={label}
                  className={`exp-btn ${form.years_experience === String(i + 1) ? 'active' : ''}`}
                  onClick={() => set('years_experience', String(i + 1))}>
                  {label} yrs
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Tech Stack */}
        {step === 2 && (
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
          </div>
        )}

        {/* Step 3 — Salary */}
        {step === 3 && (
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

        {/* Nav buttons */}
        <div className="onboard-nav">
          {step > 0 && (
            <button className="btn-ghost" onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          <button className="btn-ghost skip" onClick={step < STEPS.length - 1 ? () => setStep(s => s + 1) : finish}>
            Skip
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" onClick={() => setStep(s => s + 1)}>Next</button>
          ) : (
            <button className="btn-primary" onClick={finish} disabled={saving}>
              {saving ? 'Saving…' : 'Get started →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
