// Writes public/config.js from Vercel Environment Variables at build time.
// SUPABASE_URL / SUPABASE_ANON_KEY (NEXT_PUBLIC_* and VITE_* names are accepted too).
const fs = require('fs');
const path = require('path');
const env = process.env;
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || '';
const key = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const file = path.join(__dirname, '..', 'public', 'config.js');
if (!url || !key) {
  console.warn('[build-config] SUPABASE_URL / SUPABASE_ANON_KEY not set — keeping existing public/config.js');
  process.exit(0);
}
fs.writeFileSync(file, `// generated at build time\nwindow.APP_CONFIG = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key }, null, 2)};\n`);
console.log('[build-config] wrote public/config.js for', url);
