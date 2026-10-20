'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./db');

const User = require('./models/User');
const Session = require('./models/Session');
const AuditLog = require('./models/AuditLog');
const SupportRequest = require('./models/SupportRequest');
const { hashPassword, verifyPassword } = require('./lib/password');

const countries = require('./data/countries.json');
const COUNTRY_CODES = new Set(countries.map((c) => c.code));

const app = express();
const PORT = process.env.PORT || 3000;
const USER_SESSION_MS = Number(process.env.USER_SESSION_HOURS || 8) * 3600 * 1000;
const ADMIN_SESSION_MS = Number(process.env.ADMIN_SESSION_HOURS || 2) * 3600 * 1000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const PAGES_DIR = path.join(PUBLIC_DIR, 'pages');
const DATA_DIR = path.join(__dirname, 'data');

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "media-src 'self'",
      "connect-src 'self'",
    ].join('; ')
  );
  next();
});

// API responses carry sensitive data: never allow browser or proxy caching
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.static(PUBLIC_DIR, { index: false, extensions: [] }));

// Rate limiting for authentication and registration endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Wrap async handlers so rejected promises reach the error middleware
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// Sessions (stored in MongoDB, token hashed at rest)
// ---------------------------------------------------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const duration = user.role === 'admin' ? ADMIN_SESSION_MS : USER_SESSION_MS;
  await Session.create({
    tokenHash: sha256(token),
    user: user._id,
    role: user.role,
    expiresAt: new Date(Date.now() + duration),
  });
  return token;
}

function bearer(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function getSession(req) {
  const token = bearer(req);
  if (!token) return null;
  const s = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).populate('user');
  if (!s || !s.user) {
    if (s) await Session.deleteOne({ _id: s._id });
    return null;
  }
  return {
    id: String(s.user._id),
    role: s.user.role,
    name: s.user.name,
    email: s.user.email,
    user: s.user,
    tokenHash: s.tokenHash,
  };
}

const requireAuth = wrap(async (req, res, next) => {
  const s = await getSession(req);
  if (!s) return res.status(401).json({ error: 'Authentication required.' });
  req.session = s;
  next();
});

const requireUser = requireAuth;

const requireAdmin = wrap(async (req, res, next) => {
  const s = await getSession(req);
  if (!s) return res.status(401).json({ error: 'Authentication required.' });
  if (s.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  req.session = s;
  next();
});

// ---------------------------------------------------------------------------
// Page routes
// ---------------------------------------------------------------------------
const PAGES = {
  '/': 'index.html',
  '/about-sdg3': 'about-sdg3.html',
  '/resources': 'resources.html',
  '/sounds': 'sounds.html',
  '/assessment': 'assessment.html',
  '/find-support': 'find-support.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/admin': 'admin.html',
};
Object.entries(PAGES).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(PAGES_DIR, file)));
});

// Resource detail pages
app.get('/resources/:slug', (req, res) => res.sendFile(path.join(PAGES_DIR, 'resource-detail.html')));
app.get('/resource', (req, res) => res.sendFile(path.join(PAGES_DIR, 'resource-detail.html')));

// ---------------------------------------------------------------------------
// API: Directory and Reference Data
// ---------------------------------------------------------------------------
app.get('/api/countries', (req, res) => {
  res.json(countries);
});

app.get('/api/resources', (req, res) => {
  fs.readFile(path.join(DATA_DIR, 'resources.json'), 'utf8', (err, raw) => {
    if (err) {
      console.error('Could not read resources.json:', err);
      return res.status(500).json({ error: 'Resources unavailable.' });
    }
    res.type('application/json').send(raw);
  });
});

app.get('/api/resources/:slug', (req, res) => {
  fs.readFile(path.join(DATA_DIR, 'resources.json'), 'utf8', (err, raw) => {
    if (err) {
      console.error('Could not read resources.json:', err);
      return res.status(500).json({ error: 'Resources unavailable.' });
    }
    try {
      const all = JSON.parse(raw);
      const found = all.find((r) => r.slug === req.params.slug);
      if (!found) return res.status(404).json({ error: 'Resource publication not found.' });
      res.json(found);
    } catch (_) {
      res.status(500).json({ error: 'Corrupt resource catalog.' });
    }
  });
});

app.get('/api/helplines', (req, res) => {
  fs.readFile(path.join(DATA_DIR, 'helplines.json'), 'utf8', (err, raw) => {
    if (err) {
      console.error('Could not read helplines.json:', err);
      return res.status(500).json({ error: 'Directory unavailable.' });
    }
    res.type('application/json').send(raw);
  });
});

app.get('/api/sounds', (req, res) => {
  fs.readFile(path.join(DATA_DIR, 'sounds.json'), 'utf8', (err, raw) => {
    if (err) {
      console.error('Could not read sounds.json:', err);
      return res.status(500).json({ error: 'Sound library unavailable.' });
    }
    res.type('application/json').send(raw);
  });
});

// ---------------------------------------------------------------------------
// API: Authentication & Registration
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+[0-9]{8,15}$/;
const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

app.post('/api/register', authLimiter, wrap(async (req, res) => {
  const { name, email, password, phone, age, country, consent } = req.body || {};

  // Strict input validation to prevent NoSQL operator injection and ensure data hygiene
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return res.status(400).json({ field: 'fullname', error: 'Enter your full name (2 to 100 characters).' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.trim().length > 254) {
    return res.status(400).json({ field: 'email', error: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return res.status(400).json({ field: 'password', error: 'Password must be between 8 and 200 characters.' });
  }
  if (typeof phone !== 'string' || !PHONE_RE.test(phone.trim())) {
    return res.status(400).json({ field: 'phone', error: 'Enter phone in international format starting with "+" followed by 8 to 15 digits (e.g. +14155552671).' });
  }

  const ageNum = typeof age === 'number' ? age : (typeof age === 'string' && /^\d+$/.test(age.trim()) ? parseInt(age.trim(), 10) : NaN);
  if (!Number.isInteger(ageNum) || ageNum < 13 || ageNum > 120) {
    return res.status(400).json({ field: 'age', error: 'Enter a valid age between 13 and 120.' });
  }

  if (typeof country !== 'string' || !COUNTRY_CODES.has(country.trim().toUpperCase())) {
    return res.status(400).json({ field: 'country', error: 'Select a valid country from the list.' });
  }

  if (consent !== true) {
    return res.status(400).json({ field: 'consent', error: 'You must provide consent to store your registration details.' });
  }

  const normalized = email.trim().toLowerCase();

  // Application check for duplicate email
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    return res.status(409).json({ field: 'email', error: 'An account with this email already exists. Try logging in.' });
  }

  const { salt, hash } = await hashPassword(password);

  let newUser;
  try {
    // Security guarantee: public registration ALWAYS creates role "user"
    newUser = await User.create({
      name: name.trim(),
      email: normalized,
      phone: phone.trim(),
      age: ageNum,
      country: country.trim().toUpperCase(),
      role: 'user',
      salt,
      hash,
      consentAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ field: 'email', error: 'An account with this email already exists. Try logging in.' });
    }
    throw err;
  }

  const token = await createSession(newUser);
  res.status(201).json({ ok: true, name: newUser.name, role: newUser.role, token });
}));

app.post('/api/login', authLimiter, wrap(async (req, res) => {
  const { email, password, role } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: GENERIC_LOGIN_ERROR });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+salt +hash');
  if (!user) {
    await hashPassword(password);
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }

  const ok = await verifyPassword(password, user.salt, user.hash);
  if (!ok) return res.status(401).json({ error: GENERIC_LOGIN_ERROR });

  // If client specified admin login mode, verify the account is an administrator
  if (role === 'admin' && user.role !== 'admin') {
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }

  const token = await createSession(user);
  res.json({ ok: true, name: user.name, role: user.role, token });
}));

app.get('/api/session', wrap(async (req, res) => {
  const s = await getSession(req);
  if (!s) return res.status(401).json({ error: 'Not authenticated.' });
  res.json({ id: s.id, name: s.name, email: s.email, role: s.role });
}));

app.post('/api/logout', wrap(async (req, res) => {
  const token = bearer(req);
  if (token) await Session.deleteOne({ tokenHash: sha256(token) });
  res.json({ ok: true });
}));

// Delete own account and data (user control & right to erasure)
app.delete('/api/account', requireAuth, wrap(async (req, res) => {
  const userId = req.session.id;
  await Promise.all([
    Session.deleteMany({ user: userId }),
    User.findByIdAndDelete(userId),
  ]);
  res.json({ ok: true, message: 'Account and associated data deleted.' });
}));

// ---------------------------------------------------------------------------
// API: Assessment (stores total score only, no per-question or self-harm answers)
// ---------------------------------------------------------------------------
app.post('/api/assessment/submit', requireUser, wrap(async (req, res) => {
  const { score, type = 'phq9' } = req.body || {};
  if (typeof score !== 'number' || !Number.isInteger(score)) {
    return res.status(400).json({ error: 'Invalid score. Expected an integer.' });
  }

  const updates = {};
  if (type === 'phq9') {
    if (score < 0 || score > 27) return res.status(400).json({ error: 'PHQ-9 score must be between 0 and 27.' });
    updates.screeningScore = score;
  } else if (type === 'gad7') {
    if (score < 0 || score > 21) return res.status(400).json({ error: 'GAD-7 score must be between 0 and 21.' });
    updates.gad7Score = score;
  } else if (type === 'who5') {
    if (score < 0 || score > 25) return res.status(400).json({ error: 'WHO-5 score must be between 0 and 25.' });
    updates.who5Score = score;
  } else {
    return res.status(400).json({ error: 'Unknown assessment type.' });
  }

  await User.findByIdAndUpdate(req.session.id, updates);
  res.json({ ok: true, score, type });
}));

// ---------------------------------------------------------------------------
// API: Support Requests / Helpline Intake
// ---------------------------------------------------------------------------
app.post('/api/support-requests', wrap(async (req, res) => {
  const { name, email, phone, age, country, helplineName, helplineContact, notes } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return res.status(400).json({ field: 'name', error: 'Please enter your full name (2–100 characters).' });
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ field: 'email', error: 'Please enter a valid email address.' });
  }
  if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
    return res.status(400).json({ field: 'phone', error: 'Please enter a valid phone number.' });
  }
  const parsedAge = parseInt(age, 10);
  if (isNaN(parsedAge) || parsedAge < 13 || parsedAge > 120) {
    return res.status(400).json({ field: 'age', error: 'Please enter an age between 13 and 120.' });
  }
  if (!country || typeof country !== 'string' || !country.trim()) {
    return res.status(400).json({ field: 'country', error: 'Please select your country.' });
  }
  if (!helplineName || typeof helplineName !== 'string') {
    return res.status(400).json({ field: 'helplineName', error: 'Helpline identification is required.' });
  }

  let userId = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
    if (session) userId = session.user;
  }

  const record = await SupportRequest.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    age: parsedAge,
    country: country.trim().toUpperCase(),
    helplineName: helplineName.trim(),
    helplineContact: typeof helplineContact === 'string' ? helplineContact.trim() : '',
    notes: typeof notes === 'string' ? notes.trim().slice(0, 500) : '',
    userId,
  });

  res.status(201).json({ ok: true, id: record._id });
}));

// Admin: View Support Requests
app.get('/api/admin/support-requests', requireAdmin, wrap(async (req, res) => {
  let page = parseInt(req.query.page, 10);
  if (isNaN(page) || page < 1) page = 1;

  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  const [total, requests] = await Promise.all([
    SupportRequest.countDocuments(),
    SupportRequest.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    requests: requests.map((r) => ({
      id: String(r._id),
      name: r.name,
      email: r.email,
      phone: r.phone,
      age: r.age,
      country: r.country,
      helplineName: r.helplineName,
      helplineContact: r.helplineContact,
      notes: r.notes || '',
      createdAt: r.createdAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    limit,
  });
}));

// ---------------------------------------------------------------------------
// API: Admin Dashboard & Data Minimisation
// ---------------------------------------------------------------------------

// Helper to escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// User Table: Server-side pagination and search with projection (no phone, age, score or credentials)
app.get('/api/admin/users', requireAdmin, wrap(async (req, res) => {
  let page = parseInt(req.query.page, 10);
  if (isNaN(page) || page < 1) page = 1;

  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  const query = { role: { $ne: 'admin' } };
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const safeQ = escapeRegex(req.query.q.trim());
    query.$or = [
      { name: new RegExp(safeQ, 'i') },
      { email: new RegExp(safeQ, 'i') },
    ];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(query),
    User.find(query)
      .select('name email country createdAt') // Explicit projection: never select phone, age, screeningScore, salt, hash
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    users: users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      country: u.country || '—',
      createdAt: u.createdAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    limit,
  });
}));

// Single user detail reveal (phone and age) on explicit admin request with server logging
app.get('/api/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  const target = await User.findById(req.params.id).select('name email phone age country createdAt');
  if (!target) return res.status(404).json({ error: 'User not found.' });

  // Log the reveal action with admin ID, user ID and timestamp
  const logMessage = `[AUDIT] Sensitive data revealed: Admin ${req.session.id} viewed details for User ${target._id} at ${new Date().toISOString()}`;
  console.log(logMessage);

  await AuditLog.create({
    adminId: req.session.id,
    targetUserId: target._id,
    action: 'VIEW_USER_DETAILS',
    timestamp: new Date(),
  });

  res.json({
    id: String(target._id),
    name: target.name,
    email: target.email,
    phone: target.phone || '—',
    age: target.age !== null ? target.age : '—',
    country: target.country ? (countries.find((c) => c.code === target.country) || { name: target.country }).name : '—',
    createdAt: target.createdAt,
  });
}));

// Admin Aggregate Analytics
app.get('/api/admin/stats', requireAdmin, wrap(async (req, res) => {
  const [totalUsers, totalScreenings, totalSupportRequests, countryAgg, ageAgg, requestAgeAgg, requestCountryAgg] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }),
    User.countDocuments({ screeningScore: { $ne: null } }),
    SupportRequest.countDocuments(),
    User.aggregate([
      { $match: { country: { $ne: null } } },
      { $group: { _id: '$country', count: { $sum: 1 }, ageSum: { $sum: { $ifNull: ['$age', 0] } }, ageN: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$age', null] }, null] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      { $match: { age: { $ne: null } } },
      {
        $bucket: {
          groupBy: '$age',
          boundaries: [13, 18, 25, 35, 45, 55, 121],
          default: 'other',
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    SupportRequest.aggregate([
      { $match: { age: { $ne: null } } },
      {
        $bucket: {
          groupBy: '$age',
          boundaries: [13, 18, 25, 35, 45, 55, 121],
          default: 'other',
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    SupportRequest.aggregate([
      { $match: { country: { $ne: null } } },
      { $group: { _id: '$country', count: { $sum: 1 }, ageSum: { $sum: { $ifNull: ['$age', 0] } }, ageN: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$age', null] }, null] }, 1, 0] } } } },
    ]),
  ]);

  // Country distribution (registered users + support requests)
  const countryTotals = new Map();
  [...countryAgg, ...requestCountryAgg].forEach((item) => {
    const t = countryTotals.get(item._id) || { count: 0, ageSum: 0, ageN: 0 };
    t.count += item.count;
    t.ageSum += item.ageSum || 0;
    t.ageN += item.ageN || 0;
    countryTotals.set(item._id, t);
  });
  const grandTotal = [...countryTotals.values()].reduce((s, t) => s + t.count, 0);
  const countryDistribution = [...countryTotals.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([code, t]) => {
      const matched = countries.find((c) => c.code === code);
      return {
        code,
        name: matched ? matched.name : code,
        count: t.count,
        rawCount: t.count,
        percent: grandTotal ? Math.round((t.count / grandTotal) * 1000) / 10 : 0,
        avgAge: t.ageN ? Math.round((t.ageSum / t.ageN) * 10) / 10 : null,
      };
    });

  // Per-inventory score distributions (PHQ-9, GAD-7, WHO-5)
  const INVENTORY_STATS = {
    phq9: { field: 'screeningScore', name: 'PHQ-9 (Depression)', max: 27, bounds: [0, 5, 10, 15, 20, 28], labels: ['Minimal (0–4)', 'Mild (5–9)', 'Moderate (10–14)', 'Moderately severe (15–19)', 'Severe (20–27)'], colors: ['#6EE7B7', '#2DD4BF', '#FBBF24', '#FB923C', '#F43F5E'] },
    gad7: { field: 'gad7Score', name: 'GAD-7 (Anxiety)', max: 21, bounds: [0, 5, 10, 15, 22], labels: ['Minimal (0–4)', 'Mild (5–9)', 'Moderate (10–14)', 'Severe (15–21)'], colors: ['#6EE7B7', '#2DD4BF', '#FBBF24', '#F43F5E'] },
    who5: { field: 'who5Score', name: 'WHO-5 (Well-Being)', max: 25, bounds: [0, 14, 20, 26], labels: ['Reduced (0–13)', 'Moderate (14–19)', 'High (20–25)'], colors: ['#F43F5E', '#FBBF24', '#6EE7B7'] },
  };
  const assessments = {};
  for (const [id, cfg] of Object.entries(INVENTORY_STATS)) {
    const match = { [cfg.field]: { $ne: null } };
    const [bucketAgg, avgAgg] = await Promise.all([
      User.aggregate([
        { $match: match },
        { $bucket: { groupBy: '$' + cfg.field, boundaries: cfg.bounds, default: 'other', output: { count: { $sum: 1 } } } },
      ]),
      User.aggregate([{ $match: match }, { $group: { _id: null, avg: { $avg: '$' + cfg.field }, n: { $sum: 1 } } }]),
    ]);
    assessments[id] = {
      name: cfg.name,
      max: cfg.max,
      total: avgAgg.length ? avgAgg[0].n : 0,
      avgScore: avgAgg.length ? Math.round(avgAgg[0].avg * 10) / 10 : null,
      bands: cfg.labels.map((label, i) => {
        const b = bucketAgg.find((x) => x._id === cfg.bounds[i]);
        const count = b ? b.count : 0;
        return {
          band: label,
          color: cfg.colors[i],
          min: cfg.bounds[i],
          max: cfg.bounds[i + 1] - 1,
          count,
          rawCount: count,
        };
      }),
    };
  }

  // Derive PHQ-9 severity distribution directly from assessments to avoid duplicate DB query
  const bandKeys = ['minimal', 'mild', 'moderate', 'moderately_severe', 'severe'];
  const severityDistribution = assessments.phq9 ? assessments.phq9.bands.map((b, i) => ({
    band: b.band,
    key: bandKeys[i],
    count: b.count,
    rawCount: b.rawCount,
  })) : [];
  const avgScore = assessments.phq9 ? assessments.phq9.avgScore : null;

  // Age band distribution
  const ageLabels = {
    13: 'Under 18',
    18: '18 to 24',
    25: '25 to 34',
    35: '35 to 44',
    45: '45 to 54',
    55: '55 and over',
  };

  const ageDistribution = [13, 18, 25, 35, 45, 55].map((boundary) => {
    // Registered users plus people who submitted a support request (age is required there)
    const fromUsers = ageAgg.find((b) => b._id === boundary);
    const fromRequests = requestAgeAgg.find((b) => b._id === boundary);
    const count = (fromUsers ? fromUsers.count : 0) + (fromRequests ? fromRequests.count : 0);
    return {
      band: ageLabels[boundary],
      count,
      rawCount: count,
    };
  });

  res.json({
    totalUsers,
    totalScreenings,
    totalSupportRequests,
    avgScore,
    severityDistribution,
    countryDistribution,
    assessments,
    ageDistribution,
  });
}));

// ---------------------------------------------------------------------------
// Fallbacks & Error Handlers
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  await connectDB();
  await Promise.all([User.init(), Session.init(), AuditLog.init()]);
  app.listen(PORT, () => console.log(`Unburden running at http://localhost:${PORT}`));
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = app;