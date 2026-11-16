// =====================================================================
//  Vercel build (โหมด Supabase): copy the web files to dist/ and write
//  dist/config.js from the Environment Variables SUPABASE_URL / SUPABASE_ANON_KEY
//  (NEXT_PUBLIC_* and VITE_* names are accepted too).
//  PHP / MySQL files (api/*.php, database/, private/) are never deployed.
// =====================================================================
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const env = process.env;
// fallback: public values committed in supabase/public-config.json (URL + publishable/anon key only)
let pub = {};
try { pub = JSON.parse(fs.readFileSync(path.join(root, 'supabase', 'public-config.json'), 'utf8')); } catch { /* none */ }
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || pub.SUPABASE_URL || '';
const key = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || pub.SUPABASE_ANON_KEY || '';
if (/^sb_secret_|service_role/i.test(key)) { console.error('[build] SUPABASE_ANON_KEY must be the anon / publishable key, not the secret / service_role key'); process.exit(1); }

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of ['index.html', 'favicon.png']) fs.copyFileSync(path.join(root, f), path.join(dist, f));
for (const d of ['assets', 'fonts']) fs.cpSync(path.join(root, d), path.join(dist, d), { recursive: true });

const cfg = { BACKEND: 'supabase', SUPABASE_URL: url, SUPABASE_ANON_KEY: key };
fs.writeFileSync(path.join(dist, 'config.js'), `// generated at build time (Vercel)\nwindow.APP_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`);
console.log(url && key ? `[build] dist/ ready — Supabase ${url}` : '[build] dist/ ready — SUPABASE_URL / SUPABASE_ANON_KEY not set: the site will ask for the connection on first open');
