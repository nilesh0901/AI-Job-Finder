import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useState } from 'react';
import Column from './Column';
import JobCard from './JobCard';
import { updateJob } from '../api';

const COLUMNS = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected'];

export default function Board({ jobs, setJobs, onCardClick }) {
  const [activeJob, setActiveJob] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragStart({ active }) {
    setActiveJob(jobs.find((j) => j.id === active.id) || null);
  }

  function handleDragEnd({ active, over }) {
    setActiveJob(null);
    if (!over || active.id === over.id) return;

    const newStatus = over.id;
    if (!COLUMNS.includes(newStatus)) return;

    // Optimistic update
    setJobs((prev) =>
      prev.map((j) => (j.id === active.id ? { ...j, status: newStatus } : j))
    );

    updateJob(active.id, { status: newStatus }).catch(() => {
      // Revert on failure
      setJobs((prev) =>
        prev.map((j) =>
          j.id === active.id ? { ...j, status: activeJob?.status || j.status } : j
        )
      );
    });
  }

  return (
    <div className="board-wrapper">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="board">
          {COLUMNS.map((col) => (
            <Column
              key={col}
              id={col}
              jobs={jobs.filter((j) => j.status === col)}
              onCardClick={onCardClick}
            />
          ))}
        </div>
        <DragOverlay>
          {activeJob ? <JobCard job={activeJob} onClick={() => {}} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
