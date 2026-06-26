import { useState, useEffect } from 'react'
import { updateJob, deleteJob, getMasterResume, getUserProfile,
         generateAIContent, generateATSResume, generateResumePDF,
         saveATSResume, getATSResumes } from '../api'
import { useAuth } from './AuthProvider'

const STATUSES = ['wishlist','applied','interviewing','offer','rejected']
const AI_TABS  = ['Cover Letter','Resume Bullets','Interview Prep','Company Brief','ATS Resume']

export default function JobDetailModal({ job, onClose, onUpdated, onDeleted }) {
  const { user }          = useAuth()
  const [activeTab, setActiveTab] = useState(0)
  const [notes, setNotes] = useState(job.notes || '')
  const [status, setStatus] = useState(job.status)
  const [aiContent, setAiContent] = useState(job.ai_content || {})
  const [atsResumes, setAtsResumes] = useState([])
  const [selectedAts, setSelectedAts] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [generatingAts, setGeneratingAts] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadAtsResumes() }, [job.id])

  async function loadAtsResumes() {
    try {
      const data = await getATSResumes(job.id)
      setAtsResumes(data || [])
      if (data?.length) setSelectedAts(data[0])
    } catch {}
  }

  async function handleStatusChange(newStatus) {
    setStatus(newStatus)
    const updated = await updateJob(job.id, { status: newStatus })
    onUpdated(updated)
  }

  async function handleNotesSave() {
    const updated = await updateJob(job.id, { notes })
    onUpdated(updated)
  }

  async function handleGenerateAI() {
    setError(''); setGenerating(true)
    try {
      const [resume, profile] = await Promise.all([getMasterResume(), getUserProfile()])
      const content = await generateAIContent({
        title: job.title, company: job.company,
        jobDescription: job.raw_description,
        masterResume: resume, userProfile: profile,
      })
      setAiContent(content)
      const updated = await updateJob(job.id, { ai_content: content })
      onUpdated(updated)
    } catch (e) { setError(e.message) }
    finally { setGenerating(false) }
  }

  async function handleGenerateATS() {
    setError(''); setGeneratingAts(true)
    try {
      const [resume, profile] = await Promise.all([getMasterResume(), getUserProfile()])
      const { resumeText } = await generateATSResume({
        jobDescription: job.raw_description, masterResume: resume, userProfile: profile,
      })
      const saved = await saveATSResume(job.id, resumeText)
      setAtsResumes(prev => [saved, ...prev])
      setSelectedAts(saved)
    } catch (e) { setError(e.message) }
    finally { setGeneratingAts(false) }
  }

  async function handleDownloadPDF() {
    if (!selectedAts) return
    setGeneratingPdf(true); setError('')
    try {
      const { pdfUrl } = await generateResumePDF({
        resumeText: selectedAts.content, jobId: job.id, userId: user.id,
      })
      window.open(pdfUrl, '_blank')
    } catch (e) { setError(e.message) }
    finally { setGeneratingPdf(false) }
  }

  async function handleDelete() {
    if (!confirm('Delete this job? This cannot be undone.')) return
    setDeleting(true)
    await deleteJob(job.id)
    onDeleted(job.id)
    onClose()
  }

  const aiKeys = ['coverLetter','resumeBullets','interviewQuestions','companyBrief']
  const hasAI  = aiContent && Object.values(aiContent).some(v => v)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <h2>{job.title}</h2>
            {job.company && <span className="detail-company">{job.company}</span>}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Status selector */}
        <div className="status-row">
          {STATUSES.map(s => (
            <button key={s} onClick={() => handleStatusChange(s)}
              className={`status-btn status-${s} ${status === s ? 'active' : ''}`}>
              {s}
            </button>
          ))}
        </div>

        {/* AI Tabs */}
        <div className="tab-row tab-row-scroll">
          {AI_TABS.map((t, i) => (
            <button key={t} className={`tab ${activeTab === i ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}>{t}</button>
          ))}
        </div>

        <div className="modal-body">
          {/* Generate button (tabs 0-3) */}
          {activeTab < 4 && (
            <div className="ai-actions">
              <button className="btn-primary" onClick={handleGenerateAI} disabled={generating}>
                {generating ? '✦ Generating…' : hasAI ? '✦ Regenerate AI content' : '✦ Generate AI content'}
              </button>
              {error && <p className="form-error">{error}</p>}
            </div>
          )}

          {/* AI content tabs 0-3 */}
          {activeTab < 4 && (
            <div className="ai-output">
              {hasAI ? (
                <pre className="ai-text">{aiContent[aiKeys[activeTab]] || 'No content for this tab yet.'}</pre>
              ) : (
                <p className="ai-empty">Click "Generate AI content" to create tailored {AI_TABS[activeTab].toLowerCase()}.</p>
              )}
            </div>
          )}

          {/* ATS Resume tab */}
          {activeTab === 4 && (
            <div className="ats-section">
              <div className="ats-actions">
                <button className="btn-primary" onClick={handleGenerateATS} disabled={generatingAts}>
                  {generatingAts ? '✦ Generating…' : '✦ Generate ATS Resume'}
                </button>
                {selectedAts && (
                  <button className="btn-ghost" onClick={handleDownloadPDF} disabled={generatingPdf}>
                    {generatingPdf ? 'Generating PDF…' : '⬇ Download PDF'}
                  </button>
                )}
              </div>
              {error && <p className="form-error">{error}</p>}

              {/* Version history */}
              {atsResumes.length > 0 && (
                <div className="ats-versions">
                  {atsResumes.map(r => (
                    <button key={r.id}
                      className={`version-btn ${selectedAts?.id === r.id ? 'active' : ''}`}
                      onClick={() => setSelectedAts(r)}>
                      v{r.version} · {formatDate(r.created_at)}
                    </button>
                  ))}
                </div>
              )}

              {selectedAts ? (
                <pre className="ai-text">{selectedAts.content}</pre>
              ) : (
                <p className="ai-empty">No ATS resume yet. Click "Generate ATS Resume" to create one tailored to this job description.</p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="notes-section">
            <label className="notes-label">Notes</label>
            <textarea className="input textarea notes-input" rows={4}
              placeholder="Add notes about this application…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleNotesSave}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              View Job ↗
            </a>
          )}
          <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
