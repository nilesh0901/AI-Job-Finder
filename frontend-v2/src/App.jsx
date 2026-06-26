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
  const [jobs, setJobs]               = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [loading, setLoading]         = useState(true)

  // Hooks must be called unconditionally on every render — guard inside.
  useEffect(() => {
    if (!session) {
      setLoading(false)
      return
    }
    setLoading(true)
    async function load() {
      try {
        const [jobsData, profile] = await Promise.all([getJobs(), getUserProfile()])
        setJobs(jobsData || [])
        if (!profile || !profile.onboarding_done) setNeedsOnboarding(true)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [session])

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
