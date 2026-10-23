// =====================================================================
//  /api/backup — automatic daily backup (Vercel Serverless Function)
//
//  • Vercel Cron calls this every day at 00:00 Asia/Bangkok (17:00 UTC).
//    If nobody pressed "สำรองข้อมูลตอนนี้" yesterday, a full backup is
//    written to Supabase Storage:  backups/<ปี พ.ศ.>/<เดือน>/<วันที่>/...
//  • An admin can also trigger it from the web page (?force=1 + user token).
//  • GET /api/backup?status=1 only reports whether it is configured.
//
//  Environment variables (Vercel → Settings → Environment Variables):
//    SUPABASE_URL               Project URL
//    SUPABASE_SERVICE_ROLE_KEY  service_role / secret key (server only!)
//    CRON_SECRET                any long random string (Vercel sends it
//                               automatically as "Authorization: Bearer ...")
// =====================================================================
const zlib = require('zlib');

const TABLES = ['settings', 'titles', 'provinces', 'postcodes', 'customers', 'books', 'letters', 'print_logs', 'profiles', 'backup_logs'];
const BUCKET = 'backups';

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Bangkok wall-clock parts for a Date. */
function bkk(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return {
    ce: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`,
    be: t.getUTCFullYear() + 543, mm: p(t.getUTCMonth() + 1), dd: p(t.getUTCDate()),
    hh: p(t.getUTCHours()), mi: p(t.getUTCMinutes()), ss: p(t.getUTCSeconds()),
  };
}

module.exports = async function handler(req, res) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  const secret = process.env.CRON_SECRET || '';
  const q = new URL(req.url, 'http://localhost').searchParams;

  if (q.get('status')) return send(res, 200, { configured: Boolean(base && key), cron_secret: Boolean(secret) });
  if (!base || !key) return send(res, 500, { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน Vercel' });

  const H = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
  const api = async (path, init = {}) => {
    const r = await fetch(`${base}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} → HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r;
  };

  try {
    // ---------- who is calling? ----------
    const auth = req.headers.authorization || '';
    const isCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
    let by = 'ระบบอัตโนมัติ', byId = null;
    if (!isCron) {
      const token = auth.replace(/^Bearer\s+/i, '');
      if (!token) return send(res, 401, { ok: false, error: 'unauthorized' });
      const u = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
      if (!u.ok) return send(res, 401, { ok: false, error: 'unauthorized' });
      const user = await u.json();
      const [p] = await (await api(`/rest/v1/profiles?id=eq.${user.id}&select=role,active,full_name,email`)).json();
      if (!p || p.role !== 'admin' || !p.active) return send(res, 403, { ok: false, error: 'เฉพาะผู้ดูแลระบบ' });
      by = `${p.full_name || p.email} (สั่งจากหน้าเว็บ)`; byId = user.id;
    }

    // ---------- skip if a manual backup was made yesterday ----------
    const now = new Date();
    const today = bkk(now).ce;
    const yb = bkk(new Date(now.getTime() - 864e5));
    const yesterday = yb.ce;
    const force = !isCron && q.get('force') === '1';
    if (!force) {
      const enc = encodeURIComponent;
      const manual = await (await api(`/rest/v1/backup_logs?select=id&backup_type=eq.manual&created_at=gte.${enc(`${yesterday}T00:00:00+07:00`)}&created_at=lt.${enc(`${today}T00:00:00+07:00`)}&limit=1`)).json();
      if (manual.length) return send(res, 200, { ok: true, skipped: true, reason: `มีการกดสำรองข้อมูลเมื่อวันที่ ${yb.dd}/${yb.mm}/${yb.be} แล้ว` });
      const auto = await (await api(`/rest/v1/backup_logs?select=id&backup_type=eq.auto&created_at=gte.${enc(`${today}T00:00:00+07:00`)}&limit=1`)).json();
      if (auto.length) return send(res, 200, { ok: true, skipped: true, reason: 'วันนี้สำรองอัตโนมัติไปแล้ว' });
    }

    // ---------- export every table ----------
    const tables = {}; const row_counts = {};
    for (const t of TABLES) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await (await api(`/rest/v1/${t}?select=*&order=id.asc&limit=1000&offset=${offset}`)).json();
        rows.push(...page);
        if (page.length < 1000) break;
      }
      tables[t] = rows; row_counts[t] = rows.length;
    }

    const b = bkk(now);
    const path = `${b.be}/${b.mm}/${b.dd}/backup_${b.be}-${b.mm}-${b.dd}_${b.hh}${b.mi}${b.ss}_auto.json.gz`;
    const body = zlib.gzipSync(Buffer.from(JSON.stringify({
      meta: { app: 'envelope-print-system', format: 1, type: 'auto', path, created_at: now.toISOString(), created_by: by, supabase_url: base, row_counts },
      tables,
    })));

    await api(`/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST', body, headers: { 'Content-Type': 'application/gzip', 'x-upsert': 'true' },
    });
    await api('/rest/v1/backup_logs', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ backup_type: 'auto', path, size_bytes: body.length, row_counts, created_by: byId, created_by_name: by }),
    });
    return send(res, 200, { ok: true, path, size_bytes: body.length, row_counts });
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: e.message });
  }
};
