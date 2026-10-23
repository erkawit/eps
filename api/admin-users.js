// =====================================================================
//  /api/admin-users — admin creates a user that can sign in immediately
//  (e-mail already confirmed, no confirmation e-mail is sent).
//
//  POST  { email, password, full_name, role }   Authorization: Bearer <admin access token>
//  GET   ?status=1  → { configured }
//
//  Needs Vercel env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server only).
// =====================================================================
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports = async function handler(req, res) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  const q = new URL(req.url, 'http://localhost').searchParams;
  if (q.get('status')) return send(res, 200, { configured: Boolean(base && key) });
  if (!base || !key) return send(res, 501, { ok: false, code: 'not_configured', error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Vercel' });
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });

  const H = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
  try {
    // ---- caller must be an active admin ----
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return send(res, 401, { ok: false, error: 'unauthorized' });
    const u = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!u.ok) return send(res, 401, { ok: false, error: 'unauthorized' });
    const caller = await u.json();
    const pr = await fetch(`${base}/rest/v1/profiles?id=eq.${caller.id}&select=role,active`, { headers: H });
    const [p] = pr.ok ? await pr.json() : [];
    if (!p || p.role !== 'admin' || !p.active) return send(res, 403, { ok: false, error: 'เฉพาะผู้ดูแลระบบ' });

    // ---- validate input ----
    const b = await readBody(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const full_name = String(b.full_name || '').trim();
    const role = b.role === 'admin' ? 'admin' : 'staff';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { ok: false, error: 'อีเมลไม่ถูกต้อง' });
    if (password.length < 6) return send(res, 400, { ok: false, error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' });
    if (!full_name) return send(res, 400, { ok: false, error: 'กรุณากรอกชื่อ' });

    // ---- create the user, already confirmed (Admin API sends no e-mail) ----
    const c = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name } }),
    });
    const created = await c.json().catch(() => ({}));
    if (!c.ok) {
      const msg = created.msg || created.message || created.error_description || created.error || `HTTP ${c.status}`;
      const dup = c.status === 422 || /already|exists|registered/i.test(msg);
      return send(res, dup ? 409 : 400, { ok: false, error: dup ? 'อีเมลนี้มีผู้ใช้งานแล้ว' : msg });
    }

    // ---- profile is created by trigger; activate it with the chosen role ----
    const up = await fetch(`${base}/rest/v1/profiles?id=eq.${created.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ active: true, role, full_name }),
    });
    if (!up.ok) throw new Error(`update profile → HTTP ${up.status}: ${(await up.text()).slice(0, 200)}`);
    return send(res, 200, { ok: true, id: created.id, email });
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: e.message });
  }
};
