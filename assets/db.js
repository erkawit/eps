// =====================================================================
//  db.js — ตัวเชื่อมหน้าเว็บกับ API PHP + MySQL (XAMPP)
//  รูปแบบคำสั่งเหมือน supabase-js ส่วนที่ระบบใช้ เช่น
//    await sb.from('customers').select('*').eq('active', true).order('id').range(0, 99)
//    await sb.rpc('issue_letters', { ... })
//    await sb.auth.signInWithPassword({ email, password })
//  ทุกคำสั่งคืนค่า { data, error, count } (ไม่ throw)
// =====================================================================
export const API = new URL('api/index.php', new URL('..', import.meta.url)).href;

const errObj = (message, code, status) => ({ message, code: code || '', status: status || 0 });

export async function api(action, payload, opts = {}) {
  const url = `${API}?a=${encodeURIComponent(action)}${opts.query || ''}`;
  let r;
  try {
    r = await fetch(url, payload === undefined
      ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) {
    return { data: null, error: errObj('ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่าเปิด Apache ใน XAMPP แล้ว', 'network') };
  }
  let j = null;
  try { j = await r.json(); } catch { /* not json */ }
  if (!j) return { data: null, error: errObj(r.status === 404 ? 'ไม่พบ API (api/index.php) — ตรวจสอบตำแหน่งโฟลเดอร์ใน htdocs' : `เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (HTTP ${r.status}) — PHP อาจเกิดข้อผิดพลาด`, 'bad_response', r.status) };
  if (!r.ok || (j.error && typeof j.error === 'object')) {
    const e = errObj(j.error?.message || `HTTP ${r.status}`, j.error?.code, r.status);
    if (r.status === 401 && opts.onUnauthorized) opts.onUnauthorized();
    return { ...j, data: null, error: e };
  }
  return j;
}

class Query {
  constructor(client, table) {
    this.c = client; this.q = { table, op: 'select', columns: '*', filters: [], or: [], order: [] };
    this.mode = 'many';
  }
  select(columns = '*', o = {}) {
    if (this.q.op === 'select') { this.q.columns = columns; if (o.count) this.q.count = true; if (o.head) this.q.head = true; }
    else this.returning = true;
    return this;
  }
  insert(values) { this.q.op = 'insert'; this.q.values = values; return this; }
  update(values) { this.q.op = 'update'; this.q.values = values; return this; }
  delete() { this.q.op = 'delete'; return this; }
  f(c, op, v) { this.q.filters.push({ c, op, v }); return this; }
  eq(c, v) { return this.f(c, 'eq', v); }
  neq(c, v) { return this.f(c, 'neq', v); }
  gt(c, v) { return this.f(c, 'gt', v); }
  gte(c, v) { return this.f(c, 'gte', v); }
  lt(c, v) { return this.f(c, 'lt', v); }
  lte(c, v) { return this.f(c, 'lte', v); }
  like(c, v) { return this.f(c, 'like', v); }
  ilike(c, v) { return this.f(c, 'ilike', v); }
  is(c, v) { return this.f(c, 'is', v); }
  in(c, v) { return this.f(c, 'in', v); }
  or(expr) { this.q.or.push(expr); return this; }
  order(c, o = {}) { this.q.order.push({ c, asc: o.ascending !== false }); return this; }
  range(from, to) { this.q.range = [from, to]; return this; }
  limit(n) { this.q.limit = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  async run() {
    const res = await api('query', this.q, { onUnauthorized: this.c.onUnauthorized });
    if (res.error) return { data: null, error: res.error, count: null };
    let data = res.data;
    if (this.mode !== 'many' && Array.isArray(data)) {
      if (data.length > 1 && this.mode === 'single') return { data: null, error: errObj('พบข้อมูลมากกว่า 1 แถว'), count: res.count };
      if (!data.length && this.mode === 'single') return { data: null, error: errObj('ไม่พบข้อมูล', 'PGRST116'), count: res.count };
      data = data[0] || null;
    }
    return { data, error: null, count: res.count ?? null };
  }
  then(ok, bad) { return this.run().then(ok, bad); }
}

export function createClient() {
  const listeners = new Set();
  const client = {
    onUnauthorized: null,
    from: (table) => new Query(client, table),
    rpc: async (fn, args = {}) => { const r = await api('rpc', { fn, args }, { onUnauthorized: client.onUnauthorized }); return { data: r.error ? null : r.data, error: r.error || null }; },
    auth: {
      async getSession() { const r = await api('session'); return { data: { session: r.data?.session || null }, error: r.error || null }; },
      async signInWithPassword({ email, password }) { const r = await api('login', { email, password }); if (!r.error) listeners.forEach((f) => f('SIGNED_IN', r.data.session)); return { data: r.data || { user: null, session: null }, error: r.error || null }; },
      async signUp({ email, password, options = {} }) { const r = await api('signup', { email, password, full_name: options.data?.full_name || '' }); return { data: r.data || { user: null }, error: r.error || null }; },
      async signOut() { const r = await api('logout', {}); listeners.forEach((f) => f('SIGNED_OUT', null)); return { error: r.error || null }; },
      onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
    },
  };
  return client;
}
