import { useDraggable } from '@dnd-kit/core'

const STATUS_COLORS = {
  wishlist:     '#5e6ad2',
  applied:      '#f5a623',
  interviewing: '#7ed321',
  offer:        '#4a90e2',
  rejected:     '#e05c5c',
}

export default function JobCard({ job, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto',
  } : {}

  const hasAI = job.ai_content && Object.keys(job.ai_content).length > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`job-card ${isDragging ? 'dragging' : ''}`}
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      <div className="job-card-header">
        <span className="job-card-title">{job.title}</span>
        {hasAI && <span className="ai-badge">AI</span>}
      </div>
      {job.company && <span className="job-card-company">{job.company}</span>}
      {job.location && <span className="job-card-location">📍 {job.location}</span>}
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
