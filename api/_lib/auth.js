// =====================================================================
//  Sign-in (replaces Supabase Auth)
//  • logins are in auth.users (bcrypt hash — same format as Supabase, so
//    users migrated from Supabase keep their passwords)
//  • the session is a signed HttpOnly cookie (HMAC-SHA256 with AUTH_SECRET)
// =====================================================================
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ApiError, dbUrl } = require('./db');

const COOKIE = 'eps_session';
const MAX_AGE = 30 * 24 * 3600; // seconds — a session lasts 30 days (renewed while in use)

function secret() {
  const s = process.env.AUTH_SECRET || process.env.SESSION_SECRET || '';
  if (s) return s;
  // fallback: derived from the (secret) database URL so the system works before AUTH_SECRET is set
  const u = dbUrl();
  if (!u) throw new ApiError('ยังไม่ได้ตั้งค่า AUTH_SECRET', 503, 'not_configured');
  return crypto.createHash('sha256').update(`eps-session:${u}`).digest('hex');
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');
/** short fingerprint of the password hash: changing the password ends old sessions */
const pwTag = (hash) => crypto.createHash('sha256').update(String(hash)).digest('base64url').slice(0, 12);

function makeToken(user) {
  const data = b64(JSON.stringify({ uid: user.id, pv: pwTag(user.encrypted_password), exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  return `${data}.${sign(data)}`;
}

function readToken(req) {
  const raw = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const tok = decodeURIComponent(raw.slice(COOKIE.length + 1));
  const [data, sig] = tok.split('.');
  if (!data || !sig) return null;
  const want = sign(data);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!p.uid || !p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

function isHttps(req) {
  return String(req.headers['x-forwarded-proto'] || '').includes('https') || !!req.socket?.encrypted;
}
function setCookie(req, res, value, maxAge) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
const startSession = (req, res, user) => setCookie(req, res, makeToken(user), MAX_AGE);
const endSession = (req, res) => setCookie(req, res, '', 0);

/** The signed-in user's profile (or null). */
async function loadMe(c, req) {
  const t = readToken(req);
  if (!t) return null;
  const { rows } = await c.query(
    `select p.*, u.email as login_email, u.encrypted_password
       from public.profiles p join auth.users u on u.id = p.id where p.id = $1`, [t.uid]);
  const p = rows[0];
  if (!p || pwTag(p.encrypted_password) !== t.pv) return null;
  // kept out of JSON output, used to renew the cookie without another query
  Object.defineProperty(p, 'login', { value: { id: p.id, encrypted_password: p.encrypted_password }, enumerable: false });
  delete p.encrypted_password;
  return p;
}

const hashPassword = (pw) => bcrypt.hash(pw, 10);
const checkPassword = (pw, hash) => (hash ? bcrypt.compare(pw, hash) : Promise.resolve(false));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a login. The trigger on auth.users creates the profile
 * (the very first user becomes the active admin, others wait for approval).
 */
async function createUser(c, email, password, fullName, opt = null) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  if (!EMAIL_RE.test(email)) throw new ApiError('อีเมลไม่ถูกต้อง');
  if (password.length < 6) throw new ApiError('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  const dup = await c.query('select 1 from auth.users where email = $1', [email]);
  if (dup.rowCount) throw new ApiError('อีเมลนี้มีผู้ใช้งานแล้ว', 409, 'user_already_exists');
  const name = String(fullName || '').trim() || email.split('@')[0];
  const { rows } = await c.query(
    `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), jsonb_build_object('full_name', $3::text)) returning id, email`,
    [email, await hashPassword(password), name]);
  const u = rows[0];
  if (opt) {
    await c.query(
      'update public.profiles set active = true, role = $2, full_name = $3, perm_envelope = $4, perm_cheque = $5 where id = $1',
      [u.id, opt.role, name, opt.perm_envelope, opt.perm_cheque]);
  }
  return u;
}

async function login(c, req, res, email, password) {
  email = String(email || '').trim().toLowerCase();
  const { rows } = await c.query('select * from auth.users where email = $1', [email]);
  const u = rows[0];
  if (!u || !(await checkPassword(String(password || ''), u.encrypted_password))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    throw new ApiError('Invalid login credentials', 400, 'invalid_credentials');
  }
  await c.query('update auth.users set last_sign_in_at = now() where id = $1', [u.id]);
  startSession(req, res, u);
  const user = { id: u.id, email: u.email };
  return { user, session: { access_token: 'cookie', user } };
}

async function setPassword(c, id, password) {
  if (String(password || '').length < 6) throw new ApiError('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  const r = await c.query('update auth.users set encrypted_password = $2, updated_at = now(), email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1 returning *',
    [id, await hashPassword(password)]);
  if (!r.rowCount) throw new ApiError('ไม่พบผู้ใช้', 404);
  return r.rows[0];
}

module.exports = { loadMe, createUser, login, setPassword, checkPassword, startSession, endSession, EMAIL_RE };
