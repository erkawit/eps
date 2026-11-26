// =====================================================================
//  backend.js — เลือกฐานข้อมูลของระบบ
//    • MySQL (XAMPP)          : หน้าเว็บคุยกับ api/index.php (PHP) — ค่าเริ่มต้น
//    • Neon PostgreSQL (Vercel): config.js มี BACKEND: 'neon' (Vercel สร้างให้ตอน build)
//                               หน้าเว็บคุยกับ /api/db (Vercel Function → Neon)
//  ทั้ง 2 แบบใช้คำสั่งรูปแบบเดียวกัน (sb.from(...).select()...) ผ่าน assets/db.js
// =====================================================================
import { createClient as createApiClient, api, API } from './db.js';

export const CFG = window.APP_CONFIG || {};
export const MODE = CFG.BACKEND === 'neon' || CFG.BACKEND === 'supabase' ? 'neon' : 'mysql';
export const IS_NEON = MODE === 'neon';
export { api, API };

const phpOk = (r) => { if (r.error) throw r.error; return r; };

/**
 * Operations that differ between the two databases (labels / where backups are kept).
 * @param {() => any} _getSb  returns the current client (S.sb)
 * @param {() => any} _getProfile  returns the signed-in profile
 */
export function makeBackend(_getSb, _getProfile) {
  return {
    mode: MODE,
    label: IS_NEON ? 'Neon PostgreSQL' : 'MySQL (XAMPP)',
    createClient: () => createApiClient(),
    createUser: async (d) => phpOk(await api('admin_create_user', d)),
    setPassword: async (id, password) => phpOk(await api('admin_set_password', { id, password })),
    changePassword: async (old, password) => phpOk(await api('change_password', { old, password })),
    backupStatus: async () => { const r = await api('backup_status'); return r.error ? null : r; },
    backupRun: async (type) => phpOk(await api('backup_run', { type })),
    backupDownload: async (path) => {
      const sep = API.includes('?') ? '&' : '?';
      const resp = await fetch(`${API}${sep}a=backup_download&path=${encodeURIComponent(path)}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!resp.ok) { const j = await resp.json().catch(() => null); throw new Error(j?.error?.message || `ดาวน์โหลดไม่สำเร็จ (HTTP ${resp.status})`); }
      return resp.blob();
    },
    backupRemove: async (path) => phpOk(await api('backup_remove', { path })),
    backupWhere: IS_NEON ? 'ฐานข้อมูล Neon (ตาราง backup_files)' : 'โฟลเดอร์ private/backups บนเครื่องเซิร์ฟเวอร์',
  };
}
