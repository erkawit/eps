// =====================================================================
//  /api/db?a=<action> — the system's API on Vercel + Neon PostgreSQL
//  (same actions and request format as api/index.php for MySQL/XAMPP,
//   so the web page uses the same client: assets/db.js)
//
//  Environment variables (Vercel → Settings → Environment Variables):
//    DATABASE_URL  Neon connection string (pooled), e.g.
//                  postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
//    AUTH_SECRET   long random string used to sign the login cookie
// =====================================================================
const { withClient, ApiError, friendly } = require('./_lib/db');
const A = require('./_lib/auth');
const { handleQuery, perms } = require('./_lib/query');
const { handleRpc } = require('./_lib/rpc');
const B = require('./_lib/backup');

const REQUIRED_TABLES = ['settings', 'titles', 'provinces', 'postcodes', 'customers', 'books', 'letters', 'print_logs', 'backup_logs', 'profiles', 'envelope_layouts', 'cheque_banks', 'cheque_accounts', 'cheques', 'cheque_forms', 'cheque_print_logs', 'backup_files'];

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

const ok = (data) => ({ data, error: null });
const meName = (me) => (me ? String(me.full_name || me.email || '') : '');

function requireLogin(me) { if (!me) throw new ApiError('กรุณาเข้าสู่ระบบ', 401, 'not_signed_in'); return me; }
function requireAdmin(me) { requireLogin(me); if (!perms(me).admin) throw new ApiError('เฉพาะผู้ดูแลระบบ', 403); }

/** Connection state, used by the page before the login screen. */
async function connStatus() {
  const s = { configured: true, connected: false, installed: false, has_users: false, missing: [], error: null, can_setup: false, backend: 'neon' };
  try {
    await withClient(async (c) => {
      s.connected = true;
      const { rows } = await c.query("select table_name from information_schema.tables where table_schema = 'public'");
      const have = new Set(rows.map((r) => r.table_name));
      const auth = await c.query("select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users'");
      s.missing = REQUIRED_TABLES.filter((t) => !have.has(t));
      if (!auth.rowCount) s.missing.push('auth.users');
      s.installed = !s.missing.length;
      if (s.installed) s.has_users = Number((await c.query('select count(*) n from auth.users')).rows[0].n) > 0;
    });
  } catch (e) {
    if (e.code === 'not_configured') s.configured = false;
    s.error = e.message;
  }
  return s;
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const a = url.searchParams.get('a') || '';
  try {
    // state-changing calls must be JSON POSTs from this site (blocks cross-site form posts)
    if (req.method === 'POST' && !/application\/json/i.test(String(req.headers['content-type'] || ''))) throw new ApiError('ต้องส่งข้อมูลแบบ JSON', 415);
    const body = req.method === 'POST' ? await readBody(req) : {};

    if (a === 'status') return send(res, 200, await connStatus());

    if (a === 'backup_download') {
      const buf = await withClient(async (c) => { requireAdmin(await A.loadMe(c, req)); return B.readBackup(c, String(url.searchParams.get('path') || '')); });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Content-Disposition', `attachment; filename="${String(url.searchParams.get('path')).split('/').pop()}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    }

    const out = await withClient(async (c) => {
      const me = await A.loadMe(c, req);
      if (me) await c.query("select set_config('app.user_id', $1, true)", [me.id]);
      switch (a) {
        // ---------- sign-in ----------
        case 'session': {
          if (!me) return ok({ session: null });
          const u = (await c.query('select * from auth.users where id = $1', [me.id])).rows[0];
          A.startSession(req, res, u); // renew the 30-day cookie while in use
          const user = { id: me.id, email: me.login_email || me.email };
          return ok({ session: { access_token: 'cookie', user } });
        }
        case 'login': return ok(await A.login(c, req, res, body.email, body.password));
        case 'logout': A.endSession(req, res); return ok(null);
        case 'signup': {
          const u = await A.createUser(c, body.email, body.password, body.full_name);
          return ok({ user: u, session: null });
        }
        case 'admin_create_user': {
          requireAdmin(me);
          const role = body.role === 'admin' ? 'admin' : 'staff';
          const pe = role === 'admin' ? true : body.perm_envelope !== false;
          const pc = role === 'admin' ? true : !!body.perm_cheque;
          if (!pe && !pc) throw new ApiError('กรุณาเลือกสิทธิ์อย่างน้อย 1 ระบบ');
          if (!String(body.full_name || '').trim()) throw new ApiError('กรุณากรอกชื่อ');
          const u = await A.createUser(c, body.email, body.password, body.full_name, { role, perm_envelope: pe, perm_cheque: pc });
          return { ok: true, id: u.id, email: u.email };
        }
        case 'admin_set_password': {
          requireAdmin(me);
          const u = await A.setPassword(c, String(body.id || ''), body.password);
          if (u.id === me.id) A.startSession(req, res, u);
          return { ok: true };
        }
        case 'change_password': {
          requireLogin(me);
          const cur = (await c.query('select encrypted_password from auth.users where id = $1', [me.id])).rows[0];
          if (!cur || !(await A.checkPassword(String(body.old || ''), cur.encrypted_password))) throw new ApiError('รหัสผ่านเดิมไม่ถูกต้อง');
          if (String(body.password || '').length < 6) throw new ApiError('รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร');
          A.startSession(req, res, await A.setPassword(c, me.id, body.password)); // keep this browser signed in
          return { ok: true };
        }

        // ---------- data ----------
        case 'query': return { ...(await handleQuery(c, me, body)), error: null };
        case 'rpc': return ok(await handleRpc(c, me, body));

        // ---------- backups ----------
        case 'backup_status': requireAdmin(me); return { configured: true, mode: 'neon', cron_secret: !!process.env.CRON_SECRET };
        case 'backup_run': {
          requireAdmin(me);
          const type = body.type === 'auto' ? 'auto' : 'manual';
          return B.runBackup(c, type, meName(me) + (type === 'auto' ? ' (สั่งจากหน้าเว็บ)' : ''), me.id);
        }
        case 'backup_remove': requireAdmin(me); await B.removeBackup(c, String(body.path || '')); return { ok: true };

        // ---------- connection page (admin) ----------
        case 'conn_info': {
          requireAdmin(me);
          const v = (await c.query("select version() v, current_database() db, current_user u, inet_server_addr()::text host")).rows[0];
          let host = '';
          try { host = new URL(require('./_lib/db').dbUrl()).hostname; } catch { /* ignore */ }
          const counts = {};
          for (const t of ['profiles', 'customers', 'letters', 'cheques', 'backup_logs']) counts[t] = Number((await c.query(`select count(*) n from public.${t}`)).rows[0].n);
          return { backend: 'neon', host, database: v.db, username: v.u, version: v.v, counts, auth_secret: !!(process.env.AUTH_SECRET || process.env.SESSION_SECRET), cron_secret: !!process.env.CRON_SECRET };
        }
      }
      throw new ApiError('ไม่รู้จักคำสั่ง', 404);
    }, { tx: true });
    return send(res, 200, out);
  } catch (e0) {
    const e = friendly(e0);
    if (!(e0 instanceof ApiError) && !e0.code) console.error(e0);
    return send(res, e.status || 400, { data: null, error: { message: e.message, code: e.code || '' } });
  }
};
