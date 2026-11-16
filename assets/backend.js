// =====================================================================
//  backend.js — เลือกฐานข้อมูลของระบบ
//    • MySQL (XAMPP)  : หน้าเว็บคุยกับ api/index.php (PHP) — ค่าเริ่มต้น
//    • Supabase (Vercel): config.js มี BACKEND: 'supabase' (Vercel สร้างให้ตอน build)
//  ทั้ง 2 แบบใช้คำสั่งรูปแบบเดียวกัน (sb.from(...).select()...) — ไฟล์นี้รวมส่วนที่ต่างกัน
//  เช่น สร้างผู้ใช้, ตั้งรหัสผ่าน, สำรองข้อมูล, ทดสอบการเชื่อมต่อ
// =====================================================================
import { createClient as createPhpClient, api, API } from './db.js';

export const CFG = window.APP_CONFIG || {};
export const MODE = CFG.BACKEND === 'supabase' ? 'supabase' : 'mysql';
export const IS_SUPA = MODE === 'supabase';
export { api, API };

const SUPA_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const MANUAL_KEY = 'eps.supabase.conn';
const BUCKET = 'backups';

// ---------------------------------------------------------------------
//  Supabase connection: Vercel Environment Variables, or a value typed on the
//  connection page (kept in this browser only)
// ---------------------------------------------------------------------
export function supaConn() {
  // a value typed by the admin in this browser wins (to fix / test); otherwise Vercel's Environment Variables
  try {
    const m = JSON.parse(localStorage.getItem(MANUAL_KEY) || 'null');
    if (m?.url && m?.key) return { url: m.url, key: m.key, source: 'manual' };
  } catch { /* ignore */ }
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) return { url: normUrl(CFG.SUPABASE_URL), key: CFG.SUPABASE_ANON_KEY, source: 'env' };
  return null;
}
export const hasManualConn = () => { try { return !!localStorage.getItem(MANUAL_KEY); } catch { return false; } };
export function saveManualConn(url, key) { localStorage.setItem(MANUAL_KEY, JSON.stringify({ url: normUrl(url), key: key.trim() })); }
export function clearManualConn() { try { localStorage.removeItem(MANUAL_KEY); } catch { /* ignore */ } }
export const normUrl = (u) => String(u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

let supaLib = null;
async function loadSupa() {
  if (!supaLib) supaLib = await import(SUPA_CDN);
  return supaLib;
}
export async function supaClient(conn) {
  const { createClient } = await loadSupa();
  return createClient(conn.url, conn.key, { auth: { persistSession: true, autoRefreshToken: true } });
}

/** Check a Supabase URL + anon key: can we reach it, and are the tables installed? */
export async function supaTest(url, key) {
  url = normUrl(url); key = String(key || '').trim();
  if (!/^https:\/\/[^\s/]+/.test(url)) return { ok: false, message: 'Project URL ต้องขึ้นต้นด้วย https:// เช่น https://xxxx.supabase.co' };
  if (key.length < 20) return { ok: false, message: 'กรุณาวาง anon / publishable key ให้ครบ' };
  let r;
  try { r = await fetch(`${url}/rest/v1/settings?select=id&limit=1`, { headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) } }); }
  catch { return { ok: false, message: 'ติดต่อ Supabase ไม่ได้ — ตรวจสอบ Project URL และอินเทอร์เน็ต' }; }
  if (r.status === 401 || r.status === 403) return { ok: false, message: 'anon key ไม่ถูกต้อง (ใช้ anon / publishable key ของโปรเจกต์นี้ ห้ามใช้ service_role)' };
  if (r.status === 404) {
    const j = await r.json().catch(() => ({}));
    if (/settings|relation|schema cache|PGRST205|42P01/i.test(JSON.stringify(j))) return { ok: true, installed: false, message: 'เชื่อมต่อได้ แต่ยังไม่ได้สร้างตาราง — รันไฟล์ใน supabase/ ที่ SQL Editor ก่อน (ดู README)' };
    return { ok: false, message: 'ไม่พบโปรเจกต์ — ตรวจสอบ Project URL' };
  }
  if (!r.ok) return { ok: false, message: `Supabase ตอบกลับ HTTP ${r.status}` };
  return { ok: true, installed: true, message: 'เชื่อมต่อ Supabase สำเร็จ — พบตารางของระบบ' };
}

// ---------------------------------------------------------------------
//  Operations that differ between the two databases
// ---------------------------------------------------------------------
async function supaToken(sb) { const { data } = await sb.auth.getSession(); return data.session?.access_token || ''; }
async function fnCall(sb, path, body) {
  let r;
  try {
    r = await fetch(path, body === undefined
      ? { headers: { Authorization: `Bearer ${await supaToken(sb)}` }, cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await supaToken(sb)}` }, body: JSON.stringify(body), cache: 'no-store' });
  } catch { throw new Error('ติดต่อเซิร์ฟเวอร์ (Vercel) ไม่ได้'); }
  const j = await r.json().catch(() => null);
  if (!j) throw new Error(r.status === 404 ? 'ไม่พบฟังก์ชันบน Vercel — ต้อง deploy บน Vercel (โฟลเดอร์ api/)' : `HTTP ${r.status}`);
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.code === 'not_configured' ? 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Vercel (ดู README)' : j.error || `HTTP ${r.status}`), { code: j.code });
  return j;
}
const phpOk = (r) => { if (r.error) throw r.error; return r; };

/**
 * @param {() => any} getSb  returns the current client (S.sb)
 * @param {() => any} getProfile  returns the signed-in profile
 */
export function makeBackend(getSb, getProfile) {
  if (!IS_SUPA) {
    return {
      mode: 'mysql', label: 'MySQL (XAMPP)',
      createClient: () => createPhpClient(),
      createUser: async (d) => phpOk(await api('admin_create_user', d)),
      setPassword: async (id, password) => phpOk(await api('admin_set_password', { id, password })),
      changePassword: async (old, password) => phpOk(await api('change_password', { old, password })),
      backupStatus: async () => { const r = await api('backup_status'); return r.error ? null : r; },
      backupRun: async (type) => phpOk(await api('backup_run', { type })),
      backupDownload: async (path) => {
        const resp = await fetch(`${API}?a=backup_download&path=${encodeURIComponent(path)}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!resp.ok) { const j = await resp.json().catch(() => null); throw new Error(j?.error?.message || `ดาวน์โหลดไม่สำเร็จ (HTTP ${resp.status})`); }
        return resp.blob();
      },
      backupRemove: async (path) => phpOk(await api('backup_remove', { path })),
      backupWhere: 'โฟลเดอร์ private/backups บนเครื่องเซิร์ฟเวอร์',
    };
  }
  return {
    mode: 'supabase', label: 'Supabase',
    createUser: (d) => fnCall(getSb(), '/api/admin-users', d),
    setPassword: (id, password) => fnCall(getSb(), '/api/admin-users', { action: 'set_password', id, password }),
    changePassword: async (old, password) => {
      const sb = getSb(); const email = getProfile()?.email || (await sb.auth.getUser()).data.user?.email;
      const chk = await sb.auth.signInWithPassword({ email, password: old });
      if (chk.error) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      return { ok: true };
    },
    backupStatus: async () => { try { const r = await fetch('/api/backup?status=1', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } },
    backupRun: (type) => fnCall(getSb(), `/api/backup?force=1&type=${type === 'manual' ? 'manual' : 'auto'}`),
    backupDownload: async (path) => { const { data, error } = await getSb().storage.from(BUCKET).download(path); if (error) throw error; return data; },
    backupRemove: async (path) => { const { error } = await getSb().storage.from(BUCKET).remove([path]); if (error) throw error; return { ok: true }; },
    backupWhere: 'Supabase Storage (bucket: backups)',
  };
}
