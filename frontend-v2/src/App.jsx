import { useState, useEffect } from 'react'
import { useAuth } from './components/AuthProvider'
import Login from './components/Login'
import Onboarding from './components/Onboarding'
import Board from './components/Board'
import AddJobModal from './components/AddJobModal'
import JobDetailModal from './components/JobDetailModal'
import Settings from './components/Settings'
import { getJobs, getUserProfile } from './api'

export default function App() {
  const { session } = useAuth()
  const userId = session?.user?.id   // depend on stable user id, NOT the whole session object
  const [jobs, setJobs]               = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState('')

  async function loadData() {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    setLoadError('')
    try {
      const [jobsData, profile] = await Promise.all([getJobs(), getUserProfile()])
      setJobs(jobsData || [])
      setNeedsOnboarding(!profile || !profile.onboarding_done)
    } catch (e) {
      console.error('Failed to load data:', e)
      setLoadError(e?.message || 'Could not reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Hooks must be called unconditionally — guard inside.
  // Deps on userId (stable string) NOT session (new object every token refresh) —
  // prevents the splash flash every time the browser tab regains focus.
  useEffect(() => { loadData() }, [userId])    // eslint-disable-line react-hooks/exhaustive-deps

  // Loading state — wait for auth to resolve
  if (session === undefined) {
    return (
      <div className="splash">
        <div className="splash-logo">✦</div>
      </div>
    )
  }

  // Not logged in
  if (!session) return <Login />

  if (loading) return (
    <div className="splash"><div className="splash-logo spinning">✦</div></div>
  )

  if (loadError) return (
    <div className="splash">
      <div className="splash-error">
        <div className="splash-error-icon">⚠</div>
        <h2>Couldn't load your data</h2>
        <p className="splash-error-msg">{loadError}</p>
        <button className="btn-primary" onClick={loadData}>Retry</button>
      </div>
    </div>
  )

  if (needsOnboarding) return (
    <Onboarding onComplete={() => setNeedsOnboarding(false)} />
  )

  function handleJobUpdated(updated) {
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
    if (selectedJob?.id === updated.id) setSelectedJob(updated)
  }

  function handleJobAdded(job) {
    setJobs(prev => [job, ...prev])
  }

  function handleJobDeleted(id) {
    setJobs(prev => prev.filter(j => j.id !== id))
    setSelectedJob(null)
  }

  return (
    <div className="app">
      {/* ── Navbar ── */}
      <header className="navbar">
        <div className="navbar-left">
          <span className="navbar-logo">✦</span>
          <span className="navbar-title">AI Job Finder</span>
        </div>
        <div className="navbar-right">
          <span className="job-count">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
          <button className="btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Job</button>
          <button className="btn-ghost btn-sm btn-icon" onClick={() => setShowSettings(true)}
            title="Settings">⚙</button>
        </div>
      </header>

      {/* ── Board ── */}
      <main className="main">
        <Board
          jobs={jobs}
          onJobClick={setSelectedJob}
          onJobUpdated={handleJobUpdated}
        />
      </main>

      {/* ── Modals ── */}
      {showAdd && (
        <AddJobModal onClose={() => setShowAdd(false)} onAdded={handleJobAdded} />
      )}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdated={handleJobUpdated}
          onDeleted={handleJobDeleted}
        />
      )}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
