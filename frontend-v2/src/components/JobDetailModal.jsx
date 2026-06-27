import { useState, useEffect } from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import { updateJob, deleteJob, getMasterResume, getUserProfile,
         generateAIContent, generateATSResume, generateResumePDF,
         saveATSResume, getATSResumes, scoreATSResume, saveATSFeedback } from '../api'
import { useAuth } from './AuthProvider'

const AI_TABS  = ['Cover Letter','Resume Bullets','Interview Prep','Company Brief','ATS Resume']

// Linear-dark palette mapped onto react-diff-viewer-continued's slots
const DIFF_STYLES = {
  variables: {
    dark: {
      diffViewerBackground: '#0f1117',
      diffViewerColor:      '#d0d6e0',
      addedBackground:      '#0d3a1f',
      addedColor:           '#7ee2a8',
      removedBackground:    '#3a0d15',
      removedColor:         '#f3a9b3',
      wordAddedBackground:  '#1f6938',
      wordRemovedBackground:'#6f1b29',
      addedGutterBackground:  '#0a2b18',
      removedGutterBackground:'#2b0a12',
      gutterBackground:       '#0f1117',
      gutterBackgroundDark:   '#0a0b0f',
      highlightBackground:    '#1c1e27',
      highlightGutterBackground: '#22242e',
      codeFoldGutterBackground:  '#16181f',
      codeFoldBackground:        '#16181f',
      emptyLineBackground:       '#0a0b0f',
      gutterColor:            '#62666d',
      addedGutterColor:       '#7ee2a8',
      removedGutterColor:     '#f3a9b3',
      codeFoldContentColor:   '#8a8f98',
      diffViewerTitleBackground: '#16181f',
      diffViewerTitleColor:      '#f7f8f8',
      diffViewerTitleBorderColor:'#23252a',
    },
  },
  contentText: { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '12.5px' },
  line: { padding: '2px 0' },
}

export default function JobDetailModal({ job, onClose, onUpdated, onDeleted }) {
  const { user }          = useAuth()
  const [activeTab, setActiveTab] = useState(0)
  const [notes, setNotes] = useState(job.notes || '')
  const [aiContent, setAiContent] = useState(job.ai_content || {})
  const [atsResumes, setAtsResumes] = useState([])
  const [selectedAts, setSelectedAts] = useState(null)
  const [masterResume, setMasterResume] = useState('')
  const [diffView, setDiffView] = useState(true)        // true = side-by-side diff, false = final only
  const [copiedAts, setCopiedAts] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatingAts, setGeneratingAts] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [atsScore, setAtsScore] = useState(null)
  const [scoring, setScoring] = useState(false)
  const [feedback, setFeedback] = useState({ rating: 0, keptChanges: null, comments: '' })
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadAtsResumes()
    getMasterResume().then(setMasterResume).catch(() => {})
  }, [job.id])

  async function loadAtsResumes() {
    try {
      const data = await getATSResumes(job.id)
      setAtsResumes(data || [])
      if (data?.length) setSelectedAts(data[0])
    } catch {}
  }

  function handleCopyAts() {
    if (!selectedAts?.content) return
    navigator.clipboard.writeText(selectedAts.content).then(() => {
      setCopiedAts(true)
      setTimeout(() => setCopiedAts(false), 1800)
    })
  }

  // Suggestion jobs have no scraped description — fall back to notes/title so the
  // backend never receives a null jobDescription (caused a 422 validation error).
  const jobDescription = job.raw_description || job.notes || job.title || ''

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
        jobDescription,
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
      setMasterResume(resume)
      if (!resume || !resume.trim()) {
        throw new Error('Add your master resume in Settings before generating a tailored version.')
      }
      const { resumeText } = await generateATSResume({
        jobDescription, masterResume: resume, userProfile: profile,
      })
      const saved = await saveATSResume(job.id, resumeText, resume)
      setAtsResumes(prev => [saved, ...prev])
      setSelectedAts(saved)
      setDiffView(true)   // default view on a fresh generation = show what changed
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

  async function handleScore() {
    if (!selectedAts) return
    setScoring(true); setError('')
    try {
      const result = await scoreATSResume({
        resumeText: selectedAts.content,
        jobDescription,
      })
      setAtsScore(result)
    } catch (e) { setError(e.message) }
    finally { setScoring(false) }
  }

  async function handleFeedback(patch) {
    const updated = { ...feedback, ...patch }
    setFeedback(updated)
    if (updated.rating > 0 && updated.keptChanges !== null && selectedAts) {
      try {
        await saveATSFeedback({
          atsResumeId: selectedAts.id,
          jobId: job.id,
          rating: updated.rating,
          keptChanges: updated.keptChanges,
          comments: updated.comments,
        })
        setFeedbackSaved(true)
      } catch (e) { console.error('Feedback save failed:', e) }
    }
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
              {/* Actions row */}
              <div className="ats-actions">
                <button className="btn-primary" onClick={handleGenerateATS} disabled={generatingAts}>
                  {generatingAts ? '✦ Tailoring…' : selectedAts ? '✦ Regenerate (new version)' : '✦ Generate Tailored Resume'}
                </button>
                {selectedAts && (
                  <>
                    <div className="ats-view-toggle" role="group" aria-label="Resume view">
                      <button className={`toggle-btn ${diffView ? 'active' : ''}`}
                        onClick={() => setDiffView(true)} title="Show what the AI changed">Diff</button>
                      <button className={`toggle-btn ${!diffView ? 'active' : ''}`}
                        onClick={() => setDiffView(false)} title="Show only the tailored resume">Final</button>
                    </div>
                    <button className="btn-ghost" onClick={handleCopyAts}>
                      {copiedAts ? '✓ Copied' : '⧉ Copy'}
                    </button>
                    <button className="btn-ghost" onClick={handleScore} disabled={scoring}>
                      {scoring ? 'Scoring…' : '◎ ATS Score'}
                    </button>
                    <button className="btn-ghost" onClick={handleDownloadPDF} disabled={generatingPdf}>
                      {generatingPdf ? 'Generating PDF…' : '⬇ PDF'}
                    </button>
                  </>
                )}
              </div>
              {error && <p className="form-error">{error}</p>}

              {/* ATS Score panel */}
              {atsScore && (
                <div className="ats-score-panel">
                  <div className="ats-score-header">
                    <div className="ats-score-dial" style={{
                      color: atsScore.overall_score >= 75 ? 'var(--success)'
                           : atsScore.overall_score >= 50 ? '#f5a623'
                           : 'var(--danger)'
                    }}>
                      <span className="ats-score-number">{atsScore.overall_score}</span>
                      <span className="ats-score-label">/ 100</span>
                    </div>
                    <div className="ats-score-breakdown">
                      <div className="ats-score-sub">Keywords <strong>{atsScore.keyword_score}%</strong></div>
                      <div className="ats-score-sub">Structure <strong>{atsScore.structure_score}%</strong></div>
                    </div>
                  </div>
                  <div className="ats-keywords">
                    <div className="ats-kw-group">
                      <span className="ats-kw-label">✓ Found</span>
                      <div className="ats-chips">
                        {atsScore.keywords_found.map(k => (
                          <span key={k} className="ats-chip ats-chip-found">{k}</span>
                        ))}
                      </div>
                    </div>
                    <div className="ats-kw-group">
                      <span className="ats-kw-label">✗ Missing</span>
                      <div className="ats-chips">
                        {atsScore.keywords_missing.map(k => (
                          <span key={k} className="ats-chip ats-chip-missing">{k}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {atsScore.improvements?.length > 0 && (
                    <ul className="ats-improvements">
                      {atsScore.improvements.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {/* Version history */}
              {atsResumes.length > 0 && (
                <div className="ats-versions">
                  {atsResumes.map(r => (
                    <button key={r.id}
                      className={`version-btn ${selectedAts?.id === r.id ? 'active' : ''}`}
                      onClick={() => { setSelectedAts(r); setAtsScore(null) }}>
                      v{r.version} · {formatDate(r.created_at)}
                    </button>
                  ))}
                </div>
              )}

              {/* Resume content */}
              {selectedAts ? (
                diffView ? (
                  <div className="ats-diff">
                    <div className="ats-diff-legend">
                      <span><span className="legend-swatch removed" /> Original (master)</span>
                      <span><span className="legend-swatch added" /> Tailored for {job.company || 'this role'}</span>
                      <span className="legend-hint">Highlighted words = what the AI changed</span>
                    </div>
                    <div className="ats-diff-scroll">
                      <ReactDiffViewer
                        oldValue={selectedAts.master_resume_snapshot || masterResume || '(add your master resume in Settings to see the diff)'}
                        newValue={selectedAts.content}
                        splitView
                        compareMethod={DiffMethod.WORDS}
                        useDarkTheme
                        hideLineNumbers={false}
                        leftTitle="Your Master Resume"
                        rightTitle={`Tailored — v${selectedAts.version}`}
                        styles={DIFF_STYLES}
                      />
                    </div>
                  </div>
                ) : (
                  <pre className="ai-text ats-final-text">{selectedAts.content}</pre>
                )
              ) : (
                <p className="ai-empty">
                  No tailored resume yet. Click "Generate Tailored Resume" — the AI will make
                  surgical edits to your master resume (no fabrications) and show you a side-by-side
                  diff of every change.
                </p>
              )}

              {/* Feedback */}
              {selectedAts && (
                <div className="ats-feedback">
                  <div className="ats-feedback-label">Was this resume tailoring helpful?</div>
                  <div className="ats-stars">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} type="button"
                        className={`star-btn ${feedback.rating >= n ? 'active' : ''}`}
                        onClick={() => handleFeedback({ rating: n })}>★</button>
                    ))}
                  </div>
                  {feedback.rating > 0 && (
                    <>
                      <div className="ats-feedback-row">
                        <span className="ats-feedback-sub">Did you keep the AI changes?</span>
                        <button type="button"
                          className={`btn-ghost btn-sm ${feedback.keptChanges === true ? 'active-choice' : ''}`}
                          onClick={() => handleFeedback({ keptChanges: true })}>Yes</button>
                        <button type="button"
                          className={`btn-ghost btn-sm ${feedback.keptChanges === false ? 'active-choice' : ''}`}
                          onClick={() => handleFeedback({ keptChanges: false })}>No</button>
                      </div>
                      <textarea className="input textarea" rows={2}
                        placeholder="Optional: what could be improved?"
                        value={feedback.comments}
                        onChange={e => setFeedback(f => ({ ...f, comments: e.target.value }))}
                        onBlur={() => handleFeedback({})} />
                      {feedbackSaved && <p className="ats-feedback-saved">✓ Feedback saved</p>}
                    </>
                  )}
                </div>
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
