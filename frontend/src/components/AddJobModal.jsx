import { useState } from 'react';
import { scrapeUrl, createJob } from '../api';

export default function AddJobModal({ onClose, onJobAdded }) {
  const [mode, setMode] = useState('url'); // 'url' | 'paste'
  const [url, setUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState(null);
  const [fallbackMsg, setFallbackMsg] = useState('');

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleScrape() {
    if (!url.trim()) return;
    setScraping(true);
    setScraped(null);
    setFallbackMsg('');
    try {
      const res = await scrapeUrl(url.trim());
      if (res.success) {
        setScraped(res);
        setTitle(res.title || '');
        setCompany(res.company || '');
        setLocation(res.location || '');
        setDescription(res.rawDescription || '');
      } else {
        setMode('paste');
        setFallbackMsg("Couldn't read that page automatically — paste the job text below.");
      }
    } catch {
      setMode('paste');
      setFallbackMsg("Couldn't reach that URL — paste the job text below.");
    } finally {
      setScraping(false);
    }
  }

  async function handleSubmit() {
    if (!title.trim() && !description.trim()) return;
    setSaving(true);
    try {
      const job = await createJob({
        title: title.trim() || 'Untitled Job',
        company: company.trim(),
        location: location.trim(),
        url: url.trim(),
        rawDescription: description.trim(),
        status: 'wishlist',
      });
      onJobAdded(job);
    } catch (e) {
      alert('Failed to save job: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = title.trim() || description.trim();

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-title">Add a Job</div>
            <div className="modal-company" style={{ color: 'var(--ink-subtle)' }}>
              Paste a URL or type the job details manually
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* URL input always visible */}
          <div className="form-group">
            <label className="form-label">Job URL</label>
            <div style={{ display: 'flex', gap: 'var(--sp-xs)' }}>
              <input
                className="form-input"
                type="url"
                placeholder="https://linkedin.com/jobs/view/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
              />
              <button
                className="btn btn-secondary"
                onClick={handleScrape}
                disabled={scraping || !url.trim()}
                style={{ flexShrink: 0 }}
              >
                {scraping ? <span className="spinner" /> : 'Fetch'}
              </button>
            </div>
          </div>

          {/* Scrape success preview */}
          {scraped && (
            <div className="scrape-preview">
              <div className="scrape-preview-title">✓ Job fetched successfully</div>
              <div className="scrape-preview-company">
                {scraped.company && `${scraped.company} · `}{scraped.title}
              </div>
            </div>
          )}

          {/* Fallback notice */}
          {fallbackMsg && (
            <div className="fallback-notice">⚠ {fallbackMsg}</div>
          )}

          {/* Manual divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', margin: 'var(--sp-md) 0' }}>
            <div className="divider" style={{ flex: 1, margin: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>or enter manually</span>
            <div className="divider" style={{ flex: 1, margin: 0 }} />
          </div>

          {/* Manual fields */}
          <div className="form-group">
            <label className="form-label">Job Title *</label>
            <input
              className="form-input"
              placeholder="e.g. Senior Product Manager"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
            <div className="form-group">
              <label className="form-label">Company</label>
              <input
                className="form-input"
                placeholder="e.g. Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input
                className="form-input"
                placeholder="e.g. Remote"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Job Description</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: 140 }}
              placeholder="Paste the full job description here..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || !canSubmit}
          >
            {saving ? <><span className="spinner" /> Saving…</> : 'Add to Board'}
          </button>
        </div>
      </div>
    </div>
  );
}
