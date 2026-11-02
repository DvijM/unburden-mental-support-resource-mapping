'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { connectDB } = require('./db');
const { ensureSeeded } = require('./lib/seed');
const { hashPassword, verifyPassword } = require('./lib/password');

const User = require('./models/User');
const Session = require('./models/Session');
const AuditLog = require('./models/AuditLog');
const SupportRequest = require('./models/SupportRequest');
const Assessment = require('./models/Assessment');
const MoodCheckin = require('./models/MoodCheckin');
const Consent = require('./models/Consent');
const ShareGrant = require('./models/ShareGrant');
const AdminApplication = require('./models/AdminApplication');
const Content = require('./models/Content');
const ContentStat = require('./models/ContentStat');
const ActivityEvent = require('./models/ActivityEvent');
const Helpline = require('./models/Helpline');

const countries = require('./data/countries.json');
const resourcesFallback = require('./data/resources.json');
const soundsFallback = require('./data/sounds.json');
const COUNTRY_CODES = new Set(countries.map((c) => c.code));

const app = express();
const PORT = process.env.PORT || 3000;
const USER_SESSION_MS = Number(process.env.USER_SESSION_HOURS || 8) * 3600 * 1000;
const ADMIN_SESSION_MS = Number(process.env.ADMIN_SESSION_HOURS || 2) * 3600 * 1000;
const IS_PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

const PUBLIC_DIR = path.join(__dirname, 'public');
const PAGES_DIR = path.join(PUBLIC_DIR, 'pages');
const DATA_DIR = path.join(__dirname, 'data');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

// ---------------------------------------------------------------------------
// Security Headers & Content Security Policy (No CDN runtime or unsafe-eval)
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data:",
      "media-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  next();
});

// Block direct access to raw HTML templates under /pages/* so auth/routing rules aren't bypassed
app.use('/pages', (req, res) => {
  res.status(404).json({ error: 'Direct template access is disabled. Use canonical application routes.' });
});

// API responses carry sensitive data: never allow browser or proxy caching
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Serverless-compatible database readiness middleware for API routes
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use(
  '/api',
  wrap(async (req, res, next) => {
    if (req.path === '/health' || req.path === '/countries') return next();
    try {
      await connectDB();
      await ensureSeeded();
      next();
    } catch (err) {
      console.error('Database connection error:', err.message);
      res.status(503).json({ error: 'Database service is temporarily unavailable. Please try again shortly.' });
    }
  })
);

app.use(express.static(PUBLIC_DIR, { index: false, extensions: [] }));

// ---------------------------------------------------------------------------
// MongoDB-Backed Rate Limiter (Serverless Shared Store)
// ---------------------------------------------------------------------------
const rateLimitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    points: { type: Number, default: 1 },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'rate_limits' }
);
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const RateLimit = mongoose.models.RateLimit || mongoose.model('RateLimit', rateLimitSchema);

function createMongoLimiter({ windowMs = 15 * 60 * 1000, max = 15, prefix = 'rl' } = {}) {
  return wrap(async (req, res, next) => {
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-enforce-ratelimit'] !== '1') {
      return next();
    }
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `${prefix}:${ip}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowMs);

    try {
      const doc = await RateLimit.findOneAndUpdate(
        { key, expiresAt: { $gt: now } },
        { $inc: { points: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true }
      );
      if (doc.points > max) {
        return res.status(429).json({
          error: 'Too many attempts. Please wait a few minutes and try again.',
        });
      }
    } catch (err) {
      if (err.code === 11000) {
        await RateLimit.updateOne({ key }, { $set: { points: 1, expiresAt } });
      }
    }
    next();
  });
}

const authLimiter = createMongoLimiter({ windowMs: 15 * 60 * 1000, max: 12, prefix: 'auth' });
const registerLimiter = createMongoLimiter({ windowMs: 15 * 60 * 1000, max: 10, prefix: 'reg' });

// ---------------------------------------------------------------------------
// Cookie & Session Utilities (HTTP-Only Cookie + Legacy Bearer Compatibility)
// ---------------------------------------------------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch (_) {
        out[k] = v;
      }
    }
  });
  return out;
}

function setSessionCookies(res, token, csrfToken, durationMs) {
  const maxAge = Math.floor(durationMs / 1000);
  const secureFlag = IS_PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `unburden_sid=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureFlag}`,
    `unburden_csrf=${encodeURIComponent(csrfToken)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`,
  ]);
}

function clearSessionCookies(res) {
  const secureFlag = IS_PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `unburden_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag}`,
    `unburden_csrf=; Path=/; Max-Age=0; SameSite=Lax${secureFlag}`,
  ]);
}

function isPrivilegedRole(role) {
  return ['super_admin', 'admin', 'responder', 'analyst', 'content_editor'].includes(role);
}

function normalizeRole(role) {
  return role === 'admin' ? 'super_admin' : role;
}

async function createSession(res, user, remember = false) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const baseDuration = isPrivilegedRole(user.role) ? ADMIN_SESSION_MS : USER_SESSION_MS;
  const duration = remember && !isPrivilegedRole(user.role) ? baseDuration * 3 : baseDuration;

  await Session.create({
    tokenHash: sha256(token),
    csrfToken,
    user: user._id,
    role: user.role,
    expiresAt: new Date(Date.now() + duration),
  });

  if (res) {
    setSessionCookies(res, token, csrfToken, duration);
  }
  return { token, csrfToken };
}

function extractToken(req) {
  const cookies = parseCookies(req);
  if (cookies.unburden_sid) return { token: cookies.unburden_sid, viaCookie: true, cookies };
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return { token: auth.slice(7).trim(), viaCookie: false, cookies };
  return { token: null, viaCookie: false, cookies };
}

async function getSession(req) {
  const { token, viaCookie, cookies } = extractToken(req);
  if (!token) return null;
  const s = await Session.findOne({
    tokenHash: sha256(token),
    expiresAt: { $gt: new Date() },
  }).populate('user');

  if (!s || !s.user || s.user.accountStatus === 'suspended' || s.user.accountStatus === 'deleted') {
    if (s) await Session.deleteOne({ _id: s._id });
    return null;
  }

  // CSRF validation for state-changing requests authenticated via cookie
  const unsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (viaCookie && unsafeMethod) {
    const csrfHeader = req.headers['x-csrf-token'];
    const origin = req.headers.origin || '';
    const host = req.headers.host || '';
    if (origin && host && !origin.includes(host)) {
      return null;
    }
    if (cookies.unburden_csrf && csrfHeader && csrfHeader !== s.csrfToken) {
      return null;
    }
  }

  return {
    id: String(s.user._id),
    role: normalizeRole(s.user.role),
    rawRole: s.user.role,
    name: s.user.name,
    email: s.user.email,
    country: s.user.country,
    user: s.user,
    tokenHash: s.tokenHash,
    csrfToken: s.csrfToken,
  };
}

const requireAuth = wrap(async (req, res, next) => {
  const s = await getSession(req);
  if (!s) return res.status(401).json({ error: 'Authentication required.' });
  req.session = s;
  next();
});

const requireUser = requireAuth;

function requireRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles);
  return wrap(async (req, res, next) => {
    const s = await getSession(req);
    if (!s) return res.status(401).json({ error: 'Authentication required.' });
    const effectiveRole = normalizeRole(s.role);
    if (!allowed.has(effectiveRole)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    req.session = s;
    next();
  });
}

const requireSuperAdmin = requireRoles('super_admin');
const requireAdminOrAnalyst = requireRoles('super_admin', 'analyst', 'content_editor');
const requireResponder = requireRoles('responder');

// ---------------------------------------------------------------------------
// Consent Disclosures Registry
// ---------------------------------------------------------------------------
const CONSENT_DISCLOSURES = {
  account:
    'Required to maintain your user account, authenticate your sessions, and manage your security settings.',
  assessment_storage:
    'Allows Unburden to store your completed PHQ-9, GAD-7, and WHO-5 assessment scores and responses in your personal longitudinal history.',
  mood_tracking:
    'Allows Unburden to save your optional mood check-in ratings (1–5) and personal notes over time.',
  activity_history:
    'Allows Unburden to record your personal activity timeline (such as articles read and soundtracks played) on your private dashboard.',
  responder_sharing:
    'Enables you to explicitly nominate and grant time-limited data access to approved support responders.',
  research_analytics:
    'Allows your de-identified, aggregated demographic and screening metrics to be included in platform-wide public health statistics.',
};

async function recordConsent(userId, category, granted, policyVersion = '2.0') {
  const status = granted ? 'granted' : 'revoked';
  const doc = await Consent.create({
    user: userId,
    category,
    status,
    policyVersion,
    disclosureText: CONSENT_DISCLOSURES[category] || 'User consent preference recorded.',
    grantedAt: granted ? new Date() : null,
    revokedAt: granted ? null : new Date(),
    timestamp: new Date(),
  });
  return doc;
}

// ---------------------------------------------------------------------------
// Page Routes
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
  '/admin-apply': 'admin-apply.html',
  '/dashboard': 'dashboard.html',
  '/responder': 'responder.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
};

Object.entries(PAGES).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(PAGES_DIR, file)));
});

app.get('/resources/:slug', (req, res) => res.sendFile(path.join(PAGES_DIR, 'resource-detail.html')));
app.get('/resource', (req, res) => res.sendFile(path.join(PAGES_DIR, 'resource-detail.html')));

// ---------------------------------------------------------------------------
// API: Health Check & Reference Data
// ---------------------------------------------------------------------------
app.get(
  '/api/health',
  wrap(async (req, res) => {
    let dbState = mongoose.connection.readyState;
    if (dbState !== 1) {
      try {
        await connectDB();
        dbState = mongoose.connection.readyState;
      } catch (_) {
        dbState = 0;
      }
    }
    const healthy = dbState === 1;
    if (healthy) {
      await ensureSeeded();
    }
    res.status(healthy ? 200 : 503).json({
      ok: healthy,
      status: healthy ? 'healthy' : 'degraded',
      database: healthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  })
);

app.get('/api/countries', (req, res) => {
  res.json(countries);
});

// Resources (served from MongoDB Content collection with fallback to JSON)
app.get(
  '/api/resources',
  wrap(async (req, res) => {
    const docs = await Content.find({ kind: 'resource', published: true }).sort({ createdAt: 1 }).lean();
    if (docs.length > 0) {
      return res.json(
        docs.map((d) => ({
          slug: d.slug,
          category: d.category,
          categoryLabel: d.categoryLabel,
          badge: d.badge,
          format: d.format,
          readTime: d.readTime,
          title: d.title,
          author: d.author,
          institution: d.institution,
          citation: d.citation,
          summary: d.summary,
          takeaways: d.takeaways,
          sections: d.sections,
        }))
      );
    }
    return res.json(resourcesFallback);
  })
);

app.get(
  '/api/resources/:slug',
  wrap(async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const found = await Content.findOne({ kind: 'resource', slug, published: true }).lean();
    if (!found) {
      return res.status(404).json({ error: 'Resource publication not found.' });
    }
    res.json({
      slug: found.slug,
      category: found.category,
      categoryLabel: found.categoryLabel,
      badge: found.badge,
      format: found.format,
      readTime: found.readTime,
      title: found.title,
      author: found.author,
      institution: found.institution,
      citation: found.citation,
      summary: found.summary,
      takeaways: found.takeaways,
      sections: found.sections,
    });
  })
);

// Helplines Directory (served from MongoDB Helpline collection)
function formatHelplineDoc(h) {
  return {
    id: h.helplineId,
    organisationName: h.organisationName,
    name: h.organisationName,
    countryName: h.countryName,
    countryCode: h.countryCode,
    badge: h.badge,
    designation: h.designation,
    categories: h.categories,
    regions: h.regions,
    phone: h.phone,
    smsAvailable: h.smsAvailable,
    smsDetails: h.smsDetails,
    website: h.website,
    languages: h.languages,
    operatingHours: h.operatingHours,
    eligibility: h.eligibility,
    description: h.description,
    sourceUrl: h.sourceUrl,
    lastVerifiedAt: h.lastVerifiedAt,
    verificationStatus: h.verificationStatus,
    channels: h.channels,
    primary: h.primaryAction,
    secondary: h.secondaryAction,
  };
}

app.get(
  '/api/helplines',
  wrap(async (req, res) => {
    const query = {};
    if (typeof req.query.country === 'string' && req.query.country.trim()) {
      const code = req.query.country.trim().toUpperCase();
      if (code !== 'ALL') {
        query.$or = [{ countryCode: code }, { countryCode: 'GLOBAL' }, { regions: code.toLowerCase() }];
      }
    }
    const docs = await Helpline.find(query).sort({ countryCode: 1, organisationName: 1 }).lean();
    res.json(docs.map(formatHelplineDoc));
  })
);

// Report incorrect helpline information
app.post(
  '/api/helplines/:id/report',
  wrap(async (req, res) => {
    const { reason, details } = req.body || {};
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 200) {
      return res.status(400).json({ error: 'Please provide a brief reason for the report (3–200 characters).' });
    }
    const h = await Helpline.findOne({ helplineId: String(req.params.id) });
    if (!h) return res.status(404).json({ error: 'Helpline entry not found.' });

    h.issueReports.push({
      reason: reason.trim(),
      details: typeof details === 'string' ? details.trim().slice(0, 500) : '',
      reportedAt: new Date(),
    });
    h.verificationStatus = 'reported_issue';
    await h.save();

    await AuditLog.create({
      actorRole: 'public',
      dataCategory: 'helpline',
      action: 'REPORT_HELPLINE_ISSUE',
      details: `Reported issue on helpline ${h.helplineId}: ${reason.trim().slice(0, 120)}`,
    });

    res.status(201).json({ ok: true, message: 'Thank you. This listing has been flagged for administrator verification.' });
  })
);

// Sounds (served from MongoDB Content collection)
app.get(
  '/api/sounds',
  wrap(async (req, res) => {
    const docs = await Content.find({ kind: 'soundtrack', published: true }).sort({ createdAt: 1 }).lean();
    if (docs.length > 0) {
      return res.json(
        docs.map((s) => ({
          id: s.itemId,
          name: s.title,
          category: s.category,
          categoryLabel: s.categoryLabel,
          description: s.summary,
          file: s.file,
          defaultVolume: s.defaultVolume,
          palette: s.palette,
          accent: s.accent,
        }))
      );
    }
    return res.json(soundsFallback);
  })
);

// ---------------------------------------------------------------------------
// API: Authentication, Registration & Account Management
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+[0-9]{8,15}$/;
const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

app.post(
  '/api/register',
  registerLimiter,
  wrap(async (req, res) => {
    const {
      name,
      email,
      password,
      phone,
      age,
      country,
      consent,
      optionalConsents = {},
    } = req.body || {};

    // Strict server-side validation: role in req.body is completely ignored (never trusted)
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ field: 'fullname', error: 'Enter your full name (2 to 100 characters).' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.trim().length > 254) {
      return res.status(400).json({ field: 'email', error: 'Enter a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return res.status(400).json({ field: 'password', error: 'Password must be between 8 and 200 characters.' });
    }

    let normalizedPhone = null;
    if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
      if (typeof phone !== 'string' || !PHONE_RE.test(phone.trim())) {
        return res.status(400).json({
          field: 'phone',
          error: 'Enter phone in international format starting with "+" followed by 8 to 15 digits (e.g. +14155552671).',
        });
      }
      normalizedPhone = phone.trim();
    }

    let ageNum = null;
    if (age !== undefined && age !== null && String(age).trim() !== '') {
      ageNum =
        typeof age === 'number'
          ? age
          : typeof age === 'string' && /^\d+$/.test(age.trim())
            ? parseInt(age.trim(), 10)
            : NaN;
      if (!Number.isInteger(ageNum) || ageNum < 13 || ageNum > 120) {
        return res.status(400).json({ field: 'age', error: 'Enter a valid age between 13 and 120.' });
      }
    }

    let normalizedCountry = null;
    if (country !== undefined && country !== null && String(country).trim() !== '') {
      if (typeof country !== 'string' || !COUNTRY_CODES.has(country.trim().toUpperCase())) {
        return res.status(400).json({ field: 'country', error: 'Select a valid country from the list.' });
      }
      normalizedCountry = country.trim().toUpperCase();
    }

    if (consent !== true) {
      return res.status(400).json({
        field: 'consent',
        error: 'You must provide consent to create an account.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        field: 'email',
        error: 'An account with this email already exists. Try logging in.',
      });
    }

    const { salt, hash } = await hashPassword(password);

    const consentSummary = {
      account: true,
      assessment_storage: Boolean(optionalConsents && optionalConsents.assessment_storage),
      mood_tracking: Boolean(optionalConsents && optionalConsents.mood_tracking),
      activity_history: Boolean(optionalConsents && optionalConsents.activity_history),
      responder_sharing: Boolean(optionalConsents && optionalConsents.responder_sharing),
      research_analytics: Boolean(optionalConsents && optionalConsents.research_analytics),
    };

    let newUser;
    try {
      // Security guarantee: public registration ALWAYS creates role "user"
      newUser = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        age: ageNum,
        country: normalizedCountry,
        role: 'user',
        accountStatus: 'active',
        salt,
        hash,
        consentSummary,
        consentAt: new Date(),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          field: 'email',
          error: 'An account with this email already exists. Try logging in.',
        });
      }
      throw err;
    }

    // Record granular consent entries
    await recordConsent(newUser._id, 'account', true);
    for (const cat of ['assessment_storage', 'mood_tracking', 'activity_history', 'responder_sharing', 'research_analytics']) {
      if (consentSummary[cat]) {
        await recordConsent(newUser._id, cat, true);
      }
    }

    const { token, csrfToken } = await createSession(res, newUser);
    res.status(201).json({
      ok: true,
      name: newUser.name,
      role: newUser.role,
      token,
      csrfToken,
    });
  })
);

app.post(
  '/api/login',
  authLimiter,
  wrap(async (req, res) => {
    const { email, password, remember } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: GENERIC_LOGIN_ERROR });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+salt +hash');
    if (!user || user.accountStatus === 'suspended' || user.accountStatus === 'deleted') {
      await hashPassword(password);
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const ok = await verifyPassword(password, user.salt, user.hash);
    if (!ok) return res.status(401).json({ error: GENERIC_LOGIN_ERROR });

    user.lastLoginAt = new Date();
    await user.save();

    const { token, csrfToken } = await createSession(res, user, Boolean(remember));
    res.json({
      ok: true,
      name: user.name,
      role: normalizeRole(user.role),
      token,
      csrfToken,
    });
  })
);

app.get(
  '/api/session',
  wrap(async (req, res) => {
    const s = await getSession(req);
    if (!s) return res.status(401).json({ error: 'Not authenticated.' });
    res.json({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      country: s.country,
      consentSummary: s.user.consentSummary,
      csrfToken: s.csrfToken,
    });
  })
);

app.post(
  '/api/logout',
  wrap(async (req, res) => {
    const { token } = extractToken(req);
    if (token) await Session.deleteOne({ tokenHash: sha256(token) });
    clearSessionCookies(res);
    res.json({ ok: true });
  })
);

// Change password (authenticated user)
app.post(
  '/api/password/change',
  requireAuth,
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
      return res.status(400).json({ error: 'New password must be between 8 and 200 characters.' });
    }
    const user = await User.findById(req.session.id).select('+salt +hash');
    if (!user) return res.status(404).json({ error: 'Account not found.' });

    const ok = await verifyPassword(currentPassword, user.salt, user.hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

    const { salt, hash } = await hashPassword(newPassword);
    user.salt = salt;
    user.hash = hash;
    await user.save();

    await AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      targetUserId: user._id,
      dataCategory: 'account_status',
      action: 'PASSWORD_CHANGED',
    });

    res.json({ ok: true, message: 'Password updated successfully.' });
  })
);

// Request password reset token
app.post(
  '/api/password/request-reset',
  authLimiter,
  wrap(async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+resetTokenHash +resetTokenExpiresAt');
    let devResetToken = undefined;
    if (user && user.accountStatus === 'active') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = sha256(rawToken);
      user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await user.save();
      if (!process.env.EMAIL_PROVIDER_API_KEY && process.env.NODE_ENV !== 'production') {
        devResetToken = rawToken;
      }
    }
    res.json({
      ok: true,
      emailConfigured: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
      message: process.env.EMAIL_PROVIDER_API_KEY
        ? 'If an account matches that email, a password reset link has been sent.'
        : 'Password reset token generated. Note: An external email provider is not configured on this deployment.',
      ...(devResetToken && { resetToken: devResetToken }),
    });
  })
);

// Complete password reset with single-use token
app.post(
  '/api/password/reset',
  authLimiter,
  wrap(async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (typeof token !== 'string' || !token.trim() || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
      return res.status(400).json({ error: 'Valid reset token and a password of at least 8 characters are required.' });
    }
    const tokenHash = sha256(token.trim());
    const user = await User.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { $gt: new Date() },
    }).select('+salt +hash +resetTokenHash +resetTokenExpiresAt');

    if (!user) {
      return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
    }

    const { salt, hash } = await hashPassword(newPassword);
    user.salt = salt;
    user.hash = hash;
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    await user.save();
    await Session.deleteMany({ user: user._id });

    res.json({ ok: true, message: 'Your password has been reset. You may now log in.' });
  })
);

// ---------------------------------------------------------------------------
// API: Privacy, Granular Consent, Data Export & Delete My Data
// ---------------------------------------------------------------------------
app.get(
  '/api/consents',
  requireAuth,
  wrap(async (req, res) => {
    const [user, history] = await Promise.all([
      User.findById(req.session.id).select('consentSummary consentPolicyVersion consentAt').lean(),
      Consent.find({ user: req.session.id }).sort({ timestamp: -1 }).limit(50).lean(),
    ]);
    res.json({
      summary: user ? user.consentSummary : {},
      policyVersion: (user && user.consentPolicyVersion) || '2.0',
      disclosures: CONSENT_DISCLOSURES,
      history: history.map((c) => ({
        id: String(c._id),
        category: c.category,
        status: c.status,
        policyVersion: c.policyVersion,
        disclosureText: c.disclosureText,
        timestamp: c.timestamp,
        revokedAt: c.revokedAt,
      })),
    });
  })
);

app.post(
  '/api/consents',
  requireAuth,
  wrap(async (req, res) => {
    const { category, granted } = req.body || {};
    const validCategories = ['assessment_storage', 'mood_tracking', 'activity_history', 'responder_sharing', 'research_analytics'];
    if (!validCategories.includes(category) || typeof granted !== 'boolean') {
      return res.status(400).json({ error: 'Invalid consent category or status.' });
    }

    const user = await User.findById(req.session.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.consentSummary = user.consentSummary || {};
    user.consentSummary[category] = granted;
    await user.save();

    const consentDoc = await recordConsent(user._id, category, granted);

    // If responder_sharing consent is revoked, immediately revoke all active share grants
    if (category === 'responder_sharing' && !granted) {
      await ShareGrant.updateMany(
        { user: user._id, status: 'active' },
        { $set: { status: 'revoked', revokedAt: new Date() } }
      );
    }

    await AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      targetUserId: user._id,
      dataCategory: 'consent',
      action: granted ? `CONSENT_GRANTED_${category.toUpperCase()}` : `CONSENT_REVOKED_${category.toUpperCase()}`,
    });

    res.json({
      ok: true,
      category,
      granted,
      consentId: String(consentDoc._id),
      summary: user.consentSummary,
    });
  })
);

// Export all personal data (JSON download)
app.get(
  '/api/account/export',
  requireAuth,
  wrap(async (req, res) => {
    const userId = req.session.id;
    const [user, assessments, moods, consents, grants, activities, accessLogs] = await Promise.all([
      User.findById(userId).lean(),
      Assessment.find({ user: userId }).sort({ completedAt: -1 }).lean(),
      MoodCheckin.find({ user: userId }).sort({ timestamp: -1 }).lean(),
      Consent.find({ user: userId }).sort({ timestamp: -1 }).lean(),
      ShareGrant.find({ user: userId }).populate('responder', 'name email organisation designation').lean(),
      ActivityEvent.find({ user: userId }).sort({ timestamp: -1 }).lean(),
      AuditLog.find({ targetUserId: userId }).populate('actorId', 'name email role').sort({ timestamp: -1 }).lean(),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found.' });

    const payload = {
      exportedAt: new Date().toISOString(),
      platform: 'Unburden — Mental Health Support & Resource Mapping Platform',
      profile: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        age: user.age,
        country: user.country,
        preferredLanguage: user.preferredLanguage,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        consentSummary: user.consentSummary,
      },
      assessments: assessments.map((a) => ({
        id: String(a._id),
        type: a.type,
        responses: a.responses,
        functionalImpairment: a.functionalImpairment,
        totalScore: a.totalScore,
        severityCategory: a.severityCategory,
        item9Positive: a.item9Positive,
        assessmentVersion: a.assessmentVersion,
        completedAt: a.completedAt,
      })),
      moodCheckins: moods.map((m) => ({
        id: String(m._id),
        rating: m.rating,
        label: m.label,
        note: m.note,
        timestamp: m.timestamp,
      })),
      consents: consents.map((c) => ({
        category: c.category,
        status: c.status,
        policyVersion: c.policyVersion,
        disclosureText: c.disclosureText,
        timestamp: c.timestamp,
        revokedAt: c.revokedAt,
      })),
      sharingPermissions: grants.map((g) => ({
        id: String(g._id),
        responder: g.responder ? { name: g.responder.name, email: g.responder.email, organisation: g.responder.organisation } : null,
        status: g.status,
        categories: g.categories,
        expiresAt: g.expiresAt,
        revokedAt: g.revokedAt,
        lastAccessedAt: g.lastAccessedAt,
      })),
      activityHistory: activities.map((ev) => ({
        eventType: ev.eventType,
        itemId: ev.itemId,
        itemTitle: ev.itemTitle,
        timestamp: ev.timestamp,
      })),
      accessAuditLog: accessLogs.map((l) => ({
        actor: l.actorId ? `${l.actorId.name} (${l.actorId.role})` : l.actorRole,
        dataCategory: l.dataCategory,
        action: l.action,
        timestamp: l.timestamp,
      })),
    };

    res.setHeader('Content-Disposition', 'attachment; filename="unburden-personal-data-export.json"');
    res.json(payload);
  })
);

// Delete My Data (Comprehensive Erasure + Audit Anonymization)
app.delete(
  '/api/account',
  requireAuth,
  wrap(async (req, res) => {
    const { confirm } = req.body || {};
    // Accept either explicit confirm===true or DELETE call for backwards compatibility with existing UI
    if (confirm === false) {
      return res.status(400).json({ error: 'Confirmation is required to delete your account.' });
    }
    const userId = req.session.id;

    await Promise.all([
      Session.deleteMany({ user: userId }),
      Assessment.deleteMany({ user: userId }),
      MoodCheckin.deleteMany({ user: userId }),
      Consent.deleteMany({ user: userId }),
      ActivityEvent.deleteMany({ user: userId }),
      ShareGrant.deleteMany({ $or: [{ user: userId }, { responder: userId }] }),
      SupportRequest.deleteMany({ userId }),
      AuditLog.updateMany(
        { $or: [{ targetUserId: userId }, { actorId: userId }, { adminId: userId }] },
        {
          $set: {
            targetUserId: null,
            actorId: null,
            adminId: null,
            details: 'Personal reference anonymized following user erasure request.',
            anonymized: true,
          },
        }
      ),
      User.findByIdAndDelete(userId),
    ]);

    clearSessionCookies(res);
    res.json({
      ok: true,
      message:
        'Your account, assessments, mood records, activity history, and sharing grants have been permanently deleted from the active database. Encrypted database backups are automatically purged on a rolling 30-day retention cycle.',
    });
  })
);

// ---------------------------------------------------------------------------
// API: PHQ-9 / GAD-7 / WHO-5 Assessments (Server-Side Scoring & Consent Enforcement)
// ---------------------------------------------------------------------------
function computeAssessmentSeverity(type, total) {
  if (type === 'phq9') {
    if (total <= 4) return 'Minimal';
    if (total <= 9) return 'Mild';
    if (total <= 14) return 'Moderate';
    if (total <= 19) return 'Moderately severe';
    return 'Severe';
  }
  if (type === 'gad7') {
    if (total <= 4) return 'Minimal';
    if (total <= 9) return 'Mild';
    if (total <= 14) return 'Moderate';
    return 'Severe';
  }
  if (type === 'who5') {
    if (total <= 13) return 'Reduced well-being';
    if (total <= 19) return 'Moderate well-being';
    return 'High well-being';
  }
  return 'Unknown';
}

app.post(
  '/api/assessment/submit',
  requireUser,
  wrap(async (req, res) => {
    const {
      type = 'phq9',
      responses,
      score,
      functionalImpairment = 'not_applicable',
      storeConsent,
    } = req.body || {};

    if (!['phq9', 'gad7', 'who5'].includes(type)) {
      return res.status(400).json({ error: 'Unknown assessment type.' });
    }

    const expectedLen = type === 'phq9' ? 9 : type === 'gad7' ? 7 : 5;
    const maxOption = type === 'who5' ? 5 : 3;
    const maxScore = type === 'phq9' ? 27 : type === 'gad7' ? 21 : 25;

    let validatedResponses = [];
    let totalScore = 0;

    if (Array.isArray(responses)) {
      if (responses.length !== expectedLen) {
        return res.status(400).json({ error: `${type.toUpperCase()} requires ${expectedLen} question responses.` });
      }
      for (const r of responses) {
        if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r > maxOption) {
          return res.status(400).json({ error: `Each response must be an integer between 0 and ${maxOption}.` });
        }
        totalScore += r;
      }
      validatedResponses = responses;
    } else if (typeof score === 'number' && Number.isInteger(score)) {
      if (score < 0 || score > maxScore) {
        return res.status(400).json({ error: `${type.toUpperCase()} score must be between 0 and ${maxScore}.` });
      }
      totalScore = score;
      validatedResponses = [];
    } else {
      return res.status(400).json({ error: 'Valid question responses or integer score required.' });
    }

    const severityCategory = computeAssessmentSeverity(type, totalScore);
    const item9Positive = type === 'phq9' && validatedResponses.length === 9 ? validatedResponses[8] > 0 : false;

    const user = await User.findById(req.session.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // If user explicitly passed storeConsent=true during submission, grant assessment_storage consent
    if (storeConsent === true && (!user.consentSummary || !user.consentSummary.assessment_storage)) {
      user.consentSummary = user.consentSummary || {};
      user.consentSummary.assessment_storage = true;
      await recordConsent(user._id, 'assessment_storage', true);
    }

    const hasStorageConsent = Boolean(user.consentSummary && user.consentSummary.assessment_storage);
    if (!hasStorageConsent) {
      return res.status(403).json({
        error: 'Assessment storage requires your explicit opt-in consent. Enable "Assessment Result Storage" on this page or in your Privacy Dashboard to save your history.',
        requiresConsent: 'assessment_storage',
        score: totalScore,
        severityCategory,
        item9Positive,
        saved: false,
      });
    }

    const latestConsent = await Consent.findOne({
      user: user._id,
      category: 'assessment_storage',
      status: 'granted',
    }).sort({ timestamp: -1 });

    const validImpairment = ['not_difficult', 'somewhat_difficult', 'very_difficult', 'extremely_difficult', 'not_applicable'].includes(
      functionalImpairment
    )
      ? functionalImpairment
      : 'not_applicable';

    const record = await Assessment.create({
      user: user._id,
      type,
      responses: validatedResponses,
      functionalImpairment: validImpairment,
      totalScore,
      severityCategory,
      item9Positive,
      consentRef: latestConsent ? latestConsent._id : null,
      completedAt: new Date(),
    });

    if (type === 'phq9') user.screeningScore = totalScore;
    else if (type === 'gad7') user.gad7Score = totalScore;
    else if (type === 'who5') user.who5Score = totalScore;
    await user.save();

    if (user.consentSummary && user.consentSummary.activity_history) {
      await ActivityEvent.create({
        user: user._id,
        eventType: 'assessment_completed',
        itemId: type,
        itemTitle: `${type.toUpperCase()} Assessment (${severityCategory})`,
      });
    }

    res.json({
      ok: true,
      saved: true,
      id: String(record._id),
      score: totalScore,
      type,
      severityCategory,
      item9Positive,
      completedAt: record.completedAt,
    });
  })
);

app.get(
  '/api/assessments/my',
  requireUser,
  wrap(async (req, res) => {
    const records = await Assessment.find({ user: req.session.id }).sort({ completedAt: -1 }).limit(50).lean();
    res.json({
      assessments: records.map((a) => ({
        id: String(a._id),
        type: a.type,
        totalScore: a.totalScore,
        severityCategory: a.severityCategory,
        functionalImpairment: a.functionalImpairment,
        item9Positive: a.item9Positive,
        completedAt: a.completedAt,
      })),
    });
  })
);

app.delete(
  '/api/assessments/:id',
  requireUser,
  wrap(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid assessment ID.' });
    }
    const deleted = await Assessment.findOneAndDelete({
      _id: req.params.id,
      user: req.session.id,
    });
    if (!deleted) return res.status(404).json({ error: 'Assessment record not found.' });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// API: Mood Check-Ins (Requires mood_tracking consent)
// ---------------------------------------------------------------------------
const MOOD_LABELS = {
  1: 'Very low',
  2: 'Low',
  3: 'Neutral',
  4: 'Good',
  5: 'Very good',
};

app.post(
  '/api/mood',
  requireUser,
  wrap(async (req, res) => {
    const { rating, note = '', storeConsent } = req.body || {};
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Mood rating must be an integer between 1 and 5.' });
    }

    const user = await User.findById(req.session.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (storeConsent === true && (!user.consentSummary || !user.consentSummary.mood_tracking)) {
      user.consentSummary = user.consentSummary || {};
      user.consentSummary.mood_tracking = true;
      await user.save();
      await recordConsent(user._id, 'mood_tracking', true);
    }

    if (!user.consentSummary || !user.consentSummary.mood_tracking) {
      return res.status(403).json({
        error: 'Mood tracking requires your explicit opt-in consent. Enable "Mood Tracking" to save mood check-ins.',
        requiresConsent: 'mood_tracking',
      });
    }

    const latestConsent = await Consent.findOne({
      user: user._id,
      category: 'mood_tracking',
      status: 'granted',
    }).sort({ timestamp: -1 });

    const checkin = await MoodCheckin.create({
      user: user._id,
      rating: ratingNum,
      label: MOOD_LABELS[ratingNum],
      note: typeof note === 'string' ? note.trim().slice(0, 300) : '',
      consentRef: latestConsent ? latestConsent._id : null,
      timestamp: new Date(),
    });

    if (user.consentSummary && user.consentSummary.activity_history) {
      await ActivityEvent.create({
        user: user._id,
        eventType: 'mood_checkin',
        itemId: `mood-${ratingNum}`,
        itemTitle: `Mood Check-In: ${MOOD_LABELS[ratingNum]} (${ratingNum}/5)`,
      });
    }

    res.status(201).json({
      ok: true,
      checkin: {
        id: String(checkin._id),
        rating: checkin.rating,
        label: checkin.label,
        note: checkin.note,
        timestamp: checkin.timestamp,
      },
    });
  })
);

app.get(
  '/api/mood/my',
  requireUser,
  wrap(async (req, res) => {
    const checkins = await MoodCheckin.find({ user: req.session.id }).sort({ timestamp: -1 }).limit(60).lean();
    res.json({
      checkins: checkins.map((m) => ({
        id: String(m._id),
        rating: m.rating,
        label: m.label,
        note: m.note,
        timestamp: m.timestamp,
      })),
    });
  })
);

app.delete(
  '/api/mood/:id',
  requireUser,
  wrap(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid check-in ID.' });
    }
    const deleted = await MoodCheckin.findOneAndDelete({
      _id: req.params.id,
      user: req.session.id,
    });
    if (!deleted) return res.status(404).json({ error: 'Mood check-in not found.' });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// API: Admin Application System & Single-Use Invitation Workflow
// ---------------------------------------------------------------------------
app.post(
  '/api/admin-applications',
  registerLimiter,
  wrap(async (req, res) => {
    const {
      fullName,
      email,
      organisation,
      designation,
      requestedRole,
      reason,
      qualifications,
      policyAccepted,
    } = req.body || {};

    if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100) {
      return res.status(400).json({ field: 'fullName', error: 'Enter your full name (2 to 100 characters).' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.trim().length > 254) {
      return res.status(400).json({ field: 'email', error: 'Enter a valid institutional or professional email address.' });
    }
    if (typeof organisation !== 'string' || organisation.trim().length < 2 || organisation.trim().length > 150) {
      return res.status(400).json({ field: 'organisation', error: 'Enter your organisation or institution (2 to 150 characters).' });
    }
    if (typeof designation !== 'string' || designation.trim().length < 2 || designation.trim().length > 150) {
      return res.status(400).json({ field: 'designation', error: 'Enter your professional designation (2 to 150 characters).' });
    }
    if (!['responder', 'analyst', 'content_editor'].includes(requestedRole)) {
      return res.status(400).json({ field: 'requestedRole', error: 'Select a valid role (Responder, Analyst, or Content Editor).' });
    }
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 1000) {
      return res.status(400).json({ field: 'reason', error: 'Provide a clear reason for requesting access (10 to 1000 characters).' });
    }
    if (typeof qualifications !== 'string' || qualifications.trim().length < 10 || qualifications.trim().length > 1000) {
      return res.status(400).json({ field: 'qualifications', error: 'Provide your relevant experience or qualifications (10 to 1000 characters).' });
    }
    if (policyAccepted !== true) {
      return res.status(400).json({ field: 'policyAccepted', error: 'You must agree to the platform data-access and confidentiality policies.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingPending = await AdminApplication.findOne({
      email: normalizedEmail,
      status: { $in: ['submitted', 'pending_review'] },
    });
    if (existingPending) {
      return res.status(409).json({
        field: 'email',
        error: 'An active application for this email is already pending review.',
      });
    }

    const PERMISSION_MAP = {
      responder: ['view_consented_user_records'],
      analyst: ['view_aggregate_analytics'],
      content_editor: ['manage_resources', 'manage_helplines', 'view_aggregate_analytics'],
    };

    const application = await AdminApplication.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      organisation: organisation.trim(),
      designation: designation.trim(),
      requestedRole,
      requestedPermissions: PERMISSION_MAP[requestedRole] || [],
      reason: reason.trim(),
      qualifications: qualifications.trim(),
      policyAccepted: true,
      status: 'pending_review',
      submittedAt: new Date(),
    });

    await AuditLog.create({
      actorRole: 'applicant',
      dataCategory: 'admin_application',
      action: 'SUBMIT_ADMIN_APPLICATION',
      details: `Application ${application._id} submitted for role ${requestedRole} (${normalizedEmail})`,
    });

    res.status(201).json({
      ok: true,
      applicationId: String(application._id),
      status: application.status,
      submittedAt: application.submittedAt,
    });
  })
);

// Check application status by ID + email
app.get(
  '/api/admin-applications/status',
  wrap(async (req, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    const id = String(req.query.id || '').trim();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Provide the email address used on your application.' });
    }
    const query = { email };
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      query._id = id;
    }
    const appDoc = await AdminApplication.findOne(query).sort({ submittedAt: -1 }).lean();
    if (!appDoc) {
      return res.status(404).json({ error: 'No application found matching those details.' });
    }
    res.json({
      applicationId: String(appDoc._id),
      fullName: appDoc.fullName,
      organisation: appDoc.organisation,
      requestedRole: appDoc.requestedRole,
      status: appDoc.status,
      submittedAt: appDoc.submittedAt,
      reviewedAt: appDoc.reviewedAt,
      reviewNotes: appDoc.reviewNotes,
    });
  })
);

// Super Admin: List applications
app.get(
  '/api/admin/applications',
  requireSuperAdmin,
  wrap(async (req, res) => {
    const statusFilter = req.query.status;
    const query = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {};
    const apps = await AdminApplication.find(query)
      .populate('reviewerId', 'name email')
      .sort({ submittedAt: -1 })
      .limit(100)
      .lean();

    res.json({
      applications: apps.map((a) => ({
        id: String(a._id),
        fullName: a.fullName,
        email: a.email,
        organisation: a.organisation,
        designation: a.designation,
        requestedRole: a.requestedRole,
        requestedPermissions: a.requestedPermissions,
        reason: a.reason,
        qualifications: a.qualifications,
        status: a.status,
        submittedAt: a.submittedAt,
        reviewedAt: a.reviewedAt,
        reviewer: a.reviewerId ? a.reviewerId.name : null,
        reviewNotes: a.reviewNotes,
        inviteExpiresAt: a.inviteExpiresAt,
      })),
    });
  })
);

// Super Admin: Review (Approve / Reject) application
app.post(
  '/api/admin/applications/:id/review',
  requireSuperAdmin,
  wrap(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid application ID.' });
    }
    const { decision, reviewNotes = '' } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be "approved" or "rejected".' });
    }

    const appDoc = await AdminApplication.findById(req.params.id).select('+inviteTokenHash');
    if (!appDoc) return res.status(404).json({ error: 'Application not found.' });

    if (appDoc.status === 'completed') {
      return res.status(400).json({ error: 'This application has already been completed and activated.' });
    }

    appDoc.status = decision;
    appDoc.reviewerId = req.session.id;
    appDoc.reviewedAt = new Date();
    appDoc.reviewNotes = typeof reviewNotes === 'string' ? reviewNotes.trim().slice(0, 500) : '';

    let rawInviteToken = null;
    if (decision === 'approved') {
      rawInviteToken = crypto.randomBytes(32).toString('hex');
      appDoc.inviteTokenHash = sha256(rawInviteToken);
      appDoc.inviteExpiresAt = new Date(Date.now() + 48 * 3600 * 1000); // 48 hours expiry
      appDoc.inviteUsedAt = null;
    } else {
      appDoc.inviteTokenHash = null;
      appDoc.inviteExpiresAt = null;
    }

    await appDoc.save();

    await AuditLog.create({
      actorId: req.session.id,
      actorRole: 'super_admin',
      adminId: req.session.id,
      dataCategory: 'admin_application',
      action: decision === 'approved' ? 'APPROVE_ADMIN_APPLICATION' : 'REJECT_ADMIN_APPLICATION',
      details: `${decision.toUpperCase()} application ${appDoc._id} (${appDoc.email}) for role ${appDoc.requestedRole}`,
    });

    res.json({
      ok: true,
      id: String(appDoc._id),
      status: appDoc.status,
      reviewedAt: appDoc.reviewedAt,
      ...(rawInviteToken && {
        invitationToken: rawInviteToken,
        invitationUrl: `/admin-apply?invite=${rawInviteToken}&email=${encodeURIComponent(appDoc.email)}`,
        inviteExpiresAt: appDoc.inviteExpiresAt,
      }),
    });
  })
);

// Complete approved invitation -> Verify email & create password -> Assign role server-side
app.post(
  '/api/admin-applications/accept-invite',
  authLimiter,
  wrap(async (req, res) => {
    const { token, email, password } = req.body || {};
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Valid single-use invitation token is required.' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Enter the email address associated with your approved application.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Password must be between 8 and 200 characters.' });
    }

    const tokenHash = sha256(token.trim());
    const normalizedEmail = email.trim().toLowerCase();

    const appDoc = await AdminApplication.findOne({
      inviteTokenHash: tokenHash,
    }).select('+inviteTokenHash');

    if (!appDoc) {
      return res.status(400).json({ error: 'Invalid or already used invitation token.' });
    }
    if (appDoc.inviteUsedAt || appDoc.status === 'completed') {
      return res.status(400).json({ error: 'This invitation token has already been used.' });
    }
    if (!appDoc.inviteExpiresAt || appDoc.inviteExpiresAt <= new Date()) {
      return res.status(400).json({ error: 'This invitation token has expired.' });
    }
    if (appDoc.email !== normalizedEmail) {
      return res.status(400).json({ error: 'Email verification failed: does not match the approved applicant email.' });
    }
    if (appDoc.status !== 'approved') {
      return res.status(400).json({ error: 'Application is not approved for activation.' });
    }

    const { salt, hash } = await hashPassword(password);
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      user.role = appDoc.requestedRole;
      user.organisation = appDoc.organisation;
      user.designation = appDoc.designation;
      user.emailVerified = true;
      user.salt = salt;
      user.hash = hash;
      await user.save();
    } else {
      user = await User.create({
        name: appDoc.fullName,
        email: normalizedEmail,
        role: appDoc.requestedRole,
        organisation: appDoc.organisation,
        designation: appDoc.designation,
        accountStatus: 'active',
        emailVerified: true,
        salt,
        hash,
        consentAt: new Date(),
      });
      await recordConsent(user._id, 'account', true);
    }

    // Invalidate single-use invitation immediately
    appDoc.status = 'completed';
    appDoc.inviteUsedAt = new Date();
    appDoc.inviteTokenHash = null;
    appDoc.createdUserId = user._id;
    await appDoc.save();

    await AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      targetUserId: user._id,
      dataCategory: 'admin_application',
      action: 'ACTIVATE_APPROVED_ROLE_INVITATION',
      details: `Activated approved role ${user.role} for ${user.email}`,
    });

    const { token: sessionToken, csrfToken } = await createSession(res, user);
    res.status(201).json({
      ok: true,
      name: user.name,
      role: user.role,
      token: sessionToken,
      csrfToken,
    });
  })
);

// ---------------------------------------------------------------------------
// API: Responder Access & User-Controlled Data Sharing
// ---------------------------------------------------------------------------
// List verified responders so users can nominate one
app.get(
  '/api/responders/directory',
  requireUser,
  wrap(async (req, res) => {
    const responders = await User.find({ role: 'responder', accountStatus: 'active' })
      .select('name email organisation designation country')
      .sort({ name: 1 })
      .lean();

    res.json({
      responders: responders.map((r) => ({
        id: String(r._id),
        name: r.name,
        email: r.email,
        organisation: r.organisation || 'Verified Support Responder',
        designation: r.designation || 'Support Specialist',
        country: r.country || 'GLOBAL',
      })),
    });
  })
);

// User creates or updates a ShareGrant for a nominated responder
app.post(
  '/api/share-grants',
  requireUser,
  wrap(async (req, res) => {
    const {
      responderEmail,
      responderId,
      categories = {},
      expiresInDays = 14,
      notes = '',
      enableConsent,
    } = req.body || {};

    const user = await User.findById(req.session.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (enableConsent === true && (!user.consentSummary || !user.consentSummary.responder_sharing)) {
      user.consentSummary = user.consentSummary || {};
      user.consentSummary.responder_sharing = true;
      await user.save();
      await recordConsent(user._id, 'responder_sharing', true);
    }

    if (!user.consentSummary || !user.consentSummary.responder_sharing) {
      return res.status(403).json({
        error: 'Sharing records with a responder requires your explicit "Responder Data Sharing" consent.',
        requiresConsent: 'responder_sharing',
      });
    }

    let responder = null;
    if (responderId && mongoose.Types.ObjectId.isValid(responderId)) {
      responder = await User.findOne({ _id: responderId, role: 'responder', accountStatus: 'active' });
    } else if (typeof responderEmail === 'string' && EMAIL_RE.test(responderEmail.trim())) {
      responder = await User.findOne({
        email: responderEmail.trim().toLowerCase(),
        role: 'responder',
        accountStatus: 'active',
      });
    }

    if (!responder) {
      return res.status(404).json({
        error: 'No approved responder account found with that identifier.',
      });
    }

    const days = Math.min(Math.max(Number(expiresInDays) || 14, 1), 365);
    const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);

    const configuredCategories = {
      basic_profile: categories.basic_profile !== false,
      assessment_results: Boolean(categories.assessment_results),
      assessment_history: Boolean(categories.assessment_history),
      mood_checkins: Boolean(categories.mood_checkins),
      activity_history: Boolean(categories.activity_history),
    };

    let grant = await ShareGrant.findOne({ user: user._id, responder: responder._id });
    if (grant) {
      grant.status = 'active';
      grant.categories = configuredCategories;
      grant.expiresAt = expiresAt;
      grant.revokedAt = null;
      grant.notes = typeof notes === 'string' ? notes.trim().slice(0, 300) : '';
      await grant.save();
    } else {
      grant = await ShareGrant.create({
        user: user._id,
        responder: responder._id,
        status: 'active',
        categories: configuredCategories,
        expiresAt,
        notes: typeof notes === 'string' ? notes.trim().slice(0, 300) : '',
      });
    }

    await AuditLog.create({
      actorId: user._id,
      actorRole: 'user',
      targetUserId: user._id,
      grantId: grant._id,
      dataCategory: 'share_grant',
      action: 'GRANT_RESPONDER_ACCESS',
      details: `User granted access to responder ${responder.email} until ${expiresAt.toISOString()}`,
    });

    res.status(201).json({
      ok: true,
      grant: {
        id: String(grant._id),
        responder: {
          id: String(responder._id),
          name: responder.name,
          email: responder.email,
          organisation: responder.organisation,
          designation: responder.designation,
        },
        status: grant.status,
        categories: grant.categories,
        expiresAt: grant.expiresAt,
        createdAt: grant.createdAt,
      },
    });
  })
);

// User lists their own share grants
app.get(
  '/api/share-grants/my',
  requireUser,
  wrap(async (req, res) => {
    const grants = await ShareGrant.find({ user: req.session.id })
      .populate('responder', 'name email organisation designation')
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    res.json({
      grants: grants.map((g) => {
        const isExpired = g.expiresAt && g.expiresAt <= now;
        return {
          id: String(g._id),
          responder: g.responder
            ? {
                id: String(g.responder._id),
                name: g.responder.name,
                email: g.responder.email,
                organisation: g.responder.organisation,
                designation: g.responder.designation,
              }
            : null,
          status: isExpired && g.status === 'active' ? 'expired' : g.status,
          categories: g.categories,
          expiresAt: g.expiresAt,
          revokedAt: g.revokedAt,
          lastAccessedAt: g.lastAccessedAt,
          createdAt: g.createdAt,
        };
      }),
    });
  })
);

// User revokes a share grant
app.post(
  '/api/share-grants/:id/revoke',
  requireUser,
  wrap(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid grant ID.' });
    }
    const grant = await ShareGrant.findOne({ _id: req.params.id, user: req.session.id });
    if (!grant) return res.status(404).json({ error: 'Sharing permission not found.' });

    grant.status = 'revoked';
    grant.revokedAt = new Date();
    await grant.save();

    await AuditLog.create({
      actorId: req.session.id,
      actorRole: 'user',
      targetUserId: req.session.id,
      grantId: grant._id,
      dataCategory: 'share_grant',
      action: 'REVOKE_RESPONDER_ACCESS',
    });

    res.json({ ok: true, id: String(grant._id), status: 'revoked', revokedAt: grant.revokedAt });
  })
);

// User views audit trail of who accessed their records
app.get(
  '/api/audit-logs/my',
  requireUser,
  wrap(async (req, res) => {
    const logs = await AuditLog.find({ targetUserId: req.session.id })
      .populate('actorId', 'name email role organisation designation')
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    res.json({
      logs: logs.map((l) => ({
        id: String(l._id),
        actorName: l.actorId ? l.actorId.name : l.actorRole,
        actorEmail: l.actorId ? l.actorId.email : '',
        actorRole: l.actorId ? l.actorId.role : l.actorRole,
        organisation: l.actorId ? l.actorId.organisation : '',
        dataCategory: l.dataCategory,
        action: l.action,
        details: l.details,
        timestamp: l.timestamp,
      })),
    });
  })
);

// Responder Dashboard: List consenting users who granted active, non-expired access to this responder
app.get(
  '/api/responder/clients',
  requireResponder,
  wrap(async (req, res) => {
    const now = new Date();
    const grants = await ShareGrant.find({
      responder: req.session.id,
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .populate('user', 'name email country createdAt consentSummary')
      .sort({ updatedAt: -1 })
      .lean();

    const activeGrants = grants.filter(
      (g) => g.user && g.user.consentSummary && g.user.consentSummary.responder_sharing
    );

    res.json({
      clients: activeGrants.map((g) => ({
        grantId: String(g._id),
        userId: String(g.user._id),
        name: g.user.name,
        email: g.categories.basic_profile ? g.user.email : undefined,
        country: g.categories.basic_profile ? g.user.country : undefined,
        categories: g.categories,
        expiresAt: g.expiresAt,
        lastAccessedAt: g.lastAccessedAt,
        grantedAt: g.createdAt,
        notes: g.notes,
      })),
    });
  })
);

// Responder Dashboard: View a consenting user's explicitly shared categories (Audit Logged)
app.get(
  '/api/responder/clients/:userId',
  requireResponder,
  wrap(async (req, res) => {
    const targetUserId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const now = new Date();
    const grant = await ShareGrant.findOne({
      user: targetUserId,
      responder: req.session.id,
      status: 'active',
    });

    if (!grant) {
      return res.status(403).json({ error: 'Access denied: No active sharing permission exists for this user.' });
    }

    if (grant.expiresAt && grant.expiresAt <= now) {
      grant.status = 'expired';
      await grant.save();
      return res.status(403).json({ error: 'Access denied: The user sharing permission has expired.' });
    }

    const user = await User.findById(targetUserId).lean();
    if (!user || !user.consentSummary || !user.consentSummary.responder_sharing) {
      return res.status(403).json({ error: 'Access denied: User has revoked responder sharing consent.' });
    }

    const sharedPayload = {
      grantId: String(grant._id),
      userId: String(user._id),
      categories: grant.categories,
      expiresAt: grant.expiresAt,
      latestSharedAt: grant.updatedAt,
    };

    const accessedCategories = [];

    if (grant.categories.basic_profile) {
      sharedPayload.profile = {
        name: user.name,
        email: user.email,
        phone: user.phone || 'Not provided',
        age: user.age,
        country: user.country,
      };
      accessedCategories.push('profile');
    } else {
      sharedPayload.profile = { name: user.name };
    }

    if (grant.categories.assessment_history) {
      const history = await Assessment.find({ user: targetUserId }).sort({ completedAt: -1 }).limit(30).lean();
      sharedPayload.assessments = history.map((a) => ({
        id: String(a._id),
        type: a.type,
        totalScore: a.totalScore,
        severityCategory: a.severityCategory,
        functionalImpairment: a.functionalImpairment,
        item9Positive: a.item9Positive,
        completedAt: a.completedAt,
      }));
      accessedCategories.push('assessment_history');
    } else if (grant.categories.assessment_results) {
      const latest = await Assessment.findOne({ user: targetUserId }).sort({ completedAt: -1 }).lean();
      sharedPayload.assessments = latest
        ? [
            {
              id: String(latest._id),
              type: latest.type,
              totalScore: latest.totalScore,
              severityCategory: latest.severityCategory,
              functionalImpairment: latest.functionalImpairment,
              item9Positive: latest.item9Positive,
              completedAt: latest.completedAt,
            },
          ]
        : [];
      accessedCategories.push('assessment_results');
    }

    if (grant.categories.mood_checkins) {
      const moods = await MoodCheckin.find({ user: targetUserId }).sort({ timestamp: -1 }).limit(30).lean();
      sharedPayload.moodCheckins = moods.map((m) => ({
        id: String(m._id),
        rating: m.rating,
        label: m.label,
        note: m.note,
        timestamp: m.timestamp,
      }));
      accessedCategories.push('mood_checkins');
    }

    if (grant.categories.activity_history) {
      const events = await ActivityEvent.find({ user: targetUserId }).sort({ timestamp: -1 }).limit(30).lean();
      sharedPayload.activityHistory = events.map((e) => ({
        eventType: e.eventType,
        itemId: e.itemId,
        itemTitle: e.itemTitle,
        timestamp: e.timestamp,
      }));
      accessedCategories.push('activity_history');
    }

    grant.lastAccessedAt = new Date();
    await grant.save();

    // Generate mandatory audit events for every accessed sensitive category
    for (const cat of accessedCategories.length ? accessedCategories : ['profile']) {
      await AuditLog.create({
        actorId: req.session.id,
        actorRole: 'responder',
        targetUserId: user._id,
        grantId: grant._id,
        dataCategory: cat,
        action: `RESPONDER_VIEW_${cat.toUpperCase()}`,
        details: `Responder ${req.session.email} accessed ${cat} under grant ${grant._id}`,
        timestamp: new Date(),
      });
    }

    res.json(sharedPayload);
  })
);

// ---------------------------------------------------------------------------
// API: Engagement Analytics (Soundtracks & Resources)
// ---------------------------------------------------------------------------
async function recordContentEngagement(req, res, itemType) {
  const { itemId, title = '', sessionId = '' } = req.body || {};
  if (typeof itemId !== 'string' || !itemId.trim() || itemId.trim().length > 120) {
    return res.status(400).json({ error: 'Valid itemId is required.' });
  }

  // Exclude administrative previews from ordinary user analytics
  const session = await getSession(req);
  if (session && ['super_admin', 'admin', 'analyst', 'content_editor'].includes(session.role)) {
    return res.json({ ok: true, counted: false, reason: 'admin_preview_excluded' });
  }

  const cleanId = itemId.trim();
  const today = new Date().toISOString().slice(0, 10);
  const rawAnon = sessionId || (session ? session.tokenHash : req.ip || 'anon');
  const anonHash = sha256(`${rawAnon}:${cleanId}:${today}`).slice(0, 24);

  let stat = await ContentStat.findOne({ itemType, itemId: cleanId });
  if (!stat) {
    const contentDoc = await Content.findOne({
      kind: itemType,
      $or: [{ itemId: cleanId }, { slug: cleanId }],
    }).lean();
    stat = new ContentStat({
      itemType,
      itemId: cleanId,
      title: (contentDoc && contentDoc.title) || title.trim() || cleanId,
      totalCount: 0,
      dailyCounts: [],
      recentSessionHashes: [],
    });
  }

  // Deduplicate repeated events from the same playback/view session within 30 minutes
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  stat.recentSessionHashes = (stat.recentSessionHashes || []).filter((entry) => entry.at > cutoff);
  const isDuplicate = stat.recentSessionHashes.some((entry) => entry.hash === anonHash);
  if (isDuplicate) {
    return res.json({ ok: true, counted: false, reason: 'duplicate_session_event', totalCount: stat.totalCount });
  }

  stat.recentSessionHashes.push({ hash: anonHash, at: new Date() });
  stat.totalCount += 1;
  stat.lastEventAt = new Date();

  const dayEntry = stat.dailyCounts.find((d) => d.date === today);
  if (dayEntry) {
    dayEntry.count += 1;
  } else {
    stat.dailyCounts.push({ date: today, count: 1 });
    if (stat.dailyCounts.length > 90) {
      stat.dailyCounts = stat.dailyCounts.slice(-90);
    }
  }
  await stat.save();

  // Only store identifiable user activity if the user explicitly opted into activity_history consent
  if (session && session.user && session.user.consentSummary && session.user.consentSummary.activity_history) {
    await ActivityEvent.create({
      user: session.user._id,
      eventType: itemType === 'soundtrack' ? 'sound_play' : 'resource_view',
      itemId: cleanId,
      itemTitle: stat.title,
      timestamp: new Date(),
    });
  }

  return res.json({ ok: true, counted: true, totalCount: stat.totalCount });
}

app.post(
  '/api/analytics/sound-play',
  wrap(async (req, res) => recordContentEngagement(req, res, 'soundtrack'))
);

app.post(
  '/api/analytics/resource-view',
  wrap(async (req, res) => recordContentEngagement(req, res, 'resource'))
);

// ---------------------------------------------------------------------------
// API: Support Requests (Optional, Never Blocking Crisis Numbers)
// ---------------------------------------------------------------------------
app.post(
  '/api/support-requests',
  wrap(async (req, res) => {
    const { name, email, phone, age, country, helplineName, helplineContact, notes } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ field: 'name', error: 'Please enter your full name (2–100 characters).' });
    }
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
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

    const session = await getSession(req);
    const record = await SupportRequest.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      age: parsedAge,
      country: country.trim().toUpperCase(),
      helplineName: helplineName.trim(),
      helplineContact: typeof helplineContact === 'string' ? helplineContact.trim() : '',
      notes: typeof notes === 'string' ? notes.trim().slice(0, 500) : '',
      userId: session ? session.id : null,
    });

    res.status(201).json({ ok: true, id: record._id });
  })
);

app.get(
  '/api/admin/support-requests',
  requireSuperAdmin,
  wrap(async (req, res) => {
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
  })
);

// ---------------------------------------------------------------------------
// API: Admin Dashboard, RBAC Management & MongoDB Aggregation Pipelines
// ---------------------------------------------------------------------------
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Account Administration (Super Admin only - No individual mental health scores exposed)
app.get(
  '/api/admin/users',
  requireSuperAdmin,
  wrap(async (req, res) => {
    let page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) page = 1;

    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const query = {};
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const safeQ = escapeRegex(req.query.q.trim());
      query.$or = [{ name: new RegExp(safeQ, 'i') }, { email: new RegExp(safeQ, 'i') }];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .select('name email role accountStatus country createdAt lastLoginAt')
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
        role: normalizeRole(u.role),
        accountStatus: u.accountStatus || 'active',
        country: u.country || '—',
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      limit,
    });
  })
);

// Single user administrative metadata view (Audit logged; never exposes individual PHQ-9/mood records)
app.get(
  '/api/admin/users/:id',
  requireSuperAdmin,
  wrap(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }
    const target = await User.findById(req.params.id)
      .select('name email phone age country role accountStatus organisation designation createdAt lastLoginAt')
      .lean();
    if (!target) return res.status(404).json({ error: 'User not found.' });

    await AuditLog.create({
      actorId: req.session.id,
      actorRole: 'super_admin',
      adminId: req.session.id,
      targetUserId: target._id,
      dataCategory: 'profile',
      action: 'VIEW_USER_ACCOUNT_METADATA',
      details: `Super admin viewed account metadata for ${target.email}`,
      timestamp: new Date(),
    });

    res.json({
      id: String(target._id),
      name: target.name,
      email: target.email,
      phone: target.phone || '—',
      age: target.age !== null && target.age !== undefined ? target.age : '—',
      country: target.country
        ? (countries.find((c) => c.code === target.country) || { name: target.country }).name
        : '—',
      role: normalizeRole(target.role),
      accountStatus: target.accountStatus || 'active',
      organisation: target.organisation || '—',
      createdAt: target.createdAt,
      lastLoginAt: target.lastLoginAt,
    });
  })
);

// Super Admin: Update account status (active / suspended)
app.patch(
  '/api/admin/users/:id/status',
  requireSuperAdmin,
  wrap(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }
    const { accountStatus } = req.body || {};
    if (!['active', 'suspended'].includes(accountStatus)) {
      return res.status(400).json({ error: 'accountStatus must be "active" or "suspended".' });
    }
    if (String(req.params.id) === String(req.session.id)) {
      return res.status(400).json({ error: 'You cannot suspend your own super_admin account.' });
    }
    const target = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { accountStatus } },
      { new: true }
    );
    if (!target) return res.status(404).json({ error: 'User not found.' });

    if (accountStatus === 'suspended') {
      await Session.deleteMany({ user: target._id });
    }

    await AuditLog.create({
      actorId: req.session.id,
      actorRole: 'super_admin',
      adminId: req.session.id,
      targetUserId: target._id,
      dataCategory: 'account_status',
      action: `SET_ACCOUNT_STATUS_${accountStatus.toUpperCase()}`,
    });

    res.json({ ok: true, id: String(target._id), accountStatus: target.accountStatus });
  })
);

// Super Admin / Content Editor: Manage Helpline Directory
app.post(
  '/api/admin/helplines',
  requireRoles('super_admin', 'content_editor'),
  wrap(async (req, res) => {
    const {
      helplineId,
      organisationName,
      countryName,
      countryCode,
      phone = '',
      smsAvailable = false,
      website = '',
      operatingHours = '24/7',
      languages = ['English'],
      description,
      sourceUrl,
      categories = ['crisis'],
    } = req.body || {};

    if (!helplineId || !organisationName || !countryName || !countryCode || !description || !sourceUrl) {
      return res.status(400).json({ error: 'Organisation name, country, description, and official source URL are required.' });
    }

    const code = String(countryCode).trim().toUpperCase();
    const doc = await Helpline.findOneAndUpdate(
      { helplineId: String(helplineId).trim() },
      {
        $set: {
          helplineId: String(helplineId).trim(),
          organisationName: String(organisationName).trim(),
          countryName: String(countryName).trim(),
          countryCode: code,
          regions: [code, code === 'IN' ? 'in' : code === 'US' || code === 'CA' ? 'us-ca' : code === 'GB' || code === 'IE' ? 'uk-ie' : 'global'],
          categories: Array.isArray(categories) ? categories : ['crisis'],
          phone: String(phone).trim(),
          smsAvailable: Boolean(smsAvailable),
          website: String(website).trim(),
          operatingHours: String(operatingHours).trim(),
          languages: Array.isArray(languages) ? languages : [String(languages)],
          description: String(description).trim(),
          sourceUrl: String(sourceUrl).trim(),
          lastVerifiedAt: new Date(),
          verificationStatus: 'verified',
          channels: [
            ...(phone ? [{ icon: 'phone', label: `Call ${phone}` }] : []),
            ...(website ? [{ icon: 'globe', label: 'Official Website' }] : []),
          ],
          primaryAction: {
            label: phone ? `Call ${phone}` : 'Open Directory',
            icon: phone ? 'phone' : 'globe',
            href: phone ? `tel:${phone.replace(/[^0-9+]/g, '')}` : website || sourceUrl,
          },
          secondaryAction: {
            label: 'Official Source',
            href: website || sourceUrl,
            external: true,
          },
        },
      },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      actorId: req.session.id,
      actorRole: req.session.role,
      dataCategory: 'helpline',
      action: 'UPSERT_HELPLINE',
      details: `Updated helpline ${doc.helplineId} (${doc.organisationName})`,
    });

    res.status(201).json({ ok: true, helpline: formatHelplineDoc(doc) });
  })
);

// Super Admin: View Audit Logs
app.get(
  '/api/admin/audit-logs',
  requireSuperAdmin,
  wrap(async (req, res) => {
    const logs = await AuditLog.find()
      .populate('actorId', 'name email role')
      .populate('targetUserId', 'name email')
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    res.json({
      logs: logs.map((l) => ({
        id: String(l._id),
        actor: l.actorId ? `${l.actorId.name} (${l.actorId.role})` : l.actorRole,
        target: l.targetUserId ? l.targetUserId.email : l.anonymized ? 'Anonymized User' : 'System',
        dataCategory: l.dataCategory,
        action: l.action,
        details: l.details,
        timestamp: l.timestamp,
      })),
    });
  })
);

// Aggregate Platform Analytics (Accessible to super_admin, analyst, content_editor)
app.get(
  '/api/admin/stats',
  requireAdminOrAnalyst,
  wrap(async (req, res) => {
    const daysParam = parseInt(req.query.days, 10);
    const dateCutoff = !isNaN(daysParam) && daysParam > 0 ? new Date(Date.now() - daysParam * 86400 * 1000) : null;
    const dateFilter = dateCutoff ? { completedAt: { $gte: dateCutoff } } : {};

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000);

    const [
      totalUsers,
      activeUsers,
      totalAssessmentsDocs,
      legacyScreeningsCount,
      totalMoodCheckins,
      pendingAdminApps,
      totalSupportRequests,
      countryAgg,
      ageAgg,
      soundStats,
      resourceStats,
      moodTrendAgg,
      assessmentDailyAgg,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', lastLoginAt: { $gte: thirtyDaysAgo } }),
      Assessment.countDocuments(dateFilter),
      User.countDocuments({ screeningScore: { $ne: null } }),
      MoodCheckin.countDocuments(dateCutoff ? { timestamp: { $gte: dateCutoff } } : {}),
      AdminApplication.countDocuments({ status: { $in: ['submitted', 'pending_review'] } }),
      SupportRequest.countDocuments(),
      User.aggregate([
        { $match: { country: { $ne: null }, role: 'user' } },
        {
          $group: {
            _id: '$country',
            count: { $sum: 1 },
            ageSum: { $sum: { $ifNull: ['$age', 0] } },
            ageN: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$age', null] }, null] }, 1, 0] } },
          },
        },
        { $sort: { count: -1 } },
      ]),
      User.aggregate([
        { $match: { age: { $ne: null }, role: 'user' } },
        {
          $bucket: {
            groupBy: '$age',
            boundaries: [13, 18, 25, 35, 45, 55, 121],
            default: 'other',
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      ContentStat.find({ itemType: 'soundtrack' }).sort({ totalCount: -1 }).lean(),
      ContentStat.find({ itemType: 'resource' }).sort({ totalCount: -1 }).lean(),
      MoodCheckin.aggregate([
        { $match: { timestamp: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            avgRating: { $avg: '$rating' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Assessment.aggregate([
        { $match: { completedAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const totalScreenings = Math.max(totalAssessmentsDocs, legacyScreeningsCount);

    // Country distribution
    const grandTotal = countryAgg.reduce((s, t) => s + t.count, 0);
    const countryDistribution = countryAgg.map((t) => {
      const matched = countries.find((c) => c.code === t._id);
      return {
        code: t._id,
        name: matched ? matched.name : t._id,
        count: t.count,
        rawCount: t.count,
        percent: grandTotal ? Math.round((t.count / grandTotal) * 1000) / 10 : 0,
        avgAge: t.ageN ? Math.round((t.ageSum / t.ageN) * 10) / 10 : null,
      };
    });

    // Per-inventory score distributions (combining Assessment collection + User profile fallback)
    const INVENTORY_STATS = {
      phq9: {
        field: 'screeningScore',
        name: 'PHQ-9 (Depression)',
        max: 27,
        bounds: [0, 5, 10, 15, 20, 28],
        labels: ['Minimal (0–4)', 'Mild (5–9)', 'Moderate (10–14)', 'Moderately severe (15–19)', 'Severe (20–27)'],
        colors: ['#6EE7B7', '#2DD4BF', '#FBBF24', '#FB923C', '#F43F5E'],
      },
      gad7: {
        field: 'gad7Score',
        name: 'GAD-7 (Anxiety)',
        max: 21,
        bounds: [0, 5, 10, 15, 22],
        labels: ['Minimal (0–4)', 'Mild (5–9)', 'Moderate (10–14)', 'Severe (15–21)'],
        colors: ['#6EE7B7', '#2DD4BF', '#FBBF24', '#F43F5E'],
      },
      who5: {
        field: 'who5Score',
        name: 'WHO-5 (Well-Being)',
        max: 25,
        bounds: [0, 14, 20, 26],
        labels: ['Reduced (0–13)', 'Moderate (14–19)', 'High (20–25)'],
        colors: ['#F43F5E', '#FBBF24', '#6EE7B7'],
      },
    };

    const assessments = {};
    for (const [id, cfg] of Object.entries(INVENTORY_STATS)) {
      const matchAssess = { type: id, ...dateFilter };
      const [assessBucket, assessAvg] = await Promise.all([
        Assessment.aggregate([
          { $match: matchAssess },
          { $bucket: { groupBy: '$totalScore', boundaries: cfg.bounds, default: 'other', output: { count: { $sum: 1 } } } },
        ]),
        Assessment.aggregate([{ $match: matchAssess }, { $group: { _id: null, avg: { $avg: '$totalScore' }, n: { $sum: 1 } } }]),
      ]);

      let bucketAgg = assessBucket;
      let avgAgg = assessAvg;

      if (!avgAgg.length) {
        const matchUser = { [cfg.field]: { $ne: null } };
        [bucketAgg, avgAgg] = await Promise.all([
          User.aggregate([
            { $match: matchUser },
            { $bucket: { groupBy: '$' + cfg.field, boundaries: cfg.bounds, default: 'other', output: { count: { $sum: 1 } } } },
          ]),
          User.aggregate([{ $match: matchUser }, { $group: { _id: null, avg: { $avg: '$' + cfg.field }, n: { $sum: 1 } } }]),
        ]);
      }

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

    const bandKeys = ['minimal', 'mild', 'moderate', 'moderately_severe', 'severe'];
    const severityDistribution = assessments.phq9
      ? assessments.phq9.bands.map((b, i) => ({
          band: b.band,
          key: bandKeys[i],
          count: b.count,
          rawCount: b.rawCount,
        }))
      : [];
    const avgScore = assessments.phq9 ? assessments.phq9.avgScore : null;

    const ageLabels = {
      13: 'Under 18',
      18: '18 to 24',
      25: '25 to 34',
      35: '35 to 44',
      45: '45 to 54',
      55: '55 and over',
    };
    const ageDistribution = [13, 18, 25, 35, 45, 55].map((boundary) => {
      const fromUsers = ageAgg.find((b) => b._id === boundary);
      const count = fromUsers ? fromUsers.count : 0;
      return { band: ageLabels[boundary], count, rawCount: count };
    });

    // Soundtrack & Resource popularity summaries
    const totalSoundPlays = soundStats.reduce((s, x) => s + (x.totalCount || 0), 0);
    const mostPlayedSoundtrack =
      soundStats.length && soundStats[0].totalCount > 0
        ? { id: soundStats[0].itemId, title: soundStats[0].title, plays: soundStats[0].totalCount }
        : null;

    const totalResourceViews = resourceStats.reduce((s, x) => s + (x.totalCount || 0), 0);
    const mostViewedResource =
      resourceStats.length && resourceStats[0].totalCount > 0
        ? { id: resourceStats[0].itemId, title: resourceStats[0].title, views: resourceStats[0].totalCount }
        : null;

    const todayStr = new Date().toISOString().slice(0, 10);
    const sevenDayCutoffStr = sevenDaysAgo.toISOString().slice(0, 10);
    const thirtyDayCutoffStr = thirtyDaysAgo.toISOString().slice(0, 10);

    function computeWindowCounts(statsList) {
      let daily = 0;
      let weekly = 0;
      let monthly = 0;
      statsList.forEach((st) => {
        (st.dailyCounts || []).forEach((d) => {
          if (d.date === todayStr) daily += d.count;
          if (d.date >= sevenDayCutoffStr) weekly += d.count;
          if (d.date >= thirtyDayCutoffStr) monthly += d.count;
        });
      });
      return { daily, weekly, monthly };
    }

    res.json({
      totalUsers,
      activeUsers,
      totalScreenings,
      totalMoodCheckins,
      pendingAdminApps,
      totalSupportRequests,
      avgScore,
      severityDistribution,
      countryDistribution,
      assessments,
      ageDistribution,
      soundtracks: {
        totalPlays: totalSoundPlays,
        mostPlayed: mostPlayedSoundtrack,
        trends: computeWindowCounts(soundStats),
        rankings: soundStats.slice(0, 12).map((s) => ({
          id: s.itemId,
          title: s.title,
          plays: s.totalCount,
        })),
      },
      resources: {
        totalViews: totalResourceViews,
        mostViewed: mostViewedResource,
        trends: computeWindowCounts(resourceStats),
        rankings: resourceStats.slice(0, 12).map((r) => ({
          id: r.itemId,
          title: r.title,
          views: r.totalCount,
        })),
      },
      moodTrends: moodTrendAgg.map((m) => ({
        date: m._id,
        avgRating: Math.round(m.avgRating * 10) / 10,
        count: m.count,
      })),
      assessmentTrends: assessmentDailyAgg.map((a) => ({
        date: a._id,
        count: a.count,
      })),
    });
  })
);

// ---------------------------------------------------------------------------
// Fallbacks & Error Handlers (No stack traces or internal leaks)
// ---------------------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

app.use((req, res) => {
  res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found — Unburden</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#F9F9FB;color:#1A1C1D;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:28rem;padding:2rem}h1{font-family:'Noto Serif',Georgia,serif;font-size:2rem;margin:0 0 .5rem}
a{color:#0D4FB5}</style></head>
<body><main><h1>Page not found</h1>
<p>That page does not exist. Head back to the <a href="/">home page</a>, or if you need support right now, visit our <a href="/find-support">global helpline directory</a> or call/text <a href="tel:988">988</a> (US/Canada).</p></main></body></html>`);
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    const message =
      err.type === 'entity.too.large'
        ? 'That request is too large.'
        : 'The request could not be read. Check the data you sent and try again.';
    return res.status(status).json({ error: message });
  }
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled server error:', err.message);
  }
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

// ---------------------------------------------------------------------------
// Start (when executed directly)
// ---------------------------------------------------------------------------
async function start() {
  await connectDB();
  await ensureSeeded();
  app.listen(PORT, () => console.log(`Unburden running at http://localhost:${PORT}`));
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = app;
