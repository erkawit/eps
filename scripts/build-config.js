// =====================================================================
//  Vercel build (โหมด Neon): copy the web files to dist/ and write
//  dist/config.js → the web page talks to /api/db (Vercel Function → Neon).
//  The database connection (DATABASE_URL) stays on the server only.
//  PHP / MySQL files (api/*.php, database/, private/) are never deployed.
// =====================================================================
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const env = process.env;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of ['index.html', 'favicon.png']) fs.copyFileSync(path.join(root, f), path.join(dist, f));
for (const d of ['assets', 'fonts']) fs.cpSync(path.join(root, d), path.join(dist, d), { recursive: true });

const cfg = { BACKEND: 'neon', API_URL: '/api/db' };
fs.writeFileSync(path.join(dist, 'config.js'), `// generated at build time (Vercel)\nwindow.APP_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`);
const hasDb = Boolean(env.DATABASE_URL || env.POSTGRES_URL || env.NEON_DATABASE_URL);
console.log(hasDb ? '[build] dist/ ready — Neon PostgreSQL via /api/db' : '[build] dist/ ready — DATABASE_URL is not set yet: set it in Vercel → Environment Variables and redeploy');
