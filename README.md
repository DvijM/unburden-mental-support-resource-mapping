# Unburden — Accessible Mental Support & Resource Mapping

Node.js + Express server serving six Tailwind-styled pages, a helplines JSON API,
and a small file-backed auth demo.

## Run

```bash
npm install
npm start            # http://localhost:3000
npm run dev          # auto-restart on change (Node 18.11+)
```

`PORT` can be overridden: `PORT=8080 npm start`.

## Structure

```
unburden/
├── server.js                 Express: page routes, /api/helplines, /api/register, /api/login
├── package.json
├── data/
│   ├── helplines.json        Directory listings served to the Find Support page
│   └── users.json            Created on first registration (git-ignored)
└── public/
    ├── pages/                One HTML file per screen
    │   ├── index.html        /
    │   ├── resources.html    /resources
    │   ├── assessment.html   /assessment
    │   ├── find-support.html /find-support
    │   ├── login.html        /login
    │   └── register.html     /register
    ├── partials/             header.html, header-auth.html, footer.html (injected by main.js)
    ├── css/styles.css        Gradients, focus rings, option rows, chips
    └── js/
        ├── tailwind-config.js  Design tokens (colors, fonts, shadows)
        ├── main.js             Partial injection, active nav, mobile menu
        ├── assessment.js       PHQ-9 flow + scoring (runs entirely client-side)
        ├── support.js          Directory fetch + region/search/category filtering
        ├── resources.js        Category chip filter
        └── auth.js             Login/register validation and submit
```

## Before you ship

- **Tailwind** loads from the CDN for zero-setup development. For production,
  install Tailwind and build a static stylesheet, then drop the CDN script and
  the `unsafe-eval` entry in the CSP in `server.js`.
- **Auth is a demo.** Passwords are hashed with scrypt, but there are no
  sessions/cookies, no rate limiting, and `users.json` is not safe under
  concurrent writes. Replace `readUsers`/`writeUsers` with a database and add
  session handling.
- **Verify every helpline number and URL** in `data/helplines.json` against the
  organisation's own site before publishing. They are safety-critical.
- **Images:** resource cards and the hero use CSS-drawn placeholders. Replace
  them with `<img>` tags (with real `alt` text) and add your image host to
  `img-src` in the CSP.
