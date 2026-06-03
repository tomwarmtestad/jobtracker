const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple JSON file as database
const DB_FILE = path.join(__dirname, 'jobs.json');

function loadJobs() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveJobs(jobs) {
  fs.writeFileSync(DB_FILE, JSON.stringify(jobs, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Get all jobs
app.get('/api/jobs', (req, res) => {
  const jobs = loadJobs();
  res.json(jobs);
});

// Create job
app.post('/api/jobs', (req, res) => {
  const { description, reminderDate } = req.body;
  if (!description || !reminderDate) {
    return res.status(400).json({ error: 'Omschrijving en datum zijn verplicht' });
  }
  const jobs = loadJobs();
  const job = {
    id: generateId(),
    description,
    reminderDate,
    done: false,
    createdAt: new Date().toISOString()
  };
  jobs.push(job);
  saveJobs(jobs);
  res.json(job);
});

// Update job (mark done / snooze)
app.put('/api/jobs/:id', (req, res) => {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });
  jobs[idx] = { ...jobs[idx], ...req.body };
  saveJobs(jobs);
  res.json(jobs[idx]);
});

// Delete job
app.delete('/api/jobs/:id', (req, res) => {
  let jobs = loadJobs();
  jobs = jobs.filter(j => j.id !== req.params.id);
  saveJobs(jobs);
  res.json({ ok: true });
});

const PORT = 3456;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`JobTracker draait op http://localhost:${PORT}`);
  console.log(`Op je telefoon: http://<jouw-laptop-ip>:${PORT}`);
});
