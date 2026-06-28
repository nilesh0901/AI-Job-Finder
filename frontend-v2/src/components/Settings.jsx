import { useState, useEffect } from 'react'
import { getMasterResume, saveMasterResume, getUserProfile, saveUserProfile } from '../api'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

const COUNTRIES = ['India','United States','United Kingdom','Canada','Australia','Germany','Singapore','Netherlands','France']

// Coerce string/empty values to int|null before sending to Postgres int columns
function toIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

export default function Settings({ onClose }) {
  const { user } = useAuth()
  const [resume, setResume]   = useState('')
  const [profile, setProfile] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [customSkillInput, setCustomSkillInput] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getMasterResume().catch(() => ''),
      getUserProfile().catch(() => null),
    ]).then(([r, p]) => {
      if (cancelled) return
      setResume(r || '')
      if (p) setProfile(p)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  function setP(k, v) { setProfile(p => ({ ...p, [k]: v })) }

  function addCustomSkill() {
    const s = customSkillInput.trim()
    const current = profile.custom_skills || []
    if (!s || current.includes(s)) { setCustomSkillInput(''); return }
    setP('custom_skills', [...current, s])
    setCustomSkillInput('')
  }

  function removeCustomSkill(skill) {
    setP('custom_skills', (profile.custom_skills || []).filter(s => s !== skill))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setSaved(false); setError('')
    try {
      const cleanProfile = {
        ...profile,
        years_experience:    toIntOrNull(profile.years_experience),
        expected_salary_min: toIntOrNull(profile.expected_salary_min),
        expected_salary_max: toIntOrNull(profile.expected_salary_max),
        onboarding_done: true,
      }
      await Promise.all([
        saveMasterResume(resume),
        saveUserProfile(cleanProfile),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Settings save failed:', err)
      setError(err?.message || 'Could not save changes. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="settings-loading">Loading your settings…</div>}
        <form onSubmit={handleSave} className="modal-body settings-form" style={loading ? { opacity: 0.5, pointerEvents: 'none' } : {}}>
          {/* Account */}
          <section className="settings-section">
            <h3>Account</h3>
            <div className="settings-row">
              <span className="settings-label">Email</span>
              <span className="settings-value">{user?.email}</span>
            </div>
          </section>

          {/* Profile */}
          <section className="settings-section">
            <h3>Profile</h3>
            <input className="input" placeholder="Full name" value={profile.full_name || ''}
              onChange={e => setP('full_name', e.target.value)} />
            <input className="input" placeholder="Field (e.g. AI Engineering)" value={profile.field || ''}
              onChange={e => setP('field', e.target.value)} />
            <input className="input" placeholder="Domain (e.g. Agentic AI)" value={profile.domain || ''}
              onChange={e => setP('domain', e.target.value)} />
            <input className="input" type="number" placeholder="Years of experience"
              value={profile.years_experience || ''}
              onChange={e => setP('years_experience', e.target.value)} />

            <label className="settings-label" style={{ marginTop: 8 }}>Job location</label>
            <select className="input" value={profile.preferred_country || 'India'}
              onChange={e => setP('preferred_country', e.target.value)}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" placeholder="City (optional, e.g. Bengaluru)"
              value={profile.preferred_city || ''}
              onChange={e => setP('preferred_city', e.target.value)} />
            <label className="remote-toggle">
              <input type="checkbox"
                checked={profile.open_to_remote !== false}
                onChange={e => setP('open_to_remote', e.target.checked)} />
              <span>Also include worldwide remote jobs</span>
            </label>

            <label className="settings-label" style={{ marginTop: 8 }}>Expected salary (annual)</label>
            <div className="salary-row">
              <input className="input" type="number" placeholder="Min"
                value={profile.expected_salary_min ?? ''}
                onChange={e => setP('expected_salary_min', e.target.value)} />
              <input className="input" type="number" placeholder="Max"
                value={profile.expected_salary_max ?? ''}
                onChange={e => setP('expected_salary_max', e.target.value)} />
              <input className="input" placeholder="Currency (e.g. USD, INR)"
                value={profile.expected_salary_currency || ''}
                onChange={e => setP('expected_salary_currency', e.target.value)} />
            </div>

            <label className="settings-label" style={{ marginTop: 8 }}>Custom skills</label>
            <div className="custom-skill-row">
              <input className="input onboard-input" type="text" placeholder="Add other skill…"
                value={customSkillInput}
                onChange={e => setCustomSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill() } }} />
              <button type="button" className="btn-ghost" onClick={addCustomSkill}>+ Add</button>
            </div>
            {(profile.custom_skills || []).length > 0 && (
              <div className="tech-grid" style={{ marginTop: 10 }}>
                {(profile.custom_skills || []).map(skill => (
                  <button key={skill} type="button" className="tech-chip active"
                    onClick={() => removeCustomSkill(skill)}>
                    {skill} ✕
                  </button>
                ))}
              </div>
            )}

            <label className="settings-label" style={{ marginTop: 8 }}>Suggested-job freshness</label>
            <div className="freshness-options">
              {[
                { days: 1,  label: 'Last 24 hours', desc: 'Only the freshest postings' },
                { days: 7,  label: 'Last 7 days',   desc: 'Best balance of volume + recency' },
                { days: 15, label: 'Last 15 days',  desc: 'Wider net, more options' },
              ].map(opt => (
                <button key={opt.days} type="button"
                  className={`freshness-card ${(profile.job_freshness_days || 7) === opt.days ? 'selected' : ''}`}
                  onClick={() => setP('job_freshness_days', opt.days)}>
                  <span className="freshness-label">{opt.label}</span>
                  <span className="freshness-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Master Resume */}
          <section className="settings-section">
            <h3>Master Resume</h3>
            <p className="settings-hint">Paste your base resume here. Every AI generation uses this as context.</p>
            <textarea className="input textarea" rows={12} placeholder="Paste your full resume text here…"
              value={resume} onChange={e => setResume(e.target.value)} />
          </section>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-danger" onClick={handleSignOut}>Sign out</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
