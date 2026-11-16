// =====================================================================
//  ระบบพิมพ์ซองจดหมาย — Envelope Printing System
//  Vanilla JS + PHP/MySQL (XAMPP) + SweetAlert2 (no build step)
// =====================================================================
import { api, IS_SUPA, makeBackend, supaConn, supaClient, supaTest, saveManualConn, clearManualConn, hasManualConn, CFG } from './backend.js';
import { CHEQUE, CHQ_ITEMS, chqItemDef, bahtText, money, renderCheque, resolveChequeLayout, defaultChequeLayout, chequePreset, CHEQUE_PRESETS, BANK_BG, chequePage, chequePageCss, SAMPLE_CHEQUE, CHQ_FONTS, chqFont, CHQ_SOURCES, chqSource, chqItemLabel, splitDateItem, FIELD_TYPES } from './cheque.js';
import { ENVELOPES, ITEM_DEFS, itemDef, esc, renderEnvelope, fitEnvelopeText, pageCss, envSize, areaLine, SAMPLE_LETTER, resolveLayout, defaultLayout } from './envelope.js';

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

/** Database-specific operations (MySQL via PHP, or Supabase + Vercel functions). */
const BK = makeBackend(() => S.sb, () => S.profile);
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
  if (/Failed to fetch|NetworkError/i.test(m)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่าเปิด Apache ใน XAMPP แล้ว และเครือข่ายใช้งานได้';
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
  cheque: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h7M6 14h4M15 14h4"/>',
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
  // ---- ระบบพิมพ์ซอง ----
  issue: { sys: 'envelope', group: 'staff', title: 'ออกเลขหนังสือ', render: viewIssue },
  register: { sys: 'envelope', group: 'staff', title: 'ทะเบียนหนังสือส่ง / พิมพ์ซอง', nav: 'ทะเบียน / พิมพ์ซอง', render: viewRegister },
  recipients: { sys: 'envelope', group: 'staff', title: 'ผู้รับ / หน่วยงาน', render: viewRecipients },
  reports: { sys: 'envelope', group: 'staff', title: 'รายงานการพิมพ์ซอง', render: viewReports },
  layout: { sys: 'envelope', group: 'staff', title: 'ตั้งค่าตำแหน่งบนซอง', render: viewLayout },
  dashboard: { sys: 'envelope', group: 'admin', title: 'ภาพรวมระบบ', render: viewDashboard },
  books: { sys: 'envelope', group: 'admin', title: 'เล่มทะเบียนเลขหนังสือ', render: viewBooks },
  master: { sys: 'envelope', group: 'admin', title: 'ข้อมูลหลัก', render: viewMaster },
  settings: { sys: 'envelope', group: 'admin', title: 'ตั้งค่าหน่วยงานและซอง', render: viewSettings },
  // ---- ระบบพิมพ์เช็ค ----
  'chq-register': { sys: 'cheque', group: 'staff', title: 'ออกเช็ค / ทะเบียนเช็ค / พิมพ์เช็ค', nav: 'ออกเช็ค / พิมพ์เช็ค', icon: 'cheque', render: () => viewChequeRegister() },
  'chq-forms': { sys: 'cheque', group: 'staff', title: 'ตั้งค่าแบบฟอร์มเช็ค', icon: 'layout', render: () => viewChequeForms() },
  'chq-report': { sys: 'cheque', group: 'staff', title: 'รายงานเช็ค', icon: 'reports', render: () => viewChequeReport() },
  'chq-admin': { sys: 'cheque', group: 'admin', title: 'บัญชีเงินและธนาคาร', icon: 'books', render: () => viewChequeAdmin() },
  // ---- ใช้ร่วมกันทั้ง 2 ระบบ ----
  users: { sys: 'both', group: 'admin', title: 'ผู้ใช้งานและสิทธิ์', nav: 'ผู้ใช้งาน / สิทธิ์', render: viewUsers },
  backup: { sys: 'both', group: 'admin', title: 'สำรองข้อมูล', render: viewBackup },
  connection: { sys: 'both', group: 'admin', title: 'การเชื่อมต่อฐานข้อมูล', render: viewConnection },
};
const SYSTEMS = {
  envelope: { name: 'ระบบพิมพ์ซองจดหมาย', en: 'Envelope Printing System', desc: 'ออกเลขหนังสือส่ง · พิมพ์ซองขาว / ซองน้ำตาล · รายงาน', home: () => (isAdmin() ? 'dashboard' : 'issue') },
  cheque: { name: 'ระบบพิมพ์เช็ค', en: 'Cheque Printing System', desc: 'ออกเช็ค · พิมพ์เช็คกรุงไทย / กสิกรไทย (AC / Non-AC) · รายงาน', home: () => 'chq-register' },
};
const SYS_ICON = {
  envelope: `<svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke-linejoin="round"><rect x="6" y="14" width="52" height="36" rx="4" fill="#fff" stroke="currentColor" stroke-width="3"/><path d="M8 17l24 18 24-18" stroke="currentColor" stroke-width="3"/><rect x="40" y="20" width="12" height="9" rx="1" fill="#c9a24a"/></svg>`,
  cheque: `<svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke-linecap="round"><rect x="4" y="16" width="56" height="32" rx="3" fill="#fff" stroke="currentColor" stroke-width="3"/><path d="M11 25h22M11 32h30M11 39h14" stroke="currentColor" stroke-width="2.5"/><rect x="40" y="35" width="15" height="7" rx="1" fill="#c9a24a"/><path d="M45 21l8 0" stroke="currentColor" stroke-width="2.5"/><path d="M8 46L20 18M13 46L25 18" stroke="#c9a24a" stroke-width="2"/></svg>`,
};
const allowedSystems = () => (isAdmin() ? ['envelope', 'cheque'] : [S.profile.perm_envelope !== false && 'envelope', S.profile.perm_cheque && 'cheque'].filter(Boolean));
const SYS_KEY = 'envelope.app.system';

function renderNav() {
  const link = (k) => `<a class="nav-link" href="#${k}" data-route="${k}">${icon(ROUTES[k].icon || k)}<span>${ROUTES[k].nav || ROUTES[k].title}</span></a>`;
  const inSys = (k) => ROUTES[k].sys === S.system || ROUTES[k].sys === 'both';
  const staff = Object.keys(ROUTES).filter((k) => inSys(k) && ROUTES[k].group === 'staff');
  const admin = Object.keys(ROUTES).filter((k) => inSys(k) && ROUTES[k].group === 'admin');
  $('#nav').innerHTML = `<div class="nav-group">งานเจ้าหน้าที่</div>${staff.map(link).join('')}`
    + (isAdmin() ? `<div class="nav-group">ผู้ดูแลระบบ</div>${admin.map(link).join('')}` : '');
  $('#brand-title').textContent = SYSTEMS[S.system].name;
  $('#brand-icon').innerHTML = S.system === 'cheque' ? `<span class="brand-svg">${SYS_ICON.cheque}</span>` : '<img src="assets/logo.png" alt="">';
  $$('[data-action="switch-system"]').forEach((b) => b.classList.toggle('hidden', allowedSystems().length < 2));
  document.title = `${SYSTEMS[S.system].name} | ${SYSTEMS[S.system].en}`;
}

async function route() {
  let key = location.hash.replace('#', '') || SYSTEMS[S.system].home();
  const r = ROUTES[key];
  if (!r || (r.group === 'admin' && !isAdmin()) || (r.sys !== 'both' && r.sys !== S.system)) key = SYSTEMS[S.system].home();
  $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.route === key));
  $('#page-title').textContent = ROUTES[key].title;
  $('#topbar-right').innerHTML = '';
  $('#sidebar').classList.remove('open');
  const old = view(); old.replaceWith(old.cloneNode(false)); // drop listeners from the previous page
  view().innerHTML = '<div class="empty"><div class="spinner" style="margin:auto"></div></div>';
  try { await ROUTES[key].render(); } catch (e) { console.error(e); view().innerHTML = `<div class="card empty">โหลดข้อมูลไม่สำเร็จ: ${esc(thaiError(e))}</div>`; }
}

/** Full-screen system chooser (shown after login when the user has both systems, and by "สลับระบบ"). */
async function chooseSystem(cancellable = false) {
  const list = allowedSystems();
  let chosen = null;
  await Swal.fire({
    grow: 'fullscreen', showConfirmButton: false, showCloseButton: cancellable, allowOutsideClick: false, allowEscapeKey: cancellable,
    customClass: { popup: 'sys-popup' },
    html: `<div class="sys-choose">
      <img src="assets/logo.png" alt="" class="sys-logo">
      <h2>สวัสดี ${esc(S.profile.full_name || S.profile.email)}</h2>
      <p>กรุณาเลือกระบบที่ต้องการใช้งาน</p>
      <div class="sys-cards">${list.map((k) => `
        <button type="button" class="sys-card${S.system === k ? ' current' : ''}" data-sys="${k}">
          <span class="sys-icon">${SYS_ICON[k]}</span>
          <b>${SYSTEMS[k].name}</b><small>${SYSTEMS[k].en}</small>
          <span class="sys-desc">${SYSTEMS[k].desc}</span>
          <span class="sys-go">${S.system === k ? 'กำลังใช้งานอยู่' : 'เข้าสู่ระบบนี้ →'}</span>
        </button>`).join('')}</div>
      <p class="sys-hint">เปลี่ยนระบบได้ตลอดเวลาด้วยปุ่ม <b>⇄ สลับระบบ</b></p></div>`,
    didOpen: (p) => { p.querySelectorAll('[data-sys]').forEach((b) => b.addEventListener('click', () => { chosen = b.dataset.sys; Swal.close(); })); },
  });
  return chosen;
}

async function enterSystem(sys) {
  S.system = sys;
  try { sessionStorage.setItem(SYS_KEY, sys); } catch { /* ignore */ }
  renderNav();
  if (location.hash.replace('#', '') !== SYSTEMS[sys].home()) history.replaceState(null, '', `#${SYSTEMS[sys].home()}`);
  await route();
}

async function switchSystem() {
  const sys = await chooseSystem(true);
  if (sys && sys !== S.system) { await enterSystem(sys); ok(`เข้าสู่${SYSTEMS[sys].name}`); }
}

// ---------------------------------------------------------------------
//  Boot & authentication
// ---------------------------------------------------------------------
function show(id) {
  ['#boot', '#setup-screen', '#login-screen', '#pending-screen', '#app'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
}

async function boot() {
  $('#link-conn').addEventListener('click', (e) => { e.preventDefault(); if (IS_SUPA) showSupaSetup({ reason: 'แก้ไขการเชื่อมต่อ Supabase (บันทึกไว้ในเบราว์เซอร์นี้)' }, true); else showSetup(S.dbStatus, true); });
  if (IS_SUPA) return bootSupabase();
  S.dbStatus = await dbStatus();
  const st = S.dbStatus;
  // ยังไม่ได้ตั้งค่า / เชื่อมต่อไม่ได้ / ยังไม่ได้ติดตั้งตาราง → หน้าตั้งค่าการเชื่อมต่อก่อนหน้าเข้าสู่ระบบ
  if (!st || !st.configured || !st.connected || !st.installed) return showSetup(st);
  $('#link-conn-wrap').classList.toggle('hidden', !st.can_setup);
  S.sb = BK.createClient();
  S.sb.onUnauthorized = () => { if (S.profile) sessionExpired(); };
  const { data: { session } } = await S.sb.auth.getSession();
  if (!session) return show('#login-screen');
  await enterApp(session);
}

// ---------------------------------------------------------------------
//  โหมด Supabase (เปิดเว็บจาก Vercel): ค่าการเชื่อมต่อมาจาก Environment Variables ของ Vercel
//  ถ้ายังไม่ได้ตั้งค่า / เชื่อมต่อไม่ได้ → หน้าตั้งค่าการเชื่อมต่อก่อนหน้าเข้าสู่ระบบ
// ---------------------------------------------------------------------
async function bootSupabase() {
  const conn = supaConn();
  if (!conn) return showSupaSetup({ reason: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase — กรุณาตั้งค่าก่อนเข้าใช้งานระบบ' });
  const t = await supaTest(conn.url, conn.key);
  if (!t.ok || !t.installed) return showSupaSetup({ reason: `⚠️ ${t.message}`, conn });
  try { S.sb = await supaClient(conn); } catch { return showSupaSetup({ reason: '⚠️ โหลดไลบรารี Supabase ไม่ได้ — ตรวจสอบอินเทอร์เน็ต', conn }); }
  S.conn = conn;
  $('#link-conn-wrap').classList.add('hidden');
  const { data: { session } } = await S.sb.auth.getSession();
  if (!session) return show('#login-screen');
  await enterApp(session);
}

function showSupaSetup(st = {}, fromLogin = false) {
  show('#setup-screen');
  $('#setup-screen h2').textContent = 'ตั้งค่าการเชื่อมต่อ Supabase';
  $('#setup-reason').innerHTML = esc(st.reason || '');
  const form = $('#setup-form');
  if (!form.dataset.supa) {
    form.dataset.supa = '1';
    const cur = st.conn || supaConn() || {};
    form.innerHTML = `<div class="setup-grid">
        <label class="full">Project URL<input name="url" placeholder="https://xxxxxxxx.supabase.co" value="${esc(cur.url || '')}" required></label>
        <label class="full">anon / publishable key<input name="key" placeholder="eyJhbGciOi... หรือ sb_publishable_..." value="${esc(cur.key || '')}" required autocomplete="off"></label>
      </div>
      <div id="setup-result" class="setup-result"></div>
      <div class="setup-actions">
        <button type="button" class="btn" id="setup-test">🔌 ทดสอบการเชื่อมต่อ</button>
        <button type="submit" class="btn btn-primary">💾 บันทึกและเชื่อมต่อ</button>
      </div>`;
    $('.setup-hint').innerHTML = `ค่าอยู่ที่ Supabase → <b>Project Settings → API</b> (ใช้ <b>anon / publishable key</b> เท่านั้น ห้ามใช้ service_role) · ค่าที่กรอกที่นี่ใช้ได้เฉพาะเบราว์เซอร์นี้ — <b>แนะนำตั้ง SUPABASE_URL และ SUPABASE_ANON_KEY ใน Vercel → Environment Variables แล้ว Redeploy</b> ทุกเครื่องจะเชื่อมต่อได้ทันที · ก่อนใช้งานครั้งแรก รันไฟล์ในโฟลเดอร์ <b>supabase/</b> ที่ SQL Editor ตามลำดับ (ดู README)`;
    const read = () => { const f = new FormData(form); return { url: String(f.get('url') || '').trim(), key: String(f.get('key') || '').trim() }; };
    const result = (cls, html) => { $('#setup-result').className = `setup-result ${cls}`; $('#setup-result').innerHTML = html; };
    $('#setup-test').addEventListener('click', async () => {
      result('', 'กำลังทดสอบการเชื่อมต่อ...');
      const d = read(); const t = await supaTest(d.url, d.key);
      result(t.ok && t.installed ? 'ok' : 'bad', `${t.ok && t.installed ? '✔' : '✕'} ${esc(t.message)}`);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = read();
      Swal.fire({ title: 'กำลังเชื่อมต่อ Supabase...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
      const t = await supaTest(d.url, d.key);
      if (!t.ok || !t.installed) return Swal.fire({ icon: 'error', title: 'เชื่อมต่อไม่สำเร็จ', text: t.message, confirmButtonText: 'ตกลง' });
      saveManualConn(d.url, d.key);
      await Swal.fire({ icon: 'success', title: 'เชื่อมต่อ Supabase สำเร็จ', html: '<span class="muted">บันทึกไว้ในเบราว์เซอร์นี้ — เครื่องอื่นให้ตั้งค่าใน Vercel Environment Variables</span>', confirmButtonText: 'ตกลง' });
      location.replace(location.pathname);
    });
  }
  if (fromLogin && !$('#setup-back')) {
    form.querySelector('.setup-actions').insertAdjacentHTML('afterbegin', '<button type="button" class="btn btn-ghost" id="setup-back">← กลับหน้าเข้าสู่ระบบ</button>');
    $('#setup-back').addEventListener('click', () => show('#login-screen'));
  }
}

let expiredShown = false;
async function changeMyPassword() {
  const r = await Swal.fire({ title: 'เปลี่ยนรหัสผ่านของฉัน', focusConfirm: false,
    html: `<div class="swal-form"><label class="full">รหัสผ่านเดิม<input id="cp-old" type="password"></label><label>รหัสผ่านใหม่<input id="cp-new" type="password"></label><label>ยืนยันรหัสผ่านใหม่<input id="cp-new2" type="password"></label></div>`,
    showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true,
    preConfirm: () => { const o = $('#cp-old').value, n = $('#cp-new').value; if (n.length < 6) return Swal.showValidationMessage('รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร'); if (n !== $('#cp-new2').value) return Swal.showValidationMessage('รหัสผ่านใหม่ไม่ตรงกัน'); return { old: o, password: n }; } });
  if (!r.isConfirmed) return;
  try { loading('กำลังบันทึก...'); await BK.changePassword(r.value.old, r.value.password); } catch (e) { return fail(e); }
  ok('เปลี่ยนรหัสผ่านแล้ว');
}
async function logout() {
  Swal.fire({ title: 'กำลังออกจากระบบ...', allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
  const { error } = await S.sb.auth.signOut();
  if (error && error.code !== 'network') return fail(error);
  try { sessionStorage.removeItem(SYS_KEY); } catch { /* ignore */ }
  await Swal.fire({ icon: 'success', title: 'ออกจากระบบเรียบร้อย', timer: 1100, timerProgressBar: true, showConfirmButton: false, allowOutsideClick: false });
  location.replace(location.pathname);
}
async function sessionExpired() {
  if (expiredShown) return; expiredShown = true;
  await Swal.fire({ icon: 'warning', title: 'หมดเวลาการเข้าสู่ระบบ', text: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง', confirmButtonText: 'ตกลง', allowOutsideClick: false });
  location.replace(location.pathname);
}

// ---------------------------------------------------------------------
//  การเชื่อมต่อฐานข้อมูล MySQL (XAMPP) — ค่าเก็บที่เซิร์ฟเวอร์ (private/config.php)
//  ใช้ได้ทุกเครื่องที่เปิดเว็บนี้ ไม่ต้องตั้งค่าแยกทีละเครื่อง
// ---------------------------------------------------------------------
async function dbStatus() {
  const r = await api('status');
  if (r.error && !('configured' in r)) return { configured: false, connected: false, installed: false, error: r.error.message, can_setup: false, unreachable: true };
  return r;
}

function setupReason(st) {
  if (!st) return '';
  if (st.unreachable) return `⚠️ ${st.error}`;
  if (!st.configured) return 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล — กรุณาตั้งค่าก่อนเข้าใช้งานระบบ';
  if (!st.connected) return `⚠️ ${st.error || 'เชื่อมต่อฐานข้อมูลไม่ได้'}`;
  if (!st.installed) return `เชื่อมต่อฐานข้อมูลได้ แต่ยังไม่ได้ติดตั้งตาราง (${(st.missing || []).length} ตาราง) — กด "บันทึกและติดตั้ง"`;
  return 'แก้ไขการเชื่อมต่อฐานข้อมูล';
}

function showSetup(st, fromLogin = false) {
  show('#setup-screen');
  $('#setup-reason').innerHTML = esc(setupReason(st));
  const form = $('#setup-form');
  if (st?.cfg) for (const k of ['host', 'port', 'username', 'database']) form.elements[k].value = st.cfg[k];
  const locked = st && !st.can_setup && !st.unreachable;
  $$('input,button', form).forEach((el) => { el.disabled = locked; });
  if (locked) {
    $('#setup-result').className = 'setup-result bad';
    $('#setup-result').innerHTML = st.configured && !st.connected
      ? 'การเชื่อมต่อที่ตั้งไว้ใช้งานไม่ได้ — ด้วยเหตุผลด้านความปลอดภัย แก้ไขได้จาก<b>เครื่องเซิร์ฟเวอร์</b> (เปิด http://localhost/…) หรือให้ผู้ดูแลระบบเปิด MySQL ใน XAMPP ให้ทำงาน แล้วกด <a href="#" id="setup-retry">ลองใหม่</a>'
      : 'การเปลี่ยนการเชื่อมต่อทำได้เฉพาะผู้ดูแลระบบ (เมนู "การเชื่อมต่อฐานข้อมูล" หลังเข้าสู่ระบบ)';
    $('#setup-retry')?.addEventListener('click', (e) => { e.preventDefault(); location.reload(); });
  }
  if (fromLogin && !$('#setup-back')) {
    form.querySelector('.setup-actions').insertAdjacentHTML('afterbegin', '<button type="button" class="btn btn-ghost" id="setup-back">← กลับหน้าเข้าสู่ระบบ</button>');
    $('#setup-back').addEventListener('click', () => show('#login-screen'));
  }
  if (form.dataset.bound) return;
  form.dataset.bound = '1';
  const read = () => { const f = new FormData(form); return { host: f.get('host').trim(), port: Number(f.get('port')) || 3306, username: f.get('username').trim(), password: f.get('password'), database: f.get('database').trim(), seed: !!f.get('seed') }; };
  const result = (cls, html) => { $('#setup-result').className = `setup-result ${cls}`; $('#setup-result').innerHTML = html; };
  $('#setup-test').addEventListener('click', async () => {
    result('', 'กำลังทดสอบการเชื่อมต่อ...');
    const r = await api('setup_test', read());
    if (r.error) return result('bad', `✕ ${esc(r.error.message)}`);
    result(r.ok ? 'ok' : 'bad', `${r.ok ? '✔' : '✕'} ${esc(r.message)}`);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = read();
    if (!/^[A-Za-z0-9_]+$/.test(d.database)) return result('bad', 'ชื่อฐานข้อมูลใช้ได้เฉพาะ a-z, 0-9 และ _');
    const ok2 = await saveConnection(d);
    if (ok2) location.replace(location.pathname);
  });
}

/** Save + install (+ optional seed with progress). Returns true when done. */
async function saveConnection(d, opts = {}) {
  Swal.fire({ title: 'กำลังเชื่อมต่อและติดตั้งฐานข้อมูล...', html: '<div class="muted" id="sv-step">ทดสอบการเชื่อมต่อ</div>', showConfirmButton: false, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
  const t = await api('setup_test', d);
  if (t.error || !t.ok) { await Swal.fire({ icon: 'error', title: 'เชื่อมต่อไม่สำเร็จ', text: t.error?.message || t.message, confirmButtonText: 'ตกลง' }); return false; }
  $('#sv-step') && ($('#sv-step').textContent = 'สร้างฐานข้อมูลและตาราง...');
  const r = await api('setup_save', d);
  if (r.error) { await Swal.fire({ icon: 'error', title: 'ติดตั้งไม่สำเร็จ', text: r.error.message, confirmButtonText: 'ตกลง' }); return false; }
  if (d.seed && r.needs_seed && r.seed_files.length) {
    const label = (f) => ({ seed_1: 'ค่าหน่วยงาน คำนำหน้า จังหวัด', seed_2: 'รหัสไปรษณีย์', seed_3: 'ผู้รับ / หน่วยงาน', seed_4: 'ข้อมูลเช็คเดิม' })[f.slice(0, 6)] || f;
    const paint = (i) => { const el = $('#sv-step'); if (el) el.innerHTML = `<div class="seed-steps">${r.seed_files.map((f, k) => `<div class="${k < i ? 'done' : k === i ? 'run' : 'wait'}">${k < i ? '✔' : k === i ? '⏳' : '○'} ${esc(label(f))} <span class="muted">(${esc(f)})</span></div>`).join('')}</div>`; };
    Swal.update({ title: 'กำลังนำเข้าข้อมูลเริ่มต้น...' }); Swal.showLoading();
    for (let i = 0; i < r.seed_files.length; i++) {
      paint(i);
      const s = await api('setup_seed', { file: r.seed_files[i] });
      if (s.error) { await Swal.fire({ icon: 'error', title: 'นำเข้าข้อมูลไม่สำเร็จ', text: s.error.message, confirmButtonText: 'ตกลง' }); return false; }
    }
  }
  await Swal.fire({ icon: 'success', title: 'เชื่อมต่อฐานข้อมูลสำเร็จ', html: `ฐานข้อมูล <b>${esc(d.database)}</b> @ ${esc(d.host)}:${esc(d.port)}<br><span class="muted">${r.relogin || opts.relogin ? 'กรุณาเข้าสู่ระบบอีกครั้ง' : 'พร้อมใช้งาน'}${t.users ? '' : ' — ผู้ที่สมัครคนแรกจะเป็นผู้ดูแลระบบ'}</span>`, confirmButtonText: 'ตกลง' });
  return true;
}

async function enterApp(session, fromLogin = false) {
  S.session = session;
  const prof = await must(S.sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
  if (!prof || !prof.active) {
    $('#pending-email').textContent = session.user.email;
    return show('#pending-screen');
  }
  S.profile = prof;
  const list = allowedSystems();
  if (!list.length) {
    $('#pending-title').textContent = 'ยังไม่ได้รับสิทธิ์ใช้งานระบบใด';
    $('#pending-email').textContent = session.user.email;
    return show('#pending-screen');
  }
  await loadRefs();
  $('#me-name').textContent = prof.full_name || prof.email;
  $('#me-role').innerHTML = isAdmin() ? '<span class="badge b-admin">ผู้ดูแลระบบ</span>' : '<span class="badge b-staff">เจ้าหน้าที่</span>';
  $('#brand-org').textContent = S.settings.org_name || '';
  let sys = null;
  if (!fromLogin) { try { sys = sessionStorage.getItem(SYS_KEY); } catch { /* ignore */ } }
  if (!list.includes(sys)) sys = null;
  S.system = sys || list[0];
  renderNav();
  show('#app');
  if (!sys && list.length > 1) sys = await chooseSystem(false);
  await enterSystem(sys || list[0]);
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
  Swal.fire({ title: 'กำลังเข้าสู่ระบบ...', html: '<span class="muted">ตรวจสอบอีเมลและรหัสผ่าน</span>', allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
  try {
    const { data, error } = await S.sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
    if (error) throw error;
    Swal.update({ title: 'กำลังโหลดข้อมูลระบบ...', html: '<span class="muted">โปรดรอสักครู่</span>' }); Swal.showLoading();
    const prof = await must(S.sb.from('profiles').select('full_name,email,active').eq('id', data.user.id).maybeSingle());
    if (prof?.active) {
      await Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ', text: `ยินดีต้อนรับ ${prof.full_name || prof.email}`, timer: 1300, timerProgressBar: true, showConfirmButton: false, allowOutsideClick: false });
    } else Swal.close();
    e.target.reset();
    await enterApp(data.session, true);
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
    if (data.session) return enterApp(data.session, true);
    if (IS_SUPA) return Swal.fire({ icon: 'success', title: 'ส่งคำขอแล้ว', html: 'ผู้ใช้คนแรกของระบบเป็นผู้ดูแลระบบอัตโนมัติ — เข้าสู่ระบบได้เลย<br>ผู้ใช้ถัดไปรอผู้ดูแลอนุมัติ<br><span class="muted">(ถ้าโปรเจกต์ Supabase เปิด "Confirm email" ต้องยืนยันอีเมลก่อน)</span>' });
    Swal.fire({ icon: 'success', title: data.user && !S.dbStatus?.has_users ? 'สร้างบัญชีผู้ดูแลระบบแล้ว' : 'ส่งคำขอแล้ว', text: data.user && !S.dbStatus?.has_users ? 'บัญชีแรกของระบบเป็นผู้ดูแลระบบ — เข้าสู่ระบบได้เลย' : 'กรุณารอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วเข้าสู่ระบบได้ทันที' }).then(() => { if (S.dbStatus) S.dbStatus.has_users = true; });
  } catch (err) { fail(err); }
});

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-action="logout"]')) {
    if (await ask('ออกจากระบบ?', 'ต้องการออกจากระบบใช่หรือไม่', { icon: 'warning', confirmButtonText: 'ออกจากระบบ' })) await logout();
  }
  if (e.target.closest('#menu-btn')) $('#sidebar').classList.toggle('open');
  if (e.target.closest('#me-name')) changeMyPassword();
  if (e.target.closest('[data-action="switch-system"]')) switchSystem();
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
      <button class="btn" id="r-preview">👁 ตัวอย่างขนาดจริง</button>
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
// ---------------------------------------------------------------------
//  Printing — a clean, separate print document (hidden iframe):
//  exact envelope page size, zero margins, blank title → no browser
//  header/footer (URL, date, page title) is printed.
// ---------------------------------------------------------------------
const SKIP_PREVIEW_KEY = 'envelope.print.skipPreview';
const skipPreview = () => { try { return localStorage.getItem(SKIP_PREVIEW_KEY) === '1'; } catch { return false; } };
const setSkipPreview = (v) => { try { v ? localStorage.setItem(SKIP_PREVIEW_KEY, '1') : localStorage.removeItem(SKIP_PREVIEW_KEY); } catch { /* ignore */ } };

async function waitForPrintAssets(root, doc = document) {
  try { await doc.fonts.ready; } catch { /* ignore */ }
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.complete ? null : img.decode().catch(() => null))));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/** Print `bodyHtml` in its own document with the given @page CSS. */
async function printDocument(bodyHtml, pageRule, extraCss = '') {
  document.getElementById('print-frame')?.remove();
  const f = document.createElement('iframe');
  f.id = 'print-frame';
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;height:1000px;border:0;';
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>&#8203;</title>
    <base href="${new URL('.', location.href).href}"><link rel="stylesheet" href="assets/style.css">
    <style id="print-page-style">${pageRule}</style>
    <style>html,body{margin:0;padding:0;background:#fff}#print-root{display:block!important}${extraCss}</style></head>
    <body class="print-doc"><div id="print-root">${bodyHtml}</div></body></html>`;
  const loaded = new Promise((r) => { f.onload = r; });
  f.srcdoc = html;
  document.body.appendChild(f);
  await loaded;
  const d = f.contentDocument;
  await waitForPrintAssets(d.body, d);
  fitEnvelopeText(d);
  f.contentWindow.focus();
  f.contentWindow.print(); // blocks until the print dialog closes
}

async function printLetters(rows, type, settings = S.settings, { markPrinted = true, layout = null, preview = true } = {}) {
  rows = (rows || []).filter((r) => r.status !== 'cancelled');
  if (!rows.length) return warn('ไม่มีรายการที่พิมพ์ได้');
  const L = layout || myLayout(type, settings);
  if (preview && !skipPreview()) {
    const go = await realSizePreview(rows, type, settings, L);
    if (!go) return;
  }
  await printDocument(rows.map((r) => renderEnvelope(r, settings, type, L)).join(''), pageCss(type, L));
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

/** Full-screen preview at REAL size (100% = actual millimetres). Resolves true = print. */
function realSizePreview(rows, type, settings, L) {
  return new Promise((resolve) => {
    const env = ENVELOPES[type];
    const { w, h } = envSize(type, L);
    const inch = (mm) => (mm / 25.4).toFixed(2).replace(/\.?0+$/, '');
    const MAX = 40;
    const el = document.createElement('div');
    el.className = 'rsp';
    el.innerHTML = `
      <div class="rsp-bar">
        <h2>ตัวอย่างก่อนพิมพ์ — ขนาดจริง</h2>
        <span class="badge b-${type}">${env.label}</span>
        <b>${w.toFixed(1)} × ${h.toFixed(1)} มม.</b><span class="muted">(${inch(w)}" × ${inch(h)}"${type === 'brown' ? ` · ${L.orientation === 'portrait' ? 'แนวตั้ง' : 'แนวนอน'}` : ''})</span>
        <span class="spacer"></span>
        <div class="seg"><label><input type="radio" name="rsp-z" value="1" checked><span>ขนาดจริง 100%</span></label><label><input type="radio" name="rsp-z" value="fit"><span>พอดีหน้าจอ</span></label></div>
        <button class="btn" data-x="cancel">ยกเลิก</button>
        <button class="btn btn-primary" data-x="print">🖨️ พิมพ์ ${rows.length} ซอง</button>
      </div>
      <div class="rsp-body"></div>
      <div class="rsp-foot">
        <div class="tips">ก่อนกดพิมพ์ในหน้าต่างของเบราว์เซอร์: เลือก<b>เครื่องพิมพ์จริง</b> (ไม่ใช่ PDF) · ขนาดกระดาษ <b>${inch(w)} × ${inch(h)} นิ้ว</b> · ขอบกระดาษ <b>ไม่มี (None)</b> · มาตราส่วน <b>100%</b> · ปิด <b>หัวกระดาษและท้ายกระดาษ</b></div>
        <a href="#" data-x="guide">วิธีพิมพ์ตรงไปที่เครื่องพิมพ์ทันที (ไม่ต้องผ่านหน้าต่างพิมพ์)</a>
        <label style="display:flex;gap:6px;align-items:center;color:var(--text);margin:0"><input type="checkbox" data-x="skip"> ครั้งต่อไปพิมพ์ทันที ไม่ต้องแสดงตัวอย่าง</label>
      </div>`;
    const body = $('.rsp-body', el);
    body.innerHTML = rows.slice(0, MAX).map((r, i) => `
      <div class="rsp-wrap"><div class="rsp-cap"><span>ซองที่ ${i + 1} / ${rows.length}</span><span>${esc(r.doc_number || '')} · ${esc(r.recipient_name || '')}</span></div>
        <div class="rsp-page" style="width:${w}mm"><div class="rsp-ruler"></div>${renderEnvelope(r, settings, type, L)}
          <div class="rsp-dim-w">${w.toFixed(1)} มม. (${inch(w)}")</div><div class="rsp-dim-h">${h.toFixed(1)} มม.</div></div></div>`).join('')
      + (rows.length > MAX ? `<div class="rsp-cap">… และอีก ${rows.length - MAX} ซอง (พิมพ์ครบทุกซอง)</div>` : '');
    document.body.appendChild(el);
    document.fonts.ready.then(() => fitEnvelopeText(body));
    const zoom = (z) => {
      const k = z === 'fit' ? Math.min(1, (body.clientWidth - 90) / (w * 3.7795), (body.clientHeight - 90) / ((h + 9) * 3.7795)) : 1;
      $$('.rsp-wrap', body).forEach((p) => { p.style.zoom = k; });
    };
    el.addEventListener('change', (e) => {
      if (e.target.name === 'rsp-z') zoom(e.target.value);
      if (e.target.dataset.x === 'skip') setSkipPreview(e.target.checked);
    });
    const close = (v) => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'cancel') close(false);
      if (x === 'print') close(true);
      if (x === 'guide') { e.preventDefault(); directPrintGuide(); }
    });
  });
}

function directPrintGuide() {
  const app = location.href.split('#')[0];
  Swal.fire({
    title: 'พิมพ์ซองตรงไปที่เครื่องพิมพ์ทันที', width: 760, confirmButtonText: 'เข้าใจแล้ว',
    html: `<div style="font-size:19px;line-height:1.5">
      <p style="margin-top:0">เบราว์เซอร์จะเปิดหน้าต่างพิมพ์เสมอเพื่อความปลอดภัย ถ้าต้องการให้กด "พิมพ์" แล้ว<b>ออกเครื่องพิมพ์ทันที</b> (ไม่ผ่าน PDF Printer ไม่มีหัว/ท้ายกระดาษ) ให้ตั้งค่าครั้งเดียวที่เครื่องนี้:</p>
      <ol style="padding-left:22px;margin:0">
        <li><b>ตั้งเครื่องพิมพ์ซองเป็นเครื่องหลัก (Default)</b> — Windows: Settings → Bluetooth &amp; devices → Printers → เลือกเครื่อง → Set as default (ปิด "Let Windows manage my default printer")</li>
        <li><b>ตั้งขนาดกระดาษของเครื่องพิมพ์</b> — Printing preferences → Paper size เป็น Envelope / Custom <b>9.25 × 4.25 นิ้ว</b> (ซองขาว) หรือ <b>10 × 8.2 นิ้ว</b> (ซองน้ำตาล), ถาดป้อน = Manual / Envelope feeder</li>
        <li><b>สร้าง shortcut เปิดระบบแบบพิมพ์ตรง</b> — คลิกขวาที่ Desktop → New → Shortcut แล้ววาง:<br>
          <code style="display:block;background:#f3f5fa;padding:6px 8px;border-radius:6px;word-break:break-all;margin:4px 0">"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing ${esc(app)}</code>
          (Microsoft Edge ใช้ <code>"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing ${esc(app)}</code>)</li>
        <li>ปิด Chrome/Edge ทุกหน้าต่างก่อน แล้วเปิดระบบจาก shortcut นี้ — กด "พิมพ์" ซองจะออกเครื่องพิมพ์หลักทันทีตามขนาดซองจริง</li>
      </ol>
      <p class="muted" style="margin-bottom:0">ระบบส่งขนาดหน้าเท่ากับซองจริง (ขอบ 0) ให้เครื่องพิมพ์ทุกครั้ง · ถ้าตำแหน่งเยื้อง ปรับที่เมนู "ตั้งค่าตำแหน่งบนซอง" → เลื่อนทั้งหมด X/Y</p></div>`,
  });
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
const fitLater = (root) => document.fonts.ready.then(() => fitEnvelopeText(root));

async function previewLetters(rows, type, after) {
  rows = rows.filter((r) => r.status !== 'cancelled');
  if (!rows.length) return warn('กรุณาเลือกรายการ');
  const L = myLayout(type);
  if (await realSizePreview(rows, type, S.settings, L)) { await printLetters(rows, type, S.settings, { layout: L, preview: false }); after?.(); }
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
  const mailCell = (u) => `<button class="btn btn-sm" data-pass="${u.id}">🔑 ตั้งรหัสผ่านใหม่</button>`;
  $('#topbar-right').innerHTML = '<button class="btn btn-primary" id="u-add">+ เพิ่มผู้ใช้งาน</button>';
  view().innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>รหัสผ่าน</th><th>บทบาท</th><th>สิทธิ์ใช้งานระบบ</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th></tr></thead>
    <tbody>${users.map((u) => { const me = u.id === S.profile.id; const a = authMap.get(u.id); return `<tr data-id="${u.id}">
      <td><b>${esc(u.full_name || '')}</b>${me ? ' <span class="muted">(คุณ)</span>' : ''}</td><td>${esc(u.email || '')}</td>
      <td style="white-space:nowrap">${mailCell(u)}</td>
      <td><select data-f="role" ${me ? 'disabled' : ''} style="width:auto">${opt('staff', 'เจ้าหน้าที่', u.role)}${opt('admin', 'ผู้ดูแลระบบ', u.role)}</select></td>
      <td style="white-space:nowrap">${u.role === 'admin' ? '<span class="badge b-admin">ทั้ง 2 ระบบ (ผู้ดูแล)</span>' : `
        <label style="display:flex;gap:6px;align-items:center;color:var(--text);margin:0"><input type="checkbox" data-f="perm_envelope" ${u.perm_envelope !== false ? 'checked' : ''}> ✉️ ระบบพิมพ์ซอง</label>
        <label style="display:flex;gap:6px;align-items:center;color:var(--text);margin:0"><input type="checkbox" data-f="perm_cheque" ${u.perm_cheque ? 'checked' : ''}> 🧾 ระบบพิมพ์เช็ค</label>`}</td>
      <td><label style="display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" data-f="active" ${u.active ? 'checked' : ''} ${me ? 'disabled' : ''}> ${u.active ? 'ใช้งานได้' : '<span class="badge b-issued">รออนุมัติ / ปิด</span>'}</label></td>
      <td style="white-space:nowrap">${a?.last_sign_in_at ? `${fmtDate(a.last_sign_in_at)} ${fmtTime(a.last_sign_in_at)}` : '<span class="muted">ยังไม่เคย</span>'}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="muted" style="font-size:18px;margin-bottom:0">ผู้ดูแลระบบใช้ได้ทั้ง 2 ระบบเสมอ · ผู้ใช้ที่ได้สิทธิ์ทั้ง 2 ระบบ จะเห็นหน้าต่างเลือกระบบหลังเข้าสู่ระบบ · อนุมัติแล้วเข้าสู่ระบบได้ทันที · ผู้ใช้ลืมรหัสผ่าน: กด 🔑 ตั้งรหัสผ่านใหม่ · ปิดใช้งาน = ติ๊ก "ใช้งานได้" ออก</p></div>`;
  view().addEventListener('change', async (e) => {
    const f = e.target.dataset.f; if (!f) return;
    const id = e.target.closest('tr').dataset.id;
    const patch = f === 'role' ? { role: e.target.value } : { [f]: e.target.checked };
    try {
      await must(S.sb.from('profiles').update(patch).eq('id', id));
      ok(patch.active ? 'อนุมัติแล้ว — ผู้ใช้เข้าสู่ระบบได้ทันที' : f.startsWith('perm_') ? `${e.target.checked ? 'เปิด' : 'ปิด'}สิทธิ์${f === 'perm_cheque' ? 'ระบบพิมพ์เช็ค' : 'ระบบพิมพ์ซอง'}แล้ว` : 'บันทึกแล้ว'); route();
    } catch (er) { fail(er); }
  });
  view().addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pass]'); if (!b) return;
    const u = users.find((x) => x.id === b.dataset.pass);
    const r = await Swal.fire({ title: 'ตั้งรหัสผ่านใหม่', html: `ผู้ใช้ <b>${esc(u.full_name || u.email)}</b><br><span class="muted">${esc(u.email || '')}</span>`, input: 'text', inputValue: Math.random().toString(36).slice(2, 10),
      showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true, inputValidator: (v) => (v.length < 6 ? 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' : undefined) });
    if (!r.isConfirmed) return;
    try { loading('กำลังบันทึก...'); await BK.setPassword(u.id, r.value); } catch (er) { return fail(er); }
    Swal.fire({ icon: 'success', title: 'ตั้งรหัสผ่านใหม่แล้ว', html: `อีเมล: <b>${esc(u.email)}</b><br>รหัสผ่าน: <b>${esc(r.value)}</b><br><span class="muted">แจ้งผู้ใช้ และให้เปลี่ยนรหัสผ่านเองภายหลัง</span>` });
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
      <label>บทบาท<select id="n-role">${opt('staff', 'เจ้าหน้าที่')}${opt('admin', 'ผู้ดูแลระบบ')}</select></label>
      <div class="full" id="n-perms"><span class="muted" style="font-size:18px">สิทธิ์ใช้งานระบบ (เลือกอย่างน้อย 1)</span>
        <label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="n-env" checked> ✉️ ระบบพิมพ์ซองจดหมาย</label>
        <label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="n-chq"> 🧾 ระบบพิมพ์เช็ค</label></div></div>`,
    didOpen: () => { const t = () => { $('#n-perms').style.display = val('n-role') === 'admin' ? 'none' : ''; }; $('#n-role').addEventListener('change', t); t(); },
    showCancelButton: true, confirmButtonText: 'สร้างผู้ใช้', cancelButtonText: 'ยกเลิก', reverseButtons: true,
    preConfirm: () => {
      const d = { name: val('n-name'), email: val('n-email'), pass: val('n-pass'), role: val('n-role'), perm_envelope: $('#n-env').checked, perm_cheque: $('#n-chq').checked };
      if (d.role === 'admin') { d.perm_envelope = true; d.perm_cheque = true; }
      if (!d.name || !d.email) return Swal.showValidationMessage('กรุณากรอกชื่อและอีเมล');
      if (!d.perm_envelope && !d.perm_cheque) return Swal.showValidationMessage('กรุณาเลือกสิทธิ์อย่างน้อย 1 ระบบ');
      if (d.pass.length < 6) return Swal.showValidationMessage('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
      return d;
    },
  });
  if (!r.isConfirmed) return;
  const d = r.value;
  try {
    loading('กำลังสร้างผู้ใช้...');
    await BK.createUser({ email: d.email, password: d.pass, full_name: d.name, role: d.role, perm_envelope: d.perm_envelope, perm_cheque: d.perm_cheque });
    await Swal.fire({
      icon: 'success', title: 'สร้างผู้ใช้สำเร็จ — เข้าสู่ระบบได้ทันที',
      html: `อีเมล: <b>${esc(d.email)}</b><br>รหัสผ่าน: <b>${esc(d.pass)}</b><br><span class="muted">กรุณาแจ้งผู้ใช้ และให้เปลี่ยนรหัสผ่านภายหลัง (เมนูชื่อผู้ใช้ด้านซ้ายล่าง)</span>`,
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
  const refresh = () => { $('#s-preview').innerHTML = previewHtml([SAMPLE_LETTER], envType(), collect(), 1, $('#s-preview').clientWidth || 600); fitLater($('#s-preview')); };
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
      <div class="rp-head"><img src="assets/logo.png" alt=""><div><h2>รายงานการพิมพ์ซองจดหมาย</h2><div>${esc(S.settings.org_name || '')}</div></div></div>
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
  // margins come from repeating spacer rows (not @page margins) so no browser header/footer is printed
  const body = `<table class="page-wrap"><thead><tr><td><div style="height:14mm"></div></td></tr></thead>
    <tbody><tr><td><section class="report-page">${html}</section></td></tr></tbody>
    <tfoot><tr><td><div style="height:12mm"></div></td></tr></tfoot></table>`;
  await printDocument(body, '@page { size: A4 portrait; margin: 0; }', 'body{padding:0 15mm 0 20mm}.page-wrap{width:100%;border-collapse:collapse}.page-wrap>thead>tr>td,.page-wrap>tfoot>tr>td,.page-wrap>tbody>tr>td{padding:0;border:0}');
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// =====================================================================
//  ADMIN — สำรองข้อมูล (ไฟล์ที่เซิร์ฟเวอร์ private/backups: ปี พ.ศ. / เดือน / วันที่)
// =====================================================================
const BACKUP_TABLES = ['settings', 'titles', 'provinces', 'postcodes', 'customers', 'books', 'letters', 'print_logs', 'profiles', 'envelope_layouts', 'cheque_banks', 'cheque_accounts', 'cheques', 'cheque_forms', 'cheque_print_logs', 'backup_logs'];

function bkkParts(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return { be: t.getUTCFullYear() + 543, mm: p(t.getUTCMonth() + 1), dd: p(t.getUTCDate()), hh: p(t.getUTCHours()), mi: p(t.getUTCMinutes()), ss: p(t.getUTCSeconds()) };
}
const gunzipText = (blob) => new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

async function runManualBackup(alsoDownload) {
  Swal.fire({ title: 'กำลังสำรองข้อมูล...', html: `<div class="muted">อ่านข้อมูลทุกตารางและบันทึกไฟล์ที่${esc(BK.backupWhere)}</div>`, showConfirmButton: false, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const r = await BK.backupRun('manual');
    if (alsoDownload) await downloadBackup(r.path, true);
    const total = Object.values(r.row_counts).reduce((a, b) => a + b, 0);
    await Swal.fire({ icon: 'success', title: 'สำรองข้อมูลสำเร็จ', html: `โฟลเดอร์ <b>${esc(r.path.split('/').slice(0, 3).join(' / '))}</b><br>${num(total)} แถว · ${fmtBytes(r.size_bytes)}` });
  } catch (e) { fail(e); }
}

async function downloadBackup(path, quiet = false) {
  try {
    if (!quiet) loading('กำลังดาวน์โหลด...');
    const text = await gunzipText(await BK.backupDownload(path));
    saveBlob(new Blob([text], { type: 'application/json' }), path.split('/').pop().replace('.gz', ''));
    if (!quiet) Swal.close();
  } catch (e) { fail(e); }
}

async function viewBackup() {
  const [logs, status] = await Promise.all([
    must(S.sb.from('backup_logs').select('*').order('created_at', { ascending: false }).limit(3000)),
    BK.backupStatus(),
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
      <p style="margin-top:0">${IS_SUPA ? '' : ''}สำรองทุกตาราง (${BACKUP_TABLES.length} ตาราง) เก็บใน${esc(BK.backupWhere)} แยกตาม <b>ปี พ.ศ. → เดือน → วันที่</b></p>
      <label style="display:flex;gap:8px;align-items:center;color:var(--text);margin-bottom:12px"><input type="checkbox" id="bk-dl"> ดาวน์โหลดไฟล์สำรอง (.json) ลงเครื่องนี้ด้วย</label>
      <button class="btn btn-gold btn-block" id="bk-run">💾 สำรองข้อมูลตอนนี้</button></div>
    <div class="card"><div class="card-head"><h3>สำรองข้อมูลอัตโนมัติ</h3>
      ${autoOk ? '<span class="badge b-printed">✔ เปิดใช้งาน</span>' : '<span class="badge b-cancelled">ยังไม่ได้ตั้งค่า</span>'}</div>
      <p style="margin-top:0">หลังเวลา <b>00:00 น.</b> ของทุกวัน ระบบจะตรวจว่าเมื่อวานมีการกด "สำรองข้อมูลตอนนี้" หรือไม่ — <b>ถ้าไม่มี จะสำรองให้อัตโนมัติ</b> ${IS_SUPA ? '(Vercel Cron เรียกทุกวันเวลา 00:00 น.)' : '(ทำงานเมื่อมีผู้เปิดใช้ระบบครั้งแรกของวัน หรือตั้ง Windows Task Scheduler ให้ตรงเวลา 00:00 ตาม README)'}</p>
      <p class="muted" style="font-size:18px;margin:0 0 10px">${autoOk
    ? (manualRecent ? 'มีการกดสำรองข้อมูลภายใน 24 ชม. ที่ผ่านมา คืนนี้ระบบอาจข้ามการสำรองอัตโนมัติ' : autoRecent ? 'ระบบสำรองอัตโนมัติทำงานปกติ' : 'ยังไม่พบไฟล์สำรองอัตโนมัติในช่วง 2 วันที่ผ่านมา (ถ้าเพิ่งติดตั้ง ให้รอถึงวันถัดไป หรือกดทดสอบ)')
    : IS_SUPA ? 'ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY และ CRON_SECRET ใน Vercel แล้ว Redeploy (ดู README)' : 'เขียนไฟล์ในโฟลเดอร์ private/backups ไม่ได้ — ตรวจสอบสิทธิ์โฟลเดอร์บนเครื่องเซิร์ฟเวอร์'}</p>
      <button class="btn" id="bk-test" ${autoOk ? '' : 'disabled'}>▶️ ทดสอบการสำรองอัตโนมัติ (ฝั่งเซิร์ฟเวอร์)</button></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>โฟลเดอร์สำรองข้อมูล</h3><span class="muted" style="font-size:18px">${IS_SUPA ? 'Storage bucket: <b>backups</b>' : 'โฟลเดอร์: <b>private/backups</b>'}</span></div>
    <div id="bk-tree">${backupTree(logs)}</div></div>`;

  $('#bk-run').addEventListener('click', async () => {
    if (!(await ask('สำรองข้อมูลตอนนี้?', 'ระบบจะอ่านข้อมูลทั้งหมดและบันทึกเป็นไฟล์สำรองในโฟลเดอร์ของวันนี้', { confirmButtonText: 'สำรองข้อมูล' }))) return;
    await runManualBackup($('#bk-dl').checked); route();
  });
  $('#bk-test')?.addEventListener('click', async () => {
    try {
      loading('กำลังสำรองข้อมูลฝั่งเซิร์ฟเวอร์...');
      const j = await BK.backupRun('auto');
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
        await BK.backupRemove(log.path);
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
//  ADMIN — การเชื่อมต่อฐานข้อมูล MySQL (XAMPP)
// =====================================================================
/** Admin page — Supabase mode (Vercel) */
async function viewConnectionSupa() {
  const c = S.conn || supaConn() || {};
  const mask = (k) => (k ? `${k.slice(0, 12)}…${k.slice(-6)}` : '—');
  const [t, fu, fb] = await Promise.all([
    supaTest(c.url, c.key),
    fetch('/api/admin-users?status=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    BK.backupStatus(),
  ]);
  const counts = {};
  for (const tb of ['profiles', 'customers', 'letters', 'cheques', 'backup_logs']) {
    const { count } = await S.sb.from(tb).select('id', { count: 'exact', head: true });
    counts[tb] = count ?? 0;
  }
  const row = (k, v) => `<tr><th style="position:static;width:170px">${k}</th><td style="word-break:break-all">${v}</td></tr>`;
  const chk = (okv, title, note) => `<div class="check-row"><span class="badge ${okv ? 'b-printed' : 'b-cancelled'}">${okv ? '✔' : '✕'}</span><div><b>${title}</b>${note ? `<div class="muted" style="font-size:18px">${note}</div>` : ''}</div></div>`;
  view().innerHTML = `
  <div class="grid-2">
    <div class="card"><div class="card-head"><h3>การเชื่อมต่อที่ใช้อยู่ — Supabase</h3><span class="badge ${t.ok ? 'b-printed' : 'b-cancelled'}">${t.ok ? '✔ เชื่อมต่อแล้ว' : '✕ มีปัญหา'}</span></div>
      <table><tbody>
        ${row('ที่มาของค่า', c.source === 'env' ? '<b>Vercel Environment Variables</b> (ใช้ได้ทุกเครื่อง)' : '<b>ตั้งค่าเองในเบราว์เซอร์นี้</b>')}
        ${row('Project URL', esc(c.url || '—'))}
        ${row('anon key', `<code>${esc(mask(c.key))}</code>`)}
        ${row('สถานะ', esc(t.message))}
      </tbody></table>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" id="cn-supa">⚙️ ตั้งค่าเองในเบราว์เซอร์นี้</button>
        ${hasManualConn() ? `<button class="btn" id="cn-clear">↺ ล้างค่าที่ตั้งเอง${CFG.SUPABASE_URL ? ' (กลับไปใช้ค่าจาก Vercel)' : ''}</button>` : ''}
      </div></div>
    <div class="card"><div class="card-head"><h3>สถานะระบบ</h3></div>
      ${chk(t.ok && t.installed, 'ตารางของระบบ', t.installed ? '' : 'รันไฟล์ใน supabase/ ที่ SQL Editor')}
      ${chk(!!fu?.configured, 'สร้างผู้ใช้ / ตั้งรหัสผ่าน (Vercel: api/admin-users)', fu?.configured ? '' : 'ตั้ง SUPABASE_SERVICE_ROLE_KEY ใน Vercel แล้ว Redeploy')}
      ${chk(!!fb?.configured, 'สำรองข้อมูล (Vercel: api/backup + Cron 00:00)', fb?.configured ? (fb.cron_secret ? '' : 'แนะนำตั้ง CRON_SECRET') : 'ตั้ง SUPABASE_SERVICE_ROLE_KEY และ CRON_SECRET ใน Vercel')}
      ${[['ผู้ใช้งาน', counts.profiles], ['ผู้รับ / หน่วยงาน', counts.customers], ['เลขหนังสือที่ออก', counts.letters], ['เช็ค', counts.cheques], ['ไฟล์สำรองข้อมูล', counts.backup_logs]]
    .map(([k, v]) => `<div class="check-row"><span class="badge b-white">${num(v)}</span><div><b>${k}</b></div></div>`).join('')}</div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>หมายเหตุ</h3></div>
    <ul style="margin:0;padding-left:22px;line-height:1.6">
      <li>ระบบนี้เปิดจาก Vercel จึงใช้ฐานข้อมูล <b>Supabase</b> — ถ้าต้องการใช้ MySQL ให้วางโปรแกรมใน XAMPP</li>
      <li>ค่าการเชื่อมต่อหลักตั้งที่ Vercel → Settings → Environment Variables: <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>CRON_SECRET</code> แล้ว Redeploy</li>
      <li>"ตั้งค่าเองในเบราว์เซอร์นี้" ใช้ชั่วคราว/ทดสอบ มีผลเฉพาะเครื่องนี้</li>
    </ul></div>`;
  $('#cn-supa').addEventListener('click', async () => {
    const r = await Swal.fire({ title: 'ตั้งค่าการเชื่อมต่อ Supabase', width: 640, focusConfirm: false,
      html: `<div class="swal-form"><label class="full">Project URL<input id="cs-url" value="${esc(c.url || '')}"></label><label class="full">anon / publishable key<input id="cs-key" value="${esc(c.key || '')}"></label>
        <div class="full" style="display:flex;gap:10px;align-items:center"><button type="button" class="btn btn-sm" id="cs-test">🔌 ทดสอบ</button><span id="cs-res"></span></div>
        <p class="full muted" style="margin:0;font-size:18px">มีผลเฉพาะเบราว์เซอร์นี้ · ห้ามใช้ service_role key · ถ้าเปลี่ยนโปรเจกต์ ทุกคนต้องเข้าสู่ระบบใหม่</p></div>`,
      showCancelButton: true, confirmButtonText: 'บันทึกและเชื่อมต่อ', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      didOpen: () => $('#cs-test').addEventListener('click', async () => {
        $('#cs-res').innerHTML = '<span class="muted">กำลังทดสอบ...</span>';
        const x = await supaTest(val('cs-url'), val('cs-key'));
        $('#cs-res').innerHTML = `<span class="badge ${x.ok && x.installed ? 'b-printed' : 'b-cancelled'}">${x.ok && x.installed ? '✔' : '✕'} ${esc(x.message)}</span>`;
      }),
      preConfirm: async () => { const x = await supaTest(val('cs-url'), val('cs-key')); if (!x.ok || !x.installed) return Swal.showValidationMessage(x.message); return { url: val('cs-url'), key: val('cs-key') }; } });
    if (!r.isConfirmed) return;
    saveManualConn(r.value.url, r.value.key);
    await Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', text: 'ระบบจะโหลดใหม่', timer: 1200, showConfirmButton: false });
    location.reload();
  });
  $('#cn-clear')?.addEventListener('click', async () => {
    if (!(await ask('ล้างค่าที่ตั้งเอง?', CFG.SUPABASE_URL ? 'กลับไปใช้ค่าจาก Vercel Environment Variables' : 'ระบบจะถามการเชื่อมต่อใหม่'))) return;
    clearManualConn(); location.reload();
  });
}

async function viewConnection() {
  if (IS_SUPA) return viewConnectionSupa();
  view().innerHTML = '<div class="card empty">กำลังโหลด...</div>';
  const c = await api('conn_info');
  if (c.error) throw c.error;
  const row = (k, v) => `<tr><th style="position:static;width:170px">${k}</th><td style="word-break:break-all">${v}</td></tr>`;
  view().innerHTML = `
  <div class="grid-2">
    <div class="card"><div class="card-head"><h3>การเชื่อมต่อที่ใช้อยู่</h3><span class="badge b-printed">✔ เชื่อมต่อแล้ว</span></div>
      <table><tbody>
        ${row('Host', `${esc(c.host)} : ${esc(c.port)}`)}
        ${row('ฐานข้อมูล', `<b>${esc(c.database)}</b>`)}
        ${row('ผู้ใช้ MySQL', esc(c.username))}
        ${row('รหัสผ่าน', c.has_password ? '•••••••• (ไม่แสดง)' : '<span class="muted">ไม่มีรหัสผ่าน</span>')}
        ${row('เซิร์ฟเวอร์', `MySQL/MariaDB ${esc(c.version)} · PHP ${esc(c.php)}`)}
        ${row('บันทึกล่าสุด', c.saved_at ? `${fmtDate(c.saved_at)} ${fmtTime(c.saved_at)} น. · ${esc(c.saved_by || '')}` : '—')}
      </tbody></table>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" id="cn-change">⚙️ เปลี่ยนการเชื่อมต่อ</button>
        <button class="btn" id="cn-reinstall">🛠️ ติดตั้ง/อัปเดตโครงสร้างตาราง</button>
      </div></div>
    <div class="card"><div class="card-head"><h3>สถานะระบบ</h3></div>
      ${[['ผู้ใช้งาน', c.counts.profiles], ['ผู้รับ / หน่วยงาน', c.counts.customers], ['เลขหนังสือที่ออก', c.counts.letters], ['เช็ค', c.counts.cheques], ['ไฟล์สำรองข้อมูล', c.counts.backup_logs]]
    .map(([k, v]) => `<div class="check-row"><span class="badge b-white">${num(v)}</span><div><b>${k}</b></div></div>`).join('')}
      <div class="check-row"><span class="badge ${c.status.installed ? 'b-printed' : 'b-cancelled'}">${c.status.installed ? '✔' : '✕'}</span><div><b>ตารางของระบบ</b>${c.status.installed ? '' : `<div class="muted" style="font-size:18px">ขาด ${esc(c.status.missing.join(', '))}</div>`}</div></div>
      <div class="check-row"><span class="badge ${c.backup_dir_ok ? 'b-printed' : 'b-cancelled'}">${c.backup_dir_ok ? '✔' : '✕'}</span><div><b>โฟลเดอร์สำรองข้อมูล private/backups</b>${c.backup_dir_ok ? '' : '<div class="muted" style="font-size:18px">เขียนไฟล์ไม่ได้</div>'}</div></div>
      <p class="muted" style="font-size:18px;margin:10px 0 0">ขนาดฐานข้อมูลประมาณ ${fmtBytes(c.size_bytes)}</p></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>หมายเหตุ</h3></div>
    <ul style="margin:0;padding-left:22px;line-height:1.6">
      <li>ค่าการเชื่อมต่อเก็บที่เครื่องเซิร์ฟเวอร์ (<code>private/config.php</code>) ทุกเครื่องที่เปิดเว็บนี้ใช้ค่าเดียวกัน ไม่ต้องตั้งค่าทีละเครื่อง</li>
      <li>เปลี่ยนไปใช้ฐานข้อมูลอื่น: ระบบจะสร้างฐานข้อมูล/ตารางให้ถ้ายังไม่มี และทุกคนต้องเข้าสู่ระบบใหม่ (บัญชีผู้ใช้อยู่ในฐานข้อมูล)</li>
      <li>ถ้าวันหลังเชื่อมต่อไม่ได้ (เช่น MySQL ไม่ได้เปิด) ระบบจะแสดงหน้าตั้งค่าก่อนหน้าเข้าสู่ระบบ — แก้ไขได้จากเครื่องเซิร์ฟเวอร์ (localhost)</li>
    </ul></div>`;

  const dialog = async (reinstall) => {
    const r = await Swal.fire({
      title: reinstall ? 'ติดตั้ง/อัปเดตโครงสร้างตาราง' : 'เปลี่ยนการเชื่อมต่อฐานข้อมูล', width: 640, focusConfirm: false,
      html: `<div class="swal-form">
        <label>Host<input id="cn-host" value="${esc(c.host)}" ${reinstall ? 'disabled' : ''}></label>
        <label>Port<input id="cn-port" type="number" value="${esc(c.port)}" ${reinstall ? 'disabled' : ''}></label>
        <label>ผู้ใช้ MySQL<input id="cn-user" value="${esc(c.username)}" ${reinstall ? 'disabled' : ''}></label>
        <label>รหัสผ่าน MySQL<input id="cn-pass" type="password" placeholder="${c.has_password ? 'เว้นว่าง = ใช้รหัสเดิม' : 'ไม่มีรหัสผ่าน'}" ${reinstall ? 'disabled' : ''}></label>
        <label class="full">ชื่อฐานข้อมูล<input id="cn-db" value="${esc(c.database)}" ${reinstall ? 'disabled' : ''}></label>
        <label class="full" style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="cn-seed" ${reinstall ? '' : 'checked'}> นำเข้าข้อมูลเริ่มต้นถ้าฐานข้อมูลยังว่าง</label>
        <div class="full" style="display:flex;gap:10px;align-items:center"><button type="button" class="btn btn-sm" id="cn-test">🔌 ทดสอบการเชื่อมต่อ</button><span id="cn-result"></span></div>
        <p class="full muted" style="margin:0;font-size:18px">${reinstall ? 'สร้างตารางที่ยังไม่มี (ข้อมูลเดิมไม่หาย) — ใช้หลังอัปเดตเวอร์ชันโปรแกรม' : 'ถ้าเปลี่ยนไปฐานข้อมูลอื่น ทุกคนต้องเข้าสู่ระบบใหม่'}</p></div>`,
      showCancelButton: true, reverseButtons: true, confirmButtonText: reinstall ? 'ติดตั้ง' : 'บันทึกและเชื่อมต่อ', cancelButtonText: 'ยกเลิก',
      didOpen: () => {
        $('#cn-test').addEventListener('click', async () => {
          $('#cn-result').innerHTML = '<span class="muted">กำลังทดสอบ...</span>';
          const t = await api('setup_test', readConn());
          const okv = !t.error && t.ok;
          $('#cn-result').innerHTML = `<span class="badge ${okv ? 'b-printed' : 'b-cancelled'}">${okv ? '✔' : '✕'} ${esc(t.error?.message || t.message)}</span>`;
        });
      },
      preConfirm: () => { const d = readConn(); if (!/^[A-Za-z0-9_]+$/.test(d.database)) return Swal.showValidationMessage('ชื่อฐานข้อมูลใช้ได้เฉพาะ a-z, 0-9 และ _'); return d; },
    });
    if (!r.isConfirmed) return;
    const moved = r.value.host !== c.host || Number(r.value.port) !== Number(c.port) || r.value.database !== c.database;
    if (moved && !(await ask('ยืนยันเปลี่ยนฐานข้อมูล?', `จาก <b>${esc(c.database)}</b>@${esc(c.host)} ไปเป็น <b>${esc(r.value.database)}</b>@${esc(r.value.host)}<br><span class="muted">ทุกคนต้องเข้าสู่ระบบใหม่</span>`, { icon: 'warning' }))) return;
    if (await saveConnection(r.value, { relogin: moved })) location.replace(location.pathname);
  };
  const readConn = () => {
    const pass = $('#cn-pass').value;
    return { host: val('cn-host'), port: Number(val('cn-port')) || 3306, username: val('cn-user'), password: pass, keep_password: pass === '', database: val('cn-db'), seed: $('#cn-seed').checked };
  };
  $('#cn-change').addEventListener('click', () => dialog(false));
  $('#cn-reinstall').addEventListener('click', () => dialog(true));
}

// =====================================================================
//  ตั้งค่าตำแหน่งบนซอง — per-user layout editor (white / brown separately)
//  • every line on the envelope is its own item: show/hide, move, width,
//    font size, bold, wrap; add / delete custom text items
//  • drag on the preview, arrow keys to nudge (Shift = 5 mm)
//  • every save = new version (date/time + user) → history
//  • load another user's layout and save it as your own in one click
// =====================================================================
const PX_PER_MM = 3.7795;
const r05 = (n) => Math.round(n * 2) / 2;
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmtDT = (d) => `${fmtDate(d)} ${fmtTime(d)} น.`;
const itemLabel = (key, it) => (key.startsWith('custom_') ? `ข้อความ: ${it?.text ? it.text.split('\n')[0].slice(0, 18) : '(ว่าง)'}` : itemDef(key).label);

async function viewLayout() {
  await loadMyLayouts();
  S.lay = S.lay || { type: 'white', draft: {}, dirty: {}, source: {}, sel: null };
  const Y = S.lay;
  for (const t of ['white', 'brown']) if (!Y.draft[t] || !Y.dirty[t]) { Y.draft[t] = clone(myLayout(t)); Y.dirty[t] = false; Y.source[t] = null; }

  view().innerHTML = `
  <div class="tabs" id="ly-tabs">${Object.values(ENVELOPES).map((e) => `<button data-t="${e.key}">${e.label} ${e.size}</button>`).join('')}</div>
  <div class="lay-status" id="ly-status"></div>
  <div class="lay-cols">
    <div class="lay-left">
      <div class="card">
        <div class="card-head"><h3>ตัวอย่างซอง — ลากแต่ละรายการเพื่อย้าย</h3></div>
        <div class="lay-stage" id="ly-stage" tabindex="0"></div>
        <p class="muted" style="margin:8px 0 10px;font-size:18px">คลิกเลือกรายการ แล้ว<b>ลาก</b> หรือกด<b>ลูกศร</b>บนแป้นพิมพ์เพื่อขยับทีละ 0.5 มม. (กด Shift ค้าง = 5 มม.) · ซ่อน/ลบรายการได้ที่ตารางด้านขวา · การตั้งค่านี้เป็นของคุณคนเดียว</p>
        <div id="ly-global"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-gold" id="ly-save">💾 บันทึกการตั้งค่า</button>
          <button class="btn" id="ly-test">🖨️ พิมพ์ทดสอบ (ขนาดจริง)</button>
          <button class="btn" id="ly-revert">↶ ยกเลิกการแก้ไข</button>
          <button class="btn" id="ly-reset">↺ ค่าเริ่มต้น</button></div>
      </div>
    </div>
    <div>
      <div class="card"><div class="card-head"><h3>รายการบนซอง</h3><button class="btn btn-sm" id="ly-add">+ เพิ่มข้อความ</button></div>
        <div class="lay-tbl-wrap" id="ly-items"></div>
        <label style="margin-top:10px">หมายเหตุเมื่อบันทึก (เช่น เครื่องพิมพ์ที่ใช้)<input id="ly-note" placeholder="เช่น HP LaserJet ห้องสารบรรณ"></label></div>
      <div class="card"><div class="card-head"><h3>โหลดการตั้งค่าจากผู้ใช้อื่น</h3></div><div id="ly-others"><div class="empty">กำลังโหลด...</div></div></div>
      <div class="card"><div class="card-head"><h3>ประวัติการตั้งค่าของฉัน</h3></div><div id="ly-history"><div class="empty">กำลังโหลด...</div></div></div>
    </div>
  </div>`;

  const T = () => Y.type;
  const L = () => Y.draft[T()];
  const size = () => envSize(T(), L());
  const keysOf = () => [...ITEM_DEFS.map((d) => d.key), ...Object.keys(L().items).filter((k) => k.startsWith('custom_'))];
  const touch = () => { Y.dirty[T()] = true; paintStatus(); };

  // ---------- status bar ----------
  const paintStatus = () => {
    const cur = S.layouts[T()];
    const src = cur?.source_user_name ? ` · โหลดจาก <b>${esc(cur.source_user_name)}</b>` : '';
    $('#ly-status').innerHTML = `<span>${ENVELOPES[T()].label} — กำลังใช้: ${cur ? `<b>การตั้งค่าของคุณ</b> บันทึกเมื่อ ${fmtDT(cur.created_at)}${src}${cur.note ? ` · "${esc(cur.note)}"` : ''}` : '<b>ค่าเริ่มต้นของระบบ</b> (ยังไม่เคยบันทึก)'}</span>
      ${Y.dirty[T()] ? '<span class="lay-dirty">● มีการแก้ไขที่ยังไม่บันทึก</span>' : ''}`;
    $$('#ly-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === T()));
  };

  // ---------- preview with drag & keyboard ----------
  let k = 1;
  const paintPreview = () => {
    const stage = $('#ly-stage'); if (!stage) return;
    const { w, h } = size();
    const avail = Math.max(300, stage.clientWidth - 28);
    k = Math.min(1.25, avail / (w * PX_PER_MM), Math.max(260, window.innerHeight - 380) / (h * PX_PER_MM));
    stage.innerHTML = `<div class="lay-frame" style="width:${w * PX_PER_MM * k}px;height:${h * PX_PER_MM * k}px">
      <div style="transform:scale(${k});transform-origin:top left">${renderEnvelope(SAMPLE_LETTER, S.settings, T(), L(), { editor: true }).replace('class="env ', 'class="env on-screen ')}</div></div>`;
    $$('[data-block]', stage).forEach((el) => { el.dataset.label = itemLabel(el.dataset.block, L().items[el.dataset.block]); el.classList.toggle('sel', el.dataset.block === Y.sel); });
    fitLater(stage);
  };
  const select = (key) => {
    Y.sel = key;
    $$('#ly-stage [data-block]').forEach((el) => el.classList.toggle('sel', el.dataset.block === key));
    $$('#ly-items tr[data-key]').forEach((tr) => tr.classList.toggle('sel', tr.dataset.key === key));
  };
  const syncRow = (key) => {
    const it = L().items[key];
    const ix = $(`#ly-items tr[data-key="${key}"] input[data-p="x"]`), iy = $(`#ly-items tr[data-key="${key}"] input[data-p="y"]`);
    if (ix) ix.value = it.x; if (iy) iy.value = it.y;
  };
  let drag = null;
  $('#ly-stage').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-block]');
    if (!el) return select(null);
    e.preventDefault();
    const key = el.dataset.block; select(key);
    drag = { el, key, px: e.clientX, py: e.clientY, x: L().items[key].x, y: L().items[key].y };
    el.classList.add('dragging'); el.setPointerCapture(e.pointerId);
    $('#ly-stage').focus({ preventScroll: true });
  });
  $('#ly-stage').addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { w, h } = size();
    const it = L().items[drag.key];
    it.x = Math.min(w - 3, Math.max(0, r05(drag.x + (e.clientX - drag.px) / (k * PX_PER_MM))));
    it.y = Math.min(h - 3, Math.max(0, r05(drag.y + (e.clientY - drag.py) / (k * PX_PER_MM))));
    drag.el.style.left = `${it.x}mm`; drag.el.style.top = `${it.y}mm`;
    syncRow(drag.key);
  });
  const endDrag = () => {
    if (!drag) return;
    const it = L().items[drag.key];
    const moved = it.x !== drag.x || it.y !== drag.y;
    drag.el.classList.remove('dragging'); drag = null;
    if (moved) touch();
  };
  $('#ly-stage').addEventListener('pointerup', endDrag);
  $('#ly-stage').addEventListener('pointercancel', endDrag);
  $('#ly-stage').addEventListener('keydown', (e) => {
    if (!Y.sel || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const st = e.shiftKey ? 5 : 0.5;
    const it = L().items[Y.sel];
    if (e.key === 'ArrowLeft') it.x = r05(Math.max(0, it.x - st));
    if (e.key === 'ArrowRight') it.x = r05(it.x + st);
    if (e.key === 'ArrowUp') it.y = r05(Math.max(0, it.y - st));
    if (e.key === 'ArrowDown') it.y = r05(it.y + st);
    const el = $(`#ly-stage [data-block="${Y.sel}"]`); if (el) { el.style.left = `${it.x}mm`; el.style.top = `${it.y}mm`; }
    syncRow(Y.sel); touch();
  });

  // ---------- global settings (offset / orientation) ----------
  const paintGlobal = () => {
    $('#ly-global').innerHTML = `<div class="lay-group" style="margin:0"><b>⇲ เลื่อนทั้งหมด (ปรับให้ตรงเครื่องพิมพ์)</b>
      <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
        <label>แนวนอน X (มม.)<input type="number" step="0.5" id="ly-off-x" value="${L().offset.x}" style="width:110px"></label>
        <label>แนวตั้ง Y (มม.)<input type="number" step="0.5" id="ly-off-y" value="${L().offset.y}" style="width:110px"></label>
        ${T() === 'brown' ? `<div><span class="muted" style="font-size:17px">การวางซองน้ำตาล</span><div class="seg">${[['landscape', 'แนวนอน', '10" × 8.2"'], ['portrait', 'แนวตั้ง', '8.2" × 10"']].map(([v, l, d]) => `<label><input type="radio" name="ly-orient" value="${v}" ${L().orientation === v ? 'checked' : ''}><span>${l}<small>${d}</small></span></label>`).join('')}</div></div>` : ''}
      </div></div>`;
  };
  $('#ly-global').addEventListener('input', (e) => {
    if (e.target.id === 'ly-off-x' || e.target.id === 'ly-off-y') {
      const v = Number(e.target.value); if (!Number.isFinite(v)) return;
      L().offset[e.target.id === 'ly-off-x' ? 'x' : 'y'] = v; touch(); paintPreview();
    }
  });
  $('#ly-global').addEventListener('change', async (e) => {
    if (e.target.name !== 'ly-orient' || e.target.value === L().orientation) return;
    const go = await ask('เปลี่ยนการวางซองน้ำตาล?', 'ตำแหน่งทุกรายการจะถูกตั้งเป็นค่าเริ่มต้นของแนวใหม่ (ยังไม่บันทึกจนกว่าจะกด "บันทึกการตั้งค่า")');
    if (go) { Y.draft.brown = defaultLayout('brown', e.target.value, S.settings); Y.dirty.brown = true; }
    paintAll();
  });

  // ---------- item list ----------
  const num_ = (key, p, v, extra = '') => `<input type="number" step="0.5" data-p="${p}" value="${v ?? ''}" ${extra}>`;
  const paintItems = () => {
    let lastGroup = '';
    const rows = keysOf().map((key) => {
      const it = L().items[key]; if (!it) return '';
      const d = itemDef(key);
      const grp = d.group !== lastGroup ? `<tr class="grp"><td colspan="8">${esc(d.group)}</td></tr>` : '';
      lastGroup = d.group;
      const isCustom = key.startsWith('custom_');
      const hasW = ['text', 'box', 'custom'].includes(d.kind);
      const opt2 = d.kind === 'postcode' ? `<label title="แสดงเป็นช่องสี่เหลี่ยม" style="display:flex;flex-direction:column;align-items:center;margin:0;color:var(--text);font-size:14px;line-height:1"><input type="checkbox" data-p="boxes" ${it.boxes !== false ? 'checked' : ''}>กล่อง</label>`
        : (d.kind === 'text' || isCustom) ? `<input type="checkbox" data-p="wrap" title="ข้อความยาวให้ขึ้นบรรทัดใหม่ (ไม่ย่อขนาด)" ${it.wrap ? 'checked' : ''}>` : '';
      return `${grp}<tr data-key="${key}" class="${it.show === false ? 'off' : ''}${Y.sel === key ? ' sel' : ''}">
        <td><input type="checkbox" data-p="show" title="แสดง / ซ่อน" ${it.show !== false ? 'checked' : ''}></td>
        <td class="nm">${isCustom ? `<div style="display:flex;gap:3px;align-items:center"><input type="text" data-p="text" value="${esc(it.text || '')}" placeholder="พิมพ์ข้อความ" style="width:100%;min-width:80px"><button class="btn btn-sm btn-icon btn-danger" data-del title="ลบรายการนี้">🗑</button></div>` : esc(d.label)}</td>
        <td>${num_(key, 'x', it.x)}</td><td>${num_(key, 'y', it.y)}</td>
        <td>${hasW ? num_(key, 'w', it.w) : ''}</td>
        <td>${d.kind === 'image' ? num_(key, 'h', it.h, 'title="ความสูง มม."') : num_(key, 'size', it.size, 'title="ขนาดอักษร pt"')}</td>
        <td style="text-align:center">${d.kind === 'image' ? '' : `<input type="checkbox" data-p="bold" title="ตัวหนา" ${it.bold ? 'checked' : ''}>`}</td>
        <td style="text-align:center">${opt2}</td></tr>`;
    }).join('');
    $('#ly-items').innerHTML = `<table class="lay-items"><thead><tr><th title="แสดง">แสดง</th><th>รายการ</th><th>X มม.</th><th>Y มม.</th><th>กว้าง</th><th>ขนาด</th><th>หนา</th><th title="ข้อความยาวให้ขึ้นบรรทัดใหม่ / รหัสไปรษณีย์แบบกล่อง">ตัด<br>บรรทัด</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  $('#ly-items').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-key]'); if (!tr) return;
    const it = L().items[tr.dataset.key]; const p = e.target.dataset.p; if (!p) return;
    if (e.target.type === 'checkbox') {
      it[p] = e.target.checked;
      if (p === 'show') tr.classList.toggle('off', !e.target.checked);
    } else if (p === 'text') it.text = e.target.value;
    else { const v = Number(e.target.value); if (!Number.isFinite(v)) return; it[p] = v; }
    touch(); paintPreview();
  });
  $('#ly-items').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-key]'); if (!tr) return;
    const key = tr.dataset.key;
    if (e.target.closest('[data-del]')) {
      if (!(await ask('ลบข้อความนี้?', esc(L().items[key].text || ''), { icon: 'warning', confirmButtonColor: '#c0392b', confirmButtonText: 'ลบ' }))) return;
      delete L().items[key]; if (Y.sel === key) Y.sel = null; touch(); paintItems(); paintPreview(); return;
    }
    if (!e.target.closest('input,button,label')) select(key); // envelope editor
  });
  $('#ly-add').addEventListener('click', () => {
    const { w, h } = size();
    const key = `custom_${Date.now().toString(36)}`;
    L().items[key] = { show: true, x: r05(w * 0.06), y: r05(h * 0.7), w: r05(w * 0.4), size: T() === 'brown' ? 18 : 15, bold: false, wrap: false, text: 'ข้อความ' };
    Y.sel = key; touch(); paintItems(); paintPreview();
    setTimeout(() => { const inp = $(`#ly-items tr[data-key="${key}"] input[data-p="text"]`); inp?.focus(); inp?.select(); }, 30);
  });
  $('#ly-note').addEventListener('input', (e) => { Y.note = e.target.value; });

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
    if (!(await ask('คืนค่าเริ่มต้น?', 'ทุกรายการจะกลับเป็นค่าเริ่มต้นของระบบ ข้อความที่เพิ่มเองจะถูกลบ (ยังไม่บันทึกจนกว่าจะกด "บันทึกการตั้งค่า")'))) return;
    Y.draft[T()] = defaultLayout(T(), L().orientation, S.settings); Y.dirty[T()] = true; Y.sel = null; paintAll();
  });
  $('#ly-test').addEventListener('click', () => printLetters([SAMPLE_LETTER], T(), S.settings, { markPrinted: false, layout: L() }));

  const previewOf = (layout, title) => Swal.fire({
    title, width: 'min(900px, 96vw)', confirmButtonText: 'ปิด',
    html: previewHtml([SAMPLE_LETTER], T(), S.settings, 1, 820, resolveLayout(T(), S.settings, layout)),
    didOpen: (p) => fitLater(p),
  });

  const loadLists = async () => {
    const [others, mine] = await Promise.all([
      must(S.sb.from('envelope_layouts').select('*').eq('envelope', T()).neq('user_id', S.profile.id).order('created_at', { ascending: false }).limit(300)),
      must(S.sb.from('envelope_layouts').select('*').eq('envelope', T()).eq('user_id', S.profile.id).order('created_at', { ascending: false }).limit(50)),
    ]);
    const latest = []; const seen = new Map();
    for (const r of others) { if (!seen.has(r.user_id)) { seen.set(r.user_id, 1); latest.push(r); } else seen.set(r.user_id, seen.get(r.user_id) + 1); }
    $('#ly-others').innerHTML = latest.length ? `<div class="table-wrap"><table><thead><tr><th>ผู้ใช้</th><th>บันทึกล่าสุด</th><th>หมายเหตุ</th><th></th></tr></thead><tbody>
      ${latest.map((r) => `<tr data-id="${r.id}"><td><b>${esc(r.user_name || '')}</b>${seen.get(r.user_id) > 1 ? `<div class="muted" style="font-size:17px">${seen.get(r.user_id)} เวอร์ชัน</div>` : ''}</td>
        <td style="white-space:nowrap">${fmtDT(r.created_at)}</td><td>${esc(r.note || '')}${r.layout?.orientation === 'portrait' ? ' <span class="badge b-brown">แนวตั้ง</span>' : ''}</td>
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

  $('#ly-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; Y.type = b.dataset.t; Y.sel = null; paintAll(); });
  const paintAll = () => {
    paintStatus(); paintGlobal(); paintItems(); paintPreview();
    $('#ly-note').value = Y.note || '';
    loadLists().catch((er) => { $('#ly-others').innerHTML = `<div class="empty">${esc(thaiError(er))}</div>`; });
  };
  paintAll();
}

// =====================================================================
//  ระบบพิมพ์เช็ค — Cheque Printing System
// =====================================================================
const CROSS = { ac: 'AC (A/C Payee Only)', nonac: 'Non-AC (ไม่ขีดคร่อม)' };
const LAST_CROSS_KEY = 'chq.lastCrossing';
const lastCrossing = () => { try { return localStorage.getItem(LAST_CROSS_KEY) || 'ac'; } catch { return 'ac'; } };
const saveLastCrossing = (v) => { try { localStorage.setItem(LAST_CROSS_KEY, v); } catch { /* ignore */ } };
const crossBadge = (c) => (c ? `<span class="badge b-${c}">${c === 'ac' ? 'AC' : 'Non-AC'}</span>` : '<span class="muted">—</span>');

async function loadChequeRefs() {
  const [banks, accounts, forms] = await Promise.all([
    must(S.sb.from('cheque_banks').select('*').order('id')),
    must(S.sb.from('cheque_accounts').select('*').order('sort').order('id')),
    must(S.sb.from('cheque_forms').select('*').eq('user_id', S.profile.id).order('created_at')),
  ]);
  S.chq = { ...(S.chq || {}), banks, accounts, forms };
  if (!forms.length && !S.chq.autoStd) await autoStandardForms();
}

/**
 * First time in the cheque system: give the user the 4 standard forms laid out on the real cheques
 * (กรุงไทย / กสิกรไทย × A/C / Non-AC) so the database has them right away — editable / copyable later.
 */
async function autoStandardForms() {
  S.chq.autoStd = true;
  const rows = Object.values(CHEQUE_PRESETS).map((p) => ({ p, b: S.chq.banks.find((x) => x.code === p.bank) })).filter((x) => x.b)
    .map(({ p, b }) => ({ user_id: S.profile.id, user_name: S.profile.full_name || S.profile.email, bank_id: b.id, crossing: p.crossing,
      name: `แบบเช็คจริง ${p.label}`, layout: JSON.parse(JSON.stringify(p.layout)), is_default: true }));
  if (!rows.length) return;
  try {
    const made = await must(S.sb.from('cheque_forms').insert(rows).select());
    S.chq.forms = made;
    ok(`สร้างแบบฟอร์มเช็คมาตรฐาน ${made.length} แบบให้แล้ว (ตามเช็คจริง กรุงไทย/กสิกรไทย A/C, Non-AC)`);
  } catch (e) { console.warn('auto standard forms', e); }
}
const bankName = (id) => S.chq.banks.find((b) => b.id === id)?.short_name || 'ไม่ระบุ';
const accName = (id) => S.chq.accounts.find((a) => a.id === id)?.name || '';
const accCode = (id) => S.chq.accounts.find((a) => a.id === id)?.code || '';
const CROSS_LABEL = { ac: 'A/C', nonac: 'Non-AC', both: 'AC + Non-AC' };
/** Extra fields (typed in the cheque form) defined by my cheque forms of this bank, plus any already stored on the cheque. */
function chequeFieldsFor(bankId, extra = null) {
  const m = new Map();
  const forms = (S.chq?.forms || []).filter((f) => !bankId || f.bank_id === bankId);
  for (const f of [...forms.filter((x) => x.is_default), ...forms]) for (const v of Object.values(f.layout?.items || {})) if (v && v.show !== false && v.field?.key && !m.has(v.field.key)) m.set(v.field.key, v.field);
  for (const [k, v] of Object.entries(extra || {})) if (!m.has(k)) m.set(k, { key: k, label: v?.label || k, type: 'text' });
  return [...m.values()];
}
/** Cheque row + names used by "data in the system" items (account / bank). */
const withNames = (c) => ({ ...c, account_name: accName(c.account_id), bank_name: S.chq.banks.find((b) => b.id === c.bank_id)?.name || '' });
/** Picture of the bank's blank cheque (admin may replace it), used behind the layout on screen only. */
const chequeBg = (bankId) => { const b = S.chq.banks.find((x) => x.id === bankId); return b?.bg_image || BANK_BG[b?.code] || null; };
const SHOW_BG_KEY = 'chq.preview.bg';
const prefShowBg = () => { try { return localStorage.getItem(SHOW_BG_KEY) !== '0'; } catch { return true; } };
const formCross = (f) => f?.crossing || 'both';
const formTag = (f) => `${bankName(f.bank_id)} · ${CROSS_LABEL[formCross(f)]}`;
/** Default form for a bank (and crossing): exact type first, then a form usable for both, then any form of that bank. */
const defaultFormFor = (bankId, crossing) => {
  const fs = S.chq.forms.filter((f) => f.bank_id === bankId);
  const fits = (f) => !crossing || formCross(f) === crossing || formCross(f) === 'both';
  return fs.find((f) => f.is_default && formCross(f) === crossing) || fs.find((f) => f.is_default && fits(f))
    || fs.find((f) => formCross(f) === crossing) || fs.find(fits) || (crossing ? null : fs[0]) || null;
};
/** Layout of a form (or the Access-style standard when there is no form). */
const formLayout = (form, bankId, crossing) => resolveChequeLayout(form?.layout || null, form?.bank_id ?? bankId,
  form && formCross(form) !== 'both' ? formCross(form) : crossing);
const fiscalYearRange = () => { const d = bkkDate(); const y = Number(d.slice(0, 4)); const start = Number(d.slice(5, 7)) >= 10 ? y : y - 1; return [`${start}-10-01`, `${start + 1}-09-30`]; };

// =====================================================================
//  ออกเช็ค / ทะเบียนเช็ค / พิมพ์เช็ค
// =====================================================================
async function viewChequeRegister() {
  await loadChequeRefs();
  const today = bkkDate();
  S.chq.reg = S.chq.reg || { from: today.slice(0, 8) + '01', to: today, account: '', bank: '', status: 'normal', q: '', page: 0, size: 100, selected: new Map() };
  const R = S.chq.reg;
  $('#topbar-right').innerHTML = '<button class="btn btn-gold" id="c-new">+ ออกเช็คใหม่</button>';
  view().innerHTML = `
  <div class="card">
    <div class="toolbar">
      <label>ตั้งแต่วันที่<input type="date" id="q-from" value="${R.from}"></label>
      <label>ถึงวันที่<input type="date" id="q-to" value="${R.to}"></label>
      <div style="display:flex;gap:6px"><button class="btn btn-sm" data-q="today">วันนี้</button><button class="btn btn-sm" data-q="month">เดือนนี้</button><button class="btn btn-sm" data-q="fy">ปีงบประมาณนี้</button><button class="btn btn-sm" data-q="all">ทั้งหมด</button></div>
      <label>บัญชี<select id="q-acc"><option value="">ทุกบัญชี</option>${S.chq.accounts.map((a) => opt(a.id, a.name, R.account)).join('')}</select></label>
      <label>ธนาคาร<select id="q-bank"><option value="">ทุกธนาคาร</option>${S.chq.banks.map((b) => opt(b.id, b.short_name || b.name, R.bank)).join('')}</select></label>
      <label>สถานะ<select id="q-status">${[['normal', 'ปกติ'], ['cancelled', 'ยกเลิก'], ['', 'ทั้งหมด']].map(([v, l]) => opt(v, l, R.status)).join('')}</select></label>
      <label class="grow">ค้นหา<input id="q-q" value="${esc(R.q)}" placeholder="เลขที่เช็ค / จ่าย / รายการ"></label>
    </div>
    <div class="table-wrap" style="max-height:60vh"><table>
      <thead><tr><th style="width:36px"><input type="checkbox" id="q-all"></th><th>เลขที่เช็ค</th><th>วันที่</th><th>จ่าย</th><th class="r">จำนวนเงิน</th><th>บัญชี / ธนาคาร</th><th>ประเภท</th><th>พิมพ์</th><th></th></tr></thead>
      <tbody id="q-body"><tr><td colspan="9" class="empty">กำลังโหลด...</td></tr></tbody></table></div>
    <div class="pager" id="q-pager"></div>
    <div class="sticky-actions">
      <b id="q-sel">เลือก 0 ฉบับ</b><span class="muted" id="q-sum"></span>
      <span class="spacer"></span>
      <button class="btn btn-sm" id="q-clear">ล้างที่เลือก</button>
      <button class="btn btn-primary" id="q-print">🖨️ พิมพ์เช็คที่เลือก</button>
    </div>
  </div>`;

  const load = async () => {
    R.from = $('#q-from').value; R.to = $('#q-to').value; R.account = $('#q-acc').value; R.bank = $('#q-bank').value; R.status = $('#q-status').value; R.q = $('#q-q').value;
    let qb = S.sb.from('cheques').select('*', { count: 'exact' });
    if (R.from) qb = qb.gte('cheque_date', R.from);
    if (R.to) qb = qb.lte('cheque_date', R.to);
    if (R.account) qb = qb.eq('account_id', Number(R.account));
    if (R.bank) qb = qb.eq('bank_id', Number(R.bank));
    if (R.status) qb = qb.eq('status', R.status);
    const t = clean(R.q); if (t) qb = qb.or(`cheque_no.ilike.%${t}%,payee.ilike.%${t}%,detail.ilike.%${t}%`);
    try {
      const { data, count } = await mustCount(qb.order('cheque_date', { ascending: false }).order('cheque_no', { ascending: false }).range(R.page * R.size, R.page * R.size + R.size - 1));
      R.rows = data; paint(); pager('#q-pager', R, count, load);
    } catch (e) { $('#q-body').innerHTML = `<tr><td colspan="9" class="empty">${esc(thaiError(e))}</td></tr>`; }
  };
  const paint = () => {
    $('#q-body').innerHTML = R.rows.length ? R.rows.map((c) => `
      <tr data-id="${c.id}" class="${c.status === 'cancelled' ? 'cancelled' : ''}${R.selected.has(c.id) ? ' selected' : ''}">
        <td class="no-strike"><input type="checkbox" ${R.selected.has(c.id) ? 'checked' : ''} ${c.status === 'cancelled' ? 'disabled' : ''}></td>
        <td class="num">${esc(c.cheque_no)}${c.book_no ? `<div class="muted" style="font-size:16px">เล่ม ${esc(c.book_no)}</div>` : ''}</td>
        <td style="white-space:nowrap">${thDate(c.cheque_date)}</td>
        <td><b>${esc(c.payee)}</b>${c.detail ? `<div class="muted" style="font-size:17px">${esc(c.detail)}</div>` : ''}${c.cancel_reason ? `<div class="muted" style="font-size:17px">ยกเลิก: ${esc(c.cancel_reason)}</div>` : ''}</td>
        <td class="amt"><b>${money(c.amount)}</b></td>
        <td style="font-size:17px">${esc(accName(c.account_id))}<div class="muted">${esc(bankName(c.bank_id))}</div></td>
        <td class="no-strike">${crossBadge(c.crossing)}</td>
        <td class="no-strike">${c.status === 'cancelled' ? '<span class="badge b-cancelled">ยกเลิก</span>' : c.print_count ? `<span class="badge b-printed">พิมพ์แล้ว${c.print_count > 1 ? ` ×${c.print_count}` : ''}</span>` : '<span class="badge b-issued">ยังไม่พิมพ์</span>'}</td>
        <td class="actions no-strike">${c.status === 'normal' ? `
          <button class="btn btn-sm btn-icon" data-act="print" title="พิมพ์เช็คนี้">🖨️</button>
          <button class="btn btn-sm btn-icon" data-act="edit" title="แก้ไข">✎</button>` : ''}
          <button class="btn btn-sm btn-icon" data-act="copy" title="ออกเช็คใหม่จากข้อมูลนี้">⧉</button>
          ${c.status === 'normal' ? '<button class="btn btn-sm btn-icon btn-danger" data-act="cancel" title="ยกเลิกเช็ค">✕</button>' : ''}</td>
      </tr>`).join('') : '<tr><td colspan="9" class="empty">ไม่พบเช็คในเงื่อนไขนี้ — กด "+ ออกเช็คใหม่"</td></tr>';
    const sel = [...R.selected.values()];
    $('#q-sel').textContent = `เลือก ${sel.length} ฉบับ`;
    $('#q-sum').textContent = sel.length ? `รวม ${money(sel.reduce((t, c) => t + Number(c.amount), 0))} บาท` : '';
    $('#q-print').disabled = !sel.length;
    const selectable = R.rows.filter((c) => c.status === 'normal');
    $('#q-all').checked = selectable.length > 0 && selectable.every((c) => R.selected.has(c.id));
  };

  ['#q-from', '#q-to', '#q-acc', '#q-bank', '#q-status'].forEach((s) => $(s).addEventListener('change', () => { R.page = 0; load(); }));
  $('#q-q').addEventListener('input', debounce(() => { R.page = 0; load(); }, 350));
  $$('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const q = b.dataset.q;
    if (q === 'today') { $('#q-from').value = today; $('#q-to').value = today; }
    if (q === 'month') { $('#q-from').value = today.slice(0, 8) + '01'; $('#q-to').value = today; }
    if (q === 'fy') { const [a, z] = fiscalYearRange(); $('#q-from').value = a; $('#q-to').value = z; }
    if (q === 'all') { $('#q-from').value = ''; $('#q-to').value = ''; }
    R.page = 0; load();
  }));
  $('#q-all').addEventListener('change', (e) => { R.rows.filter((c) => c.status === 'normal').forEach((c) => (e.target.checked ? R.selected.set(c.id, c) : R.selected.delete(c.id))); paint(); });
  $('#q-clear').addEventListener('click', () => { R.selected.clear(); paint(); });
  $('#q-print').addEventListener('click', async () => { if (await printCheques([...R.selected.values()])) { R.selected.clear(); } load(); });
  $('#c-new').addEventListener('click', async () => { const row = await chequeForm(null); if (row) { await afterChequeSaved(row); load(); } });
  $('#q-body').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const c = R.rows.find((x) => x.id === Number(tr.dataset.id));
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'print') { await printCheques([c]); return load(); }
    if (act === 'edit') { if (await chequeForm(c)) load(); return; }
    if (act === 'copy') { const row = await chequeForm({ ...c, id: undefined, cheque_no: '', status: 'normal' }, true); if (row) { await afterChequeSaved(row); load(); } return; }
    if (act === 'cancel') { if (await cancelCheque(c)) { R.selected.delete(c.id); load(); } return; }
    if (c.status !== 'normal') return;
    R.selected.has(c.id) ? R.selected.delete(c.id) : R.selected.set(c.id, c);
    paint();
  });
  load();
}

async function afterChequeSaved(row) {
  const r = await Swal.fire({
    icon: 'success', title: `บันทึกเช็คเลขที่ ${esc(row.cheque_no)} แล้ว`,
    html: `จ่าย <b>${esc(row.payee)}</b><br>จำนวนเงิน <b>${money(row.amount)}</b> บาท<br><span class="muted">(${esc(bahtText(row.amount))})</span>`,
    showCancelButton: true, confirmButtonText: '🖨️ พิมพ์เช็คนี้เลย', cancelButtonText: 'ไว้ทีหลัง', reverseButtons: true,
  });
  if (r.isConfirmed) await printCheques([row]);
}

async function suggestNextNo(accountId, bankId, bookNo) {
  let qb = S.sb.from('cheques').select('cheque_no').eq('account_id', accountId);
  if (bankId) qb = qb.eq('bank_id', bankId);
  if (bookNo) qb = qb.eq('book_no', bookNo);
  const rows = await must(qb.order('created_at', { ascending: false }).order('cheque_no', { ascending: false }).limit(1));
  const last = rows[0]?.cheque_no;
  if (!last || !/^\d+$/.test(last)) return '';
  return String(Number(last) + 1).padStart(last.length, '0');
}

async function chequeForm(c, isCopy = false) {
  const isNew = !c?.id;
  c = c || { account_id: S.chq.accounts.find((a) => a.active)?.id, cheque_date: bkkDate(), crossing: lastCrossing(), amount: '' };
  if (isNew && !c.bank_id) c.bank_id = S.chq.accounts.find((a) => a.id === c.account_id)?.bank_id || 2;
  if (isNew) c.crossing = c.crossing || lastCrossing();
  const payees = await must(S.sb.from('cheques').select('payee').order('created_at', { ascending: false }).limit(400)).catch(() => []);
  const uniq = [...new Set(payees.map((p) => p.payee).filter(Boolean))].slice(0, 200);
  const r = await Swal.fire({
    title: isNew ? (isCopy ? 'ออกเช็คใหม่ (จากข้อมูลเดิม)' : 'ออกเช็คใหม่') : `แก้ไขเช็คเลขที่ ${esc(c.cheque_no)}`, width: 780, focusConfirm: false,
    html: `<div class="swal-form">
      <label>บัญชี<select id="cf-acc">${S.chq.accounts.filter((a) => a.active || a.id === c.account_id).map((a) => opt(a.id, a.name, c.account_id)).join('')}</select></label>
      <label>ธนาคาร<select id="cf-bank">${S.chq.banks.filter((b) => b.active || b.id === c.bank_id).map((b) => opt(b.id, b.name, c.bank_id)).join('')}</select></label>
      <label>เล่มที่<input id="cf-book" value="${esc(c.book_no || '')}" placeholder="เช่น 1/2569"></label>
      <label>เลขที่เช็ค *<input id="cf-no" value="${esc(c.cheque_no || '')}" inputmode="numeric" placeholder="เช่น 10237271"></label>
      <label>วันที่ในเช็ค *<input id="cf-date" type="date" value="${esc(String(c.cheque_date || '').slice(0, 10))}"></label>
      <label>จำนวนเงิน (บาท) *<input id="cf-amt" type="number" step="0.01" min="0" value="${c.amount === '' ? '' : Number(c.amount)}" placeholder="0.00"></label>
      <div class="full chq-words" id="cf-words"></div>
      <label class="full">จ่าย (ชื่อผู้รับเงิน) *<input id="cf-payee" list="cf-payees" value="${esc(c.payee || '')}"><datalist id="cf-payees">${uniq.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label class="full">รายการ / รายละเอียด<textarea id="cf-detail" rows="2">${esc(c.detail || '')}</textarea></label>
      <div class="full"><span class="muted" style="font-size:18px">ประเภทเช็ค</span><div class="seg" style="display:flex">${Object.entries(CROSS).map(([k, l]) => `<label style="flex:1"><input type="radio" name="cf-cross" value="${k}" ${c.crossing === k ? 'checked' : ''}><span style="text-align:center">${l}</span></label>`).join('')}</div></div>
      <div class="full" id="cf-extra"></div>
      <div class="full" id="cf-budget" style="display:none"><div class="swal-form" style="border:1px dashed var(--line);border-radius:10px;padding:10px">
        <b class="full" style="color:var(--navy)">ข้อมูลเงินงบประมาณ</b>
        <label>ปีงบประมาณ<input id="cf-fy" value="${esc(c.fiscal_year || '')}"></label><label>รหัสแหล่งเงิน<input id="cf-src" value="${esc(c.budget_source || '')}"></label>
        <label>รหัสกิจกรรม<input id="cf-act" value="${esc(c.activity_code || '')}"></label><label>เลขที่ฎีกา<input id="cf-bill" value="${esc(c.bill_no || '')}"></label>
        <label>รหัสงาน<input id="cf-job" value="${esc(c.job_no || '')}"></label><label>ยอดงบประมาณ<input id="cf-bsum" type="number" step="0.01" value="${c.budget_total ?? ''}"></label></div></div>
    </div>`,
    showCancelButton: true, confirmButtonText: 'บันทึกเช็ค', cancelButtonText: 'ยกเลิก', reverseButtons: true,
    didOpen: () => {
      const words = () => { const v = $('#cf-amt').value; $('#cf-words').innerHTML = v === '' ? '<span class="muted">จำนวนเงินตัวอักษรจะแสดงที่นี่</span>' : `(${esc(bahtText(v))})`; };
      const budget = () => { $('#cf-budget').style.display = accCode(Number($('#cf-acc').value)) === 'budget' ? '' : 'none'; };
      const next = async () => {
        if (!isNew) return;
        const n = await suggestNextNo(Number($('#cf-acc').value), Number($('#cf-bank').value), val('cf-book')).catch(() => '');
        if (n && (!$('#cf-no').value || $('#cf-no').dataset.auto)) { $('#cf-no').value = n; $('#cf-no').dataset.auto = '1'; }
      };
      $('#cf-amt').addEventListener('input', words);
      $('#cf-no').addEventListener('input', () => { delete $('#cf-no').dataset.auto; });
      $('#cf-acc').addEventListener('change', () => { const a = S.chq.accounts.find((x) => x.id === Number($('#cf-acc').value)); if (a?.bank_id && isNew) $('#cf-bank').value = a.bank_id; budget(); next(); });
      const extra = () => {
        const fs = chequeFieldsFor(Number($('#cf-bank').value), c.extra);
        const keep = {}; $$('#cf-extra [data-xf]').forEach((i) => { keep[i.dataset.xf] = i.value; });
        $('#cf-extra').innerHTML = fs.length ? `<div class="chq-extra"><b>ข้อมูลเพิ่มเติม</b> <span class="muted" style="font-size:16px">(ช่องที่กำหนดในแบบฟอร์มเช็คของ${esc(bankName(Number($('#cf-bank').value)))})</span><div class="swal-form" style="margin-top:6px">${fs.map((f) => {
          const v = keep[f.key] ?? (c.extra?.[f.key] && typeof c.extra[f.key] === 'object' ? c.extra[f.key].value : c.extra?.[f.key]) ?? (isNew ? f.def || '' : '');
          const type = f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'money' ? 'number' : 'text';
          return `<label>${esc(f.label)}${f.required ? ' *' : ''}<input data-xf="${esc(f.key)}" data-label="${esc(f.label)}" data-req="${f.required ? 1 : ''}" type="${type}" ${f.type === 'money' ? 'step="0.01"' : ''} value="${esc(v ?? '')}"></label>`;
        }).join('')}</div></div>` : '';
      };
      $('#cf-bank').addEventListener('change', () => { next(); extra(); }); $('#cf-book').addEventListener('change', next);
      $('#cf-acc').addEventListener('change', extra);
      words(); budget(); next(); extra();
    },
    preConfirm: async () => {
      const d = {
        account_id: Number(val('cf-acc')), bank_id: Number(val('cf-bank')) || null, book_no: val('cf-book') || null, cheque_no: val('cf-no'),
        cheque_date: val('cf-date'), payee: val('cf-payee'), amount: Number(val('cf-amt')), detail: val('cf-detail') || null,
        crossing: $('input[name="cf-cross"]:checked')?.value || null,
        fiscal_year: val('cf-fy') || null, budget_source: val('cf-src') || null, activity_code: val('cf-act') || null, bill_no: val('cf-bill') || null, job_no: val('cf-job') || null,
        budget_total: val('cf-bsum') === '' ? null : Number(val('cf-bsum')),
      };
      if (!d.cheque_no) return Swal.showValidationMessage('กรุณากรอกเลขที่เช็ค');
      if (!d.cheque_date) return Swal.showValidationMessage('กรุณาเลือกวันที่ในเช็ค');
      if (!d.payee) return Swal.showValidationMessage('กรุณากรอกชื่อผู้รับเงิน');
      if (!(d.amount > 0)) return Swal.showValidationMessage('จำนวนเงินต้องมากกว่า 0');
      if (!d.crossing) return Swal.showValidationMessage('กรุณาเลือกประเภทเช็ค AC หรือ Non-AC');
      const ex = { ...(c.extra || {}) };
      for (const i of $$('#cf-extra [data-xf]')) {
        if (i.dataset.req && !i.value.trim()) return Swal.showValidationMessage(`กรุณากรอก "${i.dataset.label}"`);
        ex[i.dataset.xf] = { label: i.dataset.label, value: i.value.trim() };
      }
      d.extra = Object.keys(ex).length ? ex : null;
      return d;
    },
  });
  if (!r.isConfirmed) return null;
  const d = r.value;
  try {
    let dupQ = S.sb.from('cheques').select('id').eq('cheque_no', d.cheque_no).eq('status', 'normal');
    if (d.bank_id) dupQ = dupQ.eq('bank_id', d.bank_id);
    const dup = (await must(dupQ.limit(5))).filter((x) => x.id !== c.id);
    if (dup.length && !(await ask('เลขที่เช็คซ้ำ', `มีเช็คเลขที่ <b>${esc(d.cheque_no)}</b> ของธนาคารนี้อยู่แล้ว ${dup.length} ฉบับ<br>ต้องการบันทึกต่อหรือไม่?`, { icon: 'warning', confirmButtonText: 'บันทึกต่อ' }))) return null;
    saveLastCrossing(d.crossing);
    const row = isNew
      ? await must(S.sb.from('cheques').insert({ ...d, created_by: S.profile.id, created_by_name: S.profile.full_name || S.profile.email }).select().single())
      : await must(S.sb.from('cheques').update(d).eq('id', c.id).select().single());
    if (!isNew) ok('บันทึกแล้ว');
    return row;
  } catch (e) { fail(e); return null; }
}

async function cancelCheque(c) {
  const res = await Swal.fire({
    icon: 'warning', title: `ยกเลิกเช็คเลขที่ ${esc(c.cheque_no)}?`, html: `จ่าย ${esc(c.payee)} · ${money(c.amount)} บาท`,
    input: 'text', inputLabel: 'เหตุผลการยกเลิก', inputPlaceholder: 'เช่น เขียนผิด / ผู้รับไม่มารับ', showCancelButton: true,
    confirmButtonText: 'ยกเลิกเช็คนี้', cancelButtonText: 'ปิด', confirmButtonColor: '#c0392b', reverseButtons: true,
    inputValidator: (v) => (!v.trim() ? 'กรุณาระบุเหตุผล' : undefined),
  });
  if (!res.isConfirmed) return false;
  try { await must(S.sb.rpc('cancel_cheque', { p_id: c.id, p_reason: res.value })); ok('ยกเลิกเช็คแล้ว'); return true; } catch (e) { fail(e); return false; }
}

// ---------------------------------------------------------------------
//  Print cheques: real-size preview (choose form + AC / Non-AC) → print
// ---------------------------------------------------------------------
async function printCheques(rows) {
  rows = (rows || []).filter((c) => c.status === 'normal');
  if (!rows.length) { warn('ไม่มีเช็คที่พิมพ์ได้'); return false; }
  if (!S.chq?.forms) await loadChequeRefs();
  const banks = [...new Set(rows.map((c) => c.bank_id || 0))];
  if (banks.length > 1) { warn('กรุณาเลือกเช็คของธนาคารเดียวกันในการพิมพ์แต่ละครั้ง'); return false; }
  const choice = await chequePreview(rows);
  if (!choice) return false;
  await printDocument(rows.map((c) => renderCheque(withNames(c), choice.layout, { crossing: choice.crossing })).join(''), chequePageCss(choice.layout));
  saveLastCrossing(choice.crossing);
  const res = await Swal.fire({
    icon: 'question', title: 'พิมพ์เช็คเรียบร้อยหรือไม่?',
    html: `${rows.length} ฉบับ · ${CROSS[choice.crossing]}<br><span class="muted" style="font-size:19px">กด "พิมพ์เรียบร้อย" เพื่อบันทึกประวัติการพิมพ์</span>`,
    showCancelButton: true, confirmButtonText: 'พิมพ์เรียบร้อย', cancelButtonText: 'ยังไม่ได้พิมพ์', reverseButtons: true,
  });
  if (!res.isConfirmed) return false;
  try {
    await must(S.sb.rpc('mark_cheques_printed', { p_ids: rows.map((c) => c.id), p_form_id: choice.form?.id || null, p_crossing: choice.crossing }));
    ok(`บันทึกการพิมพ์ ${rows.length} ฉบับแล้ว`); return true;
  } catch (e) { fail(e); return false; }
}

function chequePreview(rows, opts = {}) {
  return new Promise((resolve) => {
    const bankId = rows[0].bank_id;
    const forms = [...S.chq.forms].sort((a, b) => (b.bank_id === bankId) - (a.bank_id === bankId));
    const crossings = [...new Set(rows.map((c) => c.crossing).filter(Boolean))];
    let crossing = opts.crossing || (crossings.length === 1 ? crossings[0] : lastCrossing());
    let form = opts.form || defaultFormFor(bankId, crossing) || null;
    const el = document.createElement('div');
    el.className = 'rsp';
    const formOpts = () => (forms.length ? forms.map((f) => `<option value="${f.id}" ${form?.id === f.id ? 'selected' : ''}>${esc(f.name)} · ${esc(formTag(f))}${f.is_default ? ' ★' : ''}</option>`).join('') : '')
      + `<option value="" ${form ? '' : 'selected'}>แบบมาตรฐาน (ตามเช็คจริง) ของ${esc(bankName(bankId))}</option>`;
    el.innerHTML = `
      <div class="rsp-bar">
        <h2>ตัวอย่างก่อนพิมพ์เช็ค — ขนาดจริง</h2>
        <b>241.3 × 88.9 มม.</b><span class="muted">(9.5" × 3.5")</span>
        <label style="margin:0">แบบฟอร์ม<select id="cp-form" style="width:auto;min-width:220px">${formOpts()}</select></label>
        <div class="seg">${Object.entries({ ac: 'AC', nonac: 'Non-AC' }).map(([k, l]) => `<label><input type="radio" name="cp-cross" value="${k}" ${crossing === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <label style="margin:0;display:flex;gap:6px;align-items:center;white-space:nowrap" title="ภาพเช็คแสดงบนหน้าจอเท่านั้น ไม่ถูกพิมพ์"><input type="checkbox" id="cp-bg" ${prefShowBg() ? 'checked' : ''} style="width:auto"> แสดงภาพเช็ค</label>
        <span class="spacer"></span>
        <div class="seg"><label><input type="radio" name="rsp-z" value="1" checked><span>ขนาดจริง 100%</span></label><label><input type="radio" name="rsp-z" value="fit"><span>พอดีหน้าจอ</span></label></div>
        <button class="btn" data-x="cancel">ยกเลิก</button>
        <button class="btn btn-primary" data-x="print">🖨️ พิมพ์ ${rows.length} ฉบับ</button>
      </div>
      <div class="rsp-body"></div>
      <div class="rsp-foot">
        <div class="tips">ในหน้าต่างพิมพ์ของเบราว์เซอร์: เลือก<b>เครื่องพิมพ์จริง</b> (ไม่ใช่ PDF) · ขนาดกระดาษ <b>9.5 × 3.5 นิ้ว</b> · ขอบ <b>ไม่มี</b> · มาตราส่วน <b>100%</b> · ป้อนเช็คตามแนวที่ตั้งไว้ในแบบฟอร์ม</div>
        <a href="#" data-x="guide">วิธีพิมพ์ตรงไปที่เครื่องพิมพ์ทันที (ไม่ต้องผ่านหน้าต่างพิมพ์)</a>
        <a href="#chq-forms" data-x="forms">ตั้งค่าแบบฟอร์มเช็ค</a>
      </div>`;
    const body = $('.rsp-body', el);
    const layout = () => formLayout(form, bankId, crossing);
    const paint = () => {
      const L = layout(); const pg = chequePage(L);
      const mismatch = form && bankId && form.bank_id !== bankId;
      const crossMismatch = form && formCross(form) !== 'both' && formCross(form) !== crossing;
      body.innerHTML = (!form ? `<div class="rsp-cap" style="color:#ffd27a">ใช้แบบมาตรฐาน (ตามเช็คจริง) ของ${esc(bankName(bankId))} ${crossing === 'ac' ? 'A/C' : 'Non-AC'} — ปรับ/บันทึกเป็นแบบของคุณได้ที่ "ตั้งค่าแบบฟอร์มเช็ค"</div>` : '')
        + (crossMismatch ? `<div class="rsp-cap" style="color:#ffd27a;font-size:20px">⚠️ แบบฟอร์มที่เลือกเป็นแบบ ${CROSS_LABEL[formCross(form)]} แต่กำลังพิมพ์แบบ ${CROSS_LABEL[crossing]}</div>` : '')
        + (mismatch ? `<div class="rsp-cap" style="color:#ffd27a;font-size:20px">⚠️ เช็คเป็นของ${esc(bankName(bankId))} แต่แบบฟอร์มที่เลือกเป็นของ${esc(bankName(form.bank_id))} — ตรวจสอบตำแหน่งก่อนพิมพ์ หรือสร้างแบบฟอร์มของ${esc(bankName(bankId))}</div>` : '')
        + rows.slice(0, 30).map((c, i) => `
        <div class="rsp-wrap"><div class="rsp-cap"><span>ฉบับที่ ${i + 1} / ${rows.length} · เลขที่ ${esc(c.cheque_no)}</span><span>${esc(c.payee)} · ${money(c.amount)} บาท</span></div>
          <div class="rsp-page" style="width:${pg.w}mm"><div class="rsp-ruler"></div>${renderCheque(withNames(c), L, { crossing, showBg: prefShowBg(), bgDefault: chequeBg(form?.bank_id ?? bankId) })}
          <div class="rsp-dim-w">${pg.w.toFixed(1)} มม.</div><div class="rsp-dim-h">${pg.h.toFixed(1)} มม.</div></div></div>`).join('')
        + (rows.length > 30 ? `<div class="rsp-cap">… และอีก ${rows.length - 30} ฉบับ (พิมพ์ครบทุกฉบับ)</div>` : '');
      document.fonts.ready.then(() => fitEnvelopeText(body));
    };
    document.body.appendChild(el);
    paint();
    const close = (v) => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('change', (e) => {
      if (e.target.id === 'cp-form') { form = forms.find((f) => f.id === Number(e.target.value)) || null; paint(); }
      if (e.target.id === 'cp-bg') { try { localStorage.setItem(SHOW_BG_KEY, e.target.checked ? '1' : '0'); } catch { /* ignore */ } paint(); }
      if (e.target.name === 'cp-cross') {
        crossing = e.target.value;
        // switch to this user's form for the chosen type (or the standard one) unless the current form fits both
        if (!opts.form && (!form || formCross(form) !== 'both')) { form = defaultFormFor(bankId, crossing) || (form && formCross(form) === crossing ? form : null); $('#cp-form', el).innerHTML = formOpts(); }
        paint();
      }
      if (e.target.name === 'rsp-z') {
        const L = layout(); const pg = chequePage(L);
        const k = e.target.value === 'fit' ? Math.min(1, (body.clientWidth - 90) / (pg.w * 3.7795)) : 1;
        $$('.rsp-wrap', body).forEach((p) => { p.style.zoom = k; });
      }
    });
    el.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'cancel') close(null);
      if (x === 'print') close({ form, layout: layout(), crossing });
      if (x === 'guide') { e.preventDefault(); directPrintGuide(); }
      if (x === 'forms') close(null);
    });
  });
}

// =====================================================================
//  ตั้งค่าแบบฟอร์มเช็ค — per-user named forms, copy from other users
// =====================================================================
const CHQ_PX = 3.7795;
async function viewChequeForms() {
  await loadChequeRefs();
  S.cf = S.cf || { formId: null, draft: null, dirty: false, sel: null, cross: 'ac' };
  const F = S.cf;
  const mine = () => S.chq.forms;
  if (!mine().some((f) => f.id === F.formId)) { F.formId = (mine().find((f) => f.is_default) || mine()[0])?.id || null; F.draft = null; F.dirty = false; }
  const cur = () => mine().find((f) => f.id === F.formId) || null;
  const bankByCode = (code) => S.chq.banks.find((b) => b.code === code);
  const stdName = (p) => `แบบเช็คจริง ${p.label}`;
  const missingStd = () => Object.values(CHEQUE_PRESETS).filter((p) => bankByCode(p.bank) && !mine().some((f) => f.name === stdName(p)));
  const clearDefault = (bankId, crossing) => must(S.sb.from('cheque_forms').update({ is_default: false }).eq('user_id', S.profile.id).eq('bank_id', bankId).eq('crossing', crossing));
  if (cur() && !F.draft) F.draft = formLayout(cur());

  view().innerHTML = `
  <div class="card" style="margin-bottom:16px"><div class="toolbar" style="margin:0;align-items:center">
    <label style="min-width:320px">แบบฟอร์มของฉัน<select id="cf-sel">${mine().length ? mine().map((f) => `<option value="${f.id}" ${f.id === F.formId ? 'selected' : ''}>${esc(f.name)} · ${esc(formTag(f))}${f.is_default ? ' ★ ค่าเริ่มต้น' : ''}</option>`).join('') : '<option>— ยังไม่มีแบบฟอร์ม —</option>'}</select></label>
    <button class="btn btn-gold" id="cf-new">+ สร้างแบบฟอร์มใหม่</button>
    ${missingStd().length ? `<button class="btn btn-primary" id="cf-std" title="กรุงไทย/กสิกรไทย × A/C/Non-AC วางตามเช็คจริง">⭐ สร้างแบบมาตรฐานตามเช็คจริง (${missingStd().length} แบบ)</button>` : ''}
    ${cur() ? `<button class="btn" id="cf-rename">เปลี่ยนชื่อ</button>
    <button class="btn" id="cf-default" ${cur().is_default ? 'disabled' : ''}>★ ตั้งเป็นแบบเริ่มต้นของ${esc(formTag(cur()))}</button>
    <button class="btn btn-danger" id="cf-del">ลบแบบนี้</button>` : ''}
  </div></div>
  <div id="cf-editor"></div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>แบบฟอร์มของผู้ใช้อื่น — คัดลอกมาใช้งานได้</h3></div>
    <p class="muted" style="margin-top:0;font-size:18px">การคัดลอกจะสร้างแบบฟอร์มใหม่เป็นของคุณเอง แก้ไขได้อิสระ แม้เจ้าของเดิมจะแก้ไขหรือลบแบบของเขา ก็ไม่กระทบแบบที่คุณคัดลอกไว้</p>
    <div id="cf-others"><div class="empty">กำลังโหลด...</div></div></div>`;

  // ---------- toolbar actions ----------
  const guardDirty = async () => !F.dirty || ask('มีการแก้ไขที่ยังไม่บันทึก', 'ต้องการทิ้งการแก้ไขหรือไม่?', { icon: 'warning', confirmButtonText: 'ทิ้งการแก้ไข' });
  $('#cf-sel').addEventListener('change', async (e) => {
    if (!(await guardDirty())) { e.target.value = F.formId; return; }
    F.formId = Number(e.target.value); F.draft = formLayout(cur()); F.dirty = false; F.sel = null; route();
  });
  $('#cf-new').addEventListener('click', async () => {
    if (!(await guardDirty())) return;
    const r = await Swal.fire({
      title: 'สร้างแบบฟอร์มเช็คใหม่', focusConfirm: false,
      html: `<div class="swal-form">
        <label class="full">ชื่อแบบฟอร์ม<input id="nf-name" placeholder="เช่น กรุงไทย เครื่อง Epson ห้องการเงิน"></label>
        <label>ธนาคาร<select id="nf-bank">${S.chq.banks.filter((b) => b.active).map((b) => opt(b.id, b.name, 2)).join('')}</select></label>
        <label>ใช้กับเช็คแบบ<select id="nf-cross">${opt('ac', 'A/C (ขีดคร่อม A/C Payee Only)', 'ac')}${opt('nonac', 'Non-AC', 'ac')}${opt('both', 'ใช้ได้ทั้ง AC และ Non-AC', 'ac')}</select></label>
        <label class="full">เริ่มจาก<select id="nf-from"><option value="real">แบบมาตรฐานตามเช็คจริง ของธนาคาร/ชนิดที่เลือก</option><option value="access">แบบตามรายงานเดิม (Access) ของธนาคาร/ชนิดที่เลือก</option>${mine().map((f) => `<option value="${f.id}">สำเนาจาก: ${esc(f.name)} · ${esc(formTag(f))}</option>`).join('')}</select></label></div>`,
      showCancelButton: true, confirmButtonText: 'สร้าง', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      preConfirm: () => (val('nf-name') ? { name: val('nf-name'), bank_id: Number(val('nf-bank')), crossing: val('nf-cross'), from: Number(val('nf-from')) || null, source: val('nf-from') === 'access' ? 'access' : 'real' } : Swal.showValidationMessage('กรุณาตั้งชื่อแบบฟอร์ม')),
    });
    if (!r.isConfirmed) return;
    try {
      const src = mine().find((f) => f.id === r.value.from); const { bank_id, crossing } = r.value;
      const row = await must(S.sb.from('cheque_forms').insert({
        user_id: S.profile.id, user_name: S.profile.full_name || S.profile.email, bank_id, crossing, name: r.value.name,
        layout: src ? src.layout : defaultChequeLayout(bank_id, crossing === 'nonac' ? 'nonac' : 'ac', r.value.source),
        is_default: !mine().some((f) => f.bank_id === bank_id && formCross(f) === crossing && f.is_default),
      }).select().single());
      F.formId = row.id; F.draft = null; F.dirty = false; ok('สร้างแบบฟอร์มแล้ว'); route();
    } catch (e) { fail(e); }
  });
  $('#cf-std')?.addEventListener('click', async () => {
    if (!(await guardDirty())) return;
    const list = missingStd();
    const r = await Swal.fire({ title: 'สร้างแบบมาตรฐานตามเช็คจริง?', icon: 'question', focusConfirm: false,
      html: `จะสร้างแบบฟอร์มของคุณ ${list.length} แบบ:<br><b>${list.map((p) => esc(stdName(p))).join('<br>')}</b>
        <br><span class="muted">ข้อความวางบนเส้น/ช่องของเช็คจริงทั้งแผ่น 9.5" × 3.5" (รวมต้นขั้ว) — ปรับเพิ่มได้ภายหลัง</span>
        <label style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px"><input type="checkbox" id="std-def" checked style="width:auto"> ตั้งเป็นแบบเริ่มต้น (แทนแบบเริ่มต้นเดิม)</label>`,
      showCancelButton: true, confirmButtonText: 'สร้าง', cancelButtonText: 'ยกเลิก', reverseButtons: true, preConfirm: () => ({ def: $('#std-def').checked }) });
    if (!r.isConfirmed) return;
    try {
      let last = null;
      for (const p of list) {
        const b = bankByCode(p.bank);
        const hasDefault = mine().some((f) => f.bank_id === b.id && formCross(f) === p.crossing && f.is_default);
        if (r.value.def && hasDefault) await clearDefault(b.id, p.crossing);
        last = await must(S.sb.from('cheque_forms').insert({
          user_id: S.profile.id, user_name: S.profile.full_name || S.profile.email, bank_id: b.id, crossing: p.crossing,
          name: stdName(p), layout: JSON.parse(JSON.stringify(p.layout)), is_default: r.value.def || !hasDefault,
        }).select().single());
      }
      F.formId = last?.id ?? F.formId; F.draft = null; F.dirty = false; ok(`สร้างแบบมาตรฐาน ${list.length} แบบแล้ว`); route();
    } catch (e) { fail(e); }
  });
  $('#cf-rename')?.addEventListener('click', async () => {
    const r = await Swal.fire({ title: 'เปลี่ยนชื่อแบบฟอร์ม', input: 'text', inputValue: cur().name, showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true, inputValidator: (v) => (!v.trim() ? 'กรุณาตั้งชื่อ' : undefined) });
    if (!r.isConfirmed) return;
    try { await must(S.sb.from('cheque_forms').update({ name: r.value.trim(), updated_at: new Date().toISOString() }).eq('id', cur().id)); ok('เปลี่ยนชื่อแล้ว'); route(); } catch (e) { fail(e); }
  });
  $('#cf-default')?.addEventListener('click', async () => {
    try {
      await clearDefault(cur().bank_id, formCross(cur()));
      await must(S.sb.from('cheque_forms').update({ is_default: true }).eq('id', cur().id));
      ok('ตั้งเป็นแบบเริ่มต้นแล้ว'); route();
    } catch (e) { fail(e); }
  });
  $('#cf-del')?.addEventListener('click', async () => {
    if (!(await ask(`ลบแบบฟอร์ม "${esc(cur().name)}"?`, '<span class="muted">ผู้ใช้อื่นที่เคยคัดลอกแบบนี้ไปแล้ว จะยังใช้สำเนาของตนได้ตามปกติ</span>', { icon: 'warning', confirmButtonColor: '#c0392b', confirmButtonText: 'ลบ' }))) return;
    try { await must(S.sb.from('cheque_forms').delete().eq('id', cur().id)); F.formId = null; F.draft = null; F.dirty = false; ok('ลบแบบฟอร์มแล้ว'); route(); } catch (e) { fail(e); }
  });

  // ---------- other users' forms ----------
  const loadOthers = async () => {
    const rows = await must(S.sb.from('cheque_forms').select('*').neq('user_id', S.profile.id).order('updated_at', { ascending: false }).limit(300));
    $('#cf-others').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>ผู้สร้าง</th><th>ชื่อแบบฟอร์ม</th><th>ธนาคาร / ชนิด</th><th>แก้ไขล่าสุด</th><th></th></tr></thead><tbody>
      ${rows.map((f) => `<tr data-id="${f.id}"><td><b>${esc(f.user_name || '')}</b></td><td>${esc(f.name)}${f.source_user_name ? `<div class="muted" style="font-size:17px">สำเนาจาก ${esc(f.source_user_name)}</div>` : ''}</td>
        <td>${esc(formTag(f))}</td><td style="white-space:nowrap">${fmtDate(f.updated_at)} ${fmtTime(f.updated_at)}</td>
        <td class="actions"><button class="btn btn-sm" data-act="view">ดู</button><button class="btn btn-sm btn-primary" data-act="copy">คัดลอกเป็นของฉัน</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">ยังไม่มีผู้ใช้อื่นสร้างแบบฟอร์มเช็ค</div>';
    $('#cf-others')._rows = rows;
  };
  $('#cf-others').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    const f = $('#cf-others')._rows.find((x) => x.id === Number(e.target.closest('tr').dataset.id));
    if (act === 'view') {
      return Swal.fire({ title: `${esc(f.name)} · ${esc(f.user_name || '')}`, width: 'min(1000px, 96vw)', confirmButtonText: 'ปิด',
        html: `<div class="preview-box">${chequeScaled(SAMPLE_CHEQUE, formLayout(f), 900, formCross(f) === 'nonac' ? 'nonac' : 'ac', true, f.bank_id)}</div>`, didOpen: (p) => fitLater(p) });
    }
    if (!(await guardDirty())) return;
    const r = await Swal.fire({
      icon: 'question', title: 'ยืนยันการคัดลอกแบบฟอร์ม', focusConfirm: false,
      html: `คัดลอกแบบ <b>"${esc(f.name)}"</b> ของ <b>${esc(f.user_name || '')}</b> (${esc(formTag(f))})<br>มาเป็นแบบฟอร์มของคุณ
        <div class="swal-form" style="margin-top:12px"><label class="full">ชื่อแบบฟอร์มของคุณ<input id="cp-name" value="${esc(`${f.name} (สำเนา)`)}"></label>
        <label class="full" style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="cp-def" ${mine().some((x) => x.bank_id === f.bank_id && formCross(x) === formCross(f) && x.is_default) ? '' : 'checked'}> ตั้งเป็นแบบเริ่มต้นของ${esc(formTag(f))}</label></div>
        <p class="muted" style="font-size:17px;margin-bottom:0">สำเนาเป็นของคุณโดยสมบูรณ์ — การแก้ไข/ลบแบบต้นฉบับจะไม่กระทบสำเนานี้</p>`,
      showCancelButton: true, confirmButtonText: 'ยืนยันคัดลอก', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      preConfirm: () => (val('cp-name') ? { name: val('cp-name'), def: $('#cp-def').checked } : Swal.showValidationMessage('กรุณาตั้งชื่อ')),
    });
    if (!r.isConfirmed) return;
    try {
      if (r.value.def) await clearDefault(f.bank_id, formCross(f));
      const row = await must(S.sb.from('cheque_forms').insert({
        user_id: S.profile.id, user_name: S.profile.full_name || S.profile.email, bank_id: f.bank_id, crossing: formCross(f), name: r.value.name,
        layout: JSON.parse(JSON.stringify(f.layout)), is_default: r.value.def,
        source_form_id: f.id, source_form_name: f.name, source_user_name: f.user_name,
      }).select().single());
      F.formId = row.id; F.draft = null; F.dirty = false; ok('คัดลอกแบบฟอร์มแล้ว'); route();
    } catch (er) { fail(er); }
  });
  loadOthers().catch((er) => { $('#cf-others').innerHTML = `<div class="empty">${esc(thaiError(er))}</div>`; });

  if (!cur()) {
    $('#cf-editor').innerHTML = `<div class="card empty" style="padding:40px">ยังไม่มีแบบฟอร์มเช็คของคุณ<br>กด <b>"⭐ สร้างแบบมาตรฐานตามเช็คจริง"</b> (กรุงไทย/กสิกรไทย × A/C/Non-AC) · <b>"+ สร้างแบบฟอร์มใหม่"</b> หรือ <b>คัดลอกแบบของผู้ใช้อื่น</b> ด้านล่าง</div>`;
    return;
  }
  chequeEditor($('#cf-editor'), F, cur);
}

function chequeScaled(c, L, maxW, crossing, editor = false, bankId = null) {
  const pg = chequePage({ ...L, feed: 'landscape' });
  const k = Math.min(1, (maxW - 16) / (pg.w * CHQ_PX));
  return `<div class="preview-frame" style="width:${pg.w * CHQ_PX * k}px;height:${pg.h * CHQ_PX * k}px"><div class="preview-scale" style="transform:scale(${k})">${renderCheque(c, { ...L, feed: 'landscape' }, { crossing, editor, bgDefault: bankId ? chequeBg(bankId) : null })}</div></div>`;
}

function chequeEditor(root, F, cur) {
  const L = () => F.draft;
  const fx = formCross(cur());
  if (fx !== 'both') F.cross = fx;
  const keysOf = () => [...CHQ_ITEMS.map((d) => d.key), ...Object.keys(L().items).filter((k) => k.startsWith('custom_'))];
  const label = (key) => chqItemLabel(key, L().items[key]);
  const bgMode = () => (L().bgMode === 'none' ? 'none' : L().bg ? 'own' : 'bank');
  root.innerHTML = `
  <div class="lay-status" id="ce-status"></div>
  <div class="lay-cols">
    <div class="lay-left"><div class="card">
      <div class="card-head"><h3>ตัวอย่างเช็ค — ลากแต่ละรายการเพื่อย้าย</h3>
        <div class="seg">${Object.entries(fx === 'both' ? { ac: 'ดูแบบ AC', nonac: 'ดูแบบ Non-AC' } : { [fx]: `แบบ ${CROSS_LABEL[fx]}` }).map(([k, l]) => `<label><input type="radio" name="ce-cross" value="${k}" ${F.cross === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <div class="lay-stage" id="ce-stage" tabindex="0"></div>
      <div class="ce-selbar" id="ce-selbar"></div>
      <p class="muted" style="margin:8px 0;font-size:18px">คลิกเลือกรายการแล้ว<b>ลาก</b> หรือกด<b>ลูกศร</b> (0.5 มม. · Shift = 5 มม.) · <b>ปรับขนาดกล่อง</b>: จุดขวา = ยืด/หดความกว้าง (ยืดออกขนาดอักษรเท่าเดิม หดจนชนข้อความ ตัวอักษรจะเล็กลงเอง) · จุดล่าง/มุม = ขยาย/ย่อขนาดอักษรตาม · ภาพด้านหลังคือ<b>เช็คจริงทั้งแผ่น 9.5" × 3.5" (รวมต้นขั้วซ้ายก่อนฉีก)</b> ใช้วางตำแหน่งให้ตรงเส้น/ช่อง — กด <b>📷 เปลี่ยนรูป</b> เพื่อใช้ภาพสแกนเช็คของคุณเอง (ภาพแสดงบนจอเท่านั้น ไม่ถูกพิมพ์)</p>
      <div class="lay-group" style="margin:0"><div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
        <label>ภาพเช็คด้านหลัง<select id="ce-bgmode" style="width:auto">${opt('bank', `ภาพเช็คมาตรฐาน${esc(bankName(cur().bank_id))}`, bgMode())}${opt('own', 'ภาพที่อัปโหลดเอง', bgMode())}${opt('none', 'ไม่แสดงภาพ', bgMode())}</select></label>
        <button class="btn btn-sm" id="ce-bgpick">📷 เปลี่ยนรูป...</button><input type="file" id="ce-bg" accept="image/*" hidden>
        <label>ความเข้มของภาพ<input type="range" id="ce-bgop" min="0.1" max="1" step="0.05" value="${L().bgOpacity ?? 0.55}" style="width:110px"></label>
        <label>เลื่อนทั้งหมด X<input type="number" step="0.5" id="ce-offx" value="${L().offset.x}" style="width:80px"></label>
        <label>Y<input type="number" step="0.5" id="ce-offy" value="${L().offset.y}" style="width:80px"></label>
        <label>การป้อนเช็คเข้าเครื่องพิมพ์<select id="ce-feed" style="width:auto">${opt('landscape', 'แนวนอน (9.5" × 3.5")', L().feed)}${opt('portrait-cw', 'แนวตั้ง หมุนตามเข็ม 90°', L().feed)}${opt('portrait-ccw', 'แนวตั้ง หมุนทวนเข็ม 90°', L().feed)}</select></label>
      </div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-gold" id="ce-save">💾 บันทึกแบบฟอร์ม</button>
        <button class="btn" id="ce-test">🖨️ พิมพ์ทดสอบ (ขนาดจริง)</button>
        <button class="btn" id="ce-revert">↶ ยกเลิกการแก้ไข</button>
        <button class="btn" id="ce-reset">↺ คืนแบบมาตรฐาน</button></div>
    </div></div>
    <div><div class="card"><div class="card-head"><h3>รายการบนเช็ค</h3><button class="btn btn-sm" id="ce-add">+ เพิ่มข้อความ</button></div>
      <div class="lay-tbl-wrap" id="ce-items"></div>
      <p class="muted" style="font-size:17px;margin:8px 0 0">ติ๊กออกเพื่อลบออกจากเช็ค · ✂ = แยกวันที่เป็น วัน / เดือน / ปี วางแยกกันได้ · ⚙ = ตั้งค่าเพิ่มเติม (แบบอักษร, ข้อความนำหน้า/ต่อท้าย, ชิดขวา, รูปแบบวันที่, แสดงเฉพาะ AC/Non-AC ฯลฯ) · <b>+ เพิ่มข้อความ</b> = เพิ่มข้อความคงที่ / ข้อมูลในระบบ / ช่องกรอกใหม่ในฟอร์มออกเช็ค</p></div></div>
  </div>`;

  const touch = () => { F.dirty = true; paintStatus(); };
  const paintStatus = () => {
    const f = cur();
    $('#ce-status').innerHTML = `<span><b>${esc(f.name)}</b> · ${esc(formTag(f))}${f.is_default ? ' · <span class="badge b-admin">★ แบบเริ่มต้น</span>' : ''} · บันทึกล่าสุด ${fmtDate(f.updated_at)} ${fmtTime(f.updated_at)} น.${f.source_user_name ? ` · สำเนาจาก ${esc(f.source_user_name)}` : ''}</span>${F.dirty ? '<span class="lay-dirty">● มีการแก้ไขที่ยังไม่บันทึก</span>' : ''}`;
  };
  let k = 1;
  const paintPreview = () => {
    const stage = $('#ce-stage'); if (!stage) return;
    const avail = Math.max(300, stage.clientWidth - 28);
    k = Math.min(1.4, avail / (CHEQUE.w * CHQ_PX));
    stage.innerHTML = `<div class="lay-frame" style="width:${CHEQUE.w * CHQ_PX * k}px;height:${CHEQUE.h * CHQ_PX * k}px">
      <div style="transform:scale(${k});transform-origin:top left">${renderCheque(SAMPLE_CHEQUE, { ...L(), feed: 'landscape' }, { editor: true, crossing: F.cross, bgDefault: chequeBg(cur().bank_id) })}</div></div>`;
    $$('[data-block]', stage).forEach((el) => { el.dataset.label = label(el.dataset.block); el.classList.toggle('sel', el.dataset.block === F.sel); });
    fitLater(stage);
    document.fonts.ready.then(() => requestAnimationFrame(placeSelBox));
    paintSelBar();
  };
  // ---------- selection box with resize handles ----------
  const placeSelBox = () => {
    const frame = $('#ce-stage .lay-frame'); if (!frame) return;
    $('.chq-sel-box', frame)?.remove();
    const el = F.sel && $(`[data-block="${F.sel}"]`, frame); if (!el) return;
    const fr = frame.getBoundingClientRect(), r = el.getBoundingClientRect();
    const kind = chqItemDef(F.sel).kind, it = L().items[F.sel];
    const box = document.createElement('div'); box.className = 'chq-sel-box';
    Object.assign(box.style, { left: `${r.left - fr.left}px`, top: `${r.top - fr.top}px`, width: `${r.width}px`, height: `${Math.max(r.height, 6)}px` });
    box.innerHTML = `<span class="tip">${esc(label(F.sel))} · ${kind === 'line' ? `ยาว ${it.w} มม.` : `${it.size} pt${it.w && kind !== 'date' ? ` · กว้าง ${it.w} มม.` : ''}`}</span>`
      + (kind === 'date' && it.format === 'boxes' ? '' : '<i class="h h-e" data-h="e" title="ยืด/หดความกว้าง"></i>')
      + (kind === 'line' ? '' : '<i class="h h-s" data-h="s" title="ขยาย/ย่อขนาดอักษร"></i><i class="h h-se" data-h="se" title="ขยาย/ย่อทั้งกล่อง"></i>');
    frame.appendChild(box);
  };
  /** Natural (unshrunk) width of an item's text in mm at a given size. */
  const naturalW = (key, size) => {
    const el = $(`#ce-stage [data-block="${key}"]`); if (!el) return 0;
    const m = el.cloneNode(true);
    Object.assign(m.style, { position: 'absolute', visibility: 'hidden', width: 'auto', whiteSpace: 'nowrap', fontSize: `${size}pt`, left: '0', top: '0' });
    m.classList.remove('fit'); m.querySelectorAll('[style*="font-size"]').forEach((x) => { x.style.fontSize = ''; });
    el.parentNode.appendChild(m); const w = m.getBoundingClientRect().width / (k * CHQ_PX); m.remove(); return w;
  };
  let rs = null;
  $('#ce-stage').addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.chq-sel-box .h'); if (!h) return;
    e.preventDefault(); e.stopPropagation();
    const it = L().items[F.sel], el = $(`#ce-stage [data-block="${F.sel}"]`);
    rs = { mode: h.dataset.h, key: F.sel, px: e.clientX, py: e.clientY, w: it.w ?? 40, size: it.size ?? 14, cell: it.cell, h: el.getBoundingClientRect().height / (k * CHQ_PX) || 5 };
    h.setPointerCapture(e.pointerId);
  }, true);
  const onResizeMove = (e) => {
    if (!rs) return;
    const it = L().items[rs.key]; const kind = chqItemDef(rs.key).kind;
    const dx = (e.clientX - rs.px) / (k * CHQ_PX), dy = (e.clientY - rs.py) / (k * CHQ_PX);
    const r1 = (v) => Math.round(v * 10) / 10, half = (v) => Math.round(v * 2) / 2;
    if (rs.mode === 'e') {
      it.w = Math.max(3, Math.min(r1(rs.w + dx), r1(CHEQUE.w - (it.x || 0))));   // stays on the cheque
      if (kind !== 'line' && kind !== 'crossing' && !it.wrap) {
        // widening keeps the font size; squeezing into the text makes the text smaller
        const nat = naturalW(rs.key, rs.size);
        it.size = nat > it.w ? Math.max(6, Math.floor(rs.size * (it.w / nat) * 2) / 2) : rs.size;
      }
    } else {
      const ratio = Math.max(0.3, (rs.h + dy) / rs.h);
      it.size = Math.min(72, Math.max(6, half(rs.size * ratio)));
      if (rs.cell) it.cell = r1(rs.cell * it.size / rs.size);
      if (rs.mode === 'se' && kind !== 'date' && it.w) it.w = Math.max(3, Math.min(r1(rs.w * it.size / rs.size), r1(CHEQUE.w - (it.x || 0))));
    }
    syncRow(rs.key, true); paintPreview(); touch();
  };
  const onResizeEnd = () => { if (rs) { rs = null; paintItems(); } };
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', onResizeEnd);
  const off = () => { if (!document.body.contains(root) || !$('#ce-stage')) { window.removeEventListener('pointermove', onResizeMove); window.removeEventListener('pointerup', onResizeEnd); window.removeEventListener('hashchange', off); } };
  window.addEventListener('hashchange', off);

  // ---------- toolbar for the selected item ----------
  const fontOpts = (v) => CHQ_FONTS.map((f) => opt(f.id, f.label, v || 'psk')).join('');
  const paintSelBar = () => {
    const bar = $('#ce-selbar'); if (!bar) return;
    const key = F.sel, it = key && L().items[key];
    if (!it) { bar.innerHTML = '<span class="muted" style="font-size:17px">คลิกรายการบนเช็คเพื่อเลือก แล้วปรับแบบอักษร / ขนาด / ตำแหน่งได้ที่นี่</span>'; return; }
    const kind = chqItemDef(key).kind; const isDate = kind === 'date';
    bar.innerHTML = `<span class="nm">${esc(label(key))}</span>
      ${kind === 'line' ? '' : `<label>แบบอักษร<select data-sb="font" style="width:auto">${fontOpts(it.font)}</select></label>
      <label>ขนาด (pt)<input type="number" step="0.5" min="6" max="72" data-sb="size" value="${it.size}" style="width:80px"></label>
      <div class="tg"><button class="btn btn-sm ${it.bold ? 'on' : ''}" data-sb="bold" title="ตัวหนา"><b>B</b></button><button class="btn btn-sm ${it.italic ? 'on' : ''}" data-sb="italic" title="ตัวเอียง"><i>I</i></button></div>`}
      ${kind === 'text' || kind === 'custom' ? `<div class="tg">${[['left', '⟸'], ['center', '≡'], ['right', '⟹']].map(([a, t]) => `<button class="btn btn-sm ${(it.align || 'left') === a ? 'on' : ''}" data-sb="align" data-v="${a}" title="${a === 'left' ? 'ชิดซ้าย' : a === 'right' ? 'ชิดขวา' : 'กึ่งกลาง'}">${t}</button>`).join('')}</div>` : ''}
      ${it.cell !== undefined && !isDate ? `<label>ช่องละ (มม.)<input type="number" step="0.1" data-sb="cell" value="${it.cell}" style="width:80px"></label>` : ''}
      ${isDate ? '<button class="btn btn-sm" data-sb="split" title="แยกเป็นวัน / เดือน / ปี วางแยกกันได้">✂ แยก วัน/เดือน/ปี</button>' : ''}
      ${it.from && L().items[it.from] ? '<button class="btn btn-sm" data-sb="merge" title="รวมกลับเป็นวันที่ชุดเดิม">⤺ รวมวันที่กลับ</button>' : ''}
      <button class="btn btn-sm" data-sb="opt">⚙ ตั้งค่า</button>
      ${key.startsWith('custom_') ? '<button class="btn btn-sm btn-danger" data-sb="del">🗑 ลบ</button>' : '<button class="btn btn-sm" data-sb="hide">ซ่อน</button>'}`;
  };
  const splitDate = (key) => {
    const ks = splitDateItem(L(), key);
    F.sel = ks[0]; touch(); paintItems(); paintPreview();
    ok('แยกเป็น วัน / เดือน / ปี แล้ว — ลากแต่ละชิ้นไปวางได้อิสระ');
  };
  const mergeDate = (key) => {
    const src = L().items[key].from;
    for (const [k2, v] of Object.entries(L().items)) if (v.from === src) delete L().items[k2];
    L().items[src].show = true; F.sel = src; touch(); paintItems(); paintPreview();
  };
  $('#ce-selbar').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-sb]'); if (!b || !F.sel) return;
    const key = F.sel, it = L().items[key], a = b.dataset.sb;
    if (a === 'bold' || a === 'italic') it[a] = !it[a];
    else if (a === 'align') it.align = b.dataset.v;
    else if (a === 'split') return splitDate(key);
    else if (a === 'merge') return mergeDate(key);
    else if (a === 'opt') { if (await itemOptions(key, it)) { touch(); paintItems(); paintPreview(); } return; }
    else if (a === 'del') { delete L().items[key]; F.sel = null; }
    else if (a === 'hide') { it.show = false; F.sel = null; }
    touch(); paintItems(); paintPreview();
  });
  $('#ce-selbar').addEventListener('change', (e) => {
    const a = e.target.dataset.sb; if (!a || !F.sel) return;
    const it = L().items[F.sel];
    if (a === 'font') { if (e.target.value === 'psk') delete it.font; else it.font = e.target.value; if (chqFont(it.font).barcode && (it.size || 0) < 24) it.size = 28; }
    else { const v = Number(e.target.value); if (!Number.isFinite(v) || v <= 0) return; it[a] = v; }
    syncRow(F.sel, true); touch(); paintPreview(); paintItems();
  });
  const select = (key) => {
    F.sel = key;
    $$('#ce-stage [data-block]').forEach((el) => el.classList.toggle('sel', el.dataset.block === key));
    $$('#ce-items tr[data-key]').forEach((tr) => tr.classList.toggle('sel', tr.dataset.key === key));
    placeSelBox(); paintSelBar();
  };
  const syncRow = (key, all = false) => {
    const it = L().items[key]; const tr = $(`#ce-items tr[data-key="${key}"]`); if (!tr) return;
    for (const p of all ? ['x', 'y', 'w', 'size', 'thick'] : ['x', 'y']) { const inp = $(`input[data-p="${p}"]`, tr); if (inp) inp.value = it[p] ?? ''; }
  };
  let drag = null;
  $('#ce-stage').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-block]');
    if (!el) return select(null);
    e.preventDefault();
    const key = el.dataset.block; select(key);
    drag = { el, key, px: e.clientX, py: e.clientY, x: L().items[key].x, y: L().items[key].y };
    el.classList.add('dragging'); el.setPointerCapture(e.pointerId); $('#ce-stage').focus({ preventScroll: true });
  });
  $('#ce-stage').addEventListener('pointermove', (e) => {
    if (!drag) return;
    const it = L().items[drag.key];
    it.x = Math.min(CHEQUE.w - 2, Math.max(0, Math.round((drag.x + (e.clientX - drag.px) / (k * CHQ_PX)) * 2) / 2));
    it.y = Math.min(CHEQUE.h - 2, Math.max(0, Math.round((drag.y + (e.clientY - drag.py) / (k * CHQ_PX)) * 2) / 2));
    drag.el.style.left = `${it.x}mm`; drag.el.style.top = `${it.y}mm`; syncRow(drag.key); placeSelBox();
  });
  const endDrag = () => { if (!drag) return; const it = L().items[drag.key]; const moved = it.x !== drag.x || it.y !== drag.y; drag.el.classList.remove('dragging'); drag = null; if (moved) touch(); };
  $('#ce-stage').addEventListener('pointerup', endDrag); $('#ce-stage').addEventListener('pointercancel', endDrag);
  $('#ce-stage').addEventListener('keydown', (e) => {
    if (!F.sel || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const st = e.shiftKey ? 5 : 0.5; const it = L().items[F.sel];
    if (e.key === 'ArrowLeft') it.x = Math.max(0, it.x - st); if (e.key === 'ArrowRight') it.x += st;
    if (e.key === 'ArrowUp') it.y = Math.max(0, it.y - st); if (e.key === 'ArrowDown') it.y += st;
    const el = $(`#ce-stage [data-block="${F.sel}"]`); if (el) { el.style.left = `${it.x}mm`; el.style.top = `${it.y}mm`; }
    syncRow(F.sel); placeSelBox(); touch();
  });

  const n = (p, v, extra = '') => `<input type="number" step="0.5" data-p="${p}" value="${v ?? ''}" ${extra}>`;
  const paintItems = () => {
    let last = '';
    $('#ce-items').innerHTML = `<table class="lay-items"><thead><tr><th>แสดง</th><th>รายการ</th><th>X มม.</th><th>Y มม.</th><th>กว้าง</th><th>ขนาด</th><th>หนา</th><th></th></tr></thead><tbody>${keysOf().map((key) => {
      const it = L().items[key]; if (!it) return '';
      const d = chqItemDef(key); const isC = key.startsWith('custom_');
      const grp = d.group !== last ? `<tr class="grp"><td colspan="8">${esc(d.group)}</td></tr>` : ''; last = d.group;
      const when = it.when && it.when !== 'always' ? ` <span class="badge b-${it.when}" style="font-size:13px">${it.when === 'ac' ? 'AC' : 'Non-AC'}</span>` : '';
      return `${grp}<tr data-key="${key}" class="${it.show === false ? 'off' : ''}${F.sel === key ? ' sel' : ''}">
        <td><input type="checkbox" data-p="show" ${it.show !== false ? 'checked' : ''}></td>
        <td class="nm">${isC
    ? `<div style="display:flex;gap:3px;align-items:center">${(it.src || 'text') === 'text' ? `<input type="text" data-p="text" value="${esc(it.text || '')}" style="width:100%;min-width:80px">` : `<span style="flex:1">${esc(label(key))}<span class="src-badge ${String(it.src).startsWith('field:') ? 'field' : ''}">${String(it.src).startsWith('field:') ? 'กรอกในฟอร์ม' : 'ข้อมูลในระบบ'}</span></span>`}<button class="btn btn-sm btn-icon btn-danger" data-del title="ลบ">🗑</button></div>`
    : `${esc(d.label)}${when}${d.kind === 'date' && it.show !== false ? ' <button class="btn btn-sm btn-icon" data-split title="แยกเป็น วัน / เดือน / ปี">✂</button>' : ''}`}${it.font && it.font !== 'psk' ? `<div class="muted" style="font-size:14px">${esc(chqFont(it.font).label)}</div>` : ''}</td>
        <td>${n('x', it.x)}</td><td>${n('y', it.y)}</td>
        <td>${d.kind === 'date' ? '' : n('w', it.w)}</td>
        <td>${d.kind === 'line' ? n('thick', it.thick, 'title="ความหนาเส้น มม." step="0.1"') : n('size', it.size)}</td>
        <td style="text-align:center">${d.kind === 'line' ? '' : `<input type="checkbox" data-p="bold" ${it.bold ? 'checked' : ''}>`}</td>
        <td><button class="btn btn-sm btn-icon" data-opt title="ตั้งค่าเพิ่มเติม">⚙</button></td></tr>`;
    }).join('')}</tbody></table>`;
  };
  $('#ce-items').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-key]'); const p = e.target.dataset.p; if (!tr || !p) return;
    const it = L().items[tr.dataset.key];
    if (e.target.type === 'checkbox') { it[p] = e.target.checked; if (p === 'show') tr.classList.toggle('off', !e.target.checked); }
    else if (p === 'text') it.text = e.target.value;
    else { const v = Number(e.target.value); if (!Number.isFinite(v)) return; it[p] = v; }
    touch(); paintPreview();
  });
  $('#ce-items').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-key]'); if (!tr) return;
    const key = tr.dataset.key; const it = L().items[key];
    if (e.target.closest('[data-del]')) { delete L().items[key]; if (F.sel === key) F.sel = null; touch(); paintItems(); paintPreview(); return; }
    if (e.target.closest('[data-split]')) { splitDate(key); return; }
    if (e.target.closest('[data-opt]')) { if (await itemOptions(key, it)) { touch(); paintItems(); paintPreview(); } return; }
    if (!e.target.closest('input,button,label')) select(key);
  });
  $('#ce-items').addEventListener('change', (e) => { if (['size', 'w', 'x', 'y'].includes(e.target.dataset.p)) { placeSelBox(); paintSelBar(); } });
  $('#ce-add').addEventListener('click', async () => {
    const d = await addItemDialog();
    if (!d) return;
    const key = `custom_${Date.now().toString(36)}`;
    const bar = d.font && chqFont(d.font).barcode;
    const nC = Object.keys(L().items).filter((x) => x.startsWith('custom_')).length;
    L().items[key] = { show: true, when: 'always', x: 96 + (nC % 3) * 30, y: 48 + (nC % 4) * 6, w: 60, size: bar ? 28 : 14, bold: false, wrap: false, align: 'left', ...d };
    if (!d.font) delete L().items[key].font;
    F.sel = key; touch(); paintItems(); paintPreview();
    ok(d.src?.startsWith('field:') ? `เพิ่มช่อง "${d.field.label}" ในฟอร์มออกเช็คแล้ว — ลากไปวางตำแหน่งที่ต้องการ แล้วกดบันทึกแบบฟอร์ม` : 'เพิ่มรายการแล้ว — ลากไปวางตำแหน่งที่ต้องการ');
  });
  /** Asks what the new text is: fixed text, data already in the system, or a NEW field typed in the cheque form. */
  const addItemDialog = async (cur0 = null) => {
    const known = knownFields();
    const srcOpts = [...new Set(CHQ_SOURCES.map((x) => x.group))].map((g) => `<optgroup label="${esc(g)}">${CHQ_SOURCES.filter((x) => x.group === g).map((x) => opt(x.id, x.label, cur0?.src)).join('')}</optgroup>`).join('');
    const r = await Swal.fire({
      title: cur0 ? 'ข้อมูลของรายการนี้' : 'เพิ่มข้อความบนเช็ค', width: 720, focusConfirm: false,
      html: `<div class="swal-form" style="text-align:left">
        <div class="full"><b>ข้อความนี้ต้องเพิ่มเป็นช่องกรอกข้อมูลในฟอร์มออกเช็คด้วยหรือไม่?</b></div>
        <label class="full radio-row"><input type="radio" name="ad-mode" value="text" checked> <span><b>ไม่ต้อง — ข้อความคงที่</b><br><span class="muted">พิมพ์ข้อความเดียวกันทุกฉบับ เช่น ชื่อหน่วยงาน, "ห้ามโอน"</span></span></label>
        <label class="full radio-row"><input type="radio" name="ad-mode" value="src"> <span><b>ไม่ต้อง — ใช้ข้อมูลที่มีอยู่แล้วในระบบ</b><br><span class="muted">เช่น วัน/เดือน/ปี แยกชิ้น, เลขที่เช็ค, ชื่อบัญชี, เฉพาะบาท/สตางค์</span></span></label>
        <label class="full radio-row"><input type="radio" name="ad-mode" value="field"> <span><b>ต้องการ — เพิ่มเป็นช่องกรอกใหม่ในฟอร์มออกเช็ค</b><br><span class="muted">ผู้ออกเช็คจะกรอกข้อมูลนี้ทุกครั้งที่ออกเช็ค แล้วระบบพิมพ์ตรงตำแหน่งนี้</span></span></label>
        <div class="full" id="ad-text"><label>ข้อความ<textarea id="ad-t" rows="2">${esc(cur0?.text || '')}</textarea></label></div>
        <div class="full" id="ad-src" style="display:none"><label>ข้อมูล<select id="ad-s">${srcOpts}</select></label></div>
        <div class="full" id="ad-field" style="display:none"><div class="swal-form">
          ${known.length ? `<label class="full">ใช้ช่องที่มีอยู่แล้ว (ข้อมูลชุดเดียวกัน)<select id="ad-known"><option value="">— สร้างช่องใหม่ —</option>${known.map((f) => `<option value="${esc(f.key)}">${esc(f.label)} (${esc(FIELD_TYPES[f.type] || f.type)})</option>`).join('')}</select></label>` : ''}
          <label>ชื่อช่องในฟอร์ม *<input id="ad-fl" placeholder="เช่น เลขที่ใบสำคัญ"></label>
          <label>ชนิดข้อมูล<select id="ad-ft">${Object.entries(FIELD_TYPES).map(([k2, v]) => opt(k2, v, 'text')).join('')}</select></label>
          <label class="full">ค่าเริ่มต้น (ไม่บังคับ)<input id="ad-fd" placeholder="เติมให้อัตโนมัติตอนออกเช็คใหม่"></label>
          <label class="full" style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="ad-fr" style="width:auto"> บังคับกรอก</label></div></div>
        <label class="full">แบบอักษร<select id="ad-font">${fontOpts(cur0?.font)}</select></label>
      </div>`,
      showCancelButton: true, confirmButtonText: cur0 ? 'ใช้ค่านี้' : 'เพิ่ม', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      didOpen: (pop) => {
        const mode0 = !cur0 ? 'text' : (cur0.src || 'text').startsWith('field:') ? 'field' : (cur0.src || 'text') === 'text' ? 'text' : 'src';
        pop.querySelector(`input[name="ad-mode"][value="${mode0}"]`).checked = true;
        if (cur0?.field) { $('#ad-fl').value = cur0.field.label; $('#ad-ft').value = cur0.field.type || 'text'; $('#ad-fd').value = cur0.field.def || ''; $('#ad-fr').checked = !!cur0.field.required; if ($('#ad-known')) $('#ad-known').value = cur0.field.key; }
        const show = () => { const m = pop.querySelector('input[name="ad-mode"]:checked').value; $('#ad-text').style.display = m === 'text' ? '' : 'none'; $('#ad-src').style.display = m === 'src' ? '' : 'none'; $('#ad-field').style.display = m === 'field' ? '' : 'none'; };
        pop.addEventListener('change', (e) => {
          if (e.target.name === 'ad-mode') show();
          if (e.target.id === 'ad-known') { const f = known.find((x) => x.key === e.target.value); if (f) { $('#ad-fl').value = f.label; $('#ad-ft').value = f.type; $('#ad-fd').value = f.def || ''; $('#ad-fr').checked = !!f.required; } }
        });
        show();
      },
      preConfirm: () => {
        const m = document.querySelector('input[name="ad-mode"]:checked').value;
        const font = val('ad-font') === 'psk' ? undefined : val('ad-font');
        if (m === 'text') { const t = $('#ad-t').value; if (!t.trim()) return Swal.showValidationMessage('กรุณาพิมพ์ข้อความ'); return { src: 'text', text: t, font }; }
        if (m === 'src') return { src: val('ad-s'), font };
        const lbl = val('ad-fl'); if (!lbl) return Swal.showValidationMessage('กรุณาตั้งชื่อช่องในฟอร์ม');
        const key = $('#ad-known')?.value || cur0?.field?.key || `f_${Date.now().toString(36)}`;
        return { src: `field:${key}`, field: { key, label: lbl, type: val('ad-ft'), def: val('ad-fd') || '', required: $('#ad-fr').checked }, font };
      },
    });
    return r.isConfirmed ? r.value : null;
  };
  /** Fields typed in the cheque form, defined in any of my forms (so a field can be re-used by several forms). */
  const knownFields = () => {
    const m = new Map();
    for (const lay of [L(), ...S.chq.forms.map((x) => x.layout)]) for (const v of Object.values(lay?.items || {})) if (v?.field?.key && !m.has(v.field.key)) m.set(v.field.key, v.field);
    return [...m.values()];
  };

  const itemOptions = async (key, it) => {
    const d = chqItemDef(key);
    const fontRow = d.kind === 'line' ? '' : `<label>แบบอักษร<select id="io-font">${fontOpts(it.font)}</select></label>
      <label style="display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" id="io-italic" ${it.italic ? 'checked' : ''}> ตัวเอียง</label>`;
    const cellRow = d.kind === 'custom' ? `<label>แยกตัวอักษรลงช่อง ช่องละ (มม.)<input id="io-cell2" type="number" step="0.1" min="0" value="${it.cell ?? ''}" placeholder="ว่าง = ไม่แยก"></label>` : '';
    const dataBtn = d.kind === 'custom' ? '<div class="full"><button type="button" class="btn btn-sm" id="io-data">🔁 เปลี่ยนข้อมูลของรายการนี้ (ข้อความคงที่ / ข้อมูลในระบบ / ช่องกรอกในฟอร์ม)</button></div>' : '';
    const whenSel = `<label>แสดงเมื่อ<select id="io-when">${opt('always', 'ทุกแบบ (AC และ Non-AC)', it.when || 'always')}${opt('ac', 'เฉพาะเช็ค AC', it.when)}${opt('nonac', 'เฉพาะเช็ค Non-AC', it.when)}</select></label>`;
    let html = '';
    if (d.kind === 'crossing') html = `<label class="full">ข้อความ<input id="io-text" value="${esc(it.text || '')}"></label><label>มุมเอียง (องศา)<input id="io-angle" type="number" step="0.5" value="${it.angle || 0}"></label>
      <label>สี<select id="io-color">${opt('#c8102e', 'แดง', it.color || '#000')}${opt('#000', 'ดำ (เครื่องพิมพ์ขาวดำ)', it.color || '#000')}${opt('#1f3fae', 'น้ำเงิน', it.color || '#000')}</select></label>
      <label style="display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" id="io-lines" ${it.lines !== false ? 'checked' : ''}> มีเส้นคู่ขนาน</label>${whenSel}`;
    else if (d.kind === 'line') html = `<label style="display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" id="io-double" ${it.double ? 'checked' : ''}> เส้นคู่</label><label>ระยะห่างเส้นคู่ (มม.)<input id="io-lgap" type="number" step="0.1" value="${it.gap ?? ((it.thick || 0.5) * 3)}"></label>${whenSel}`;
    else if (d.kind === 'date') html = `<label>รูปแบบ<select id="io-format">${opt('boxes', 'ช่อง วว ดด ปปปป', it.format)}${opt('slash', 'วว/ดด/ปปปป', it.format)}${opt('dmy', 'ว/ด/ปปปป (ไม่เติม 0 เช่น 9/3/2569)', it.format)}${opt('long', 'วันที่ เดือน ปี (ตัวอักษร)', it.format)}</select></label>
      <label>ปี<select id="io-era">${opt('be', 'พ.ศ.', it.era)}${opt('ce', 'ค.ศ.', it.era)}</select></label>
      <label>ความกว้างต่อช่อง (มม.)<input id="io-cell" type="number" step="0.1" value="${it.cell ?? 5.5}"></label><label>ระยะเว้นระหว่าง วว|ดด|ปปปป (มม.)<input id="io-gap" type="number" step="0.1" value="${it.gap ?? 0}"></label>${whenSel}`;
    else html = `<label>ข้อความนำหน้า<input id="io-prefix" value="${esc(it.prefix || '')}" placeholder="เช่น ** หรือ ("></label><label>ข้อความต่อท้าย<input id="io-suffix" value="${esc(it.suffix || '')}" placeholder="เช่น ** หรือ )"></label>
      <label>จัดตำแหน่ง<select id="io-align">${opt('left', 'ชิดซ้าย', it.align)}${opt('center', 'กึ่งกลาง', it.align)}${opt('right', 'ชิดขวา', it.align)}</select></label>
      <label style="display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" id="io-wrap" ${it.wrap ? 'checked' : ''}> ข้อความยาวให้ขึ้นบรรทัดใหม่ (ไม่ย่อ)</label>
      <label>ระยะบรรทัด (เท่า)<input id="io-lh" type="number" step="0.05" min="0.8" max="3" value="${it.lh ?? ''}" placeholder="อัตโนมัติ"></label>
      ${key === 'payee' ? `<label>เส้นต่อท้ายชื่อผู้รับ<select id="io-fill">${opt('none', 'ไม่มี', it.fill || 'none')}${opt('solid', 'เส้นทึบ ____', it.fill || 'none')}${opt('dashed', 'เส้นประ ----', it.fill || 'none')}</select></label>
      <label>เลื่อนเส้นขึ้น/ลง (มม.)<input id="io-filldy" type="number" step="0.1" value="${it.fillDy ?? 0}"></label>` : ''}${whenSel}`;
    let changeData = false;
    const r = await Swal.fire({ title: `ตั้งค่า: ${esc(label(key))}`, focusConfirm: false, html: `<div class="swal-form">${dataBtn}${fontRow}${html}${cellRow}</div>`, showCancelButton: true, confirmButtonText: 'ใช้ค่านี้', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      didOpen: () => { $('#io-data')?.addEventListener('click', () => { changeData = true; Swal.clickConfirm(); }); },
      preConfirm: () => {
        const o = {}; const g = (id) => document.getElementById(id);
        if (g('io-font')) o.font = g('io-font').value === 'psk' ? undefined : g('io-font').value; if (g('io-italic')) o.italic = g('io-italic').checked;
        if (g('io-cell2')) o.cell = g('io-cell2').value === '' ? undefined : Number(g('io-cell2').value) || undefined;
        if (g('io-text')) o.text = g('io-text').value; if (g('io-angle')) o.angle = Number(g('io-angle').value) || 0;
        if (g('io-lines')) o.lines = g('io-lines').checked; if (g('io-double')) o.double = g('io-double').checked;
        if (g('io-format')) o.format = g('io-format').value; if (g('io-era')) o.era = g('io-era').value;
        if (g('io-cell')) o.cell = Number(g('io-cell').value) || 5.5; if (g('io-gap')) o.gap = Number(g('io-gap').value) || 0;
        if (g('io-prefix')) o.prefix = g('io-prefix').value; if (g('io-suffix')) o.suffix = g('io-suffix').value;
        if (g('io-align')) o.align = g('io-align').value; if (g('io-wrap')) o.wrap = g('io-wrap').checked;
        if (g('io-color')) o.color = g('io-color').value; if (g('io-lgap')) o.gap = Number(g('io-lgap').value) || 0;
        if (g('io-lh')) o.lh = Number(g('io-lh').value) || null; if (g('io-fill')) o.fill = g('io-fill').value; if (g('io-filldy')) o.fillDy = Number(g('io-filldy').value) || 0;
        if (g('io-when')) o.when = g('io-when').value;
        return o;
      } });
    if (!r.isConfirmed) return false;
    Object.assign(it, r.value);
    for (const k2 of ['font', 'cell']) if (it[k2] === undefined) delete it[k2];
    if (changeData) { const d2 = await addItemDialog(it); if (d2) { delete it.text; delete it.field; Object.assign(it, d2); if (!d2.font) delete it.font; } }
    return true;
  };

  root.addEventListener('change', (e) => {
    if (e.target.name === 'ce-cross') { F.cross = e.target.value; paintPreview(); }
    if (e.target.id === 'ce-feed') { L().feed = e.target.value; touch(); }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'ce-offx' || e.target.id === 'ce-offy') { const v = Number(e.target.value); if (Number.isFinite(v)) { L().offset[e.target.id === 'ce-offx' ? 'x' : 'y'] = v; touch(); paintPreview(); } }
    if (e.target.id === 'ce-bgop') { L().bgOpacity = Number(e.target.value); touch(); paintPreview(); }
  });
  $('#ce-bgpick').addEventListener('click', () => $('#ce-bg').click());
  $('#ce-bg').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    L().bg = await shrinkImageJpeg(file, 2000); delete L().bgMode; $('#ce-bgmode').value = 'own'; e.target.value = ''; touch(); paintPreview();
    ok('เปลี่ยนรูปแล้ว — ภาพถูกยืดให้เต็มขนาดเช็คทั้งแผ่น 9.5" × 3.5" (ควรสแกน/ครอปให้ชิดขอบกระดาษเช็ค)');
  });
  $('#ce-bgmode').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'none') L().bgMode = 'none';
    else if (v === 'bank') { delete L().bgMode; L().bg = null; }
    else { delete L().bgMode; if (!L().bg) { $('#ce-bg').click(); e.target.value = bgMode(); return; } }
    touch(); paintPreview();
  });
  $('#ce-save').addEventListener('click', async () => {
    try {
      const row = await must(S.sb.from('cheque_forms').update({ layout: L(), updated_at: new Date().toISOString() }).eq('id', cur().id).select().single());
      Object.assign(cur(), row); F.dirty = false; paintStatus();
      Swal.fire({ icon: 'success', title: 'บันทึกแบบฟอร์มแล้ว', text: `${row.name} · ${fmtDate(row.updated_at)} ${fmtTime(row.updated_at)} น.`, timer: 1800, showConfirmButton: false });
    } catch (er) { fail(er); }
  });
  $('#ce-test').addEventListener('click', async () => {
    const L2 = JSON.parse(JSON.stringify(L()));
    const ch = await chequePreview([{ ...SAMPLE_CHEQUE, bank_id: cur().bank_id, status: 'normal' }], { form: { ...cur(), layout: L2 }, crossing: F.cross });
    if (ch) await printDocument(renderCheque({ ...SAMPLE_CHEQUE }, ch.layout, { crossing: ch.crossing }), chequePageCss(ch.layout));
  });
  $('#ce-revert').addEventListener('click', () => { F.draft = formLayout(cur()); F.dirty = false; F.sel = null; chequeEditor(root, F, cur); });
  $('#ce-reset').addEventListener('click', async () => {
    const r = await Swal.fire({ title: 'คืนตำแหน่งแบบมาตรฐาน?', icon: 'question',
      html: `ทุกรายการกลับเป็นแบบมาตรฐานของ${esc(bankName(cur().bank_id))} ${CROSS_LABEL[F.cross]} (ภาพด้านหลังคงเดิม)<br><span class="muted">ยังไม่บันทึกจนกว่าจะกด "บันทึกแบบฟอร์ม"</span>`,
      input: 'radio', inputOptions: { real: 'ตามเช็คจริง (ข้อความอยู่บนเส้น/ช่องของเช็ค)', access: 'ตามแบบรายงานเดิม (Access)' }, inputValue: 'real',
      showCancelButton: true, confirmButtonText: 'คืนค่า', cancelButtonText: 'ยกเลิก', reverseButtons: true });
    if (!r.isConfirmed) return;
    const { bg, bgOpacity, bgMode: bm } = L(); F.draft = defaultChequeLayout(cur().bank_id, F.cross, r.value); Object.assign(F.draft, { bg, bgOpacity: bgOpacity ?? F.draft.bgOpacity }); if (bm) F.draft.bgMode = bm; F.dirty = true; F.sel = null; chequeEditor(root, F, cur);
  });
  paintStatus(); paintItems(); paintPreview();
}

function shrinkImageJpeg(file, maxW) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = reject; img.src = URL.createObjectURL(file);
  });
}

// =====================================================================
//  รายงานเช็ค
// =====================================================================
async function viewChequeReport() {
  await loadChequeRefs();
  const today = bkkDate();
  const [fa, fz] = fiscalYearRange();
  S.chq.rep = S.chq.rep || { from: fa, to: fz, account: '', bank: '', status: 'normal', group: 'month' };
  const R = S.chq.rep;
  view().innerHTML = `
  <div class="card"><div class="toolbar" style="margin-bottom:0">
    <label>ตั้งแต่วันที่<input type="date" id="cr-from" value="${R.from}"></label>
    <label>ถึงวันที่<input type="date" id="cr-to" value="${R.to}"></label>
    <div style="display:flex;gap:6px"><button class="btn btn-sm" data-q="today">วันนี้</button><button class="btn btn-sm" data-q="month">เดือนนี้</button><button class="btn btn-sm" data-q="fy">ปีงบประมาณนี้</button><button class="btn btn-sm" data-q="year">ปีนี้</button></div>
    <label>บัญชี<select id="cr-acc"><option value="">ทุกบัญชี</option>${S.chq.accounts.map((a) => opt(a.id, a.name, R.account)).join('')}</select></label>
    <label>ธนาคาร<select id="cr-bank"><option value="">ทุกธนาคาร</option>${S.chq.banks.map((b) => opt(b.id, b.short_name || b.name, R.bank)).join('')}</select></label>
    <label>สถานะ<select id="cr-status">${[['normal', 'ปกติ'], ['cancelled', 'ยกเลิก'], ['', 'ทั้งหมด']].map(([v, l]) => opt(v, l, R.status)).join('')}</select></label>
    <label>สรุปตาม<select id="cr-group">${opt('day', 'รายวัน', R.group)}${opt('month', 'รายเดือน', R.group)}${opt('year', 'รายปี', R.group)}</select></label>
    <span class="spacer"></span><button class="btn" id="cr-csv">⬇️ ส่งออก Excel (CSV)</button><button class="btn btn-primary" id="cr-print">🖨️ พิมพ์รายงาน</button>
  </div></div>
  <div class="grid-4" id="cr-stats" style="margin-top:16px"></div>
  <div class="grid-2" style="margin-top:16px">
    <div class="card"><div class="card-head"><h3 id="cr-gtitle">สรุปตามช่วงเวลา</h3></div><div class="table-wrap" style="max-height:380px" id="cr-period"></div></div>
    <div class="card"><div class="card-head"><h3>สรุปตามบัญชี / ธนาคาร</h3></div><div class="table-wrap" style="max-height:380px" id="cr-acct"></div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>รายการเช็ค <span class="muted" style="font-weight:400;font-size:18px">(เรียงตามเลขที่เช็ค)</span></h3><span class="badge b-staff" id="cr-count"></span></div>
    <div class="table-wrap" style="max-height:65vh" id="cr-list"></div></div>`;

  const rangeText = () => (R.from && R.to ? `วันที่ ${thDate(R.from, false)} ถึง ${thDate(R.to, false)}` : 'ทุกช่วงเวลา');
  const load = async () => {
    R.from = $('#cr-from').value; R.to = $('#cr-to').value; R.account = $('#cr-acc').value; R.bank = $('#cr-bank').value; R.status = $('#cr-status').value; R.group = $('#cr-group').value;
    $('#cr-list').innerHTML = '<div class="empty">กำลังโหลด...</div>';
    try {
      const out = [];
      for (let from = 0; from < 30000; from += 1000) {
        let qb = S.sb.from('cheques').select('*');
        if (R.from) qb = qb.gte('cheque_date', R.from); if (R.to) qb = qb.lte('cheque_date', R.to);
        if (R.account) qb = qb.eq('account_id', Number(R.account)); if (R.bank) qb = qb.eq('bank_id', Number(R.bank));
        if (R.status) qb = qb.eq('status', R.status);
        const rows = await must(qb.order('id').range(from, from + 999)); out.push(...rows); if (rows.length < 1000) break;
      }
      R.rows = out.sort((a, b) => (a.cheque_no.length - b.cheque_no.length) || a.cheque_no.localeCompare(b.cheque_no) || String(a.cheque_date).localeCompare(String(b.cheque_date)));
      paint();
    } catch (e) { $('#cr-list').innerHTML = `<div class="empty">${esc(thaiError(e))}</div>`; }
  };
  const sumOf = (rows) => rows.reduce((t, c) => t + Number(c.amount || 0), 0);
  const periodKey = (d) => (R.group === 'year' ? d.slice(0, 4) : R.group === 'month' ? d.slice(0, 7) : d.slice(0, 10));
  const periodLabel = (k) => (R.group === 'year' ? `พ.ศ. ${Number(k) + 543}` : R.group === 'month' ? `${TH_MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(0, 4)) + 543}` : thDate(k));
  const listTable = (rows, forPrint) => !rows.length ? '<div class="empty">ไม่มีเช็คในเงื่อนไขนี้</div>' : `<table class="${forPrint ? 'rp-table rp-items' : ''}">${forPrint ? '<colgroup><col style="width:9mm"><col style="width:22mm"><col style="width:18mm"><col><col style="width:42mm"><col style="width:26mm"></colgroup>' : ''}
    <thead><tr><th class="r">ลำดับ</th><th>เลขที่เช็ค</th><th>วันที่</th><th>จ่าย</th><th>${forPrint ? 'บัญชี / ธนาคาร' : 'บัญชี / ธนาคาร / รายการ'}</th><th class="r">จำนวนเงิน</th>${forPrint ? '' : '<th>สถานะ</th>'}</tr></thead>
    <tbody>${rows.map((c, i) => `<tr${c.status === 'cancelled' ? ' class="zero"' : ''}><td class="r">${i + 1}</td><td style="white-space:nowrap"><b>${esc(c.cheque_no)}</b>${c.status === 'cancelled' ? '<div class="muted">(ยกเลิก)</div>' : ''}</td>
      <td style="white-space:nowrap">${thDate(c.cheque_date)}</td><td>${esc(c.payee)}</td>
      <td>${esc(accName(c.account_id))} · ${esc(bankName(c.bank_id))}${!forPrint && c.detail ? `<div class="muted" style="font-size:17px">${esc(c.detail)}</div>` : ''}</td>
      <td class="r amt">${money(c.amount)}</td>${forPrint ? '' : `<td>${c.status === 'cancelled' ? '<span class="badge b-cancelled">ยกเลิก</span>' : c.print_count ? '<span class="badge b-printed">พิมพ์แล้ว</span>' : '<span class="badge b-issued">ยังไม่พิมพ์</span>'}</td>`}</tr>`).join('')}</tbody>
    <tfoot><tr><td></td><td colspan="4">รวม ${num(rows.length)} ฉบับ</td><td class="r amt">${money(sumOf(rows))}</td>${forPrint ? '' : '<td></td>'}</tr></tfoot></table>`;
  const paint = () => {
    const rows = R.rows; const normal = rows.filter((c) => c.status === 'normal'); const canc = rows.filter((c) => c.status === 'cancelled');
    $('#cr-stats').innerHTML = `
      <div class="stat gold"><small>จำนวนเช็ค (ปกติ)</small><b>${num(normal.length)}</b></div>
      <div class="stat"><small>ยอดเงินรวม (บาท)</small><b style="font-size:30px">${money(sumOf(normal))}</b></div>
      <div class="stat"><small>ยกเลิก</small><b>${num(canc.length)}</b></div>
      <div class="stat"><small>พิมพ์ผ่านระบบแล้ว</small><b>${num(normal.filter((c) => c.print_count > 0).length)}</b></div>`;
    const byP = new Map(); for (const c of rows) { const k = periodKey(String(c.cheque_date)); const g = byP.get(k) || []; g.push(c); byP.set(k, g); }
    $('#cr-gtitle').textContent = `สรุป${{ day: 'รายวัน', month: 'รายเดือน', year: 'รายปี' }[R.group]}`;
    $('#cr-period').innerHTML = `<table><thead><tr><th>ช่วงเวลา</th><th class="r">ฉบับ</th><th class="r">ยอดเงิน</th><th class="r">ยกเลิก</th></tr></thead><tbody>${[...byP.keys()].sort().map((k) => { const g = byP.get(k); const nn = g.filter((c) => c.status === 'normal'); return `<tr><td>${periodLabel(k)}</td><td class="r">${num(nn.length)}</td><td class="r amt">${money(sumOf(nn))}</td><td class="r">${num(g.length - nn.length)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">—</td></tr>'}</tbody></table>`;
    const byA = new Map(); for (const c of normal) { const k = `${c.account_id}|${c.bank_id || 0}`; const g = byA.get(k) || []; g.push(c); byA.set(k, g); }
    $('#cr-acct').innerHTML = `<table><thead><tr><th>บัญชี</th><th>ธนาคาร</th><th class="r">ฉบับ</th><th class="r">ยอดเงิน</th></tr></thead><tbody>${[...byA.entries()].map(([k, g]) => { const [a, b] = k.split('|').map(Number); return `<tr><td>${esc(accName(a))}</td><td>${esc(bankName(b))}</td><td class="r">${num(g.length)}</td><td class="r amt">${money(sumOf(g))}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">—</td></tr>'}</tbody></table>`;
    $('#cr-count').textContent = `${num(rows.length)} ฉบับ`;
    $('#cr-list').innerHTML = listTable(rows, false);
  };
  ['#cr-from', '#cr-to', '#cr-acc', '#cr-bank', '#cr-status'].forEach((s) => $(s).addEventListener('change', load));
  $('#cr-group').addEventListener('change', () => { R.group = $('#cr-group').value; paint(); });
  $$('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const q = b.dataset.q;
    if (q === 'today') { $('#cr-from').value = today; $('#cr-to').value = today; }
    if (q === 'month') { $('#cr-from').value = today.slice(0, 8) + '01'; $('#cr-to').value = today; }
    if (q === 'fy') { const [a, z] = fiscalYearRange(); $('#cr-from').value = a; $('#cr-to').value = z; }
    if (q === 'year') { $('#cr-from').value = today.slice(0, 4) + '-01-01'; $('#cr-to').value = today.slice(0, 4) + '-12-31'; }
    load();
  }));
  $('#cr-csv').addEventListener('click', () => {
    const lines = [['รายงานเช็ค'], [rangeText()], [], ['ลำดับ', 'เลขที่เช็ค', 'เล่มที่', 'วันที่', 'จ่าย', 'จำนวนเงิน', 'จำนวนเงิน (ตัวอักษร)', 'รายการ', 'บัญชี', 'ธนาคาร', 'ประเภท', 'สถานะ', 'เหตุผลยกเลิก'],
      ...R.rows.map((c, i) => [i + 1, c.cheque_no, c.book_no || '', thDate(c.cheque_date, false), c.payee, Number(c.amount).toFixed(2), bahtText(c.amount), c.detail || '', accName(c.account_id), bankName(c.bank_id), c.crossing ? (c.crossing === 'ac' ? 'AC' : 'Non-AC') : '', c.status === 'cancelled' ? 'ยกเลิก' : 'ปกติ', c.cancel_reason || '']),
      ['', `รวม ${R.rows.length} ฉบับ`, '', '', '', sumOf(R.rows).toFixed(2)]];
    const csv = '﻿' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `รายงานเช็ค_${R.from || 'ทั้งหมด'}_${R.to || ''}.csv`);
  });
  $('#cr-print').addEventListener('click', () => {
    if (!R.rows?.length) return warn('ไม่มีรายการ');
    const normal = R.rows.filter((c) => c.status === 'normal');
    const filters = [R.account ? accName(Number(R.account)) : 'ทุกบัญชี', R.bank ? bankName(Number(R.bank)) : 'ทุกธนาคาร', { normal: 'สถานะปกติ', cancelled: 'สถานะยกเลิก', '': 'ทุกสถานะ' }[R.status]].join(' · ');
    printReport(`
      <div class="rp-head"><img src="assets/logo.png" alt=""><div><h2>รายงานการจ่ายเช็ค</h2><div>${esc(S.settings.org_name || '')}</div></div></div>
      <div class="rp-meta"><span><b>ช่วงเวลา:</b> ${esc(rangeText())}</span><span>${esc(filters)}</span></div>
      <div class="rp-sum"><div>จำนวน<b>${num(normal.length)}</b>ฉบับ</div><div>ยอดเงินรวม<b>${money(sumOf(normal))}</b>บาท</div><div>ยกเลิก<b>${num(R.rows.length - normal.length)}</b>ฉบับ</div></div>
      ${listTable(R.rows, true)}
      <div class="rp-sign"><div>ลงชื่อ ..................................................... ผู้รายงาน<br>(${esc(S.profile.full_name || S.profile.email)})</div>
      <div>พิมพ์เมื่อ ${thDate(bkkDate(), false)} เวลา ${fmtTime(new Date())} น.</div></div>`);
  });
  load();
}

// =====================================================================
//  ADMIN — บัญชีเงินและธนาคาร
// =====================================================================
async function viewChequeAdmin() {
  await loadChequeRefs();
  view().innerHTML = `
  <div class="grid-2">
    <div class="card"><div class="card-head"><h3>บัญชีเงิน (ประเภทเช็ค)</h3><button class="btn btn-primary btn-sm" id="ca-add">+ เพิ่มบัญชี</button></div>
      <div class="table-wrap"><table><thead><tr><th>ชื่อบัญชี</th><th>ธนาคารหลัก</th><th>เลขที่บัญชี</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${S.chq.accounts.map((a) => `<tr data-id="${a.id}"><td><b>${esc(a.name)}</b><div class="muted" style="font-size:16px">${esc(a.code)}${a.note ? ` · ${esc(a.note)}` : ''}</div></td><td>${esc(bankName(a.bank_id))}</td><td>${esc(a.account_no || '')}</td>
        <td>${a.active ? '<span class="badge b-printed">ใช้งาน</span>' : '<span class="badge b-cancelled">ปิด</span>'}</td><td class="actions"><button class="btn btn-sm" data-a="acc">แก้ไข</button></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>ธนาคาร</h3><button class="btn btn-primary btn-sm" id="cb-add">+ เพิ่มธนาคาร</button></div>
      <div class="table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อธนาคาร</th><th>ชื่อย่อ</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${S.chq.banks.map((b) => `<tr data-id="${b.id}"><td>${b.id} · ${esc(b.code)}</td><td><b>${esc(b.name)}</b></td><td>${esc(b.short_name || '')}</td>
        <td>${b.active ? '<span class="badge b-printed">ใช้งาน</span>' : '<span class="badge b-cancelled">ปิด</span>'}</td><td class="actions"><button class="btn btn-sm" data-a="bank">แก้ไข</button></td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:17px;margin-bottom:0">รหัสธนาคารตามข้อมูลเดิม: 2 = กรุงไทย, 3 = กสิกรไทย, 1 = ธนาคารอื่น (แก้ชื่อได้ที่นี่)</p></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>ภาพเช็คเปล่าของแต่ละธนาคาร</h3></div>
    <p class="muted" style="margin-top:0;font-size:18px">ใช้เป็นภาพด้านหลังตอนตั้งค่าแบบฟอร์มและตอนดูตัวอย่างก่อนพิมพ์ (ไม่ถูกพิมพ์) — ควรเป็นภาพสแกน<b>เช็คทั้งแผ่น 9.5" × 3.5" รวมต้นขั้วด้านซ้ายก่อนฉีก</b> ครอปชิดขอบกระดาษ ผู้ใช้แต่ละคนยังเปลี่ยนรูปเฉพาะแบบฟอร์มของตัวเองได้</p>
    <div class="bank-pics">${S.chq.banks.filter((b) => b.active).map((b) => {
      const src = chequeBg(b.id);
      return `<div class="bank-pic" data-id="${b.id}"><div class="bank-pic-img">${src ? `<img src="${esc(src)}" alt="">` : '<span class="muted">ยังไม่มีภาพ</span>'}</div>
        <div class="bank-pic-bar"><b>${esc(b.name)}</b><span class="muted" style="font-size:16px">${b.bg_image ? 'ภาพที่อัปโหลด' : BANK_BG[b.code] ? 'ภาพที่มากับระบบ' : ''}</span><span class="spacer"></span>
        <button class="btn btn-sm" data-a="pic">📷 เปลี่ยนรูป</button>${b.bg_image ? `<button class="btn btn-sm" data-a="pic-reset">↺ ${BANK_BG[b.code] ? 'ใช้ภาพที่มากับระบบ' : 'ลบภาพ'}</button>` : ''}</div></div>`;
    }).join('')}</div><input type="file" id="cb-pic" accept="image/*" hidden></div>`;
  const accForm = async (a) => {
    a = a || { active: true, bank_id: 2, sort: S.chq.accounts.length + 1 };
    const r = await Swal.fire({ title: a.id ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี', focusConfirm: false, html: `<div class="swal-form">
      <label class="full">ชื่อบัญชี<input id="a-name" value="${esc(a.name || '')}"></label><label>รหัส (ภาษาอังกฤษ)<input id="a-code" value="${esc(a.code || '')}" ${a.id ? 'disabled' : ''}></label>
      <label>ธนาคารหลัก<select id="a-bank">${S.chq.banks.map((b) => opt(b.id, b.name, a.bank_id)).join('')}</select></label><label>เลขที่บัญชี<input id="a-no" value="${esc(a.account_no || '')}"></label>
      <label>ลำดับ<input id="a-sort" type="number" value="${a.sort ?? 0}"></label><label class="full">หมายเหตุ<input id="a-note" value="${esc(a.note || '')}"></label>
      <label class="full" style="display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" id="a-act" ${a.active ? 'checked' : ''}> เปิดใช้งาน</label></div>`,
      showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      preConfirm: () => { const d = { name: val('a-name'), bank_id: Number(val('a-bank')), account_no: val('a-no') || null, sort: Number(val('a-sort')) || 0, note: val('a-note') || null, active: $('#a-act').checked }; if (!a.id) d.code = val('a-code'); if (!d.name || (!a.id && !/^[a-z0-9_-]+$/i.test(d.code || ''))) return Swal.showValidationMessage('กรอกชื่อบัญชี และรหัสเป็นภาษาอังกฤษ/ตัวเลข'); return d; } });
    if (!r.isConfirmed) return;
    try { await must(a.id ? S.sb.from('cheque_accounts').update(r.value).eq('id', a.id) : S.sb.from('cheque_accounts').insert(r.value)); ok('บันทึกแล้ว'); route(); } catch (e) { fail(e); }
  };
  const bankForm = async (b) => {
    b = b || { active: true, id: Math.max(0, ...S.chq.banks.map((x) => x.id)) + 1 };
    const r = await Swal.fire({ title: S.chq.banks.some((x) => x.id === b.id) ? 'แก้ไขธนาคาร' : 'เพิ่มธนาคาร', focusConfirm: false, html: `<div class="swal-form">
      <label>รหัสอักษร<input id="b-code" value="${esc(b.code || '')}" placeholder="เช่น SCB"></label><label>ชื่อย่อ<input id="b-short" value="${esc(b.short_name || '')}"></label>
      <label class="full">ชื่อธนาคาร<input id="b-name" value="${esc(b.name || '')}"></label>
      <label class="full" style="display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" id="b-act" ${b.active ? 'checked' : ''}> เปิดใช้งาน</label></div>`,
      showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      preConfirm: () => { const d = { id: b.id, code: val('b-code').toUpperCase(), name: val('b-name'), short_name: val('b-short') || null, active: $('#b-act').checked }; if (!d.code || !d.name) return Swal.showValidationMessage('กรอกรหัสและชื่อธนาคาร'); return d; } });
    if (!r.isConfirmed) return;
    try { await must(S.chq.banks.some((x) => x.id === b.id) ? S.sb.from('cheque_banks').update(r.value).eq('id', b.id) : S.sb.from('cheque_banks').insert(r.value)); ok('บันทึกแล้ว'); route(); } catch (e) { fail(e); }
  };
  $('#ca-add').addEventListener('click', () => accForm(null));
  $('#cb-add').addEventListener('click', () => bankForm(null));
  let picBank = null;
  $('#cb-pic').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file || !picBank) return;
    try { loading('กำลังบันทึกภาพ...'); await must(S.sb.from('cheque_banks').update({ bg_image: await shrinkImageJpeg(file, 2000) }).eq('id', picBank)); ok('เปลี่ยนรูปเช็คแล้ว'); route(); } catch (er) { fail(er); }
  });
  view().addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'pic') { picBank = Number(e.target.closest('.bank-pic').dataset.id); $('#cb-pic').click(); return; }
    if (a === 'pic-reset') {
      const bid = Number(e.target.closest('.bank-pic').dataset.id);
      if (!(await ask('ยกเลิกภาพที่อัปโหลด?', 'กลับไปใช้ภาพเช็คที่มากับระบบ (ถ้ามี)'))) return;
      try { await must(S.sb.from('cheque_banks').update({ bg_image: null }).eq('id', bid)); ok('เรียบร้อย'); route(); } catch (er) { fail(er); }
      return;
    }
    const id = Number(e.target.closest('tr').dataset.id);
    if (a === 'acc') accForm(S.chq.accounts.find((x) => x.id === id));
    if (a === 'bank') bankForm(S.chq.banks.find((x) => x.id === id));
  });
}

boot().catch((e) => { console.error(e); show('#login-screen'); fail(e); });
