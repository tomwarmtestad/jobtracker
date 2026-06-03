const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
 
const app = express();
const PASSWORD = process.env.APP_PASSWORD || 'werkplanning';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
// Auth middleware
function checkAuth(req, res, next) {
  if (req.path === '/login' || req.path === '/api/login') return next();
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/auth=([^;]+)/);
  if (match && match[1] === PASSWORD) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Niet ingelogd' });
  res.redirect('/login');
}
 
app.use(checkAuth);
 
// Login page
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
 
// Data files
const DB_FILE = path.join(__dirname, 'jobs.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
 
function loadJobs() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
 
function saveJobs(jobs) {
  fs.writeFileSync(DB_FILE, JSON.stringify(jobs, null, 2));
}
 
function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ emails: [] }));
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}
 
function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
 
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
 
// Jobs API
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
 
// Settings API
app.get('/api/settings', (req, res) => res.json(loadSettings()));
 
app.post('/api/settings', (req, res) => {
  const { emails } = req.body;
  saveSettings({ emails: emails || [] });
  res.json({ ok: true });
});
 
// Send test email
app.post('/api/send-test', async (req, res) => {
  const settings = loadSettings();
  if (!settings.emails || settings.emails.length === 0) {
    return res.status(400).json({ error: 'Geen e-mailadressen ingesteld' });
  }
  try {
    await sendReminderEmail(settings.emails, true);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
 
// Send email via Resend
function sendReminderEmail(emails, isTest = false) {
  return new Promise((resolve, reject) => {
    const jobs = loadJobs();
    const today = new Date(); today.setHours(0,0,0,0);
 
    const overdue = jobs.filter(j => {
      if (j.done) return false;
      const d = new Date(j.reminderDate + 'T00:00:00');
      return d < today;
    });
 
    const todayJobs = jobs.filter(j => {
      if (j.done) return false;
      const d = new Date(j.reminderDate + 'T00:00:00');
      return d.getTime() === today.getTime();
    });
 
    if (!isTest && overdue.length === 0 && todayJobs.length === 0) {
      return resolve({ skipped: true });
    }
 
    const jobRow = j => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">
          <strong style="color:#1a1a1a">${j.title}</strong>
          ${j.description ? `<br><span style="color:#888;font-size:13px">${j.description}</span>` : ''}
          ${j.lastNote ? `<br><em style="color:#e69500;font-size:13px">📝 ${j.lastNote}</em>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;white-space:nowrap;color:#888;font-size:13px">
          ${new Date(j.reminderDate + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
        </td>
      </tr>`;
 
    const html = `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f5f7;padding:24px">
        <div style="background:white;border-top:3px solid #e69500;border-radius:4px;padding:28px">
          <h1 style="color:#c07d00;font-size:20px;margin:0 0 4px">JobTracker</h1>
          <p style="color:#888;font-size:13px;margin:0 0 24px">Dagelijkse reminder — ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          ${overdue.length ? `
            <h2 style="font-size:14px;color:#d93025;margin:0 0 8px">⚠ Verlopen (${overdue.length})</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#fff5f5;border-radius:3px">
              ${overdue.map(jobRow).join('')}
            </table>` : ''}
          ${todayJobs.length ? `
            <h2 style="font-size:14px;color:#e67700;margin:0 0 8px">⏰ Vandaag (${todayJobs.length})</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              ${todayJobs.map(jobRow).join('')}
            </table>` : ''}
          ${isTest && overdue.length === 0 && todayJobs.length === 0 ? '<p style="color:#888">Geen openstaande reminders vandaag. Dit is een testmail.</p>' : ''}
          <a href="https://jobtracker-ik6e.onrender.com" style="display:inline-block;background:#e69500;color:white;padding:10px 20px;text-decoration:none;font-weight:600;border-radius:3px;font-size:14px">Open JobTracker</a>
        </div>
      </div>`;
 
    const body = JSON.stringify({
      from: 'JobTracker <onboarding@resend.dev>',
      to: emails,
      subject: isTest ? 'JobTracker testmail' : `JobTracker reminder — ${overdue.length + todayJobs.length} job${overdue.length + todayJobs.length !== 1 ? 's' : ''} vereisen aandacht`,
      html
    });
 
    const req2 = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, r => {
      let data = '';
      r.on('data', d => data += d);
      r.on('end', () => r.statusCode < 300 ? resolve(JSON.parse(data)) : reject(new Error(`Resend fout: ${data}`)));
    });
    req2.on('error', reject);
    req2.write(body);
    req2.end();
  });
}
 
// Daily email check every hour
function checkAndSendEmails() {
  const now = new Date();
  if (now.getHours() === 8 && now.getMinutes() < 5) {
    const settings = loadSettings();
    if (settings.emails && settings.emails.length > 0) {
      sendReminderEmail(settings.emails).catch(console.error);
    }
  }
}
 
setInterval(checkAndSendEmails, 5 * 60 * 1000); // Check every 5 minutes
 
const PORT = process.env.PORT || 3456;
app.listen(PORT, '0.0.0.0', () => console.log(`JobTracker draait op poort ${PORT}`));
