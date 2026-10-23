// =====================================================================
//  ระบบพิมพ์ซองจดหมาย — Envelope Printing System
//  Vanilla JS + Supabase + SweetAlert2 (no build step)
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { ENVELOPES, esc, renderEnvelope, pageCss, envSize, areaLine, SAMPLE_LETTER, resolveLayout, defaultLayout } from './envelope.js';

const CFG = window.APP_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = () => $('#view');

const S = {
  sb: null, session: null, profile: null,
  settings: {}, books: [], titles: [], provinces: [],
  basket: [],
  issue: { envelope: 'white', urgency: 'ปกติ', book_id: null, subject: '' },
  reg: null,
};
const isAdmin = () => S.profile?.role === 'admin';
const URGENCY = ['ปกติ', 'ด่วน', 'ด่วนมาก', 'ด่วนที่สุด'];

// ---------------------------------------------------------------------
//  Small helpers
// ---------------------------------------------------------------------
const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, timerProgressBar: true });
const ok = (title) => Toast.fire({ icon: 'success', title });
const warn = (title) => Toast.fire({ icon: 'warning', title });
const fail = (e) => Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: thaiError(e), confirmButtonText: 'ตกลง' });
const ask = (title, html, o = {}) =>
  Swal.fire({ icon: 'question', title, html, showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก', reverseButtons: true, ...o })
    .then((r) => r.isConfirmed);
const loading = (title = 'กำลังดำเนินการ...') => Swal.fire({ title, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

function thaiError(e) {
  const m = e?.message || String(e);
  if (/Invalid login/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (/Email not confirmed/i.test(m)) return 'บัญชียังไม่ได้รับการยืนยัน กรุณาติดต่อผู้ดูแลระบบให้อนุมัติ (หรือกดลิงก์ยืนยันในอีเมล)';
  if (/already registered|already been registered/i.test(m)) return 'อีเมลนี้มีผู้ใช้งานแล้ว';
  if (/Password should be/i.test(m)) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (/duplicate key/i.test(m)) return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
  if (/foreign key/i.test(m)) return 'ลบไม่ได้ เนื่องจากข้อมูลนี้ถูกใช้งานอยู่';
  if (/row-level security|permission denied/i.test(m)) return 'ไม่มีสิทธิ์ดำเนินการนี้';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต';
  return m;
}
async function must(p) { const { data, error } = await p; if (error) throw error; return data; }
async function mustCount(p) { const { data, error, count } = await p; if (error) throw error; return { data, count }; }
const clean = (s) => (s || '').replace(/[,()%*\\"]/g, ' ').trim();
const bkkDate = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
const beYear = () => Number(bkkDate().slice(0, 4)) + 543;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' }) : '');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '');
const num = (n) => Number(n || 0).toLocaleString('th-TH');
const provName = (id) => S.provinces.find((p) => p.id === id)?.name || '';
const titleName = (id) => (id ? S.titles.find((t) => t.id === id)?.name || '' : '');
const fullName = (c) => [c.title_id ? titleName(c.title_id) : '', c.name].filter((x) => x && x !== '-').join(' ');
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(label)}</option>`;
const val = (id) => document.getElementById(id)?.value?.trim() ?? '';

const ICONS = {
  layout: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  reports: '<path d="M3 3v18h18"/><path d="M8 17V11M13 17V7M18 17v-4"/>',
  backup: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1zM10 12h4"/>',
  connection: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  dashboard: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  issue: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  register: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  recipients: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
  books: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  master: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};
const icon = (k) => `<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ''}</svg>`;

// ---------------------------------------------------------------------
//  Routes
// ---------------------------------------------------------------------
const ROUTES = {
  issue: { group: 'staff', title: 'ออกเลขหนังสือ', render: viewIssue },
  register: { group: 'staff', title: 'ทะเบียนหนังสือส่ง / พิมพ์ซอง', nav: 'ทะเบียน / พิมพ์ซอง', render: viewRegister },
  recipients: { group: 'staff', title: 'ผู้รับ / หน่วยงาน', render: viewRecipients },
  reports: { group: 'staff', title: 'รายงานการพิมพ์ซอง', render: viewReports },
  layout: { group: 'staff', title: 'ตั้งค่าตำแหน่งบนซอง', render: viewLayout },
  dashboard: { group: 'admin', title: 'ภาพรวมระบบ', render: viewDashboard },
  books: { group: 'admin', title: 'เล่มทะเบียนเลขหนังสือ', render: viewBooks },
  users: { group: 'admin', title: 'ผู้ใช้งาน', render: viewUsers },
  master: { group: 'admin', title: 'ข้อมูลหลัก', render: viewMaster },
  settings: { group: 'admin', title: 'ตั้งค่าหน่วยงานและซอง', render: viewSettings },
  backup: { group: 'admin', title: 'สำรองข้อมูล', render: viewBackup },
  connection: { group: 'admin', title: 'การเชื่อมต่อ Supabase', render: viewConnection },
};

function renderNav() {
  const link = (k) => `<a class="nav-link" href="#${k}" data-route="${k}">${icon(k)}<span>${ROUTES[k].nav || ROUTES[k].title}</span></a>`;
  const staff = Object.keys(ROUTES).filter((k) => ROUTES[k].group === 'staff');
  const admin = Object.keys(ROUTES).filter((k) => ROUTES[k].group === 'admin');
  $('#nav').innerHTML = `<div class="nav-group">งานเจ้าหน้าที่</div>${staff.map(link).join('')}`
    + (isAdmin() ? `<div class="nav-group">ผู้ดูแลระบบ</div>${admin.map(link).join('')}` : '');
}

async function route() {
  let key = location.hash.replace('#', '') || (isAdmin() ? 'dashboard' : 'issue');
  if (!ROUTES[key] || (ROUTES[key].group === 'admin' && !isAdmin())) key = 'issue';
  $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.route === key));
  $('#page-title').textContent = ROUTES[key].title;
  $('#topbar-right').innerHTML = '';
  $('#sidebar').classList.remove('open');
  const old = view(); old.replaceWith(old.cloneNode(false)); // drop listeners from the previous page
  view().innerHTML = '<div class="empty"><div class="spinner" style="margin:auto"></div></div>';
  try { await ROUTES[key].render(); } catch (e) { console.error(e); view().innerHTML = `<div class="card empty">โหลดข้อมูลไม่สำเร็จ: ${esc(thaiError(e))}</div>`; }
}

// ---------------------------------------------------------------------
//  Boot & authentication
// ---------------------------------------------------------------------
function show(id) {
  ['#boot', '#login-screen', '#pending-screen', '#app'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
}

async function boot() {
  S.conn = resolveConn();
  $('#link-conn').addEventListener('click', (e) => { e.preventDefault(); connectionDialog(); });
  if (!S.conn) {
    show('#login-screen');
    $('#login-form').outerHTML = `<div class="setup-box"><b>ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase</b><br>
      กดปุ่มด้านล่างเพื่อกรอก Project URL และ anon key (หรือตั้งค่า <code>SUPABASE_URL</code> / <code>SUPABASE_ANON_KEY</code> ใน Vercel)
      <button class="btn btn-primary btn-block" style="margin-top:10px" id="btn-setup-conn">⚙️ ตั้งค่าการเชื่อมต่อ</button></div>`;
    $('#btn-setup-conn').addEventListener('click', connectionDialog);
    $('#link-register').parentElement.classList.add('hidden');
    return;
  }
  S.sb = createClient(S.conn.url, S.conn.key);
  S.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.replace(location.pathname); });
  const { data: { session } } = await S.sb.auth.getSession();
  if (!session) return show('#login-screen');
  await enterApp(session);
}

// ---------------------------------------------------------------------
//  Supabase connection (manual override stored in this browser)
// ---------------------------------------------------------------------
const CONN_KEY = 'envelope.supabase.connection';
function readManualConn() {
  try { const m = JSON.parse(localStorage.getItem(CONN_KEY) || 'null'); return m?.url && m?.key ? m : null; } catch { return null; }
}
function resolveConn() {
  const m = readManualConn();
  if (m) return { url: m.url, key: m.key, source: 'manual' };
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) return { url: CFG.SUPABASE_URL, key: CFG.SUPABASE_ANON_KEY, source: 'vercel' };
  return null;
}
const connSourceLabel = (c) => !c ? 'ยังไม่ได้ตั้งค่า' : c.source === 'manual' ? 'ตั้งค่าเองในเบราว์เซอร์นี้ (Manual)' : 'ค่าจาก Vercel Environment Variables';
const maskKey = (k) => (k ? `${k.slice(0, 12)}…${k.slice(-6)}` : '');

async function testConnection(url, key) {
  const r = { auth: false, db: false, message: '' };
  try {
    const a = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    r.auth = a.ok;
    if (!a.ok) { r.message = a.status === 401 ? 'anon key ไม่ถูกต้อง' : `เชื่อมต่อ Auth ไม่ได้ (HTTP ${a.status})`; return r; }
    const d = await fetch(`${url}/rest/v1/settings?select=id&limit=1`, { headers: { apikey: key } });
    r.db = d.ok;
    r.message = d.ok ? 'เชื่อมต่อสำเร็จ พบตารางของระบบ' : 'เชื่อมต่อได้ แต่ยังไม่พบตารางของระบบ — กรุณารันไฟล์ SQL ใน Supabase';
  } catch (e) { r.message = 'เชื่อมต่อไม่ได้ ตรวจสอบ Project URL หรืออินเทอร์เน็ต'; }
  return r;
}

async function connectionDialog() {
  const cur = resolveConn();
  const manual = readManualConn();
  const r = await Swal.fire({
    title: 'ตั้งค่าการเชื่อมต่อ Supabase', width: 680, focusConfirm: false,
    html: `<div class="swal-form">
      <p class="full muted" style="margin:0">ค่าที่ใช้อยู่ตอนนี้: <b>${esc(connSourceLabel(cur))}</b></p>
      <label class="full">Project URL<input id="cn-url" value="${esc(cur?.url || '')}" placeholder="https://xxxxxxxx.supabase.co"></label>
      <label class="full">anon public key (Project Settings → API)<textarea id="cn-key" rows="3" placeholder="eyJhbGciOi...">${esc(manual?.key || cur?.key || '')}</textarea></label>
      <div class="full" style="display:flex;gap:10px;align-items:center"><button type="button" class="btn btn-sm" id="cn-test">🔌 ทดสอบการเชื่อมต่อ</button><span id="cn-result"></span></div>
      <p class="full muted" style="margin:0;font-size:18px">ค่าที่ตั้งเองจะบันทึกไว้ในเบราว์เซอร์เครื่องนี้ และใช้แทนค่าจาก Vercel (ต้องตั้งค่าแยกทีละเครื่อง)</p></div>`,
    showCancelButton: true, showDenyButton: !!manual, reverseButtons: true,
    confirmButtonText: 'บันทึกและเชื่อมต่อ', cancelButtonText: 'ยกเลิก', denyButtonText: 'ล้างค่า (ใช้ค่าจาก Vercel)',
    didOpen: () => {
      $('#cn-test').addEventListener('click', async () => {
        const url = val('cn-url').replace(/\/+$/, ''), key = val('cn-key');
        $('#cn-result').innerHTML = '<span class="muted">กำลังทดสอบ...</span>';
        const t = await testConnection(url, key);
        $('#cn-result').innerHTML = `<span class="badge ${t.db ? 'b-printed' : t.auth ? 'b-issued' : 'b-cancelled'}">${t.db ? '✔' : t.auth ? '!' : '✕'} ${esc(t.message)}</span>`;
      });
    },
    preConfirm: async () => {
      const url = val('cn-url').replace(/\/+$/, ''), key = val('cn-key');
      if (!/^https?:\/\/[^\s]+$/.test(url)) return Swal.showValidationMessage('Project URL ไม่ถูกต้อง เช่น https://xxxx.supabase.co');
      if (key.length < 20) return Swal.showValidationMessage('กรุณากรอก anon key');
      const t = await testConnection(url, key);
      if (!t.auth) return Swal.showValidationMessage(t.message);
      return { url, key, db: t.db };
    },
  });
  if (r.isDenied) {
    try { localStorage.removeItem(CONN_KEY); } catch { /* ignore */ }
    await Swal.fire({ icon: 'success', title: 'ล้างค่าที่ตั้งเองแล้ว', text: 'ระบบจะใช้ค่าจาก Vercel', timer: 1500, showConfirmButton: false });
    return location.reload();
  }
  if (!r.isConfirmed) return;
  try { localStorage.setItem(CONN_KEY, JSON.stringify({ url: r.value.url, key: r.value.key, saved_at: new Date().toISOString() })); }
  catch { return fail(new Error('เบราว์เซอร์นี้ไม่อนุญาตให้บันทึกค่า (อาจเปิดโหมดไม่ระบุตัวตน)')); }
  await Swal.fire({ icon: 'success', title: 'บันทึกการเชื่อมต่อแล้ว', text: r.value.db ? 'กำลังโหลดระบบใหม่...' : 'อย่าลืมรันไฟล์ SQL ใน Supabase ก่อนใช้งาน', timer: 1600, showConfirmButton: false });
  if (S.sb) await S.sb.auth.signOut().catch(() => {});
  location.replace(location.pathname);
}

async function enterApp(session) {
  S.session = session;
  const prof = await must(S.sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
  if (!prof || !prof.active) {
    $('#pending-email').textContent = session.user.email;
    return show('#pending-screen');
  }
  S.profile = prof;
  await loadRefs();
  $('#me-name').textContent = prof.full_name || prof.email;
  $('#me-role').innerHTML = isAdmin() ? '<span class="badge b-admin">ผู้ดูแลระบบ</span>' : '<span class="badge b-staff">เจ้าหน้าที่</span>';
  $('#brand-org').textContent = S.settings.org_name || '';
  renderNav();
  show('#app');
  route();
}

async function loadRefs() {
  const [settings, books, titles, provinces] = await Promise.all([
    must(S.sb.from('settings').select('*').eq('id', 1).maybeSingle()),
    must(S.sb.from('books').select('*').order('id')),
    must(S.sb.from('titles').select('*').order('id')),
    must(S.sb.from('provinces').select('*').order('name')),
  ]);
  S.settings = settings || {};
  S.books = books; S.titles = titles; S.provinces = provinces;
  await loadMyLayouts();
}

// ---- per-user envelope layout ----
async function loadMyLayouts() {
  S.layouts = { white: null, brown: null };
  const { data, error } = await S.sb.from('envelope_layouts').select('*').eq('user_id', S.profile.id).order('created_at', { ascending: false }).limit(60);
  if (error) return; // table not created yet → factory defaults
  for (const r of data) if (!S.layouts[r.envelope]) S.layouts[r.envelope] = r;
}
const myLayout = (type, settings = S.settings) => resolveLayout(type, settings, S.layouts?.[type]?.layout || null);
const reloadBooks = async () => { S.books = await must(S.sb.from('books').select('*').order('id')); };

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector('button'); btn.disabled = true;
  try {
    const { data, error } = await S.sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
    if (error) throw error;
    await enterApp(data.session);
  } catch (err) { fail(err); } finally { btn.disabled = false; }
});

$('#link-register').addEventListener('click', async (e) => {
  e.preventDefault();
  const r = await Swal.fire({
    title: 'ขอสิทธิ์ใช้งาน',
    html: `<div class="swal-form">
      <label class="full">ชื่อ - นามสกุล<input id="r-name"></label>
      <label class="full">อีเมล<input id="r-email" type="email"></label>
      <label>รหัสผ่าน<input id="r-pass" type="password"></label>
      <label>ยืนยันรหัสผ่าน<input id="r-pass2" type="password"></label>
      <p class="full muted" style="margin:0;font-size:18px">ผู้ใช้คนแรกของระบบจะเป็นผู้ดูแลระบบโดยอัตโนมัติ ผู้ใช้ถัดไปต้องรอผู้ดูแลอนุมัติ</p></div>`,
    showCancelButton: true, confirmButtonText: 'ส่งคำขอ', cancelButtonText: 'ยกเลิก', reverseButtons: true, focusConfirm: false,
    preConfirm: () => {
      const d = { name: val('r-name'), email: val('r-email'), pass: $('#r-pass').value, pass2: $('#r-pass2').value };
      if (!d.name || !d.email || !d.pass) return Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบ');
      if (d.pass.length < 6) return Swal.showValidationMessage('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
      if (d.pass !== d.pass2) return Swal.showValidationMessage('รหัสผ่านไม่ตรงกัน');
      return d;
    },
  });
  if (!r.isConfirmed) return;
  try {
    loading();
    const { data, error } = await S.sb.auth.signUp({ email: r.value.email, password: r.value.pass, options: { data: { full_name: r.value.name } } });
    if (error) throw error;
    Swal.close();
    if (data.session) return enterApp(data.session);
    Swal.fire({ icon: 'success', title: 'ส่งคำขอแล้ว', text: 'กรุณารอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วเข้าสู่ระบบได้ทันที (ไม่ต้องกดยืนยันอีเมล)' });
  } catch (err) { fail(err); }
});

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-action="logout"]')) {
    if (await ask('ออกจากระบบ?', '', { icon: 'warning' })) await S.sb.auth.signOut();
  }
  if (e.target.closest('#menu-btn')) $('#sidebar').classList.toggle('open');
});
window.addEventListener('hashchange', () => { if (S.profile) route(); });

// =====================================================================
//  STAFF — ออกเลขหนังสือ (issue numbers)
// =====================================================================
async function viewIssue() {
  await reloadBooks();
  const books = S.books.filter((b) => b.active);
  if (!books.some((b) => b.id === S.issue.book_id)) S.issue.book_id = books[0]?.id ?? null;

  view().innerHTML = `
  <div class="grid-2">
    <div class="card">
      <div class="card-head"><h3><span class="step">1</span>เลือกผู้รับ</h3>
        <button class="btn btn-sm" id="new-cus">+ เพิ่มผู้รับใหม่</button></div>
      <input id="cus-q" placeholder="ค้นหา ชื่อ / ตำแหน่ง / หน่วยงาน / ที่อยู่ / รหัสผู้รับ" autocomplete="off">
      <p class="muted" style="font-size:18px;margin:8px 0 10px">คลิกรายการเพื่อเพิ่มเข้ารายการออกเลข เลือกได้หลายรายการ ระบบจะออกเลขเรียงตามลำดับ</p>
      <div class="pick-list" id="cus-results"><div class="empty">กำลังโหลด...</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3><span class="step">2</span>รายการที่จะออกเลข <span id="basket-count" class="badge b-staff"></span></h3>
        <button class="btn btn-sm btn-ghost" id="clear-basket">ล้างรายการ</button></div>
      <ol class="basket" id="basket"></ol>
      <div class="form-grid">
        <label class="full">เรื่อง<input id="opt-subject" value="${esc(S.issue.subject)}" placeholder="เช่น ส่งหมายเรียก / ส่งสำเนาคำพิพากษา (ไม่บังคับ)"></label>
        <label>เล่มทะเบียน<select id="opt-book">${books.map((b) => opt(b.id, `${b.name} (${b.prefix})`, S.issue.book_id)).join('') || '<option value="">— ยังไม่มีเล่มทะเบียน —</option>'}</select></label>
        <label>ชั้นความเร็ว<select id="opt-urgency">${URGENCY.map((u) => opt(u, u, S.issue.urgency)).join('')}</select></label>
        <div class="full"><label style="margin-bottom:4px">ขนาดซอง</label>${envSeg('opt-env', S.issue.envelope)}</div>
      </div>
      <div class="next-no" id="next-no"></div>
      <button class="btn btn-gold btn-block" id="btn-issue">ออกเลขหนังสือ</button>
    </div>
  </div>`;

  const search = debounce(async () => {
    const box = $('#cus-results'); if (!box) return;
    try {
      const rows = await searchCustomers($('#cus-q').value);
      const inBasket = new Set(S.basket.map((b) => b.id));
      box.innerHTML = rows.length ? rows.map((c) => `
        <div class="pick-item${inBasket.has(c.id) ? ' added' : ''}" data-id="${c.id}">
          <div class="grow"><div class="name">${esc(fullName(c))}</div>
          <div class="sub">${esc([c.address, areaLine(c.amphur, provName(c.province_id)), c.postcode].filter(Boolean).join(' '))}</div></div>
          <span class="code">${esc(c.code || '')}</span>
          <button class="btn btn-sm btn-icon" data-edit="${c.id}" title="แก้ไขข้อมูลผู้รับ">✎</button>
        </div>`).join('') : '<div class="empty">ไม่พบข้อมูล — กด "+ เพิ่มผู้รับใหม่"</div>';
      box._rows = rows;
    } catch (e) { box.innerHTML = `<div class="empty">${esc(thaiError(e))}</div>`; }
  });
  $('#cus-q').addEventListener('input', search);
  search();

  $('#cus-results').addEventListener('click', async (e) => {
    const item = e.target.closest('.pick-item'); if (!item) return;
    const c = $('#cus-results')._rows.find((r) => r.id === Number(item.dataset.id));
    if (e.target.closest('[data-edit]')) {
      const saved = await customerForm(c); if (saved) { S.basket = S.basket.map((b) => (b.id === saved.id ? saved : b)); search(); renderBasket(); }
      return;
    }
    if (S.basket.some((b) => b.id === c.id)) { S.basket = S.basket.filter((b) => b.id !== c.id); item.classList.remove('added'); }
    else { S.basket.push(c); item.classList.add('added'); }
    renderBasket();
  });
  $('#new-cus').addEventListener('click', async () => {
    const saved = await customerForm(null);
    if (saved) { S.basket.push(saved); renderBasket(); search(); }
  });
  $('#clear-basket').addEventListener('click', () => { S.basket = []; renderBasket(); search(); });
  $('#basket').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const i = Number(b.dataset.i), a = b.dataset.a;
    if (a === 'del') S.basket.splice(i, 1);
    if (a === 'up' && i > 0) [S.basket[i - 1], S.basket[i]] = [S.basket[i], S.basket[i - 1]];
    if (a === 'down' && i < S.basket.length - 1) [S.basket[i + 1], S.basket[i]] = [S.basket[i], S.basket[i + 1]];
    renderBasket(); if (a === 'del') search();
  });
  $('#opt-subject').addEventListener('input', (e) => { S.issue.subject = e.target.value; });
  $('#opt-urgency').addEventListener('change', (e) => { S.issue.urgency = e.target.value; });
  $('#opt-book').addEventListener('change', (e) => { S.issue.book_id = Number(e.target.value); renderBasket(); });
  $$('input[name="opt-env"]').forEach((r) => r.addEventListener('change', (e) => { S.issue.envelope = e.target.value; }));
  $('#btn-issue').addEventListener('click', doIssue);
  renderBasket();
}

function envSeg(name, sel) {
  return `<div class="seg">${Object.values(ENVELOPES).map((e) => `
    <label><input type="radio" name="${name}" value="${e.key}"${e.key === sel ? ' checked' : ''}><span>${e.label}<small>${e.size}</small></span></label>`).join('')}</div>`;
}

function nextNumberOf(book) {
  if (!book) return null;
  const y = beYear();
  return book.auto_reset && book.year < y ? { year: y, no: 1 } : { year: book.year, no: book.next_no };
}

function renderBasket() {
  const ol = $('#basket'); if (!ol) return;
  ol.innerHTML = S.basket.length ? S.basket.map((c, i) => `
    <li><div class="grow"><b>${esc(fullName(c))}</b><div class="muted" style="font-size:18px">${esc(areaLine(c.amphur, provName(c.province_id)))} ${esc(c.postcode || '')}</div></div>
      <button class="btn btn-sm btn-icon" data-i="${i}" data-a="up" title="เลื่อนขึ้น">↑</button>
      <button class="btn btn-sm btn-icon" data-i="${i}" data-a="down" title="เลื่อนลง">↓</button>
      <button class="btn btn-sm btn-icon btn-danger" data-i="${i}" data-a="del" title="นำออก">✕</button></li>`).join('')
    : '<div class="basket-empty">ยังไม่ได้เลือกผู้รับ — คลิกรายชื่อทางซ้ายเพื่อเพิ่ม</div>';
  $('#basket-count').textContent = `${S.basket.length} รายการ`;
  const b = S.books.find((x) => x.id === S.issue.book_id);
  const n = nextNumberOf(b);
  $('#next-no').innerHTML = !b ? 'ยังไม่มีเล่มทะเบียน — ให้ผู้ดูแลระบบเพิ่มที่เมนู "เล่มทะเบียนเลขหนังสือ"'
    : S.basket.length > 1 ? `เลขที่จะได้รับ: <b>${esc(b.prefix)}/${n.no}</b> ถึง <b>${esc(b.prefix)}/${n.no + S.basket.length - 1}</b> <span class="muted">(ปี ${n.year})</span>`
      : `เลขถัดไป: <b>${esc(b.prefix)}/${n.no}</b> <span class="muted">(ปี ${n.year})</span>`;
  $('#btn-issue').disabled = !S.basket.length || !b;
  $('#btn-issue').textContent = S.basket.length ? `ออกเลขหนังสือ ${S.basket.length} รายการ` : 'ออกเลขหนังสือ';
}

async function doIssue() {
  const b = S.books.find((x) => x.id === S.issue.book_id);
  if (!S.basket.length || !b) return;
  const env = ENVELOPES[S.issue.envelope];
  const okGo = await ask(`ยืนยันออกเลข ${S.basket.length} รายการ?`,
    `เล่มทะเบียน: <b>${esc(b.name)}</b><br>ชั้นความเร็ว: <b>${esc(S.issue.urgency)}</b><br>ซอง: <b>${env.label} ${env.size}</b>`,
    { confirmButtonText: 'ออกเลข' });
  if (!okGo) return;
  try {
    loading('กำลังออกเลข...');
    const rows = await must(S.sb.rpc('issue_letters', {
      p_book_id: b.id, p_customer_ids: S.basket.map((c) => c.id),
      p_subject: S.issue.subject || null, p_urgency: S.issue.urgency, p_envelope: S.issue.envelope,
    }));
    S.basket = []; S.issue.subject = '';
    await reloadBooks();
    const r = await Swal.fire({
      icon: 'success', title: `ออกเลขสำเร็จ ${rows.length} รายการ`, width: 620,
      html: `<div class="issued-list">${rows.map((x) => `<div><b>${esc(x.doc_number)}</b>${esc(x.recipient_name)}</div>`).join('')}</div>`,
      showDenyButton: true, showCancelButton: true,
      confirmButtonText: `🖨️ พิมพ์ซองเลย (${env.label})`, denyButtonText: 'ไปหน้าทะเบียน', cancelButtonText: 'ปิด',
      denyButtonColor: '#c9a24a',
    });
    if (r.isConfirmed) { await printLetters(rows, S.issue.envelope); route(); }
    else if (r.isDenied) location.hash = 'register';
    else route();
  } catch (e) { fail(e); }
}

async function searchCustomers(text, limit = 40) {
  let qb = S.sb.from('customers').select('id,code,title_id,name,address,amphur,province_id,postcode,telephone,note,active').eq('active', true);
  for (const term of clean(text).split(/\s+/).filter(Boolean)) {
    qb = qb.or(`name.ilike.%${term}%,address.ilike.%${term}%,code.ilike.%${term}%,amphur.ilike.%${term}%`);
  }
  return must(qb.order('updated_at', { ascending: false }).limit(limit));
}

// ---------------------------------------------------------------------
//  Recipient (customer) form — shared by staff & admin
// ---------------------------------------------------------------------
async function customerForm(c) {
  const isNew = !c;
  c = c || { province_id: null };
  const r = await Swal.fire({
    title: isNew ? 'เพิ่มผู้รับใหม่' : 'แก้ไขข้อมูลผู้รับ', width: 720, focusConfirm: false,
    html: `<div class="swal-form">
      <label>คำนำหน้า (ถ้าเป็นบุคคล)<select id="f-title"><option value="">— ไม่ระบุ —</option>${S.titles.filter((t) => t.id > 0).map((t) => opt(t.id, t.name, c.title_id)).join('')}</select></label>
      <label>รหัสผู้รับ<input id="f-code" value="${esc(c.code || 'สร้างอัตโนมัติ')}" disabled></label>
      <label class="full">ชื่อ / ตำแหน่ง / หน่วยงาน *<input id="f-name" value="${esc(c.name || '')}" placeholder="เช่น ผู้อำนวยการสำนักงานขนส่งจังหวัดอุดรธานี"></label>
      <label class="full">ที่อยู่ (เลขที่ หมู่ ถนน ตำบล/แขวง)<textarea id="f-address" rows="2">${esc(c.address || '')}</textarea></label>
      <div class="full ac-wrap"><label>🔎 ค้นหาตำบล / อำเภอ / รหัสไปรษณีย์ เพื่อกรอกอัตโนมัติ<input id="f-ac" autocomplete="off" placeholder="เช่น หมากแข้ง หรือ 41000"></label><div class="ac-list hidden" id="f-ac-list"></div></div>
      <label>อำเภอ / เขต<input id="f-amphur" value="${esc(c.amphur || '')}" placeholder="เช่น เมือง"></label>
      <label>จังหวัด<select id="f-province"><option value="">— เลือก —</option>${S.provinces.filter((p) => p.id > 0).map((p) => opt(p.id, p.name, c.province_id)).join('')}</select></label>
      <label>รหัสไปรษณีย์<input id="f-postcode" value="${esc(c.postcode || '')}" maxlength="5" inputmode="numeric"></label>
      <label>โทรศัพท์<input id="f-tel" value="${esc(c.telephone || '')}"></label>
      <label class="full">หมายเหตุ<input id="f-note" value="${esc(c.note || '')}"></label>
    </div>`,
    showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true,
    didOpen: () => {
      const list = $('#f-ac-list');
      const run = debounce(async () => {
        const t = clean($('#f-ac').value);
        if (t.length < 2) return list.classList.add('hidden');
        const rows = await must(S.sb.from('postcodes').select('*')
          .or(`tumbon.ilike.%${t}%,amphur.ilike.%${t}%,postcode.ilike.${t}%`).limit(20));
        list._rows = rows;
        list.innerHTML = rows.length ? rows.map((p, i) => `<div data-i="${i}">ต.${esc(p.tumbon)} อ.${esc(p.amphur)} จ.${esc(p.province)} <b>${esc(p.postcode)}</b>${p.note ? `<br><small class="muted">${esc(p.note)}</small>` : ''}</div>`).join('') : '<div>ไม่พบข้อมูล</div>';
        list.classList.remove('hidden');
      });
      $('#f-ac').addEventListener('input', run);
      list.addEventListener('click', (e) => {
        const d = e.target.closest('[data-i]'); if (!d) return;
        const p = list._rows[Number(d.dataset.i)];
        $('#f-amphur').value = p.amphur;
        $('#f-postcode').value = p.postcode;
        const pv = S.provinces.find((x) => x.name === p.province); if (pv) $('#f-province').value = pv.id;
        const addr = $('#f-address');
        if (!addr.value.includes(p.tumbon)) addr.value = `${addr.value.trim()} ${p.province.includes('กรุงเทพ') ? 'แขวง' : 'ตำบล'}${p.tumbon}`.trim();
        list.classList.add('hidden'); $('#f-ac').value = '';
      });
    },
    preConfirm: () => {
      const d = {
        title_id: val('f-title') ? Number(val('f-title')) : null, name: val('f-name'), address: val('f-address') || null,
        amphur: val('f-amphur') || null, province_id: val('f-province') ? Number(val('f-province')) : null,
        postcode: val('f-postcode') || null, telephone: val('f-tel') || null, note: val('f-note') || null,
      };
      if (!d.name) return Swal.showValidationMessage('กรุณากรอกชื่อ / ตำแหน่ง / หน่วยงาน');
      if (d.postcode && !/^\d{5}$/.test(d.postcode)) return Swal.showValidationMessage('รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
      return d;
    },
  });
  if (!r.isConfirmed) return null;
  try {
    const q = isNew ? S.sb.from('customers').insert(r.value) : S.sb.from('customers').update(r.value).eq('id', c.id);
    const saved = await must(q.select().single());
    ok(isNew ? `เพิ่มผู้รับแล้ว (${saved.code})` : 'บันทึกแล้ว');
    return saved;
  } catch (e) { fail(e); return null; }
}

// =====================================================================
//  STAFF — ทะเบียนหนังสือส่ง / พิมพ์ซอง (register & print)
// =====================================================================
async function viewRegister() {
  const today = bkkDate();
  S.reg = S.reg || { from: today, to: today, book_id: '', status: '', q: '', envelope: S.issue.envelope, selected: new Set(), rows: [] };
  const R = S.reg;
  view().innerHTML = `
  <div class="card">
    <div class="toolbar">
      <label>ตั้งแต่วันที่<input type="date" id="r-from" value="${R.from}"></label>
      <label>ถึงวันที่<input type="date" id="r-to" value="${R.to}"></label>
      <label>เล่มทะเบียน<select id="r-book"><option value="">ทั้งหมด</option>${S.books.map((b) => opt(b.id, b.name, R.book_id)).join('')}</select></label>
      <label>สถานะ<select id="r-status">${[['', 'ทั้งหมด'], ['issued', 'รอพิมพ์'], ['printed', 'พิมพ์แล้ว'], ['cancelled', 'ยกเลิก']].map(([v, l]) => opt(v, l, R.status)).join('')}</select></label>
      <label class="grow">ค้นหา<input id="r-q" value="${esc(R.q)}" placeholder="เลขที่ / ผู้รับ / เรื่อง"></label>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" data-range="0">วันนี้</button>
        <button class="btn btn-sm" data-range="7">7 วัน</button>
        <button class="btn btn-sm" data-range="30">30 วัน</button>
      </div>
    </div>
    <div class="table-wrap" style="max-height:62vh"><table>
      <thead><tr><th style="width:36px"><input type="checkbox" id="r-all" title="เลือกทั้งหมด"></th>
        <th>เลขที่หนังสือ</th><th>วันที่</th><th>ผู้รับ</th><th>เรื่อง</th><th>ซอง</th><th>สถานะ</th><th>ผู้ออกเลข</th><th></th></tr></thead>
      <tbody id="r-body"><tr><td colspan="9" class="empty">กำลังโหลด...</td></tr></tbody>
    </table></div>
    <div class="sticky-actions">
      <b id="r-selcount">เลือก 0 รายการ</b>
      <button class="btn btn-sm" id="r-pick-unprinted">เลือกเฉพาะที่ยังไม่พิมพ์</button>
      <span class="spacer"></span>
      ${envSeg('r-env', R.envelope)}
      <button class="btn" id="r-preview">👁 ดูตัวอย่าง</button>
      <button class="btn btn-primary" id="r-print">🖨️ พิมพ์ซองที่เลือก</button>
    </div>
  </div>`;

  const reload = async () => {
    R.from = $('#r-from').value || today; R.to = $('#r-to').value || R.from;
    R.book_id = $('#r-book').value; R.status = $('#r-status').value; R.q = $('#r-q').value;
    let qb = S.sb.from('letters').select('*')
      .gte('created_at', `${R.from}T00:00:00+07:00`).lte('created_at', `${R.to}T23:59:59.999+07:00`);
    if (R.book_id) qb = qb.eq('book_id', Number(R.book_id));
    if (R.status) qb = qb.eq('status', R.status);
    const t = clean(R.q);
    if (t) qb = qb.or(`doc_number.ilike.%${t}%,recipient_name.ilike.%${t}%,subject.ilike.%${t}%`);
    try {
      R.rows = await must(qb.order('book_id').order('year').order('doc_no').limit(2000));
      const ids = new Set(R.rows.map((r) => r.id));
      R.selected = new Set([...R.selected].filter((id) => ids.has(id)));
      paint();
    } catch (e) { $('#r-body').innerHTML = `<tr><td colspan="9" class="empty">${esc(thaiError(e))}</td></tr>`; }
  };
  const paint = () => {
    $('#r-body').innerHTML = R.rows.length ? R.rows.map((r) => `
      <tr data-id="${r.id}" class="${r.status === 'cancelled' ? 'cancelled' : ''}${R.selected.has(r.id) ? ' selected' : ''}">
        <td class="no-strike"><input type="checkbox" ${R.selected.has(r.id) ? 'checked' : ''} ${r.status === 'cancelled' ? 'disabled' : ''}></td>
        <td class="num">${esc(r.doc_number)}${r.urgency !== 'ปกติ' ? ` <span class="badge b-urgent">${esc(r.urgency)}</span>` : ''}</td>
        <td>${fmtDate(r.created_at)}<div class="muted" style="font-size:17px">${fmtTime(r.created_at)}</div></td>
        <td><b>${esc(r.recipient_name)}</b><div class="muted" style="font-size:18px">${esc(areaLine(r.recipient_amphur, r.recipient_province))} ${esc(r.recipient_postcode || '')}</div></td>
        <td>${esc(r.subject || '')}${r.cancel_reason ? `<div class="muted" style="font-size:17px">เหตุผลยกเลิก: ${esc(r.cancel_reason)}</div>` : ''}</td>
        <td><span class="badge b-${r.envelope}">${ENVELOPES[r.envelope].label}</span></td>
        <td class="no-strike">${statusBadge(r)}</td>
        <td style="font-size:18px">${esc(r.created_by_name || '')}</td>
        <td class="actions no-strike">${r.status !== 'cancelled' ? `
          <button class="btn btn-sm btn-icon" data-act="print" title="พิมพ์ซองนี้">🖨️</button>
          <button class="btn btn-sm btn-icon" data-act="edit" title="แก้ไขชื่อ/ที่อยู่บนซอง">✎</button>
          <button class="btn btn-sm btn-icon btn-danger" data-act="cancel" title="ยกเลิกเลข">✕</button>` : ''}</td>
      </tr>`).join('') : '<tr><td colspan="9" class="empty">ไม่พบรายการในช่วงวันที่เลือก</td></tr>';
    const selectable = R.rows.filter((r) => r.status !== 'cancelled');
    $('#r-all').checked = selectable.length > 0 && selectable.every((r) => R.selected.has(r.id));
    $('#r-selcount').textContent = `เลือก ${R.selected.size} / ${R.rows.length} รายการ`;
    $('#r-print').disabled = $('#r-preview').disabled = !R.selected.size;
  };
  const selectedRows = () => R.rows.filter((r) => R.selected.has(r.id));

  ['#r-from', '#r-to', '#r-book', '#r-status'].forEach((s) => $(s).addEventListener('change', reload));
  $('#r-q').addEventListener('input', debounce(reload, 350));
  $$('[data-range]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(); d.setDate(d.getDate() - Number(b.dataset.range));
    $('#r-from').value = bkkDate(d); $('#r-to').value = today; reload();
  }));
  $('#r-all').addEventListener('change', (e) => {
    R.rows.filter((r) => r.status !== 'cancelled').forEach((r) => (e.target.checked ? R.selected.add(r.id) : R.selected.delete(r.id)));
    paint();
  });
  $('#r-pick-unprinted').addEventListener('click', () => { R.selected = new Set(R.rows.filter((r) => r.status === 'issued').map((r) => r.id)); paint(); });
  $$('input[name="r-env"]').forEach((x) => x.addEventListener('change', (e) => { R.envelope = e.target.value; }));
  $('#r-preview').addEventListener('click', () => previewLetters(selectedRows(), R.envelope, reload));
  $('#r-print').addEventListener('click', async () => { await printLetters(selectedRows(), R.envelope); reload(); });
  $('#r-body').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const r = R.rows.find((x) => x.id === Number(tr.dataset.id));
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'print') { await printLetters([r], R.envelope); return reload(); }
    if (act === 'edit') { if (await editLetter(r)) reload(); return; }
    if (act === 'cancel') { if (await cancelLetter(r)) reload(); return; }
    if (r.status === 'cancelled') return;
    R.selected.has(r.id) ? R.selected.delete(r.id) : R.selected.add(r.id);
    paint();
  });
  reload();
}

const statusBadge = (r) => r.status === 'printed'
  ? `<span class="badge b-printed">พิมพ์แล้ว${r.print_count > 1 ? ` ×${r.print_count}` : ''}</span>`
  : r.status === 'cancelled' ? '<span class="badge b-cancelled">ยกเลิก</span>' : '<span class="badge b-issued">รอพิมพ์</span>';

async function cancelLetter(r) {
  const res = await Swal.fire({
    icon: 'warning', title: `ยกเลิกเลข ${r.doc_number}?`, input: 'text', inputLabel: 'เหตุผลการยกเลิก',
    inputPlaceholder: 'เช่น ออกเลขผิด / ไม่ได้ส่งหนังสือ', showCancelButton: true,
    confirmButtonText: 'ยกเลิกเลขนี้', cancelButtonText: 'ปิด', confirmButtonColor: '#c0392b', reverseButtons: true,
    inputValidator: (v) => (!v.trim() ? 'กรุณาระบุเหตุผล' : undefined),
  });
  if (!res.isConfirmed) return false;
  try { await must(S.sb.rpc('cancel_letter', { p_id: r.id, p_reason: res.value })); ok('ยกเลิกเลขแล้ว'); return true; } catch (e) { fail(e); return false; }
}

async function editLetter(r) {
  const res = await Swal.fire({
    title: `แก้ไขข้อมูลบนซอง ${r.doc_number}`, width: 680, focusConfirm: false,
    html: `<div class="swal-form">
      <label class="full">ผู้รับ<input id="e-name" value="${esc(r.recipient_name)}"></label>
      <label class="full">ที่อยู่<textarea id="e-address" rows="2">${esc(r.recipient_address || '')}</textarea></label>
      <label>อำเภอ / เขต<input id="e-amphur" value="${esc(r.recipient_amphur || '')}"></label>
      <label>จังหวัด<input id="e-province" value="${esc(r.recipient_province || '')}" list="e-plist"><datalist id="e-plist">${S.provinces.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist></label>
      <label>รหัสไปรษณีย์<input id="e-postcode" value="${esc(r.recipient_postcode || '')}" maxlength="5"></label>
      <label>ชั้นความเร็ว<select id="e-urgency">${URGENCY.map((u) => opt(u, u, r.urgency)).join('')}</select></label>
      <label class="full">เรื่อง<input id="e-subject" value="${esc(r.subject || '')}"></label>
      <p class="full muted" style="margin:0;font-size:18px">แก้ไขเฉพาะข้อมูลบนซองฉบับนี้ (ไม่กระทบข้อมูลผู้รับหลัก) เลขที่หนังสือไม่เปลี่ยน</p></div>`,
    showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true,
    preConfirm: () => {
      const d = {
        p_id: r.id, p_name: val('e-name'), p_address: val('e-address'), p_amphur: val('e-amphur'),
        p_province: val('e-province'), p_postcode: val('e-postcode'), p_subject: val('e-subject'), p_urgency: val('e-urgency'),
      };
      if (!d.p_name) return Swal.showValidationMessage('กรุณากรอกชื่อผู้รับ');
      if (d.p_postcode && !/^\d{5}$/.test(d.p_postcode)) return Swal.showValidationMessage('รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
      return d;
    },
  });
  if (!res.isConfirmed) return false;
  try {
    await must(S.sb.rpc('update_letter', res.value));
    ok('บันทึกแล้ว'); return true;
  } catch (e) { fail(e); return false; }
}

// ---------------------------------------------------------------------
//  Printing
// ---------------------------------------------------------------------
async function waitForPrintAssets(root) {
  try { await document.fonts.ready; } catch { /* ignore */ }
  await Promise.all($$('img', root).map((img) => (img.complete ? null : img.decode().catch(() => null))));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function printLetters(rows, type, settings = S.settings, { markPrinted = true, layout = null } = {}) {
  rows = (rows || []).filter((r) => r.status !== 'cancelled');
  if (!rows.length) return warn('ไม่มีรายการที่พิมพ์ได้');
  const root = $('#print-root');
  const L = layout || myLayout(type, settings);
  root.innerHTML = rows.map((r) => renderEnvelope(r, settings, type, L)).join('');
  $('#print-page-style').textContent = pageCss(type, L);
  await waitForPrintAssets(root);
  window.print();
  root.innerHTML = '';
  if (!markPrinted) return;
  const env = ENVELOPES[type];
  const res = await Swal.fire({
    icon: 'question', title: 'พิมพ์ซองเรียบร้อยหรือไม่?',
    html: `${rows.length} ซอง · ${env.label} ${env.size}<br><span class="muted" style="font-size:19px">กด "พิมพ์เรียบร้อย" เพื่อบันทึกสถานะเป็น "พิมพ์แล้ว"</span>`,
    showCancelButton: true, confirmButtonText: 'พิมพ์เรียบร้อย', cancelButtonText: 'ยังไม่ได้พิมพ์', reverseButtons: true,
  });
  if (!res.isConfirmed) return;
  try { await must(S.sb.rpc('mark_printed', { p_ids: rows.map((r) => r.id), p_envelope: type })); ok(`บันทึกการพิมพ์ ${rows.length} ซองแล้ว`); } catch (e) { fail(e); }
}

function previewHtml(rows, type, settings = S.settings, max = 6, maxW = 820, layout = null) {
  const L = layout || myLayout(type, settings);
  const { w, h } = envSize(type, L);
  const pxW = w * 3.7795, pxH = h * 3.7795;
  const scale = Math.min(1, (maxW - 16) / pxW, 520 / pxH);
  const items = rows.slice(0, max).map((r) => `
    <div class="preview-frame" style="width:${pxW * scale}px;height:${pxH * scale}px">
      <div class="preview-scale" style="transform:scale(${scale})">${renderEnvelope(r, settings, type, L).replace('class="env ', 'class="env on-screen ')}</div>
    </div>`).join('');
  return `<div class="preview-box">${items}${rows.length > max ? `<div class="muted">… และอีก ${rows.length - max} ซอง</div>` : ''}</div>`;
}

async function previewLetters(rows, type, after) {
  rows = rows.filter((r) => r.status !== 'cancelled');
  if (!rows.length) return warn('กรุณาเลือกรายการ');
  const env = ENVELOPES[type];
  const r = await Swal.fire({
    title: `ตัวอย่าง ${env.label} ${env.size} (${rows.length} ซอง)`, width: 'min(940px, 96vw)', html: previewHtml(rows, type),
    showCancelButton: true, confirmButtonText: '🖨️ พิมพ์', cancelButtonText: 'ปิด', reverseButtons: true,
  });
  if (r.isConfirmed) { await printLetters(rows, type); after?.(); }
}

// =====================================================================
//  ผู้รับ / หน่วยงาน (recipients list)
// =====================================================================
async function viewRecipients() {
  const st = { q: '', province: '', page: 0, size: 50, showInactive: false };
  $('#topbar-right').innerHTML = '<button class="btn btn-primary" id="c-add">+ เพิ่มผู้รับ</button>';
  view().innerHTML = `
  <div class="card">
    <div class="toolbar">
      <label class="grow">ค้นหา<input id="c-q" placeholder="ชื่อ / ที่อยู่ / รหัส / อำเภอ"></label>
      <label>จังหวัด<select id="c-prov"><option value="">ทั้งหมด</option>${S.provinces.filter((p) => p.id > 0).map((p) => opt(p.id, p.name)).join('')}</select></label>
      ${isAdmin() ? '<label style="display:flex;gap:6px;align-items:center;padding-bottom:9px"><input type="checkbox" id="c-inactive"> แสดงที่ปิดใช้งาน</label>' : ''}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>รหัส</th><th>ชื่อ / ตำแหน่ง / หน่วยงาน</th><th>ที่อยู่</th><th>อำเภอ / จังหวัด</th><th>รหัส ปณ.</th><th></th></tr></thead>
      <tbody id="c-body"></tbody></table></div>
    <div class="pager" id="c-pager"></div>
  </div>`;
  const load = async () => {
    let qb = S.sb.from('customers').select('*', { count: 'exact' });
    if (!st.showInactive) qb = qb.eq('active', true);
    for (const term of clean(st.q).split(/\s+/).filter(Boolean)) qb = qb.or(`name.ilike.%${term}%,address.ilike.%${term}%,code.ilike.%${term}%,amphur.ilike.%${term}%`);
    if (st.province) qb = qb.eq('province_id', Number(st.province));
    const { data, count } = await mustCount(qb.order('id', { ascending: false }).range(st.page * st.size, st.page * st.size + st.size - 1));
    $('#c-body').innerHTML = data.length ? data.map((c) => `
      <tr data-id="${c.id}" class="${c.active ? '' : 'cancelled'}"><td class="code">${esc(c.code || '')}</td><td><b>${esc(fullName(c))}</b></td>
      <td>${esc(c.address || '')}</td><td>${esc(areaLine(c.amphur, provName(c.province_id)))}</td><td>${esc(c.postcode || '')}</td>
      <td class="actions no-strike"><button class="btn btn-sm" data-act="edit">แก้ไข</button>
      ${isAdmin() ? `<button class="btn btn-sm" data-act="toggle">${c.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button><button class="btn btn-sm btn-danger" data-act="del">ลบ</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">ไม่พบข้อมูล</td></tr>';
    $('#c-body')._rows = data;
    pager('#c-pager', st, count, load);
  };
  $('#c-q').addEventListener('input', debounce(() => { st.q = $('#c-q').value; st.page = 0; load(); }, 350));
  $('#c-prov').addEventListener('change', (e) => { st.province = e.target.value; st.page = 0; load(); });
  $('#c-inactive')?.addEventListener('change', (e) => { st.showInactive = e.target.checked; st.page = 0; load(); });
  $('#c-add').addEventListener('click', async () => { if (await customerForm(null)) load(); });
  $('#c-body').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    const c = $('#c-body')._rows.find((x) => x.id === Number(e.target.closest('tr').dataset.id));
    if (act === 'edit' && (await customerForm(c))) load();
    if (act === 'toggle') { try { await must(S.sb.from('customers').update({ active: !c.active }).eq('id', c.id)); ok('บันทึกแล้ว'); load(); } catch (er) { fail(er); } }
    if (act === 'del' && (await ask('ลบผู้รับนี้?', `<b>${esc(c.name)}</b><br><span class="muted">ประวัติการออกเลขยังคงอยู่</span>`, { icon: 'warning', confirmButtonColor: '#c0392b', confirmButtonText: 'ลบ' }))) {
      try { await must(S.sb.from('customers').delete().eq('id', c.id)); ok('ลบแล้ว'); load(); } catch (er) { fail(er); }
    }
  });
  load();
}

function pager(sel, st, count, load) {
  const pages = Math.max(1, Math.ceil((count || 0) / st.size));
  $(sel).innerHTML = `ทั้งหมด ${num(count)} รายการ · หน้า ${st.page + 1} / ${pages}
    <button class="btn btn-sm" data-p="-1" ${st.page <= 0 ? 'disabled' : ''}>‹ ก่อนหน้า</button>
    <button class="btn btn-sm" data-p="1" ${st.page >= pages - 1 ? 'disabled' : ''}>ถัดไป ›</button>`;
  $$('[data-p]', $(sel)).forEach((b) => b.addEventListener('click', () => { st.page += Number(b.dataset.p); load(); }));
}

// =====================================================================
//  ADMIN — Dashboard
// =====================================================================
async function viewDashboard() {
  const today = bkkDate();
  const head = (q) => mustCount(q).then((r) => r.count);
  const [cus, todayN, yearN, waiting, pending, recent] = await Promise.all([
    head(S.sb.from('customers').select('id', { count: 'exact', head: true })),
    head(S.sb.from('letters').select('id', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00+07:00`).neq('status', 'cancelled')),
    head(S.sb.from('letters').select('id', { count: 'exact', head: true }).eq('year', beYear()).neq('status', 'cancelled')),
    head(S.sb.from('letters').select('id', { count: 'exact', head: true }).eq('status', 'issued')),
    head(S.sb.from('profiles').select('id', { count: 'exact', head: true }).eq('active', false)),
    must(S.sb.from('letters').select('*').order('created_at', { ascending: false }).limit(10)),
  ]);
  await reloadBooks();
  view().innerHTML = `
  ${pending ? `<div class="card" style="background:var(--warn-soft);margin-bottom:16px">มีผู้ขอสิทธิ์ใช้งานรออนุมัติ <b>${pending}</b> คน — <a href="#users">ไปที่หน้าผู้ใช้งาน</a></div>` : ''}
  <div class="grid-4">
    <div class="stat gold"><small>ออกเลขวันนี้</small><b>${num(todayN)}</b></div>
    <div class="stat"><small>ออกเลขทั้งปี ${beYear()}</small><b>${num(yearN)}</b></div>
    <div class="stat"><small>รอพิมพ์ซอง</small><b>${num(waiting)}</b></div>
    <div class="stat"><small>ผู้รับ / หน่วยงานในระบบ</small><b>${num(cus)}</b></div>
  </div>
  <div class="grid-2" style="margin-top:18px">
    <div class="card"><div class="card-head"><h3>ออกเลขล่าสุด</h3><a href="#register" class="btn btn-sm">ดูทะเบียน</a></div>
      <div class="table-wrap"><table><thead><tr><th>เลขที่</th><th>ผู้รับ</th><th>สถานะ</th><th>เวลา</th></tr></thead><tbody>
      ${recent.length ? recent.map((r) => `<tr><td class="num">${esc(r.doc_number)}</td><td>${esc(r.recipient_name)}</td><td>${statusBadge(r)}</td><td style="white-space:nowrap">${fmtDate(r.created_at)} ${fmtTime(r.created_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">ยังไม่มีการออกเลข</td></tr>'}
      </tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>เล่มทะเบียน</h3><a href="#books" class="btn btn-sm">จัดการ</a></div>
      <div class="table-wrap"><table><thead><tr><th>เล่ม</th><th>ปี</th><th>เลขถัดไป</th><th>สถานะ</th></tr></thead><tbody>
      ${S.books.map((b) => { const n = nextNumberOf(b); return `<tr><td><b>${esc(b.name)}</b></td><td>${n.year}</td><td class="num">${esc(b.prefix)}/${n.no}</td><td>${b.active ? '<span class="badge b-printed">ใช้งาน</span>' : '<span class="badge b-cancelled">ปิด</span>'}</td></tr>`; }).join('')}
      </tbody></table></div></div>
  </div>`;
}

// =====================================================================
//  ADMIN — Books (registry books / running numbers)
// =====================================================================
async function viewBooks() {
  await reloadBooks();
  $('#topbar-right').innerHTML = '<button class="btn btn-primary" id="b-add">+ เพิ่มเล่มทะเบียน</button>';
  view().innerHTML = `<div class="card">
    <p class="muted" style="margin-top:0">เล่มทะเบียนใช้ออกเลขหนังสือเรียงต่อกัน เช่น <b>ศย 304.019/1</b>, <b>/2</b>, <b>/3</b> … เมื่อขึ้นปี พ.ศ. ใหม่ ระบบจะเริ่มเลข 1 ให้อัตโนมัติ (ถ้าเปิด "เริ่มเลขใหม่ทุกปี")</p>
    <div class="table-wrap"><table><thead><tr><th>ชื่อเล่ม</th><th>เลขที่หนังสือ (คำนำหน้า)</th><th>ปี พ.ศ.</th><th>เลขถัดไป</th><th>เริ่มใหม่ทุกปี</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${S.books.map((b) => { const n = nextNumberOf(b); return `<tr data-id="${b.id}"><td><b>${esc(b.name)}</b></td><td>${esc(b.prefix)}</td><td>${n.year}</td>
      <td class="num">${esc(b.prefix)}/${n.no}</td><td>${b.auto_reset ? '✔' : '—'}</td>
      <td>${b.active ? '<span class="badge b-printed">ใช้งาน</span>' : '<span class="badge b-cancelled">ปิดใช้งาน</span>'}</td>
      <td class="actions"><button class="btn btn-sm" data-act="edit">แก้ไข</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">ยังไม่มีเล่มทะเบียน</td></tr>'}</tbody></table></div></div>`;
  $('#b-add').addEventListener('click', () => bookForm(null));
  view().addEventListener('click', (e) => {
    if (e.target.closest('[data-act="edit"]')) bookForm(S.books.find((b) => b.id === Number(e.target.closest('tr').dataset.id)));
  });
}

async function bookForm(b) {
  const isNew = !b;
  b = b || { name: 'ทะเบียนหนังสือส่งภายนอก', prefix: S.books[0]?.prefix || '', year: beYear(), next_no: 1, auto_reset: true, active: true };
  const r = await Swal.fire({
    title: isNew ? 'เพิ่มเล่มทะเบียน' : 'แก้ไขเล่มทะเบียน', width: 640, focusConfirm: false,
    html: `<div class="swal-form">
      <label class="full">ชื่อเล่มทะเบียน<input id="k-name" value="${esc(b.name)}"></label>
      <label class="full">คำนำหน้าเลขที่หนังสือ<input id="k-prefix" value="${esc(b.prefix)}" placeholder="เช่น ศย 304.019"></label>
      <label>ปี พ.ศ.<input id="k-year" type="number" value="${b.year}"></label>
      <label>เลขถัดไป<input id="k-next" type="number" min="1" value="${b.next_no}"></label>
      <label class="full" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="k-reset" ${b.auto_reset ? 'checked' : ''}> เริ่มเลข 1 ใหม่อัตโนมัติเมื่อขึ้นปี พ.ศ. ใหม่</label>
      <label class="full" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="k-active" ${b.active ? 'checked' : ''}> เปิดใช้งาน</label>
      <p class="full muted" style="margin:0;font-size:18px">ตัวอย่างเลขที่: <b id="k-demo"></b> · ระบบป้องกันเลขซ้ำอัตโนมัติ</p></div>`,
    showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true,
    didOpen: () => { const f = () => { $('#k-demo').textContent = `ที่ ${val('k-prefix')}/${val('k-next')}`; }; ['k-prefix', 'k-next'].forEach((i) => $('#' + i).addEventListener('input', f)); f(); },
    preConfirm: () => {
      const d = { name: val('k-name'), prefix: val('k-prefix'), year: Number(val('k-year')), next_no: Number(val('k-next')), auto_reset: $('#k-reset').checked, active: $('#k-active').checked };
      if (!d.name || !d.prefix) return Swal.showValidationMessage('กรุณากรอกชื่อเล่มและคำนำหน้าเลขที่');
      if (!(d.next_no >= 1) || !(d.year > 2500)) return Swal.showValidationMessage('ปี พ.ศ. หรือเลขถัดไปไม่ถูกต้อง');
      return d;
    },
  });
  if (!r.isConfirmed) return;
  try {
    await must(isNew ? S.sb.from('books').insert(r.value) : S.sb.from('books').update(r.value).eq('id', b.id));
    ok('บันทึกแล้ว'); route();
  } catch (e) { fail(e); }
}

// =====================================================================
//  ADMIN — Users
// =====================================================================
async function viewUsers() {
  const [users, auth] = await Promise.all([
    must(S.sb.from('profiles').select('*').order('created_at')),
    S.sb.rpc('admin_user_auth_status').then((r) => (r.error ? null : r.data)),
  ]);
  const authMap = new Map((auth || []).map((a) => [a.id, a]));
  const mailCell = (u) => {
    if (!auth) return '<span class="muted">—</span>';
    const a = authMap.get(u.id);
    return a?.email_confirmed_at ? '<span class="badge b-printed">✔ ยืนยันแล้ว</span>'
      : `<span class="badge b-issued">ยังไม่ยืนยัน</span> <button class="btn btn-sm" data-confirm="${u.id}">ยืนยันให้</button>`;
  };
  $('#topbar-right').innerHTML = '<button class="btn btn-primary" id="u-add">+ เพิ่มผู้ใช้งาน</button>';
  view().innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>ยืนยันอีเมล</th><th>บทบาท</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th></tr></thead>
    <tbody>${users.map((u) => { const me = u.id === S.profile.id; const a = authMap.get(u.id); return `<tr data-id="${u.id}">
      <td><b>${esc(u.full_name || '')}</b>${me ? ' <span class="muted">(คุณ)</span>' : ''}</td><td>${esc(u.email || '')}</td>
      <td style="white-space:nowrap">${mailCell(u)}</td>
      <td><select data-f="role" ${me ? 'disabled' : ''} style="width:auto">${opt('staff', 'เจ้าหน้าที่', u.role)}${opt('admin', 'ผู้ดูแลระบบ', u.role)}</select></td>
      <td><label style="display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" data-f="active" ${u.active ? 'checked' : ''} ${me ? 'disabled' : ''}> ${u.active ? 'ใช้งานได้' : '<span class="badge b-issued">รออนุมัติ / ปิด</span>'}</label></td>
      <td style="white-space:nowrap">${a?.last_sign_in_at ? `${fmtDate(a.last_sign_in_at)} ${fmtTime(a.last_sign_in_at)}` : '<span class="muted">ยังไม่เคย</span>'}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="muted" style="font-size:18px;margin-bottom:0">ผู้ใช้ที่ผู้ดูแลสร้างหรืออนุมัติ จะได้รับการยืนยันอีเมลให้อัตโนมัติ เข้าสู่ระบบได้ทันที · การรีเซ็ตรหัสผ่านหรือลบบัญชีถาวร ทำได้ที่ Supabase Dashboard → Authentication → Users</p></div>`;
  view().addEventListener('change', async (e) => {
    const f = e.target.dataset.f; if (!f) return;
    const id = e.target.closest('tr').dataset.id;
    const patch = f === 'role' ? { role: e.target.value } : { active: e.target.checked };
    try {
      await must(S.sb.from('profiles').update(patch).eq('id', id));
      if (patch.active && auth && !authMap.get(id)?.email_confirmed_at) await must(S.sb.rpc('admin_confirm_user', { p_id: id }));
      ok(patch.active ? 'อนุมัติแล้ว — ผู้ใช้เข้าสู่ระบบได้ทันที' : 'บันทึกแล้ว'); route();
    } catch (er) { fail(er); }
  });
  view().addEventListener('click', async (e) => {
    const b = e.target.closest('[data-confirm]'); if (!b) return;
    try { await must(S.sb.rpc('admin_confirm_user', { p_id: b.dataset.confirm })); ok('ยืนยันอีเมลแล้ว'); route(); } catch (er) { fail(er); }
  });
  $('#u-add').addEventListener('click', addUser);
}

async function addUser() {
  const r = await Swal.fire({
    title: 'เพิ่มผู้ใช้งาน', focusConfirm: false,
    html: `<div class="swal-form">
      <label class="full">ชื่อ - นามสกุล<input id="n-name"></label>
      <label class="full">อีเมล (ใช้เข้าสู่ระบบ)<input id="n-email" type="email"></label>
      <label>รหัสผ่านเริ่มต้น<input id="n-pass" type="text" value="${Math.random().toString(36).slice(2, 10)}"></label>
      <label>บทบาท<select id="n-role">${opt('staff', 'เจ้าหน้าที่')}${opt('admin', 'ผู้ดูแลระบบ')}</select></label></div>`,
    showCancelButton: true, confirmButtonText: 'สร้างผู้ใช้', cancelButtonText: 'ยกเลิก', reverseButtons: true,
    preConfirm: () => {
      const d = { name: val('n-name'), email: val('n-email'), pass: val('n-pass'), role: val('n-role') };
      if (!d.name || !d.email) return Swal.showValidationMessage('กรุณากรอกชื่อและอีเมล');
      if (d.pass.length < 6) return Swal.showValidationMessage('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
      return d;
    },
  });
  if (!r.isConfirmed) return;
  const d = r.value;
  try {
    loading('กำลังสร้างผู้ใช้...');
    let via = 'server';
    const { data: { session } } = await S.sb.auth.getSession();
    const resp = await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: d.email, password: d.pass, full_name: d.name, role: d.role }),
    }).catch(() => null);
    const j = resp ? await resp.json().catch(() => null) : null;
    if (!(resp?.ok && j?.ok)) {
      // server not available (no service key / local) → fall back to sign-up, then confirm the e-mail ourselves
      if (j && j.code !== 'not_configured' && resp.status !== 404) throw new Error(j.error || `HTTP ${resp.status}`);
      via = 'client';
      const tmp = createClient(S.conn.url, S.conn.key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'tmp-signup' } });
      const { data, error } = await tmp.auth.signUp({ email: d.email, password: d.pass, options: { data: { full_name: d.name } } });
      if (error) {
        if (/rate limit/i.test(error.message)) throw new Error('Supabase จำกัดจำนวนอีเมลที่ส่งได้ต่อชั่วโมง — ตั้ง SUPABASE_SERVICE_ROLE_KEY ใน Vercel (แนะนำ) หรือปิด "Confirm email" ใน Supabase แล้วลองใหม่');
        throw error;
      }
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) throw new Error('อีเมลนี้มีผู้ใช้งานแล้ว');
      await must(S.sb.rpc('admin_confirm_user', { p_id: data.user.id }));
      await must(S.sb.from('profiles').update({ active: true, role: d.role, full_name: d.name }).eq('id', data.user.id));
    }
    await Swal.fire({
      icon: 'success', title: 'สร้างผู้ใช้สำเร็จ — เข้าสู่ระบบได้ทันที',
      html: `อีเมล: <b>${esc(d.email)}</b><br>รหัสผ่าน: <b>${esc(d.pass)}</b><br><span class="muted">ไม่ต้องยืนยันอีเมล${via === 'client' ? ' (ผู้ใช้อาจได้รับอีเมลจาก Supabase ให้เพิกเฉยได้)' : ''}<br>กรุณาแจ้งผู้ใช้และให้เปลี่ยนรหัสผ่านภายหลัง</span>`,
    });
    route();
  } catch (e) { fail(e); }
}

// =====================================================================
//  ADMIN — Master data (titles / provinces / postcodes)
// =====================================================================
async function viewMaster(tab = 'postcodes') {
  view().innerHTML = `<div class="tabs">
    <button data-tab="postcodes">รหัสไปรษณีย์</button><button data-tab="titles">คำนำหน้าชื่อ</button><button data-tab="provinces">จังหวัด</button></div>
    <div id="m-body"></div>`;
  const open = (t) => { $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t)); (t === 'postcodes' ? masterPostcodes : () => masterSimple(t))(); };
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => open(b.dataset.tab)));
  open(tab);
}

async function masterSimple(table) {
  const label = table === 'titles' ? 'คำนำหน้าชื่อ' : 'จังหวัด';
  const rows = await must(S.sb.from(table).select('*').order('id'));
  $('#m-body').innerHTML = `<div class="card"><div class="card-head"><h3>${label} (${rows.length})</h3><button class="btn btn-primary btn-sm" id="m-add">+ เพิ่ม${label}</button></div>
    <div class="table-wrap" style="max-height:65vh"><table><thead><tr><th style="width:80px">รหัส</th><th>${label}</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-id="${r.id}"><td>${r.id}</td><td>${esc(r.name)}</td><td class="actions">${r.id > 0 ? '<button class="btn btn-sm" data-act="edit">แก้ไข</button><button class="btn btn-sm btn-danger" data-act="del">ลบ</button>' : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  const edit = async (row) => {
    const r = await Swal.fire({ title: row ? `แก้ไข${label}` : `เพิ่ม${label}`, input: 'text', inputValue: row?.name || '', showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true, inputValidator: (v) => (!v.trim() ? 'กรุณากรอกข้อมูล' : undefined) });
    if (!r.isConfirmed) return;
    try {
      const nextId = Math.max(0, ...rows.map((x) => x.id)) + 1;
      await must(row ? S.sb.from(table).update({ name: r.value.trim() }).eq('id', row.id) : S.sb.from(table).insert({ id: nextId, name: r.value.trim() }));
      ok('บันทึกแล้ว'); await loadRefs(); masterSimple(table);
    } catch (e) { fail(e); }
  };
  $('#m-add').addEventListener('click', () => edit(null));
  $('#m-body').onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    const row = rows.find((x) => x.id === Number(e.target.closest('tr').dataset.id));
    if (act === 'edit') edit(row);
    if (act === 'del' && (await ask(`ลบ "${esc(row.name)}"?`, '', { icon: 'warning', confirmButtonColor: '#c0392b', confirmButtonText: 'ลบ' }))) {
      try { await must(S.sb.from(table).delete().eq('id', row.id)); ok('ลบแล้ว'); await loadRefs(); masterSimple(table); } catch (er) { fail(er); }
    }
  };
}

async function masterPostcodes() {
  const st = { q: '', page: 0, size: 50 };
  $('#m-body').innerHTML = `<div class="card"><div class="toolbar"><label class="grow">ค้นหา<input id="p-q" placeholder="ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์"></label><button class="btn btn-primary" id="p-add">+ เพิ่ม</button></div>
    <div class="table-wrap"><table><thead><tr><th>รหัส ปณ.</th><th>ตำบล/แขวง</th><th>อำเภอ/เขต</th><th>จังหวัด</th><th>หมายเหตุ</th><th></th></tr></thead><tbody id="p-body"></tbody></table></div>
    <div class="pager" id="p-pager"></div></div>`;
  const load = async () => {
    let qb = S.sb.from('postcodes').select('*', { count: 'exact' });
    const t = clean(st.q);
    if (t) qb = qb.or(`tumbon.ilike.%${t}%,amphur.ilike.%${t}%,province.ilike.%${t}%,postcode.ilike.${t}%`);
    const { data, count } = await mustCount(qb.order('postcode').order('id').range(st.page * st.size, st.page * st.size + st.size - 1));
    $('#p-body').innerHTML = data.map((p) => `<tr data-id="${p.id}"><td class="num">${esc(p.postcode)}</td><td>${esc(p.tumbon)}</td><td>${esc(p.amphur)}</td><td>${esc(p.province)}</td><td style="font-size:18px;max-width:320px">${esc(p.note || '')}</td>
      <td class="actions"><button class="btn btn-sm" data-act="edit">แก้ไข</button><button class="btn btn-sm btn-danger" data-act="del">ลบ</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">ไม่พบข้อมูล</td></tr>';
    $('#p-body')._rows = data;
    pager('#p-pager', st, count, load);
  };
  const edit = async (p) => {
    p = p || {};
    const r = await Swal.fire({
      title: p.id ? 'แก้ไขรหัสไปรษณีย์' : 'เพิ่มรหัสไปรษณีย์', focusConfirm: false,
      html: `<div class="swal-form"><label>ตำบล/แขวง<input id="pc-t" value="${esc(p.tumbon || '')}"></label><label>อำเภอ/เขต<input id="pc-a" value="${esc(p.amphur || '')}"></label>
        <label>จังหวัด<select id="pc-p">${S.provinces.filter((x) => x.id > 0).map((x) => opt(x.name, x.name, p.province)).join('')}</select></label><label>รหัสไปรษณีย์<input id="pc-c" maxlength="5" value="${esc(p.postcode || '')}"></label>
        <label class="full">หมายเหตุ<input id="pc-n" value="${esc(p.note || '')}"></label></div>`,
      showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      preConfirm: () => {
        const d = { tumbon: val('pc-t'), amphur: val('pc-a'), province: val('pc-p'), postcode: val('pc-c'), note: val('pc-n') || null, updated_at: new Date().toISOString() };
        if (!d.tumbon || !d.amphur || !/^\d{5}$/.test(d.postcode)) return Swal.showValidationMessage('กรอกตำบล อำเภอ และรหัสไปรษณีย์ 5 หลักให้ครบ');
        return d;
      },
    });
    if (!r.isConfirmed) return;
    try { await must(p.id ? S.sb.from('postcodes').update(r.value).eq('id', p.id) : S.sb.from('postcodes').insert(r.value)); ok('บันทึกแล้ว'); load(); } catch (e) { fail(e); }
  };
  $('#p-q').addEventListener('input', debounce(() => { st.q = $('#p-q').value; st.page = 0; load(); }, 350));
  $('#p-add').addEventListener('click', () => edit(null));
  $('#p-body').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    const p = $('#p-body')._rows.find((x) => x.id === Number(e.target.closest('tr').dataset.id));
    if (act === 'edit') edit(p);
    if (act === 'del' && (await ask('ลบรายการนี้?', `${esc(p.tumbon)} ${esc(p.amphur)} ${esc(p.postcode)}`, { icon: 'warning', confirmButtonColor: '#c0392b', confirmButtonText: 'ลบ' }))) {
      try { await must(S.sb.from('postcodes').delete().eq('id', p.id)); ok('ลบแล้ว'); load(); } catch (er) { fail(er); }
    }
  });
  load();
}

// =====================================================================
//  ADMIN — Settings (organization + envelope layout)
// =====================================================================
async function viewSettings() {
  await loadRefs();
  const s = { ...S.settings };
  const F = (id, label, v, extra = '') => `<label${extra}>${label}<input id="s-${id}" value="${esc(v ?? '')}"></label>`;
  const N = (id, label, v) => `<label>${label}<input id="s-${id}" type="number" step="0.5" value="${esc(v ?? 0)}"></label>`;
  view().innerHTML = `
  <div class="grid-2">
    <div>
      <div class="card"><div class="card-head"><h3>ข้อมูลหน่วยงาน (ผู้ส่ง)</h3></div>
        <div class="form-grid">
          ${F('org_name', 'ชื่อหน่วยงาน', s.org_name, ' class="full"')}
          ${F('address', 'ที่อยู่ (ถนน ตำบล)', s.address, ' class="full"')}
          ${F('amphur', 'อำเภอ', s.amphur)}${F('province', 'จังหวัด', s.province)}
          ${F('postcode', 'รหัสไปรษณีย์', s.postcode)}${F('telephone', 'โทรศัพท์', s.telephone)}
          ${F('fax', 'โทรสาร', s.fax)}${F('recipient_prefix', 'คำขึ้นต้นผู้รับบนซอง', s.recipient_prefix)}
        </div></div>
      <div class="card"><div class="card-head"><h3>ตราสัญลักษณ์และช่องค่าฝากส่ง</h3></div>
        <div class="form-grid">
          <div class="full" style="display:flex;gap:14px;align-items:center">
            <div id="s-emblem-prev" style="width:70px;height:70px;border:1px dashed var(--line);border-radius:10px;display:grid;place-items:center;overflow:hidden">${s.emblem_url ? `<img src="${esc(s.emblem_url)}" style="max-width:100%;max-height:100%">` : '<span class="muted" style="font-size:17px">ไม่มี</span>'}</div>
            <div style="flex:1"><label>อัปโหลดตราสัญลักษณ์ (เช่น ตราครุฑ) PNG/JPG<input type="file" id="s-emblem" accept="image/*"></label>
              <div style="display:flex;gap:14px;margin-top:6px"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="s-show_emblem" ${s.show_emblem !== false ? 'checked' : ''}> แสดงบนซอง</label>
              <button class="btn btn-sm btn-ghost" id="s-emblem-clear" type="button">ลบรูป</button></div></div>
          </div>
          <label class="full">ข้อความช่องค่าฝากส่ง (มุมขวาบน)<textarea id="s-postage_text" rows="3">${esc(s.postage_text || '')}</textarea></label>
          <label class="full" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="s-show_postage" ${s.show_postage !== false ? 'checked' : ''}> แสดงช่องค่าฝากส่ง</label>
        </div></div>
      <div class="card"><div class="card-head"><h3>ตำแหน่งข้อความบนซอง</h3></div>
        <p style="margin:0">การย้ายตำแหน่งข้อความ ขนาดตัวอักษร และการวางซองน้ำตาล ตั้งค่าแยกตามผู้ใช้ที่เมนู <a href="#layout"><b>ตั้งค่าตำแหน่งบนซอง</b></a> (ตัวอย่างด้านขวาแสดงตามการตั้งค่าของคุณ)</p></div>
      <div class="card"><div class="card-head"><h3>รหัสผู้รับอัตโนมัติ</h3></div>
        <div class="form-grid">
          ${F('customer_prefix', 'ตัวอักษรนำหน้า', s.customer_prefix)}
          <label>จำนวนหลักเลขลำดับ<input id="s-customer_length" type="number" min="3" max="10" value="${s.customer_length ?? 6}"></label>
          <label class="full" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="s-customer_year" ${s.customer_year !== false ? 'checked' : ''}> ใส่ปี พ.ศ. 2 หลัก (เช่น CUS69003730)</label>
        </div></div>
      <div style="margin-top:16px"><button class="btn btn-primary btn-block" id="s-save">💾 บันทึกการตั้งค่า</button></div>
    </div>
    <div style="position:sticky;top:80px">
      <div class="card"><div class="card-head"><h3>ตัวอย่างซอง</h3>${envSeg('s-env', 'white')}</div>
        <div id="s-preview"></div>
        <div style="display:flex;gap:10px;margin-top:12px"><button class="btn" id="s-test">🖨️ พิมพ์ทดสอบ</button></div>
      </div>
    </div>
  </div>`;

  const collect = () => {
    const d = { ...s };
    ['org_name', 'address', 'amphur', 'province', 'postcode', 'telephone', 'fax', 'recipient_prefix', 'postage_text', 'customer_prefix'].forEach((k) => { d[k] = $('#s-' + k).value; });
    ['customer_length'].forEach((k) => { d[k] = Number($('#s-' + k).value || 0); });
    ['show_emblem', 'show_postage', 'customer_year'].forEach((k) => { d[k] = $('#s-' + k).checked; });
    return d;
  };
  const envType = () => $('input[name="s-env"]:checked').value;
  const refresh = () => { $('#s-preview').innerHTML = previewHtml([SAMPLE_LETTER], envType(), collect(), 1, $('#s-preview').clientWidth || 600); };
  view().addEventListener('input', debounce(refresh, 200));
  view().addEventListener('change', refresh);
  $('#s-emblem').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    s.emblem_url = await shrinkImage(file, 400);
    $('#s-emblem-prev').innerHTML = `<img src="${s.emblem_url}" style="max-width:100%;max-height:100%">`; refresh();
  });
  $('#s-emblem-clear').addEventListener('click', () => { s.emblem_url = null; $('#s-emblem-prev').innerHTML = '<span class="muted" style="font-size:17px">ไม่มี</span>'; refresh(); });
  $('#s-test').addEventListener('click', () => printLetters([SAMPLE_LETTER], envType(), collect(), { markPrinted: false }));
  $('#s-save').addEventListener('click', async () => {
    const d = collect(); delete d.id; d.updated_at = new Date().toISOString();
    try { await must(S.sb.from('settings').update(d).eq('id', 1)); S.settings = { ...S.settings, ...d }; $('#brand-org').textContent = d.org_name; ok('บันทึกการตั้งค่าแล้ว'); } catch (e) { fail(e); }
  });
  refresh();
}

function shrinkImage(file, maxSide) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================================
//  รายงานการพิมพ์ซอง (daily / monthly / yearly · white / brown / all)
// =====================================================================
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const PERIODS = { day: 'รายวัน', month: 'รายเดือน', year: 'รายปี' };
const ENV_FILTER = { all: 'ทั้งหมด', white: 'ซองขาว', brown: 'ซองน้ำตาล' };
const SERIES = { white: { label: 'ซองขาว', color: '#3b5ba9' }, brown: { label: 'ซองน้ำตาล', color: '#b47a3c' } };

function thDate(iso, short = true) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${(short ? TH_MONTHS_S : TH_MONTHS)[m - 1]} ${y + 543}`;
}

async function viewReports() {
  const today = bkkDate();
  const by = beYear();
  S.rep = S.rep || { period: 'day', from: today.slice(0, 8) + '01', to: today, year: by, yFrom: by - 4, yTo: by, env: 'all', rows: [] };
  const R = S.rep;
  view().innerHTML = `
  <div class="card">
    <div class="tabs" id="rp-tabs">${Object.entries(PERIODS).map(([k, l]) => `<button data-p="${k}" class="${R.period === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="toolbar" id="rp-filters"></div>
    <div class="toolbar" style="margin-bottom:0;align-items:center">
      <span class="muted">ประเภทซอง</span>
      <div class="seg">${Object.entries(ENV_FILTER).map(([k, l]) => `<label><input type="radio" name="rp-env" value="${k}" ${R.env === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <span class="spacer"></span>
      <button class="btn" id="rp-csv">⬇️ ส่งออก Excel (CSV)</button>
      <button class="btn btn-primary" id="rp-print">🖨️ พิมพ์รายงาน</button>
    </div>
  </div>
  <div class="grid-4" id="rp-stats" style="margin-top:16px"></div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3 id="rp-title"></h3><div class="legend" id="rp-legend"></div></div>
    <div id="rp-chart"></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>รายการซองที่พิมพ์ <span class="muted" style="font-weight:400;font-size:18px">(เรียงตามเลขที่หนังสือ)</span></h3><span class="badge b-staff" id="rp-count"></span></div>
    <div class="table-wrap" id="rp-table" style="max-height:65vh"></div>
  </div>`;

  const yearOpts = (sel) => Array.from({ length: 12 }, (_, i) => by - i).map((y) => opt(y, `พ.ศ. ${y}`, sel)).join('');
  const paintFilters = () => {
    $$('#rp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.p === R.period));
    $('#rp-filters').innerHTML = R.period === 'day' ? `
        <label>ตั้งแต่วันที่<input type="date" id="rp-from" value="${R.from}"></label>
        <label>ถึงวันที่<input type="date" id="rp-to" value="${R.to}"></label>
        <div style="display:flex;gap:6px"><button class="btn btn-sm" data-q="this">เดือนนี้</button><button class="btn btn-sm" data-q="last">เดือนที่แล้ว</button><button class="btn btn-sm" data-q="7">7 วันล่าสุด</button></div>`
      : R.period === 'month' ? `<label>ปี พ.ศ.<select id="rp-year">${yearOpts(R.year)}</select></label>`
        : `<label>ตั้งแต่ปี<select id="rp-yfrom">${yearOpts(R.yFrom)}</select></label><label>ถึงปี<select id="rp-yto">${yearOpts(R.yTo)}</select></label>`;
  };

  const rangeCE = () => {
    if (R.period === 'day') return [R.from, R.to];
    if (R.period === 'month') return [`${R.year - 543}-01-01`, `${R.year - 543}-12-31`];
    return [`${Math.min(R.yFrom, R.yTo) - 543}-01-01`, `${Math.max(R.yFrom, R.yTo) - 543}-12-31`];
  };
  const periodKeys = () => {
    const [a, b] = rangeCE();
    if (R.period === 'day') {
      const out = []; const d = new Date(a + 'T00:00:00Z'); const end = new Date(b + 'T00:00:00Z');
      while (d <= end && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
      return out;
    }
    if (R.period === 'month') return Array.from({ length: 12 }, (_, i) => `${R.year - 543}-${String(i + 1).padStart(2, '0')}`);
    const out = []; for (let y = Number(a.slice(0, 4)); y <= Number(b.slice(0, 4)); y++) out.push(String(y)); return out;
  };
  const labelOf = (k, short = true) => R.period === 'day' ? thDate(k, short)
    : R.period === 'month' ? `${(short ? TH_MONTHS_S : TH_MONTHS)[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(0, 4)) + 543}` : `พ.ศ. ${Number(k) + 543}`;
  const rangeText = () => {
    const [a, b] = rangeCE();
    if (R.period === 'day') return a === b ? `วันที่ ${thDate(a, false)}` : `วันที่ ${thDate(a, false)} ถึง ${thDate(b, false)}`;
    if (R.period === 'month') return `ปี พ.ศ. ${R.year}`;
    return `ปี พ.ศ. ${Number(a.slice(0, 4)) + 543} ถึง ${Number(b.slice(0, 4)) + 543}`;
  };
  const cols = () => (R.env === 'all' ? ['white', 'brown', 'total'] : [R.env]);
  const colLabel = (c) => (c === 'total' ? 'รวมทั้งหมด' : SERIES[c].label);

  const load = async () => {
    if (R.period === 'day') {
      R.from = $('#rp-from').value || today; R.to = $('#rp-to').value || R.from;
      if (R.from > R.to) [R.from, R.to] = [R.to, R.from];
      const days = (Date.parse(R.to) - Date.parse(R.from)) / 864e5;
      if (days > 366) { warn('รายงานรายวันเลือกได้ไม่เกิน 1 ปี'); R.from = R.to.slice(0, 8) + '01'; paintFilters(); bindFilters(); }
    }
    const [a, b] = rangeCE();
    $('#rp-chart').innerHTML = '<div class="empty">กำลังโหลด...</div>';
    try {
      const [data, items] = await Promise.all([
        must(S.sb.rpc('print_report', { p_period: R.period, p_from: a, p_to: b })),
        must(S.sb.rpc('print_report_items', { p_from: a, p_to: b, p_envelope: null })),
      ]);
      R.items = items.map((i) => ({ ...i, white: Number(i.white || 0), brown: Number(i.brown || 0), prints: Number(i.prints || 0) }));
      const map = new Map(data.map((d) => [d.period_key, d]));
      R.rows = periodKeys().map((k) => {
        const d = map.get(k) || {};
        return { key: k, white: Number(d.white || 0), brown: Number(d.brown || 0), total: Number(d.total || 0), envelopes: Number(d.envelopes || 0) };
      });
      paint();
    } catch (e) { $('#rp-chart').innerHTML = `<div class="empty">${esc(thaiError(e))}</div>`; }
  };

  const sum = (k) => R.rows.reduce((t, r) => t + r[k], 0);
  const shownItems = () => (R.env === 'all' ? R.items || [] : (R.items || []).filter((i) => i[R.env] > 0));
  const paint = () => {
    const W = sum('white'), B = sum('brown'), T = sum('total');
    const unit = R.period === 'day' ? 'วัน' : R.period === 'month' ? 'เดือน' : 'ปี';
    const shown = R.env === 'all' ? T : R.env === 'white' ? W : B;
    const avg = R.rows.length ? shown / R.rows.length : 0;
    const dim = (k) => (R.env !== 'all' && R.env !== k ? ' style="opacity:.45"' : '');
    $('#rp-stats').innerHTML = `
      <div class="stat"${dim('white')}><small><i class="sw" style="background:${SERIES.white.color}"></i>ซองขาว 4.25" × 9.25"</small><b>${num(W)}</b></div>
      <div class="stat"${dim('brown')}><small><i class="sw" style="background:${SERIES.brown.color}"></i>ซองน้ำตาล 8.2" × 10"</small><b>${num(B)}</b></div>
      <div class="stat gold"${R.env !== 'all' ? ' style="opacity:.45"' : ''}><small>รวมทั้งหมด</small><b>${num(T)}</b></div>
      <div class="stat"><small>เฉลี่ยต่อ${unit} (${ENV_FILTER[R.env]})</small><b>${avg.toLocaleString('th-TH', { maximumFractionDigits: 1 })}</b></div>`;
    $('#rp-title').textContent = `จำนวนซองที่พิมพ์${PERIODS[R.period]} · ${ENV_FILTER[R.env]} · ${rangeText()}`;
    const series = R.env === 'all' ? ['white', 'brown'] : [R.env];
    $('#rp-legend').innerHTML = series.length > 1 ? series.map((k) => `<span><i class="sw" style="background:${SERIES[k].color}"></i>${SERIES[k].label}</span>`).join('') : '';
    $('#rp-chart').innerHTML = barChart(R.rows, series, (k) => labelOf(k), R.period);
    bindTooltip($('#rp-chart'), R.rows, series, (k) => labelOf(k, false));
    const items = shownItems();
    $('#rp-count').textContent = `${num(items.length)} ฉบับ`;
    $('#rp-table').innerHTML = itemsTable(items, R.env);
  };

  const bindFilters = () => {
    $$('#rp-filters input, #rp-filters select').forEach((el) => el.addEventListener('change', () => {
      if (R.period === 'month') R.year = Number($('#rp-year').value);
      if (R.period === 'year') { R.yFrom = Number($('#rp-yfrom').value); R.yTo = Number($('#rp-yto').value); }
      load();
    }));
    $$('#rp-filters [data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q; const d = new Date(today + 'T00:00:00Z');
      if (q === 'this') { R.from = today.slice(0, 8) + '01'; R.to = today; }
      if (q === 'last') { d.setUTCDate(0); R.to = d.toISOString().slice(0, 10); R.from = R.to.slice(0, 8) + '01'; }
      if (q === '7') { d.setUTCDate(d.getUTCDate() - 6); R.from = d.toISOString().slice(0, 10); R.to = today; }
      paintFilters(); bindFilters(); load();
    }));
  };

  $('#rp-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    R.period = b.dataset.p; paintFilters(); bindFilters(); load();
  });
  $$('input[name="rp-env"]').forEach((x) => x.addEventListener('change', (e) => { R.env = e.target.value; paint(); }));
  $('#rp-csv').addEventListener('click', () => {
    const items = shownItems();
    const c = R.env === 'all' ? ['white', 'brown', 'prints'] : [R.env];
    const lines = [[`รายงานการพิมพ์ซองจดหมาย (${ENV_FILTER[R.env]})`], [rangeText()], [],
      ['ลำดับ', 'เลขที่หนังสือ', 'วันที่ออกเลข', 'ผู้รับ', 'จังหวัด', 'เรื่อง', ...c.map(itemColLabel), 'พิมพ์ล่าสุด', 'ผู้พิมพ์', 'สถานะ'],
      ...items.map((i, n) => [n + 1, i.doc_number, thDate(bkkDate(new Date(i.issued_at)), false), i.recipient_name, i.recipient_province || '', i.subject || '',
        ...c.map((k) => i[k]), `${fmtDate(i.last_printed_at)} ${fmtTime(i.last_printed_at)}`, i.printed_by || '', i.status === 'cancelled' ? 'ยกเลิก' : '']),
      ['', `รวม ${items.length} ฉบับ`, '', '', '', '', ...c.map((k) => items.reduce((t, i) => t + i[k], 0))]];
    const csv = '\ufeff' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const [a, b] = rangeCE();
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `รายการซองที่พิมพ์_${a}_${b}.csv`);
  });
  $('#rp-print').addEventListener('click', () => {
    const items = shownItems();
    if (!items.length) return warn('ไม่มีรายการในช่วงเวลานี้');
    const W = items.reduce((t, i) => t + i.white, 0), B = items.reduce((t, i) => t + i.brown, 0);
    const box = (label, v, unit) => `<div>${label}<b>${num(v)}</b>${unit}</div>`;
    printReport(`
      <div class="rp-head"><img src="/assets/logo.png" alt=""><div><h2>รายงานการพิมพ์ซองจดหมาย</h2><div>${esc(S.settings.org_name || '')}</div></div></div>
      <div class="rp-meta"><span><b>ช่วงเวลา:</b> ${esc(rangeText())}</span><span><b>ประเภทซอง:</b> ${ENV_FILTER[R.env]}</span></div>
      <div class="rp-sum">${box('จำนวนหนังสือ', items.length, 'ฉบับ')}${R.env !== 'brown' ? box('ซองขาว', W, 'ซอง') : ''}${R.env !== 'white' ? box('ซองน้ำตาล', B, 'ซอง') : ''}${R.env === 'all' ? box('รวม', W + B, 'ซอง') : ''}</div>
      ${itemsTable(items, R.env, true)}
      <div class="rp-sign"><div>ลงชื่อ ..................................................... ผู้รายงาน<br>(${esc(S.profile.full_name || S.profile.email)})</div>
      <div>พิมพ์เมื่อ ${thDate(bkkDate(), false)} เวลา ${fmtTime(new Date())} น.</div></div>`);
  });

  paintFilters(); bindFilters(); load();
}

const itemColLabel = (c) => (c === 'prints' ? 'รวม (ครั้ง)' : `${SERIES[c].label} (ครั้ง)`);

/** One row per letter, sorted by document number (already sorted by the database). */
function itemsTable(items, env, forPrint = false) {
  const c = env === 'all' ? ['white', 'brown', 'prints'] : [env];
  const tot = (k) => items.reduce((t, i) => t + i[k], 0);
  const issued = (i) => fmtDate(i.issued_at);
  if (!items.length) return '<div class="empty">ไม่มีการพิมพ์ซองในช่วงเวลานี้</div>';
  const colg = forPrint ? `<colgroup><col style="width:9mm"><col style="width:26mm"><col style="width:20mm"><col><col style="width:27mm">${c.map(() => '<col style="width:16mm">').join('')}</colgroup>` : '';
  return `<table class="${forPrint ? 'rp-table rp-items' : ''}">${colg}<thead><tr>
      <th class="r" style="width:${forPrint ? '11mm' : '60px'}">ลำดับ</th><th>เลขที่หนังสือ</th><th>วันที่ออกเลข</th><th>ผู้รับ</th><th>เรื่อง</th>
      ${c.map((k) => `<th class="r">${forPrint ? itemColLabel(k).replace(' (ครั้ง)', '') : itemColLabel(k)}</th>`).join('')}
      ${forPrint ? '' : '<th>พิมพ์ล่าสุด</th><th>ผู้พิมพ์</th>'}</tr></thead>
    <tbody>${items.map((i, n) => `<tr${i.status === 'cancelled' ? ' class="zero"' : ''}>
      <td class="r">${n + 1}</td><td style="white-space:nowrap"><b>${esc(i.doc_number)}</b>${i.status === 'cancelled' ? '<div class="muted">(ยกเลิก)</div>' : ''}</td>
      <td style="white-space:nowrap">${issued(i)}</td>
      <td>${esc(i.recipient_name)}${i.recipient_province ? `<span class="muted"> · ${esc(i.recipient_province)}</span>` : ''}</td>
      <td>${esc(i.subject || '')}</td>
      ${c.map((k) => `<td class="r">${num(i[k])}</td>`).join('')}
      ${forPrint ? '' : `<td style="white-space:nowrap">${fmtDate(i.last_printed_at)} ${fmtTime(i.last_printed_at)}</td><td>${esc(i.printed_by || '')}</td>`}</tr>`).join('')}</tbody>
    <tfoot><tr><td></td><td colspan="4">รวม ${num(items.length)} ฉบับ</td>${c.map((k) => `<td class="r">${num(tot(k))}</td>`).join('')}${forPrint ? '' : '<td colspan="2"></td>'}</tr></tfoot></table>`;
}

/** Stacked bar chart in plain HTML (2px surface gap between segments, rounded data-end). */
function barChart(rows, series, labelOf, period) {
  const val = (r) => series.reduce((t, k) => t + r[k], 0);
  const max = Math.max(0, ...rows.map(val));
  if (!max) return '<div class="chart-empty">ไม่มีการพิมพ์ซองในช่วงเวลานี้</div>';
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  const every = rows.length > 16 ? Math.ceil(rows.length / 16) : 1;
  const pos = (v) => `bottom:calc(30px + (100% - 30px) * ${v / top})`;
  return `<div class="chart" role="img" aria-label="กราฟจำนวนซองที่พิมพ์">
    <div class="chart-y">${ticks.map((v) => `<span style="${pos(v)}">${num(v)}</span>`).join('')}</div>
    <div class="chart-plot">
      ${ticks.map((v) => `<div class="chart-grid${v === 0 ? ' base' : ''}" style="${pos(v)}"></div>`).join('')}
      <div class="chart-bars">${rows.map((r, i) => `
        <div class="chart-col" data-i="${i}">
          <div class="chart-area"><div class="chart-stack" style="height:${(val(r) / top) * 100}%">${series.slice().reverse().filter((k) => r[k]).map((k) =>
            `<div class="chart-seg" style="flex:${r[k]};background:${SERIES[k].color}"></div>`).join('')}</div></div>
          <div class="chart-x">${i % every === 0 ? esc(period === 'day' ? String(Number(r.key.slice(8, 10))) : labelOf(r.key).replace(/ \d{4}$/, '')) : ''}</div>
        </div>`).join('')}</div>
    </div></div>`;
}
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / p;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p);
}
function bindTooltip(root, rows, series, labelOf) {
  let tip = $('#chart-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'chart-tip'; tip.className = 'chart-tip hidden'; document.body.appendChild(tip); }
  root.addEventListener('mousemove', (e) => {
    const col = e.target.closest('.chart-col');
    if (!col) return tip.classList.add('hidden');
    const r = rows[Number(col.dataset.i)];
    tip.innerHTML = `<b>${esc(labelOf(r.key))}</b>${series.map((k) => `<div><i class="sw" style="background:${SERIES[k].color}"></i>${SERIES[k].label}<span>${num(r[k])}</span></div>`).join('')}
      ${series.length > 1 ? `<div class="tt-total">รวม<span>${num(r.total)}</span></div>` : ''}`;
    tip.classList.remove('hidden');
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`; tip.style.top = `${e.clientY - tip.offsetHeight - 10}px`;
  });
  root.addEventListener('mouseleave', () => tip.classList.add('hidden'));
}

async function printReport(html) {
  const root = $('#print-root');
  root.innerHTML = `<section class="report-page">${html}</section>`;
  $('#print-page-style').textContent = '@page { size: A4 portrait; margin: 15mm 15mm 15mm 20mm; }';
  await waitForPrintAssets(root);
  window.print();
  root.innerHTML = '';
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// =====================================================================
//  ADMIN — สำรองข้อมูล (backup to Supabase Storage: ปี พ.ศ. / เดือน / วันที่)
// =====================================================================
const BACKUP_TABLES = ['settings', 'titles', 'provinces', 'postcodes', 'customers', 'books', 'letters', 'print_logs', 'profiles', 'envelope_layouts', 'backup_logs'];
const BACKUP_BUCKET = 'backups';

function bkkParts(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return { be: t.getUTCFullYear() + 543, mm: p(t.getUTCMonth() + 1), dd: p(t.getUTCDate()), hh: p(t.getUTCHours()), mi: p(t.getUTCMinutes()), ss: p(t.getUTCSeconds()) };
}
function backupPath(type, d = new Date()) {
  const b = bkkParts(d);
  return `${b.be}/${b.mm}/${b.dd}/backup_${b.be}-${b.mm}-${b.dd}_${b.hh}${b.mi}${b.ss}_${type}.json.gz`;
}
async function fetchAllRows(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await must(S.sb.from(table).select('*').order('id').range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const gzipBlob = (text) => new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
const gunzipText = (blob) => new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

async function runManualBackup(alsoDownload) {
  Swal.fire({ title: 'กำลังสำรองข้อมูล...', html: '<div id="bk-progress" class="muted">เตรียมข้อมูล</div>', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const tables = {}; const row_counts = {};
    for (const t of BACKUP_TABLES) {
      const el = $('#bk-progress'); if (el) el.textContent = `กำลังอ่านตาราง ${t} ...`;
      tables[t] = await fetchAllRows(t); row_counts[t] = tables[t].length;
    }
    const now = new Date();
    const path = backupPath('manual', now);
    const by = S.profile.full_name || S.profile.email;
    const json = JSON.stringify({ meta: { app: 'envelope-print-system', format: 1, type: 'manual', path, created_at: now.toISOString(), created_by: by, supabase_url: S.conn.url, row_counts }, tables });
    const blob = await gzipBlob(json);
    const { error } = await S.sb.storage.from(BACKUP_BUCKET).upload(path, blob, { contentType: 'application/gzip', upsert: false });
    if (error) throw new Error(`อัปโหลดไฟล์สำรองไม่สำเร็จ: ${error.message} (ตรวจสอบว่าได้รัน 01_schema.sql เพื่อสร้าง bucket "backups" แล้ว)`);
    await must(S.sb.from('backup_logs').insert({ backup_type: 'manual', path, size_bytes: blob.size, row_counts, created_by: S.profile.id, created_by_name: by }));
    if (alsoDownload) saveBlob(new Blob([json], { type: 'application/json' }), path.split('/').pop().replace('.gz', ''));
    const total = Object.values(row_counts).reduce((a, b) => a + b, 0);
    await Swal.fire({ icon: 'success', title: 'สำรองข้อมูลสำเร็จ', html: `โฟลเดอร์ <b>${esc(path.split('/').slice(0, 3).join(' / '))}</b><br>${num(total)} แถว · ${fmtBytes(blob.size)}` });
  } catch (e) { fail(e); }
}

async function downloadBackup(path) {
  try {
    loading('กำลังดาวน์โหลด...');
    const { data, error } = await S.sb.storage.from(BACKUP_BUCKET).download(path);
    if (error) throw error;
    const text = await gunzipText(data);
    saveBlob(new Blob([text], { type: 'application/json' }), path.split('/').pop().replace('.gz', ''));
    Swal.close();
  } catch (e) { fail(e); }
}

async function viewBackup() {
  const [logs, status] = await Promise.all([
    must(S.sb.from('backup_logs').select('*').order('created_at', { ascending: false }).limit(3000)),
    fetch('/api/backup?status=1').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const last = logs[0], lastAuto = logs.find((l) => l.backup_type === 'auto');
  const totalSize = logs.reduce((t, l) => t + Number(l.size_bytes || 0), 0);
  const autoOk = status?.configured;
  const autoRecent = lastAuto && Date.now() - Date.parse(lastAuto.created_at) < 2.2 * 864e5;
  const lastManual = logs.find((l) => l.backup_type === 'manual');
  const manualRecent = lastManual && Date.now() - Date.parse(lastManual.created_at) < 1.2 * 864e5;

  view().innerHTML = `
  <div class="grid-4">
    <div class="stat gold"><small>สำรองล่าสุด</small><b style="font-size:28px">${last ? `${fmtDate(last.created_at)} ${fmtTime(last.created_at)}` : '—'}</b></div>
    <div class="stat"><small>สำรองอัตโนมัติล่าสุด</small><b style="font-size:28px">${lastAuto ? `${fmtDate(lastAuto.created_at)} ${fmtTime(lastAuto.created_at)}` : '—'}</b></div>
    <div class="stat"><small>จำนวนไฟล์สำรอง</small><b>${num(logs.length)}</b></div>
    <div class="stat"><small>พื้นที่ที่ใช้</small><b>${fmtBytes(totalSize)}</b></div>
  </div>
  <div class="grid-2" style="margin-top:16px">
    <div class="card"><div class="card-head"><h3>สำรองข้อมูลตอนนี้</h3></div>
      <p style="margin-top:0">สำรองทุกตาราง (${BACKUP_TABLES.length} ตาราง) เก็บใน Supabase Storage แยกโฟลเดอร์ตาม <b>ปี พ.ศ. → เดือน → วันที่</b></p>
      <label style="display:flex;gap:8px;align-items:center;color:var(--text);margin-bottom:12px"><input type="checkbox" id="bk-dl"> ดาวน์โหลดไฟล์สำรอง (.json) ลงเครื่องนี้ด้วย</label>
      <button class="btn btn-gold btn-block" id="bk-run">💾 สำรองข้อมูลตอนนี้</button></div>
    <div class="card"><div class="card-head"><h3>สำรองข้อมูลอัตโนมัติ</h3>
      ${autoOk ? '<span class="badge b-printed">✔ เปิดใช้งาน</span>' : '<span class="badge b-cancelled">ยังไม่ได้ตั้งค่า</span>'}</div>
      <p style="margin-top:0">ทุกวันเวลา <b>00:00 น.</b> ระบบจะตรวจว่าเมื่อวานมีการกด "สำรองข้อมูลตอนนี้" หรือไม่ — <b>ถ้าไม่มี จะสำรองให้อัตโนมัติ</b></p>
      <p class="muted" style="font-size:18px;margin:0 0 10px">${autoOk
    ? (manualRecent ? 'มีการกดสำรองข้อมูลภายใน 24 ชม. ที่ผ่านมา คืนนี้ระบบอาจข้ามการสำรองอัตโนมัติ' : autoRecent ? 'ระบบสำรองอัตโนมัติทำงานปกติ' : 'ยังไม่พบไฟล์สำรองอัตโนมัติในช่วง 2 วันที่ผ่านมา (ถ้าเพิ่งตั้งค่า ให้รอถึงเที่ยงคืน หรือกดทดสอบ)')
    : 'ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY และ CRON_SECRET ใน Vercel แล้ว Redeploy (ดู README.md)'}</p>
      <button class="btn" id="bk-test" ${autoOk ? '' : 'disabled'}>▶️ ทดสอบการสำรองอัตโนมัติ (ฝั่งเซิร์ฟเวอร์)</button></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>โฟลเดอร์สำรองข้อมูล</h3><span class="muted" style="font-size:18px">Storage bucket: <b>${BACKUP_BUCKET}</b></span></div>
    <div id="bk-tree">${backupTree(logs)}</div></div>`;

  $('#bk-run').addEventListener('click', async () => {
    if (!(await ask('สำรองข้อมูลตอนนี้?', 'ระบบจะอ่านข้อมูลทั้งหมดและบันทึกเป็นไฟล์สำรองในโฟลเดอร์ของวันนี้', { confirmButtonText: 'สำรองข้อมูล' }))) return;
    await runManualBackup($('#bk-dl').checked); route();
  });
  $('#bk-test')?.addEventListener('click', async () => {
    try {
      loading('กำลังสำรองข้อมูลฝั่งเซิร์ฟเวอร์...');
      const { data: { session } } = await S.sb.auth.getSession();
      const r = await fetch('/api/backup?force=1', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await Swal.fire({ icon: 'success', title: 'ระบบสำรองอัตโนมัติทำงานได้', html: `บันทึกไฟล์ <b>${esc(j.path)}</b>` });
      route();
    } catch (e) { fail(e); }
  });
  $('#bk-tree').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bk]'); if (!b) return;
    const log = logs.find((l) => l.id === Number(b.dataset.id));
    if (b.dataset.bk === 'dl') return downloadBackup(log.path);
    if (b.dataset.bk === 'del' && (await ask('ลบไฟล์สำรองนี้?', `<b>${esc(log.path)}</b><br><span class="muted">ลบแล้วกู้คืนไม่ได้</span>`, { icon: 'warning', confirmButtonColor: '#c0392b', confirmButtonText: 'ลบ' }))) {
      try {
        const { error } = await S.sb.storage.from(BACKUP_BUCKET).remove([log.path]);
        if (error) throw error;
        await must(S.sb.from('backup_logs').delete().eq('id', log.id));
        ok('ลบไฟล์สำรองแล้ว'); route();
      } catch (er) { fail(er); }
    }
  });
}

function backupTree(logs) {
  if (!logs.length) return '<div class="empty">ยังไม่มีไฟล์สำรอง — กด "สำรองข้อมูลตอนนี้"</div>';
  const tree = {};
  logs.forEach((l) => {
    const [y, m, d] = l.path.split('/');
    ((tree[y] ||= {})[m] ||= {})[d] ||= [];
    tree[y][m][d].push(l);
  });
  const desc = (o) => Object.keys(o).sort().reverse();
  const count = (o) => (Array.isArray(o) ? o.length : Object.values(o).reduce((t, v) => t + count(v), 0));
  return desc(tree).map((y, yi) => `
    <details class="tree" ${yi === 0 ? 'open' : ''}><summary>📁 ปี พ.ศ. ${esc(y)} <span class="muted">(${count(tree[y])} ไฟล์)</span></summary>
    ${desc(tree[y]).map((m, mi) => `
      <details class="tree" ${yi === 0 && mi === 0 ? 'open' : ''}><summary>📁 ${esc(m)} - ${TH_MONTHS[Number(m) - 1] || ''} <span class="muted">(${count(tree[y][m])} ไฟล์)</span></summary>
      ${desc(tree[y][m]).map((d, di) => `
        <details class="tree" ${yi === 0 && mi === 0 && di === 0 ? 'open' : ''}><summary>📁 ${esc(d)} ${TH_MONTHS_S[Number(m) - 1] || ''} ${esc(y)} <span class="muted">(${tree[y][m][d].length} ไฟล์)</span></summary>
          <div class="table-wrap"><table><tbody>${tree[y][m][d].map((l) => `
            <tr><td style="white-space:nowrap">🗎 ${fmtTime(l.created_at)} น.</td>
              <td>${l.backup_type === 'auto' ? '<span class="badge b-white">อัตโนมัติ 00:00</span>' : '<span class="badge b-admin">กดสำรอง</span>'}</td>
              <td class="code" style="word-break:break-all">${esc(l.path.split('/').pop())}</td>
              <td style="white-space:nowrap">${fmtBytes(l.size_bytes)}</td>
              <td style="white-space:nowrap">${num(Object.values(l.row_counts || {}).reduce((a, b) => a + b, 0))} แถว</td>
              <td>${esc(l.created_by_name || '')}</td>
              <td class="actions"><button class="btn btn-sm" data-bk="dl" data-id="${l.id}">⬇️ ดาวน์โหลด</button><button class="btn btn-sm btn-danger" data-bk="del" data-id="${l.id}">ลบ</button></td></tr>`).join('')}
          </tbody></table></div></details>`).join('')}
      </details>`).join('')}
    </details>`).join('');
}

// =====================================================================
//  ADMIN — การเชื่อมต่อ Supabase
// =====================================================================
async function viewConnection() {
  const c = S.conn;
  view().innerHTML = `
  <div class="grid-2">
    <div class="card"><div class="card-head"><h3>การเชื่อมต่อที่ใช้อยู่</h3>
      <span class="badge ${c.source === 'manual' ? 'b-admin' : 'b-white'}">${c.source === 'manual' ? 'ตั้งค่าเอง (Manual)' : 'จาก Vercel'}</span></div>
      <table><tbody>
        <tr><th style="position:static">แหล่งที่มา</th><td>${esc(connSourceLabel(c))}</td></tr>
        <tr><th style="position:static">Project URL</th><td style="word-break:break-all">${esc(c.url)}</td></tr>
        <tr><th style="position:static">anon key</th><td class="code">${esc(maskKey(c.key))}</td></tr>
      </tbody></table>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" id="cn-change">⚙️ เปลี่ยนการเชื่อมต่อ</button>
        <button class="btn" id="cn-check">🔌 ตรวจสอบระบบ</button>
      </div></div>
    <div class="card"><div class="card-head"><h3>ผลการตรวจสอบ</h3></div><div id="cn-checks"><div class="empty">กด "ตรวจสอบระบบ"</div></div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>วิธีตั้งค่า</h3></div>
    <ol style="margin:0;padding-left:22px;line-height:1.6">
      <li><b>แบบ Manual (หน้านี้)</b> — กด "เปลี่ยนการเชื่อมต่อ" กรอก Project URL และ anon public key จาก Supabase → Project Settings → API ค่าจะบันทึกในเบราว์เซอร์เครื่องนี้และใช้แทนค่าของ Vercel</li>
      <li><b>แบบ Vercel (ทุกเครื่อง)</b> — ตั้ง Environment Variables <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code> แล้ว Redeploy</li>
      <li><b>สำรองข้อมูลอัตโนมัติ</b> — ต้องตั้ง <code>SUPABASE_SERVICE_ROLE_KEY</code> และ <code>CRON_SECRET</code> ใน Vercel เพิ่ม (ใช้เฉพาะฝั่งเซิร์ฟเวอร์ ห้ามนำมากรอกในหน้านี้)</li>
    </ol></div>`;
  $('#cn-change').addEventListener('click', connectionDialog);
  $('#cn-check').addEventListener('click', async () => {
    const box = $('#cn-checks');
    box.innerHTML = '<div class="empty">กำลังตรวจสอบ...</div>';
    const t = await testConnection(c.url, c.key);
    const st = await S.sb.storage.from(BACKUP_BUCKET).list('', { limit: 1 }).then((r) => !r.error).catch(() => false);
    const api = await fetch('/api/backup?status=1').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const row = (okv, label, hint) => `<div class="check-row"><span class="badge ${okv ? 'b-printed' : 'b-cancelled'}">${okv ? '✔' : '✕'}</span><div><b>${label}</b>${hint ? `<div class="muted" style="font-size:18px">${hint}</div>` : ''}</div></div>`;
    box.innerHTML = row(t.auth, 'เชื่อมต่อ Supabase Auth', t.auth ? '' : t.message)
      + row(t.db, 'ตารางฐานข้อมูลของระบบ', t.db ? '' : 'รันไฟล์ SQL ในโฟลเดอร์ supabase/')
      + row(st, 'Storage bucket "backups"', st ? '' : 'รัน 01_schema.sql อีกครั้งเพื่อสร้าง bucket')
      + row(api?.configured, 'ฟังก์ชันสำรองข้อมูลอัตโนมัติ (Vercel)', api?.configured ? `เวลา 00:00 น. ทุกวัน${api.cron_secret ? '' : ' · แนะนำให้ตั้ง CRON_SECRET'}` : 'ตั้ง SUPABASE_SERVICE_ROLE_KEY ใน Vercel');
  });
}

// =====================================================================
//  ตั้งค่าตำแหน่งบนซอง — per-user layout editor (white / brown separately)
//  • drag blocks on the preview or type exact millimetres
//  • every save = new version (date/time + user)  → history
//  • load another user's layout and save it as your own in one click
// =====================================================================
const LAY_BLOCKS = { sender: 'ผู้ส่ง / เลขที่หนังสือ', postage: 'ช่องค่าฝากส่ง', recipient: 'ผู้รับ' };
const PX_PER_MM = 3.7795;
const r05 = (n) => Math.round(n * 2) / 2;
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmtDT = (d) => `${fmtDate(d)} ${fmtTime(d)} น.`;

async function viewLayout() {
  await loadMyLayouts();
  S.lay = S.lay || { type: 'white', draft: {}, dirty: {}, source: {} };
  const Y = S.lay;
  for (const t of ['white', 'brown']) if (!Y.draft[t] || !Y.dirty[t]) { Y.draft[t] = clone(myLayout(t)); Y.dirty[t] = false; Y.source[t] = null; }

  view().innerHTML = `
  <div class="tabs" id="ly-tabs">${Object.values(ENVELOPES).map((e) => `<button data-t="${e.key}">${e.label} ${e.size}</button>`).join('')}</div>
  <div class="lay-status" id="ly-status"></div>
  <div class="lay-cols">
    <div class="lay-left">
      <div class="card">
        <div class="card-head"><h3>ตัวอย่างซอง — ลากกล่องเพื่อย้าย</h3></div>
        <div class="lay-stage" id="ly-stage"></div>
        <p class="muted" style="margin:8px 0 10px;font-size:18px">ลากกล่องเส้นประ (ผู้ส่ง · ช่องค่าฝากส่ง · ผู้รับ) หรือพิมพ์ค่าเป็นมิลลิเมตรด้านขวา วัดจากมุมซ้ายบนของซอง · การตั้งค่านี้เป็นของคุณคนเดียว ไม่กระทบผู้ใช้อื่น</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-gold" id="ly-save">💾 บันทึกการตั้งค่า</button>
          <button class="btn" id="ly-test">🖨️ พิมพ์ทดสอบ</button>
          <button class="btn" id="ly-revert">↶ ยกเลิกการแก้ไข</button>
          <button class="btn" id="ly-reset">↺ ค่าเริ่มต้น</button></div>
      </div>
    </div>
    <div>
      <div class="card"><div class="card-head"><h3>ปรับค่าละเอียด (มม. / ขนาดอักษร pt)</h3></div><div id="ly-form"></div></div>
      <div class="card"><div class="card-head"><h3>โหลดการตั้งค่าจากผู้ใช้อื่น</h3></div><div id="ly-others"><div class="empty">กำลังโหลด...</div></div></div>
      <div class="card"><div class="card-head"><h3>ประวัติการตั้งค่าของฉัน</h3></div><div id="ly-history"><div class="empty">กำลังโหลด...</div></div></div>
    </div>
  </div>`;

  const T = () => Y.type;
  const L = () => Y.draft[T()];
  const size = () => envSize(T(), L());

  // ---------- status bar ----------
  const paintStatus = () => {
    const cur = S.layouts[T()];
    const src = cur?.source_user_name ? ` · โหลดจาก <b>${esc(cur.source_user_name)}</b>` : '';
    $('#ly-status').innerHTML = `<span>${ENVELOPES[T()].label} — กำลังใช้: ${cur ? `<b>การตั้งค่าของคุณ</b> บันทึกเมื่อ ${fmtDT(cur.created_at)}${src}${cur.note ? ` · "${esc(cur.note)}"` : ''}` : '<b>ค่าเริ่มต้นของระบบ</b> (ยังไม่เคยบันทึก)'}</span>
      ${Y.dirty[T()] ? '<span class="lay-dirty">● มีการแก้ไขที่ยังไม่บันทึก</span>' : ''}${Y.source[T()] ? `<span class="muted">(แก้ไขจากการตั้งค่าของ ${esc(Y.source[T()].user_name)})</span>` : ''}`;
    $$('#ly-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === T()));
  };

  // ---------- preview with drag ----------
  let k = 1;
  const paintPreview = () => {
    const stage = $('#ly-stage'); if (!stage) return;
    const { w, h } = size();
    const avail = Math.max(300, stage.clientWidth - 28);
    k = Math.min(1.25, avail / (w * PX_PER_MM), Math.max(260, window.innerHeight - 330) / (h * PX_PER_MM));
    stage.innerHTML = `<div class="lay-frame" style="width:${w * PX_PER_MM * k}px;height:${h * PX_PER_MM * k}px">
      <div style="transform:scale(${k});transform-origin:top left">${renderEnvelope(SAMPLE_LETTER, S.settings, T(), L()).replace('class="env ', 'class="env on-screen ')}</div></div>`;
    $$('[data-block]', stage).forEach((el) => { el.dataset.label = LAY_BLOCKS[el.dataset.block]; });
  };
  let drag = null;
  $('#ly-stage').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-block]'); if (!el) return;
    e.preventDefault();
    const b = el.dataset.block;
    drag = { el, b, px: e.clientX, py: e.clientY, x: L()[b].x, y: L()[b].y };
    el.classList.add('dragging'); el.setPointerCapture(e.pointerId);
  });
  $('#ly-stage').addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { w, h } = size();
    const nx = Math.min(w - 5, Math.max(0, r05(drag.x + (e.clientX - drag.px) / (k * PX_PER_MM))));
    const ny = Math.min(h - 5, Math.max(0, r05(drag.y + (e.clientY - drag.py) / (k * PX_PER_MM))));
    L()[drag.b].x = nx; L()[drag.b].y = ny;
    drag.el.style.left = `${nx}mm`; drag.el.style.top = `${ny}mm`;
    const ix = $(`#ly-${drag.b}-x`), iy = $(`#ly-${drag.b}-y`); if (ix) ix.value = nx; if (iy) iy.value = ny;
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = L()[drag.b].x !== drag.x || L()[drag.b].y !== drag.y;
    drag.el.classList.remove('dragging'); drag = null;
    if (moved) { Y.dirty[T()] = true; paintStatus(); }
  };
  $('#ly-stage').addEventListener('pointerup', endDrag);
  $('#ly-stage').addEventListener('pointercancel', endDrag);

  // ---------- numeric form ----------
  const field = (g, key, label, step = 0.5) => `<label>${label}<input type="number" step="${step}" id="ly-${g}-${key}" data-g="${g}" data-k="${key}" value="${L()[g][key]}"></label>`;
  const paintForm = () => {
    $('#ly-form').innerHTML = `
      ${T() === 'brown' ? `<div class="lay-group"><b>การวางซองในเครื่องพิมพ์</b>
        <div class="seg">${[['landscape', 'แนวนอน', '10" × 8.2"'], ['portrait', 'แนวตั้ง', '8.2" × 10"']].map(([v, l, d]) => `<label><input type="radio" name="ly-orient" value="${v}" ${L().orientation === v ? 'checked' : ''}><span>${l}<small>${d}</small></span></label>`).join('')}</div></div>` : ''}
      <div class="lay-group"><b>⇲ เลื่อนทั้งหมด (ปรับให้ตรงเครื่องพิมพ์)</b><div class="lay-grid">${field('offset', 'x', 'แนวนอน X')}${field('offset', 'y', 'แนวตั้ง Y')}</div></div>
      <div class="lay-group"><b>ผู้ส่ง / เลขที่หนังสือ (มุมซ้ายบน)</b><div class="lay-grid">${field('sender', 'x', 'X')}${field('sender', 'y', 'Y')}${field('sender', 'size', 'ขนาดอักษร')}${field('emblem', 'h', 'ความสูงตรา')}</div></div>
      <div class="lay-group"><b>ช่องค่าฝากส่ง <label style="display:inline-flex;gap:4px;align-items:center;margin-left:auto;font-weight:400;color:var(--text)"><input type="checkbox" id="ly-postage-show" ${L().postage.show !== false ? 'checked' : ''}> แสดง</label></b>
        <div class="lay-grid">${field('postage', 'x', 'X')}${field('postage', 'y', 'Y')}${field('postage', 'w', 'กว้าง')}${field('postage', 'size', 'ขนาดอักษร')}</div></div>
      <div class="lay-group"><b>ผู้รับ (เรียน / ที่อยู่ / รหัสไปรษณีย์)</b><div class="lay-grid">${field('recipient', 'x', 'X')}${field('recipient', 'y', 'Y')}${field('recipient', 'w', 'กว้าง')}${field('recipient', 'size', 'ขนาดอักษร')}</div></div>
      <label>หมายเหตุเมื่อบันทึก (เช่น เครื่องพิมพ์ที่ใช้)<input id="ly-note" placeholder="เช่น HP LaserJet ห้องสารบรรณ" value="${esc(Y.note || '')}"></label>`;
  };
  $('#ly-form').addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'ly-note') { Y.note = t.value; return; }
    if (t.dataset.g) {
      const v = Number(t.value);
      if (Number.isFinite(v)) { L()[t.dataset.g][t.dataset.k] = v; Y.dirty[T()] = true; paintPreview(); paintStatus(); }
    }
    if (t.id === 'ly-postage-show') { L().postage.show = t.checked; Y.dirty[T()] = true; paintPreview(); paintStatus(); }
  });
  $('#ly-form').addEventListener('change', async (e) => {
    if (e.target.name !== 'ly-orient' || e.target.value === L().orientation) return;
    const go = await ask('เปลี่ยนการวางซองน้ำตาล?', 'ตำแหน่งข้อความจะถูกตั้งเป็นค่าเริ่มต้นของแนวใหม่ (ยังไม่บันทึกจนกว่าจะกด "บันทึกการตั้งค่า")');
    if (go) { Y.draft.brown = defaultLayout('brown', e.target.value); Y.dirty.brown = true; }
    paintAll();
  });

  // ---------- save / load ----------
  const save = async (layout, note, source = null) => {
    const row = await must(S.sb.from('envelope_layouts').insert({
      user_id: S.profile.id, user_name: S.profile.full_name || S.profile.email, envelope: T(), layout,
      note: note || null, source_layout_id: source?.id || null, source_user_name: source?.user_name || null,
    }).select().single());
    S.layouts[T()] = row; Y.draft[T()] = clone(resolveLayout(T(), S.settings, row.layout)); Y.dirty[T()] = false; Y.source[T()] = null; Y.note = '';
    return row;
  };
  $('#ly-save').addEventListener('click', async () => {
    try {
      const row = await save(clone(L()), (Y.note || '').trim(), Y.source[T()]);
      Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าแล้ว', html: `${ENVELOPES[T()].label} · ${fmtDT(row.created_at)}<br><span class="muted">ใช้กับการพิมพ์ซองของคุณตั้งแต่ตอนนี้</span>`, timer: 2200, showConfirmButton: false });
      paintAll();
    } catch (er) { fail(er); }
  });
  $('#ly-revert').addEventListener('click', () => { Y.draft[T()] = clone(myLayout(T())); Y.dirty[T()] = false; Y.source[T()] = null; paintAll(); });
  $('#ly-reset').addEventListener('click', async () => {
    if (!(await ask('คืนค่าเริ่มต้น?', 'ตำแหน่งทั้งหมดจะกลับเป็นค่าเริ่มต้นของระบบ (ยังไม่บันทึกจนกว่าจะกด "บันทึกการตั้งค่า")'))) return;
    Y.draft[T()] = defaultLayout(T(), L().orientation); Y.dirty[T()] = true; paintAll();
  });
  $('#ly-test').addEventListener('click', () => printLetters([SAMPLE_LETTER], T(), S.settings, { markPrinted: false, layout: L() }));

  const previewOf = (layout, title) => Swal.fire({ title, width: 'min(900px, 96vw)', html: previewHtml([SAMPLE_LETTER], T(), S.settings, 1, 820, resolveLayout(T(), S.settings, layout)), confirmButtonText: 'ปิด' });

  const loadLists = async () => {
    const [others, mine] = await Promise.all([
      must(S.sb.from('envelope_layouts').select('*').eq('envelope', T()).neq('user_id', S.profile.id).order('created_at', { ascending: false }).limit(300)),
      must(S.sb.from('envelope_layouts').select('*').eq('envelope', T()).eq('user_id', S.profile.id).order('created_at', { ascending: false }).limit(50)),
    ]);
    // latest version of each other user
    const latest = []; const seen = new Map();
    for (const r of others) { if (!seen.has(r.user_id)) { seen.set(r.user_id, 1); latest.push(r); } else seen.set(r.user_id, seen.get(r.user_id) + 1); }
    $('#ly-others').innerHTML = latest.length ? `<div class="table-wrap"><table><thead><tr><th>ผู้ใช้</th><th>บันทึกล่าสุด</th><th>หมายเหตุ</th><th></th></tr></thead><tbody>
      ${latest.map((r) => `<tr data-id="${r.id}"><td><b>${esc(r.user_name || '')}</b>${seen.get(r.user_id) > 1 ? `<div class="muted" style="font-size:17px">${seen.get(r.user_id)} เวอร์ชัน</div>` : ''}</td>
        <td style="white-space:nowrap">${fmtDT(r.created_at)}</td><td>${esc(r.note || '')}${r.layout.orientation === 'portrait' ? ' <span class="badge b-brown">แนวตั้ง</span>' : ''}</td>
        <td class="actions"><button class="btn btn-sm" data-act="view">ดู</button><button class="btn btn-sm btn-primary" data-act="use">ใช้การตั้งค่านี้</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">ยังไม่มีผู้ใช้อื่นบันทึกการตั้งค่า${ENVELOPES[T()].label}</div>`;
    $('#ly-others')._rows = latest;
    $('#ly-history').innerHTML = mine.length ? `<div class="table-wrap" style="max-height:360px"><table><thead><tr><th>บันทึกเมื่อ</th><th>หมายเหตุ / ที่มา</th><th></th></tr></thead><tbody>
      ${mine.map((r, i) => `<tr data-id="${r.id}"><td style="white-space:nowrap">${fmtDT(r.created_at)} ${i === 0 ? '<span class="badge b-printed">ใช้อยู่</span>' : ''}</td>
        <td>${esc(r.note || '')}${r.source_user_name ? `<div class="muted" style="font-size:17px">โหลดจาก ${esc(r.source_user_name)}</div>` : ''}</td>
        <td class="actions"><button class="btn btn-sm" data-act="view">ดู</button>${i ? '<button class="btn btn-sm" data-act="restore">ใช้เวอร์ชันนี้</button>' : ''}<button class="btn btn-sm btn-danger" data-act="del">ลบ</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">ยังไม่เคยบันทึก — กำลังใช้ค่าเริ่มต้นของระบบ</div>';
    $('#ly-history')._rows = mine;
  };

  $('#ly-others').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    const r = $('#ly-others')._rows.find((x) => x.id === Number(e.target.closest('tr').dataset.id));
    if (act === 'view') return previewOf(r.layout, `การตั้งค่าของ ${r.user_name} · ${fmtDT(r.created_at)}`);
    if (!(await ask(`ใช้การตั้งค่าของ ${esc(r.user_name)}?`, `${ENVELOPES[T()].label} บันทึกเมื่อ ${fmtDT(r.created_at)}${r.note ? `<br>"${esc(r.note)}"` : ''}<br><span class="muted">ระบบจะบันทึกเป็นการตั้งค่าของคุณทันที (ของเดิมยังอยู่ในประวัติ)</span>`, { confirmButtonText: 'โหลดและบันทึกเป็นของฉัน' }))) return;
    try {
      await save(clone(resolveLayout(T(), S.settings, r.layout)), `โหลดจาก ${r.user_name}${r.note ? ` (${r.note})` : ''}`, r);
      ok(`โหลดการตั้งค่าของ ${r.user_name} แล้ว`); paintAll();
    } catch (er) { fail(er); }
  });
  $('#ly-history').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    const r = $('#ly-history')._rows.find((x) => x.id === Number(e.target.closest('tr').dataset.id));
    if (act === 'view') return previewOf(r.layout, `เวอร์ชัน ${fmtDT(r.created_at)}`);
    try {
      if (act === 'restore') { await save(clone(resolveLayout(T(), S.settings, r.layout)), `กลับไปใช้เวอร์ชัน ${fmtDT(r.created_at)}`); ok('กลับไปใช้เวอร์ชันนี้แล้ว'); }
      if (act === 'del') {
        if (!(await ask('ลบเวอร์ชันนี้?', fmtDT(r.created_at), { icon: 'warning', confirmButtonColor: '#c0392b', confirmButtonText: 'ลบ' }))) return;
        await must(S.sb.from('envelope_layouts').delete().eq('id', r.id));
        await loadMyLayouts(); if (!Y.dirty[T()]) Y.draft[T()] = clone(myLayout(T()));
        ok('ลบแล้ว');
      }
      paintAll();
    } catch (er) { fail(er); }
  });

  $('#ly-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; Y.type = b.dataset.t; paintAll(); });
  const paintAll = () => { paintStatus(); paintForm(); paintPreview(); loadLists().catch((er) => { $('#ly-others').innerHTML = `<div class="empty">${esc(thaiError(er))}</div>`; }); };
  paintAll();
}

boot().catch((e) => { console.error(e); show('#login-screen'); fail(e); });
