// =====================================================================
//  /api/backup — automatic daily backup (Vercel Cron, 00:00 Asia/Bangkok = 17:00 UTC)
//  If nobody pressed "สำรองข้อมูลตอนนี้" yesterday, a full backup is saved
//  in the Neon table public.backup_files (path: <ปี พ.ศ.>/<เดือน>/<วันที่>/...).
//
//  • Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically.
//  • GET /api/backup?status=1 only reports whether it is configured.
//  • Admins run backups from the web page through /api/db (backup_run).
//
//  Environment variables: DATABASE_URL (Neon), CRON_SECRET (long random string)
// =====================================================================
const { withClient, dbUrl } = require('./_lib/db');
const B = require('./_lib/backup');

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const q = new URL(req.url, 'http://localhost').searchParams;
  const secret = process.env.CRON_SECRET || '';
  if (q.get('status')) return send(res, 200, { configured: Boolean(dbUrl()), cron_secret: Boolean(secret) });

  const auth = String(req.headers.authorization || '');
  const isCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
  if (!isCron) return send(res, 401, { ok: false, error: 'unauthorized' });

  try {
    const out = await withClient(async (c) => {
      const skip = await B.autoSkipReason(c);
      if (skip) return { ok: true, skipped: true, reason: skip };
      return B.runBackup(c, 'auto', 'ระบบอัตโนมัติ', null);
    }, { tx: true });
    return send(res, 200, out);
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: e.message });
  }
};
