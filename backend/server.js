import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeJob } from './scraper.js';
import { generateAIContent, testConnection } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'jobs.json');
const PORT = process.env.PORT || 3001;

// Initialize DB file if missing
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ jobs: [] }, null, 2));
}

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

// ── Jobs CRUD ──────────────────────────────────────────────────────────────

app.get('/api/jobs', (req, res) => {
  try {
    const { jobs } = readDB();
    res.json({ jobs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/jobs', (req, res) => {
  try {
    const { title, company, location, url, rawDescription, status } = req.body;
    const db = readDB();
    const job = {
      id: crypto.randomUUID(),
      status: status || 'wishlist',
      title: title || 'Untitled Job',
      company: company || '',
      location: location || '',
      url: url || '',
      rawDescription: rawDescription || '',
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: '',
      aiContent: {
        coverLetter: '',
        resumeBullets: '',
        interviewQuestions: '',
        companyBrief: '',
        generatedAt: null,
      },
    };
    db.jobs.unshift(job);
    writeDB(db);
    res.status(201).json(job);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/jobs/:id', (req, res) => {
  try {
    const db = readDB();
    const idx = db.jobs.findIndex(j => j.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Job not found' });
    db.jobs[idx] = { ...db.jobs[idx], ...req.body, updatedAt: new Date().toISOString() };
    writeDB(db);
    res.json(db.jobs[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/jobs/:id', (req, res) => {
  try {
    const db = readDB();
    const before = db.jobs.length;
    db.jobs = db.jobs.filter(j => j.id !== req.params.id);
    if (db.jobs.length === before) return res.status(404).json({ error: 'Job not found' });
    writeDB(db);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Scraper ────────────────────────────────────────────────────────────────

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'url is required' });
  try {
    const data = await scrapeJob(url);
    res.json({ success: true, ...data });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ── AI ─────────────────────────────────────────────────────────────────────

app.post('/api/ai/generate', async (req, res) => {
  const { jobId, jobDescription, masterResume } = req.body;
  if (!jobId) return res.status(400).json({ error: 'jobId is required' });

  try {
    const db = readDB();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const content = await generateAIContent({
      title: job.title,
      company: job.company,
      jobDescription: jobDescription || job.rawDescription,
      masterResume,
    });

    // Persist to DB
    const idx = db.jobs.findIndex(j => j.id === jobId);
    db.jobs[idx].aiContent = { ...content, generatedAt: new Date().toISOString() };
    db.jobs[idx].updatedAt = new Date().toISOString();
    writeDB(db);

    res.json(content);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ai/test', async (req, res) => {
  try {
    await testConnection();
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
