import { useState, useEffect } from 'react';
import { getJobs } from './api';
import Board from './components/Board';
import AddJobModal from './components/AddJobModal';
import JobDetailModal from './components/JobDetailModal';
import Settings from './components/Settings';

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [view, setView] = useState('board'); // 'board' | 'settings'
  const [selectedJob, setSelectedJob] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    getJobs()
      .then(({ jobs }) => setJobs(jobs))
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleJobAdded(job) {
    setJobs((prev) => [job, ...prev]);
    setShowAdd(false);
  }

  function handleJobUpdated(updated) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    setSelectedJob(updated);
  }

  function handleJobDeleted(id) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setSelectedJob(null);
  }

  return (
    <>
      {/* Nav */}
      <nav className="top-nav">
        <div className="nav-brand">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="7" height="7" rx="2" fill="currentColor" opacity="0.8" />
            <rect x="10" y="1" width="7" height="7" rx="2" fill="currentColor" opacity="0.5" />
            <rect x="1" y="10" width="7" height="7" rx="2" fill="currentColor" opacity="0.5" />
            <rect x="10" y="10" width="7" height="7" rx="2" fill="currentColor" opacity="0.3" />
          </svg>
          Job Tracker
        </div>

        <div className="nav-actions">
          <button
            className={`btn btn-ghost btn-sm ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView(view === 'settings' ? 'board' : 'settings')}
          >
            {view === 'settings' ? '← Board' : 'Settings'}
          </button>
          {view === 'board' && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              + Add Job
            </button>
          )}
        </div>
      </nav>

      {/* Main */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', gap: 'var(--sp-sm)', color: 'var(--ink-subtle)', fontSize: 14 }}>
          <span className="spinner" /> Loading…
        </div>
      ) : loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', flexDirection: 'column', gap: 'var(--sp-md)', color: 'var(--col-rejected)', textAlign: 'center', padding: 'var(--sp-lg)' }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Cannot connect to backend</div>
          <div style={{ fontSize: 14, color: 'var(--ink-subtle)', maxWidth: 420 }}>
            {loadError}
            <br /><br />
            Make sure the backend is running:
            <br />
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-muted)' }}>
              npm run dev:backend
            </code>
          </div>
        </div>
      ) : view === 'settings' ? (
        <Settings />
      ) : (
        <Board
          jobs={jobs}
          setJobs={setJobs}
          onCardClick={setSelectedJob}
        />
      )}

      {/* Modals */}
      {showAdd && (
        <AddJobModal
          onClose={() => setShowAdd(false)}
          onJobAdded={handleJobAdded}
        />
      )}

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onJobUpdated={handleJobUpdated}
          onJobDeleted={handleJobDeleted}
        />
      )}
    </>
  );
}
