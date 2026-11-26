// =====================================================================
//  npm run dev — run the Vercel version on this computer (http://localhost:3000)
//  Serves dist/ and runs api/db.js + api/backup.js like Vercel does.
//    DATABASE_URL="postgresql://..." npm run dev
// =====================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.json': 'application/json', '.svg': 'image/svg+xml' };
const handlers = { '/api/db': require('../api/db.js'), '/api/backup': require('../api/backup.js') };

http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (handlers[p]) {
    try { return await handlers[p](req, res); } catch (e) { console.error(e); res.statusCode = 500; return res.end(String(e)); }
  }
  let f = path.join(dist, p === '/' ? 'index.html' : p);
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}  (API: /api/db → ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'ยังไม่ได้ตั้ง DATABASE_URL'})`));
