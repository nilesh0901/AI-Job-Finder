import { useDroppable } from '@dnd-kit/core'
import JobCard from './JobCard'

const COLUMN_LABELS = {
  wishlist:     'Wishlist',
  applied:      'Applied',
  interviewing: 'Interviewing',
  offer:        'Offer',
  rejected:     'Rejected',
}

const COLUMN_COLORS = {
  wishlist:     '#5e6ad2',
  applied:      '#f5a623',
  interviewing: '#7ed321',
  offer:        '#4a90e2',
  rejected:     '#e05c5c',
}

export default function Column({ id, jobs, onJobClick }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div className={`column ${isOver ? 'column-over' : ''}`} ref={setNodeRef}>
      <div className="column-header">
        <span className="column-dot" style={{ background: COLUMN_COLORS[id] }} />
        <span className="column-title">{COLUMN_LABELS[id]}</span>
        <span className="column-count">{jobs.length}</span>
      </div>
      <div className="column-body">
        {jobs.map(job => (
          <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
        ))}
        {jobs.length === 0 && (
          <div className="column-empty">Drop jobs here</div>
        )}
      </div>
    </div>
  )
}
