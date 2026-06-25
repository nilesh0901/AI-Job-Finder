import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const STATUS_COLORS = {
  wishlist:    'var(--col-wishlist)',
  applied:     'var(--col-applied)',
  interviewing:'var(--col-interviewing)',
  offer:       'var(--col-offer)',
  rejected:    'var(--col-rejected)',
};

const STATUS_LABELS = {
  wishlist:    'Wishlist',
  applied:     'Applied',
  interviewing:'Interviewing',
  offer:       'Offer',
  rejected:    'Rejected',
};

export default function JobCard({ job, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 999 : undefined,
    position: isDragging ? 'relative' : undefined,
  };

  const hasAI = !!job.aiContent?.generatedAt;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`job-card ${isDragging ? 'is-dragging' : ''}`}
      onClick={(e) => {
        if (!isDragging) onClick(job);
      }}
    >
      <div className="job-card-title">{job.title || 'Untitled Job'}</div>
      {job.company && <div className="job-card-company">{job.company}</div>}
      <div className="job-card-footer">
        <span
          className="status-pill"
          style={{ background: STATUS_COLORS[job.status] }}
        >
          {STATUS_LABELS[job.status]}
        </span>
        {hasAI && (
          <span className="job-card-ai-badge" title="AI content generated">
            ✦ AI ready
          </span>
        )}
      </div>
    </div>
  );
}
