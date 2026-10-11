'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const PAGES_DIR = path.join(PUBLIC_DIR, 'pages');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// Basic hardening headers. The CSP allows the Tailwind CDN and Google Fonts
// that the pages load; tighten it if you later self-host those assets.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
    ].join('; ')
  );
  next();
});

// Static assets (css, js, partials). Pages are served by explicit routes below
// so that clean URLs like /assessment work without the .html extension.
app.use(express.static(PUBLIC_DIR, { index: false, extensions: [] }));
app.use('/images', express.static(path.join(__dirname, 'images')));

// ---------------------------------------------------------------------------
// In-memory session tokens
//
// Auth is a working demo implementation, not production auth: there are no
// sessions/cookies, and this Map is not safe across server restarts or cluster
// scaling. Swap the token store / getSession for a real session provider and
// switch the frontend to httpOnly cookies before shipping.
// ---------------------------------------------------------------------------
const activeSessions = new Map(); // token -> { userId, role, name, email }

function createSessionToken(user) {
  const token = crypto.randomUUID();
  activeSessions.set(token, {
    userId: user.id,
    role: user.role || 'user',
    name: user.name,
    email: user.email,
  });
  return token;
}

function getSession(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !activeSessions.has(token)) return null;
  return { token, ...activeSessions.get(token) };
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Authentication required.' });
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Authentication required.' });
  if (session.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  req.session = session;
  next();
}

// ---------------------------------------------------------------------------
// Page routes
// ---------------------------------------------------------------------------
const PAGES = {
  '/': 'index.html',
  '/resources': 'resources.html',
  '/assessment': 'assessment.html',
  '/find-support': 'find-support.html',
  '/login': 'login.html',
  '/register': 'register.html',
};

Object.entries(PAGES).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(PAGES_DIR, file)));
});

// The admin page HTML is deliberately public (it is empty of data); the
// dashboard itself only loads information through /api/admin/* endpoints, which
// are protected by server-side role checks (requireAdmin). See /api/session for
// the redirect that sends unauthenticated users back to /login.
app.get('/admin', (req, res) => res.sendFile(path.join(PAGES_DIR, 'admin.html')));

// ---------------------------------------------------------------------------
// API: helplines
// ---------------------------------------------------------------------------
app.get('/api/helplines', (req, res) => {
  fs.readFile(path.join(DATA_DIR, 'helplines.json'), 'utf8', (err, raw) => {
    if (err) {
      console.error('Could not read helplines.json:', err);
      return res.status(500).json({ error: 'Directory unavailable.' });
    }
    res.type('application/json').send(raw);
  });
});

// ---------------------------------------------------------------------------
// API: auth (file-backed demo store)
//
// Roles: 'user' (regular accounts, created through normal registration) and
// 'admin' (administrator accounts). Regular login and registration always use
// role 'user'; an explicit 'admin' flag is only sent via the admin switch on
// the login / register pages.
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+\d\s\-().]{7,20}$/;

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')).map(normalizeUser);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function writeUsers(users) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

// Normalize legacy records that lack the new fields.
function normalizeUser(u) {
  return {
    ...u,
    role: u.role || 'user',
    phone: u.phone || '',
    screeningScore: u.screeningScore !== undefined ? u.screeningScore : null,
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHex) {
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

app.post('/api/register', (req, res) => {
  const { name, email, password, phone, role } = req.body || {};
  const isAdmin = role === 'admin';

  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ field: 'fullname', error: 'Enter your full name.' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ field: 'email', error: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ field: 'password', error: 'Use at least 8 characters.' });
  }
  // Admin registration is opt-in only: the toggle on the login/register
  // pages must be switched to "Admin" to send the admin flag.
  if (isAdmin) {
    if (typeof phone !== 'string' || !PHONE_RE.test(phone.trim())) {
      return res.status(400).json({ field: 'phone', error: 'Enter a valid phone number for administrator accounts.' });
    }
    if (password.length < 12) {
      return res.status(400).json({ field: 'password', error: 'Administrator accounts require at least 12 characters.' });
    }
  }

  const normalized = email.trim().toLowerCase();
  const users = readUsers();
  if (users.some((u) => u.email === normalized)) {
    return res.status(409).json({ field: 'email', error: 'An account with this email already exists. Try logging in.' });
  }

  const { salt, hash } = hashPassword(password);
  users.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalized,
    phone: isAdmin ? phone.trim() : '',
    salt,
    hash,
    role: isAdmin ? 'admin' : 'user',
    screeningScore: null,
    createdAt: new Date().toISOString(),
  });
  writeUsers(users);

  res.status(201).json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { email, password, role: requestedRole } = req.body || {};
  const role = requestedRole === 'admin' ? 'admin' : 'user';
  const GENERIC = 'Email or password is incorrect.';

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: GENERIC });
  }

  const users = readUsers();
  const user = users.find((u) => u.email === email.trim().toLowerCase());
  // Run a hash even for unknown users so response time does not reveal
  // whether an account exists.
  const ok = user
    ? verifyPassword(password, user.salt, user.hash)
    : (hashPassword(password), false);

  if (!ok) return res.status(401).json({ error: GENERIC });

  if (role === 'admin' && user.role !== 'admin') {
    return res.status(403).json({ error: 'This account does not have administrator privileges. Please contact your system administrator.' });
  }

  const token = createSessionToken(user);
  res.json({ ok: true, name: user.name, role: user.role, token });
});

// ---------------------------------------------------------------------------
// API: session
// ---------------------------------------------------------------------------
app.get('/api/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated.' });

  const user = readUsers().find((u) => u.id === session.userId);
  if (!user) {
    activeSessions.delete(session.token);
    return res.status(401).json({ error: 'Session expired.' });
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});

app.post('/api/logout', (req, res) => {
  const session = getSession(req);
  if (session) activeSessions.delete(session.token);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API: assessment submission (auth required)
// ---------------------------------------------------------------------------
app.post('/api/assessment/submit', requireAuth, (req, res) => {
  const { score } = req.body || {};
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 27) {
    return res.status(400).json({ error: 'Invalid score. Must be an integer between 0 and 27.' });
  }

  const users = readUsers();
  const user = users.find((u) => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'User not found.' });

  user.screeningScore = score;
  writeUsers(users);
  res.json({ ok: true, score });
});

// ---------------------------------------------------------------------------
// API: admin (admin only)
//
// Only name, email, phone and the screening summary score are returned.
// Password hashes, tokens and secret fields are never exposed.
// ---------------------------------------------------------------------------
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readUsers();
  res.json(users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    screeningScore: u.screeningScore,
    createdAt: u.createdAt,
  })));
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const users = readUsers();
  const usersWithScores = users.filter((u) => u.screeningScore !== null);
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const avgScore = usersWithScores.length
    ? Math.round((usersWithScores.reduce((s, u) => s + u.screeningScore, 0) / usersWithScores.length) * 10) / 10
    : null;
  const recentSignups = [...users]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map((u) => ({ name: u.name, email: u.email, role: u.role, createdAt: u.createdAt }));

  res.json({ totalUsers: users.length, usersWithScores: usersWithScores.length, adminCount, avgScore, recentSignups });
});

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((req, res) => {
  res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found — Unburden</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#F9F9FB;color:#1A1C1D;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:28rem;padding:2rem}h1{font-family:'Noto Serif',Georgia,serif;font-size:2rem;margin:0 0 .5rem}
a{color:#0D4FB5}</style></head>
<body><main><h1>Page not found</h1>
<p>That page does not exist. Head back to the <a href="/">home page</a>, or if you need help right now, call or text <a href="tel:988">988</a>.</p></main></body></html>`);
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Body-parser and similar middleware attach a 4xx status for client mistakes
  // (malformed JSON, oversized payload). Report those as-is instead of a 500.
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    const message = err.type === 'entity.too.large'
      ? 'That request is too large.'
      : 'The request could not be read. Check the data you sent and try again.';
    return res.status(status).json({ error: message });
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Unburden running at http://localhost:${PORT}`));
}

module.exports = app;
