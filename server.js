const express = require('express');
const path = require('path');
const fs = require('fs');
 
const app = express();
const PASSWORD = process.env.APP_PASSWORD || 'werkplanning';
 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
function checkAuth(req, res, next) {
  if (req.path === '/login' || req.path === '/api/login') return next();
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/auth=([^;]+)/);
  if (match && match[1] === PASSWORD) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Niet ingelogd' });
  res.redirect('/login');
}
 
app.use(checkAuth);
 
app.get('/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JobTracker Login</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f4f5f7; font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { background: white; border-top: 3px solid #e69500; border-radius: 4px; padding: 40px; width: 340px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    h1 { font-size: 22px; font-weight: 700; color: #c07d00; margin-bottom: 4px; }
    p { color: #888; font-size: 13px; margin-bottom: 28px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
    input { width: 100%; background: #f4f5f7; border: 1px solid #e0e0e0; color: #1a1a1a; padding: 10px 12px; font-family: 'Inter', sans-serif; font-size: 14px; outline: none; margin-bottom: 16px; border-radius: 3px; }
    input:focus { border-color: #e69500; background: white; }
    button { width: 100%; background: #e69500; color: white; border: none; padding: 12px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 3px; }
    button:hover { background: #c07d00; }
    .error { color: #d93025; font-size: 13px; margin-bottom: 12px; display: none; }
  </style>
</head>
<body>
  <div class="box">
    <h1>JobTracker</h1>
    <p>Werkvoorbereiding & bestellingen</p>
    <div class="error" id="err">Wachtwoord onjuist</div>
    <label>Wachtwoord</label>
    <input type="password" id="pw" placeholder="••••••••" autofocus>
    <button onclick="login()">Inloggen</button>
  </div>
  <script>
    document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    async function login() {
      const pw = document.getElementById('pw').value;
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (res.ok) { document.cookie = 'auth=' + pw + ';path=/;max-age=86400'; window.location = '/'; }
      else { document.getElementById('err').style.display = 'block'; }
    }
  </script>
</body>
</html>`);
});
 
app.post('/api/login', (req, res) => {
  if (req.body.password === PASSWORD) res.json({ ok: true });
  else res.status(401).json({ error: 'Onjuist wachtwoord' });
});
 
app.use(express.static(__dirname));
 
const DB_FILE = path.join(__dirname, 'jobs.json');
 
function loadJobs() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
 
function saveJobs(jobs) {
  fs.writeFileSync(DB_FILE, JSON.stringify(jobs, null, 2));
}
 
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
 
app.get('/api/jobs', (req, res) => res.json(loadJobs()));
 
app.post('/api/jobs', (req, res) => {
  const { title, description, reminderDate } = req.body;
  if (!title || !reminderDate) return res.status(400).json({ error: 'Verplicht' });
  const jobs = loadJobs();
  const job = { id: generateId(), title, description, reminderDate, done: false, createdAt: new Date().toISOString() };
  jobs.push(job);
  saveJobs(jobs);
  res.json(job);
});
 
app.put('/api/jobs/:id', (req, res) => {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });
  jobs[idx] = { ...jobs[idx], ...req.body };
  saveJobs(jobs);
  res.json(jobs[idx]);
});
 
app.delete('/api/jobs/:id', (req, res) => {
  saveJobs(loadJobs().filter(j => j.id !== req.params.id));
  res.json({ ok: true });
});
 
const PORT = process.env.PORT || 3456;
app.listen(PORT, '0.0.0.0', () => console.log(`JobTracker draait op poort ${PORT}`));
