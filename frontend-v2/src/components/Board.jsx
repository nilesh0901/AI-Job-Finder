import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core'
import Column from './Column'
import JobCard from './JobCard'
import { updateJob } from '../api'

const FIT_CLASS = {
  'Fitly Perfect!': 'fit-perfect',
  'Great fit!':     'fit-great',
  'Good fit':       'fit-good',
  'Fair match':     'fit-fair',
  'Low match':      'fit-low',
}

const COLUMNS = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected']
const COLUMN_LABELS = {
  wishlist: 'Wishlist', applied: 'Applied', interviewing: 'Interviewing',
  offer: 'Offer', rejected: 'Rejected',
}

export default function Board({ jobs, onJobClick, onJobUpdated, onRefreshSuggestions }) {
  const [activeJob, setActiveJob]       = useState(null)
  const [activeColumn, setActiveColumn] = useState(COLUMNS[0])
  const [refreshing, setRefreshing]     = useState(false)
  const [hideViewed, setHideViewed]     = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }))

  const regularJobs = jobs.filter(j => !j.is_suggestion)
  const suggestions = jobs.filter(j => j.is_suggestion && j.status === 'wishlist')

  function visibleJobs(list) {
    return hideViewed ? list.filter(j => !j.viewed_at) : list
  }

  function grouped() {
    return COLUMNS.reduce((acc, col) => {
      acc[col] = visibleJobs(regularJobs.filter(j => j.status === col))
      return acc
    }, {})
  }

  async function handleDragEnd({ active, over }) {
    setActiveJob(null)
    if (!over || active.id === over.id) return
    const newStatus = over.id
    if (!COLUMNS.includes(newStatus)) return
    const job = jobs.find(j => j.id === active.id)
    if (!job) return
    if (!job.is_suggestion && job.status === newStatus) return
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

  const viewedCount = regularJobs.filter(j => j.viewed_at).length

  return (
    <>
      {/* ── Board controls (desktop only) ─────────────────────────── */}
      <div className="board-controls">
        {viewedCount > 0 && (
          <button
            className={`hide-viewed-toggle ${hideViewed ? 'active' : ''}`}
            onClick={() => setHideViewed(v => !v)}
          >
            <span className="hide-viewed-dot" />
            {hideViewed ? `Showing unviewed (${viewedCount} hidden)` : `Hide viewed (${viewedCount})`}
          </button>
        )}
      </div>

      {/* ── Mobile: tab switcher ─────────────────────────────────── */}
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

      {/* ── Mobile: single column ────────────────────────────────── */}
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
              {job.fit_score != null && (
                <div className={`fit-badge ${FIT_CLASS[job.fit_label] || 'fit-low'}`}>
                  <span className="fit-score-num">{job.fit_score}</span>
                  <span>{job.fit_label}</span>
                </div>
              )}
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

      {/* ── Desktop: full Kanban ─────────────────────────────────── */}
      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={({ active }) => setActiveJob(jobs.find(j => j.id === active.id))}
        onDragEnd={handleDragEnd}>
        <div className="board">
          {/* Suggested rail */}
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
