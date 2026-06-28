import { useState } from 'react'
import { scrapeJob, createJob } from '../api'

export default function AddJobModal({ onClose, onAdded, userId }) {
  const [mode, setMode]     = useState('url')   // 'url' | 'manual'
  const [url, setUrl]       = useState('')
  const [scraping, setScraping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm]     = useState({
    title: '', company: '', location: '', raw_description: '', url: '',
    job_type: null, work_mode: null, seniority: null,
    salary_text: null, company_logo_url: null,
    fit_score: null, fit_label: null,
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleScrape(e) {
    e.preventDefault()
    setError('')
    setScraping(true)
    try {
      const data = await scrapeJob(url, userId)
      if (!data.success) throw new Error(data.error || 'Scrape failed')
      setForm({
        title:           data.title || '',
        company:         data.company || '',
        location:        data.location || '',
        raw_description: data.rawDescription || '',
        url,
        job_type:        data.job_type || null,
        work_mode:       data.work_mode || null,
        seniority:       data.seniority || null,
        salary_text:     data.salary_text || null,
        company_logo_url: data.company_logo_url || null,
        fit_score:       data.score ?? null,
        fit_label:       data.label || null,
      })
      setMode('manual')
    } catch (err) {
      setError(err.message)
      setMode('manual')
      set('url', url)
    } finally {
      setScraping(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.title) return setError('Title is required')
    setSaving(true)
    setError('')
    try {
      const job = await createJob({
        title:           form.title,
        company:         form.company,
        location:        form.location,
        url:             form.url,
        raw_description: form.raw_description,
        status:          'wishlist',
        job_type:        form.job_type,
        work_mode:       form.work_mode,
        seniority:       form.seniority,
        salary_text:     form.salary_text,
        company_logo_url: form.company_logo_url,
        fit_score:       form.fit_score,
        fit_label:       form.fit_label,
      })
      onAdded(job)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Job</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Mode tabs */}
        <div className="tab-row">
          <button className={`tab ${mode === 'url' ? 'active' : ''}`} onClick={() => setMode('url')}>
            From URL
          </button>
          <button className={`tab ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
            Manual
          </button>
        </div>

        {mode === 'url' && (
          <form onSubmit={handleScrape} className="modal-form">
            <p className="modal-hint">Paste a job posting URL — we'll extract the details automatically.</p>
            <input className="input" type="url" placeholder="https://linkedin.com/jobs/..."
              value={url} onChange={e => setUrl(e.target.value)} required />
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={scraping}>
                {scraping ? 'Scraping…' : 'Scrape & fill →'}
              </button>
            </div>
          </form>
        )}

        {mode === 'manual' && (
          <form onSubmit={handleSave} className="modal-form">
            <input className="input" placeholder="Job title *" value={form.title}
              onChange={e => set('title', e.target.value)} required />
            <input className="input" placeholder="Company" value={form.company}
              onChange={e => set('company', e.target.value)} />
            <input className="input" placeholder="Location" value={form.location}
              onChange={e => set('location', e.target.value)} />
            <input className="input" type="url" placeholder="Job URL (optional)" value={form.url}
              onChange={e => set('url', e.target.value)} />
            <textarea className="input textarea" placeholder="Paste job description here (used for AI generation)"
              rows={6} value={form.raw_description}
              onChange={e => set('raw_description', e.target.value)} />
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Add job'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
