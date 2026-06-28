import { useDraggable } from '@dnd-kit/core'

const FIT_CLASS = {
  'Fitly Perfect!': 'fit-perfect',
  'Great fit!':     'fit-great',
  'Good fit':       'fit-good',
  'Fair match':     'fit-fair',
  'Low match':      'fit-low',
}

export default function JobCard({ job, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto',
  } : {}

  const hasAI       = job.ai_content && Object.keys(job.ai_content).length > 0
  const hasFitScore = job.fit_score != null
  const fitClass    = FIT_CLASS[job.fit_label] || 'fit-low'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`job-card ${isDragging ? 'dragging' : ''} ${job.is_suggestion ? 'suggestion-card' : ''}`}
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      {/* Company logo row */}
      <div className="job-card-logo-row">
        {job.company_logo_url
          ? <img src={job.company_logo_url} alt="" className="company-logo" onError={e => { e.target.style.display = 'none' }} />
          : job.company
            ? <div className="company-logo-placeholder">{job.company[0]?.toUpperCase()}</div>
            : null
        }
        <div className="job-card-title-wrap">
          <span className="job-card-title">{job.title}</span>
          {job.company && <span className="job-card-company">{job.company}</span>}
        </div>
        {hasAI && <span className="ai-badge">AI</span>}
      </div>

      {/* Fit score badge */}
      {hasFitScore && (
        <div className={`fit-badge ${fitClass}`}>
          <span className="fit-score-num">{job.fit_score}</span>
          <span>{job.fit_label}</span>
        </div>
      )}

      {/* Meta chips: work_mode / job_type / seniority */}
      {(job.work_mode || job.job_type || job.seniority || job.salary_text) && (
        <div className="job-meta-chips">
          {job.work_mode  && <span className="job-meta-chip">{job.work_mode}</span>}
          {job.job_type   && <span className="job-meta-chip">{job.job_type}</span>}
          {job.seniority  && <span className="job-meta-chip">{job.seniority}</span>}
          {job.salary_text && <span className="job-meta-chip">₹ {job.salary_text}</span>}
        </div>
      )}

      {job.location && <span className="job-card-location">📍 {job.location}</span>}
      {job.is_suggestion && job.source && (
        <span className="job-card-source">{job.source}</span>
      )}

      <div className="job-card-footer">
        <span className="job-card-date">{formatDate(job.added_at)}</span>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="job-card-link"
            onClick={e => e.stopPropagation()}
          >↗</a>
        )}
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
