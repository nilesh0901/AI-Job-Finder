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

export default function Board({ jobs, onJobClick, onJobUpdated, onRefreshSuggestions }) {
  const [activeJob, setActiveJob]       = useState(null)
  const [activeColumn, setActiveColumn] = useState(COLUMNS[0]) // for mobile tab view
  const [refreshing, setRefreshing]     = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }))

  // Suggestions are real `jobs` rows flagged is_suggestion — keep them out of the
  // status columns and surface them in the read-only Suggested rail instead.
  const regularJobs = jobs.filter(j => !j.is_suggestion)
  const suggestions = jobs.filter(j => j.is_suggestion && j.status === 'wishlist')

  function grouped() {
    return COLUMNS.reduce((acc, col) => {
      acc[col] = regularJobs.filter(j => j.status === col)
      return acc
    }, {})
  }

  async function handleDragEnd({ active, over }) {
    setActiveJob(null)
    if (!over || active.id === over.id) return
    const newStatus = over.id
    if (!COLUMNS.includes(newStatus)) return   // drops onto 'suggested' are ignored
    const job = jobs.find(j => j.id === active.id)
    if (!job) return
    // Allow drop when: job is a suggestion (always promote) OR status actually changes.
    if (!job.is_suggestion && job.status === newStatus) return
    // Dragging a suggestion into a real column promotes it to a tracked job.
    const patch = job.is_suggestion ? { status: newStatus, is_suggestion: false } : { status: newStatus }
    const updated = await updateJob(job.id, patch)
    onJobUpdated(updated)
  }

  async function handleRefresh() {
    if (!onRefreshSuggestions || refreshing) return
    setRefreshing(true)
    try { await onRefreshSuggestions() } catch (e) { console.error(e) } finally { setRefreshing(false) }
  }

  const byStatus = grouped()
  const mobileTabs = ['suggested', ...COLUMNS]

  function mobileCards(col) {
    return col === 'suggested' ? suggestions : byStatus[col]
  }

  return (
    <>
      {/* ── Mobile: tab switcher ─────────────────────────────── */}
      <div className="mobile-tabs">
        {mobileTabs.map(col => (
          <button key={col}
            className={`mobile-tab ${activeColumn === col ? 'active' : ''}`}
            onClick={() => setActiveColumn(col)}>
            {col === 'suggested' ? '✦ Suggested' : COLUMN_LABELS[col]}
            <span className="mobile-tab-count">{mobileCards(col).length}</span>
          </button>
        ))}
      </div>

      {/* ── Mobile: single column ────────────────────────────── */}
      <div className="mobile-column-view">
        {activeColumn === 'suggested' && (
          <button className="btn-ghost btn-refresh-mobile" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Finding jobs…' : '↻ Refresh suggestions'}
          </button>
        )}
        {mobileCards(activeColumn).length === 0 ? (
          <div className="column-empty mobile-empty">
            {activeColumn === 'suggested' ? 'No suggestions yet — tap Refresh.' : 'No jobs here yet'}
          </div>
        ) : (
          mobileCards(activeColumn).map(job => (
            <div key={job.id} className="mobile-job-card" onClick={() => onJobClick(job)}>
              <div className="job-card-header">
                <span className="job-card-title">{job.title}</span>
                {job.ai_content && Object.keys(job.ai_content).length > 0 && (
                  <span className="ai-badge">AI</span>
                )}
              </div>
              {job.company && <span className="job-card-company">{job.company}</span>}
              {job.location && <span className="job-card-location">📍 {job.location}</span>}
              {job.is_suggestion && job.source && <span className="job-card-source">{job.source}</span>}
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
          {/* Suggested rail — read-only: cards drag OUT, nothing drops IN.
              Rendered first so it sits as the leading column. */}
          <div className="column column-suggested">
            <div className="column-header">
              <span className="column-title column-label">✦ Suggested</span>
              <span className="column-count">{suggestions.length}</span>
              <button className="btn-ghost btn-refresh" onClick={handleRefresh}
                disabled={refreshing} title="Refresh job suggestions">
                {refreshing ? '…' : '↻'}
              </button>
            </div>
            <div className="column-body">
              {suggestions.length === 0 ? (
                <div className="suggestions-empty">
                  <p>No suggestions yet.</p>
                  <button className="btn-primary" onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? 'Finding jobs…' : 'Find jobs for me'}
                  </button>
                </div>
              ) : (
                suggestions.map(job => (
                  <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
                ))
              )}
            </div>
          </div>

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
