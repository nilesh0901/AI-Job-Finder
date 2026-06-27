import { useState, useEffect } from 'react'
import { getMasterResume, saveMasterResume, getUserProfile, saveUserProfile } from '../api'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

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
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    getMasterResume().then(setResume).catch(() => {})
    getUserProfile().then(p => p && setProfile(p)).catch(() => {})
  }, [])

  function setP(k, v) { setProfile(p => ({ ...p, [k]: v })) }

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

        <form onSubmit={handleSave} className="modal-body settings-form">
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
