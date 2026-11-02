# Unburden — Mental Health Support & Resource Mapping Platform

An independent educational mental health support and resource-mapping platform developed in alignment with **United Nations Sustainable Development Goal 3, Target 3.4** (*"By 2030, reduce by one third premature mortality from non-communicable diseases through prevention and treatment and promote mental health and well-being"*).

---

## 1. Key Capabilities & Security Architecture

### Role-Based Access Control (RBAC) & Strict Privacy Boundaries
- **`user`**: Standard account created via public registration (`/register`). Users own their data, control granular opt-in consents (`assessment_storage`, `mood_tracking`, `activity_history`, `responder_sharing`, `research_analytics`), nominate verified Responders via time-limited `ShareGrant` permissions, view personal access audit logs, export all personal data as JSON, and permanently erase their account and records (`Delete My Data`).
- **`responder`**: Credentialed support specialists approved via the Role Application workflow (`/admin-apply`). Responders can access individual user records **only** when the user has granted `responder_sharing` consent and created an active, unrevoked, non-expired `ShareGrant` for that specific responder. Every view writes an immutable entry to the user's visible `AuditLog`.
- **`analyst`**: Accesses anonymized, aggregated platform analytics only (`/admin`).
- **`content_editor`**: Maintains verified helpline directory listings and educational resource metadata.
- **`super_admin`**: Reviews role applications (`/api/admin/applications`), manages account statuses (`active` / `suspended`), maintains verified helplines, and views aggregate platform analytics and system security audit logs. **Super Administrators do not receive automatic access to individual mental health assessments or mood check-in records.**

### Standardized Self-Assessments & Immediate Item 9 Safety Handling
- Supports **PHQ-9** (Kroenke, Spitzer, & Williams, 2001), **GAD-7** (Spitzer et al., 2006), and **WHO-5** (WHO, 1998) in plain language without invented frequency hints or visible point badges on options.
- Includes the post-questionnaire functional-impairment question.
- **Immediate Item 9 Crisis Banner**: Selecting any non-zero response on PHQ-9 Question 9 (*thoughts that you would be better off dead, or of hurting yourself*) immediately displays a non-blocking crisis support banner with country-specific and global emergency contacts before the user even finishes the questionnaire.

### Global Helpline Directory (`/find-support`)
- Backed by the MongoDB `helplines` collection with `sourceUrl`, `lastVerifiedAt`, and `verificationStatus`.
- Searchable global country selector covering all ISO countries, with verified national crisis lines (India Tele-MANAS `14416`, KIRAN `1800-599-0019`, iCall, Vandrevala Foundation; US/Canada `988`; UK/Ireland Samaritans `116 123`; Australia Lifeline `13 11 14`) and international fallback directories (Find A Helpline, Befrienders Worldwide, IASP).
- Direct `tel:` / `sms:` / web links — **never** gated behind mandatory intake forms, plus a static `<noscript>` emergency directory fallback and a community *"Report incorrect info"* workflow.

### Soundtrack & Resource Engagement Analytics
- Tracks ambient soundtrack playback (`POST /api/analytics/sound-play`) and educational resource views (`POST /api/analytics/resource-view`) with 30-minute session deduplication and automatic exclusion of administrative previews.

---

## 2. MongoDB Collections (Mongoose Models)

| Collection | Model File | Purpose |
|---|---|---|
| `users` | `models/User.js` | User accounts, scrypt password hashes, RBAC roles, and consent summaries. |
| `sessions` | `models/Session.js` | Persistent server-side sessions (`tokenHash`, `csrfToken`, TTL index). |
| `assessments` | `models/Assessment.js` | Longitudinal PHQ-9, GAD-7, and WHO-5 records (`responses`, `functionalImpairment`, `totalScore`, `severityCategory`, `item9Positive`, `consentRef`). |
| `mood_checkins` | `models/MoodCheckin.js` | Opt-in 1–5 longitudinal mood ratings and reflection notes. |
| `consents` | `models/Consent.js` | Versioned audit trail of granular user consent grants and revocations. |
| `share_grants` | `models/ShareGrant.js` | User-to-Responder category-level sharing permissions with expiration and revocation timestamps. |
| `audit_logs` | `models/AuditLog.js` | Immutable audit log of responder record views, consent changes, role approvals, and admin actions. |
| `admin_applications` | `models/AdminApplication.js` | Applications for `responder`, `analyst`, and `content_editor` roles + hashed single-use invitation tokens. |
| `content` | `models/Content.js` | Educational resource guides and ambient soundtrack metadata. |
| `content_stats` | `models/ContentStat.js` | Aggregate play/view counters, daily trend buckets, and session deduplication hashes. |
| `activity_events` | `models/ActivityEvent.js` | Opt-in personal user activity history. |
| `helplines` | `models/Helpline.js` | Global helpline directory entries, verification metadata, and community issue reports. |
| `rate_limits` | `server.js` | Serverless-compatible MongoDB rate-limiting store with TTL expiration. |

---

## 3. Prerequisites & MongoDB Atlas Setup

1. **Node.js**: Version `18.x` or newer.
2. **MongoDB Atlas Cluster**:
   - Create a free (`M0`) or dedicated cluster at [https://www.mongodb.com/atlas](https://www.mongodb.com/atlas).
   - Under **Database Access**, create a database user with `readWrite` permissions.
   - Under **Network Access**, allow access from your local IP address and (for Vercel serverless deployment) `0.0.0.0/0`.
   - Copy your connection string (`mongodb+srv://<username>:<password>@<cluster>.mongodb.net/unburden?retryWrites=true&w=majority`).

---

## 4. Environment Variables (`.env`)

Copy `.env.example` to `.env` and configure the following variables:

```env
# Required: MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/unburden?retryWrites=true&w=majority

# Server port for local development
PORT=3000
NODE_ENV=development

# Session lifetimes (in hours)
USER_SESSION_HOURS=8
ADMIN_SESSION_HOURS=2

# Initial Super-Admin Provisioning (idempotent — will never overwrite an existing admin's password)
INITIAL_ADMIN_EMAIL=admin@yourdomain.org
INITIAL_ADMIN_PASSWORD=ReplaceWithAStrongPassword123!
INITIAL_ADMIN_NAME=Platform Super Administrator

# Optional: External transactional email provider key (if omitted, single-use invite/reset links are returned directly to the Super Admin UI / dev response)
EMAIL_PROVIDER_API_KEY=
```

---

## 5. Local Development, Build & Testing

```bash
# 1. Install dependencies
npm install

# 2. Compile and minify production Tailwind CSS (outputs to public/css/styles.css)
npm run build

# 3. (Optional) Explicitly run idempotent super-admin provisioning via CLI
npm run create-admin

# 4. Run the automated test suite (uses mongodb-memory-server — no external DB required for tests)
npm test

# 5. Start the local server
npm start
```

Open `http://localhost:3000` in your browser.
- **Health check endpoint**: `GET http://localhost:3000/api/health`

---

## 6. Vercel Serverless Deployment

This repository is pre-configured for **Vercel** via `api/index.js` and `vercel.json`:

1. Push the repository to GitHub.
2. Import the repository into [Vercel](https://vercel.com/new).
3. In the Vercel project settings under **Environment Variables**, add:
   - `MONGODB_URI`
   - `INITIAL_ADMIN_EMAIL`
   - `INITIAL_ADMIN_PASSWORD`
   - `NODE_ENV` = `production`
4. Set the **Build Command** to `npm run build` and **Output Directory** to `public`.
5. Click **Deploy**. On the first request, `db.js` establishes a cached Mongoose connection (`global.__unburdenMongoCache`) and `lib/seed.js` idempotently seeds the verified helpline directory, resources, soundtracks, and initial `super_admin` account.

---

## 7. Troubleshooting

- **`503 Database service is temporarily unavailable`**: Verify that `MONGODB_URI` is set in `.env` (or Vercel Environment Variables) and that `0.0.0.0/0` is permitted in MongoDB Atlas **Network Access**.
- **Cannot log in as Super Admin**: Ensure `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` (at least 8 characters) are set. If the account was created earlier with a different password, `provisionInitialSuperAdmin` is idempotent and will not overwrite it; use `ADMIN_FORCE_RESET=true npm run create-admin` if you intentionally want to rotate the password via CLI.
- **Styling changes not appearing**: Run `npm run build` to recompile `./src/input.css` into `./public/css/styles.css`.
