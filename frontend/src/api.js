const handle = async (res) => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
};

const json = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const getJobs = () => fetch('/api/jobs').then(handle);

export const createJob = (data) =>
  fetch('/api/jobs', { method: 'POST', ...json(data) }).then(handle);

export const updateJob = (id, data) =>
  fetch(`/api/jobs/${id}`, { method: 'PATCH', ...json(data) }).then(handle);

export const deleteJob = (id) =>
  fetch(`/api/jobs/${id}`, { method: 'DELETE' }).then(handle);

export const scrapeUrl = (url) =>
  fetch('/api/scrape', { method: 'POST', ...json({ url }) }).then(handle);

export const generateAI = (jobId, jobDescription, masterResume) =>
  fetch('/api/ai/generate', {
    method: 'POST',
    ...json({ jobId, jobDescription, masterResume }),
  }).then(handle);

export const testAI = () => fetch('/api/ai/test').then(handle);
