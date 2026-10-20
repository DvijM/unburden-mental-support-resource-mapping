# Unburden — Accessible Mental Support & Resource Mapping

Node.js and Express application backed by MongoDB and Mongoose, providing evidence-based mental health resources, accessible clinical self-screenings, crisis directories, and interactive ambient audio soundscapes.

## Quickstart & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Verify that `MONGODB_URI` points to your running MongoDB instance (defaults to `mongodb://127.0.0.1:27017/unburden`). Set strong `ADMIN_EMAIL` and `ADMIN_PASSWORD` (minimum 12 characters) in `.env`.

3. **Ensure MongoDB service is running:**
   ```bash
   # On Windows PowerShell:
   net start MongoDB
   # Or directly:
   mongod --dbpath <data-directory>
   ```

4. **Provision initial administrator account:**
   ```bash
   npm run create-admin
   ```
   This script reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`, prompts for or accepts an administrator name, and creates or promotes the administrator in the database.

5. **(Optional) Import legacy users:**
   If you have records in `data/users.json` from a previous installation:
   ```bash
   npm run import-legacy-users
   ```

6. **Start the server:**
   ```bash
   npm start            # http://localhost:3000
   npm run dev          # auto-restart on file changes (Node 18.11+)
   ```

## Structure

```
unburden/
├── server.js                 Express server: routing, rate-limited auth, admin APIs, and error handling
├── db.js                     Mongoose database connection manager with graceful failure handling
├── package.json
├── .env.example              Template for local environment configuration (git-ignored .env)
├── data/
│   ├── helplines.json        Directory listings served to the Find Support page
│   ├── sounds.json           Sound library metadata served to the Calming Sounds page
│   ├── countries.json        ISO 3166-1 alpha-2 country list for registration and demographics
│   └── users.json            Legacy user records (optional, preserved for import)
├── models/
│   ├── User.js               User schema (name, email, phone, age, country, role, salt, hash, score, consent)
│   ├── Session.js            Bearer token session store with automatic TTL index expiration
│   ├── AuditLog.js           Server audit trail tracking administrator access to sensitive user details
│   └── SupportRequest.js     Helpline intake records with seeker contact details and assigned hub
├── scripts/
│   ├── create-admin.js       CLI script to provision or promote administrator accounts
│   ├── import-legacy-users.js Migration script for data/users.json legacy data
│   └── generate-sounds.js    Audio waveform generator for ambient soundscape loops
└── public/
    ├── audio/                Ambient loopable audio files (/audio/<name>.mp3)
    ├── images/               Illustrations and world map SVG (/images/...)
    ├── pages/                One HTML file per screen
    │   ├── index.html        /
    │   ├── about-sdg3.html   /about-sdg3
    │   ├── resources.html    /resources
    │   ├── resource-detail.html /resources/:slug
    │   ├── sounds.html       /sounds
    │   ├── assessment.html   /assessment
    │   ├── find-support.html /find-support
    │   ├── login.html        /login
    │   ├── register.html     /register
    │   └── admin.html        /admin (Dashboard with data-minimised management views)
    ├── partials/             header.html, header-auth.html, footer.html (injected by main.js)
    ├── css/styles.css        Design tokens, focus rings, option rows, chips, sound equalizer
    └── js/
        ├── tailwind-config.js Design tokens (colors, fonts, shadows)
        ├── main.js           Partial injection, active navigation, mobile menu
        ├── assessment.js     Standardized multi-inventory screener (PHQ-9, GAD-7, WHO-5)
        ├── support.js        Directory fetch + region/search/category filtering & helpline intake
        ├── resources.js      Category chip filter & publications catalog
        ├── resource-detail.js Single publication viewer with legal/academic attribution
        ├── sounds.js         Web Audio multi-track ambient mixer & sleep timer
        ├── admin.js          Admin dashboard analytics, pagination, search, and audit-logged details view
        └── auth.js           Client-side auth validation and registration handling
```

## Calming Sounds: Audio Files & Licensing

Ambient audio files are stored in `public/audio/` and served locally under the `media-src 'self'` Content-Security-Policy directive.

- **Recommended format:** MP3 or OGG (or PCM WAV).
- **Duration & Loop:** 1 to 3 minutes of seamlessly loopable audio, kept lightweight (~200KB - 2MB).
- **Licensing requirement:** Only royalty-free or Creative Commons Zero (CC0) recordings should be used.

### Expected Files & Attribution Register

| Filename | Sound Name | Category | Source / Creator | License |
|---|---|---|---|---|
| `rainforest.mp3` | Rainforest Canopy | Nature | Synthesized / Field Recording | CC0 Public Domain |
| `gentle-rain.mp3` | Gentle Rain | Water | Synthesized / Field Recording | CC0 Public Domain |
| `thunderstorm.mp3` | Distant Thunderstorm | Nature | Synthesized / Field Recording | CC0 Public Domain |
| `ocean-waves.mp3` | Ocean Waves | Water | Synthesized / Field Recording | CC0 Public Domain |
| `flowing-stream.mp3` | Flowing Stream | Water | Synthesized / Field Recording | CC0 Public Domain |
| `fireplace.mp3` | Crackling Fireplace | Ambient | Synthesized / Field Recording | CC0 Public Domain |
| `crickets.mp3` | Night Crickets | Night | Synthesized / Field Recording | CC0 Public Domain |
| `wind-trees.mp3` | Wind Through Trees | Nature | Synthesized / Field Recording | CC0 Public Domain |
| `birdsong.mp3` | Morning Birdsong | Nature | Synthesized / Field Recording | CC0 Public Domain |
| `brown-noise.mp3` | Soft Brown Noise | Ambient | Synthesized (Acoustic 1/f²) | CC0 Public Domain |
| `singing-bowls.mp3` | Singing Bowls | Ambient | Synthesized (432Hz Harmonic) | CC0 Public Domain |

## Before you ship

- **HTTPS & Transport Security:** Deploy behind a reverse proxy (e.g. Nginx, Caddy, or Cloudflare) enforcing TLS 1.3, HSTS (`Strict-Transport-Security`), and valid SSL certificates.
- **Session Security:** The current build stores bearer tokens in client `localStorage` for cross-page demo compatibility. For production environments, migrate sessions to `httpOnly`, `Secure`, `SameSite=Strict` cookies to defend against Cross-Site Scripting (XSS) token extraction.
- **Database Backups:** Set up automated, encrypted backups of the MongoDB instance (`mongodump`) stored with off-site redundancy and tested restoration procedures.
- **Privacy Policy & Lawful Basis:** Before onboarding real individuals, establish formal clinical oversight, publish a comprehensive Privacy Policy detailing data retention schedules, and confirm appropriate lawful bases under applicable privacy regulations (such as GDPR Article 9 or HIPAA where relevant).
- **Verify Helpline Numbers:** Periodically verify every phone number and web chat URL in `data/helplines.json` against the official providers' sites. They are safety-critical resources.
