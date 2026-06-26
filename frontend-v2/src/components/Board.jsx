import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core'
import Column from './Column'
import JobCard from './JobCard'
import { updateJob } from '../api'

const COLUMNS = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected']
const COLUMN_LABELS = {
  wishlist: 'Wishlist', applied: 'Applied', interviewing: 'Interviewing',
  offer: 'Offer', rejected: 'Rejected',
}

export default function Board({ jobs, onJobClick, onJobUpdated }) {
  const [activeJob, setActiveJob]       = useState(null)
  const [activeColumn, setActiveColumn] = useState(COLUMNS[0]) // for mobile tab view

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }))

  function grouped() {
    return COLUMNS.reduce((acc, col) => {
      acc[col] = jobs.filter(j => j.status === col)
      return acc
    }, {})
  }

  async function handleDragEnd({ active, over }) {
    setActiveJob(null)
    if (!over || active.id === over.id) return
    const newStatus = over.id
    if (!COLUMNS.includes(newStatus)) return
    const job = jobs.find(j => j.id === active.id)
    if (!job || job.status === newStatus) return
    const updated = await updateJob(job.id, { status: newStatus })
    onJobUpdated(updated)
  }

  const byStatus = grouped()

  return (
    <>
      {/* ── Mobile: tab switcher ─────────────────────────────── */}
      <div className="mobile-tabs">
        {COLUMNS.map(col => (
          <button key={col}
            className={`mobile-tab ${activeColumn === col ? 'active' : ''}`}
            onClick={() => setActiveColumn(col)}>
            {COLUMN_LABELS[col]}
            <span className="mobile-tab-count">{byStatus[col].length}</span>
          </button>
        ))}
      </div>

      {/* ── Mobile: single column ────────────────────────────── */}
      <div className="mobile-column-view">
        {byStatus[activeColumn].length === 0 ? (
          <div className="column-empty mobile-empty">No jobs here yet</div>
        ) : (
          byStatus[activeColumn].map(job => (
            <div key={job.id} className="mobile-job-card" onClick={() => onJobClick(job)}>
              <div className="job-card-header">
                <span className="job-card-title">{job.title}</span>
                {job.ai_content && Object.keys(job.ai_content).length > 0 && (
                  <span className="ai-badge">AI</span>
                )}
              </div>
              {job.company && <span className="job-card-company">{job.company}</span>}
              {job.location && <span className="job-card-location">📍 {job.location}</span>}
              <div className="job-card-footer">
                <span className="job-card-date">
                  {new Date(job.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {job.url && (
                  <a href={job.url} target="_blank" rel="noopener noreferrer"
                    className="job-card-link" onClick={e => e.stopPropagation()}>↗</a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Desktop: full Kanban ─────────────────────────────── */}
      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={({ active }) => setActiveJob(jobs.find(j => j.id === active.id))}
        onDragEnd={handleDragEnd}>
        <div className="board">
          {COLUMNS.map(col => (
            <Column key={col} id={col} jobs={byStatus[col]} onJobClick={onJobClick} />
          ))}
        </div>
        <DragOverlay>
          {activeJob ? <JobCard job={activeJob} onClick={() => {}} /> : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}
