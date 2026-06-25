import { useDroppable } from '@dnd-kit/core';
import JobCard from './JobCard';

const COL_COLORS = {
  wishlist:    'var(--col-wishlist)',
  applied:     'var(--col-applied)',
  interviewing:'var(--col-interviewing)',
  offer:       'var(--col-offer)',
  rejected:    'var(--col-rejected)',
};

const COL_LABELS = {
  wishlist:    'Wish List',
  applied:     'Applied',
  interviewing:'Interviewing',
  offer:       'Offer',
  rejected:    'Rejected',
};

export default function Column({ id, jobs, onCardClick }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={`column ${isOver ? 'is-over' : ''}`}>
      <div className="column-header">
        <span
          className="column-dot"
          style={{ background: COL_COLORS[id] }}
        />
        <span className="column-title">{COL_LABELS[id]}</span>
        <span className="column-count">{jobs.length}</span>
      </div>
      <div className="column-cards">
        {jobs.length === 0 ? (
          <div className="empty-column">
            Drop jobs here
          </div>
        ) : (
          jobs.map((job) => (
            <JobCard key={job.id} job={job} onClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  );
}
