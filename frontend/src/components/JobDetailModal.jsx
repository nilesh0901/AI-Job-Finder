import { useState, useCallback } from 'react';
import { generateAI, updateJob, deleteJob } from '../api';

const TABS = [
  { key: 'coverLetter', label: 'Cover Letter' },
  { key: 'resumeBullets', label: 'Resume Bullets' },
  { key: 'interviewQuestions', label: 'Interview Prep' },
  { key: 'companyBrief', label: 'Company Brief' },
];

export default function JobDetailModal({ job, onClose, onJobUpdated, onJobDeleted }) {
  const [activeTab, setActiveTab] = useState('coverLetter');
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState(job.notes || '');
  const [copied, setCopied] = useState(false);
  const [genError, setGenError] = useState('');

  const ai = job.aiContent || {};
  const hasResume = !!(localStorage.getItem('masterResume') || '').trim();

  async function handleGenerate() {
    if (!hasResume) return;
    setGenerating(true);
    setGenError('');
    try {
      const masterResume = localStorage.getItem('masterResume') || '';
      const content = await generateAI(job.id, job.rawDescription, masterResume);
      const updated = {
        ...job,
        aiContent: { ...content, generatedAt: new Date().toISOString() },
      };
      onJobUpdated(updated);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleNotesBlur() {
    if (notes === job.notes) return;
    try {
      const updated = await updateJob(job.id, { notes });
      onJobUpdated(updated);
    } catch {}
  }

  async function handleDelete() {
    if (!confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
    try {
      await deleteJob(job.id);
      onJobDeleted(job.id);
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  }

  function copyTab() {
    const text = ai[activeTab] || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const currentContent = ai[activeTab] || '';

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-title">{job.title || 'Untitled Job'}</div>
            <div className="modal-company">
              {[job.company, job.location].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="modal-header-actions">
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body">
          {/* Meta */}
          <div className="job-meta">
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="job-meta-item btn btn-ghost btn-sm"
              >
                ↗ View Posting
              </a>
            )}
          </div>

          <div className="divider" />

          {/* AI Generate bar */}
          <div className="generate-bar">
            <div>
              <div className="generate-bar-text">
                {ai.generatedAt ? '✦ AI Content Ready' : 'Generate AI Content'}
              </div>
              <div className="generate-bar-hint">
                {!hasResume
                  ? '⚠ Go to Settings and paste your resume first'
                  : ai.generatedAt
                  ? `Last generated ${new Date(ai.generatedAt).toLocaleDateString()}`
                  : 'Cover letter · Resume bullets · Interview prep · Company brief'}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={generating || !hasResume}
            >
              {generating ? <><span className="spinner" /> Generating…</> : ai.generatedAt ? 'Regenerate' : 'Generate ✦'}
            </button>
          </div>

          {genError && (
            <div className="test-result fail" style={{ marginBottom: 'var(--sp-md)' }}>
              {genError}
            </div>
          )}

          {/* Tabs */}
          {generating ? (
            <div className="generating-overlay">
              <span className="spinner" />
              Asking Gemini to craft your materials…
            </div>
          ) : (
            <>
              <div className="tabs">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                    {ai[t.key] ? ' ✓' : ''}
                  </button>
                ))}
              </div>

              <div className="tab-content">
                {currentContent ? (
                  <>
                    <pre className="tab-text">{currentContent}</pre>
                    <button
                      className="btn btn-ghost btn-sm copy-btn"
                      onClick={copyTab}
                      title="Copy to clipboard"
                    >
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </>
                ) : (
                  <p className="tab-empty">
                    {ai.generatedAt
                      ? 'No content for this tab.'
                      : 'Click "Generate ✦" above to create this content.'}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="divider" />

          {/* Notes */}
          <div className="section-label">Notes</div>
          <textarea
            className="form-textarea"
            placeholder="Interview dates, recruiter name, salary info…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            style={{ minHeight: 80 }}
          />

          {/* Raw description */}
          {job.rawDescription && (
            <>
              <div className="divider" />
              <div className="section-label">Job Description</div>
              <pre className="tab-text" style={{ maxHeight: 200, overflowY: 'auto', padding: 'var(--sp-sm)', background: 'var(--surface-1)', borderRadius: 'var(--r-lg)', border: '1px solid var(--hairline)' }}>
                {job.rawDescription}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
