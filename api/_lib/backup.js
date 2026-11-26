// =====================================================================
//  Backups (.json.gz) — stored in the Neon table public.backup_files
//  (replaces the Supabase Storage bucket "backups").
//  Path: <ปี พ.ศ.>/<เดือน>/<วันที่>/backup_<...>_<manual|auto>.json.gz
// =====================================================================
const zlib = require('zlib');
const { ApiError } = require('./db');

const TABLES = ['settings', 'titles', 'provinces', 'postcodes', 'customers', 'books', 'letters', 'print_logs', 'profiles', 'envelope_layouts', 'cheque_banks', 'cheque_accounts', 'cheques', 'cheque_forms', 'cheque_print_logs', 'backup_logs'];
const PATH_RE = /^\d{4}\/\d{2}\/\d{2}\/backup_[0-9_-]+_(manual|auto)\.json\.gz$/;

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

/** Exports every table into one gzip file. */
async function runBackup(c, type, byName, byId) {
  const tables = {}; const rowCounts = {};
  for (const t of TABLES) {
    let rows = [];
    try { rows = (await c.query(`select * from public."${t}" order by id`)).rows; } catch { rows = []; }
    tables[t] = rows; rowCounts[t] = rows.length;
  }
  const now = new Date();
  const b = bkk(now);
  const path = `${b.be}/${b.mm}/${b.dd}/backup_${b.be}-${b.mm}-${b.dd}_${b.hh}${b.mi}${b.ss}_${type}.json.gz`;
  const body = zlib.gzipSync(Buffer.from(JSON.stringify({
    meta: { app: 'envelope-print-system', format: 2, type, path, created_at: now.toISOString(), created_by: byName, database: 'neon', row_counts: rowCounts },
    tables,
  })));
  await c.query(
    `insert into public.backup_files (path, data, size_bytes) values ($1, $2, $3)
     on conflict (path) do update set data = excluded.data, size_bytes = excluded.size_bytes, created_at = now()`,
    [path, body, body.length]);
  await c.query(
    'insert into public.backup_logs (backup_type, path, size_bytes, row_counts, created_by, created_by_name) values ($1, $2, $3, $4, $5, $6)',
    [type, path, body.length, JSON.stringify(rowCounts), byId, byName]);
  return { ok: true, path, size_bytes: body.length, row_counts: rowCounts };
}

/** Daily rule: back up once a day unless someone pressed "สำรองข้อมูลตอนนี้" yesterday. Returns a reason to skip, or null. */
async function autoSkipReason(c) {
  const now = new Date();
  const today = bkk(now).ce;
  const yb = bkk(new Date(now.getTime() - 864e5));
  const manual = await c.query(
    "select 1 from public.backup_logs where backup_type = 'manual' and created_at >= $1::timestamptz and created_at < $2::timestamptz limit 1",
    [`${yb.ce}T00:00:00+07:00`, `${today}T00:00:00+07:00`]);
  if (manual.rowCount) return `มีการกดสำรองข้อมูลเมื่อวันที่ ${yb.dd}/${yb.mm}/${yb.be} แล้ว`;
  const auto = await c.query(
    "select 1 from public.backup_logs where backup_type = 'auto' and created_at >= $1::timestamptz limit 1", [`${today}T00:00:00+07:00`]);
  if (auto.rowCount) return 'วันนี้สำรองอัตโนมัติไปแล้ว';
  return null;
}

async function readBackup(c, path) {
  if (!PATH_RE.test(path)) throw new ApiError('ชื่อไฟล์ไม่ถูกต้อง');
  const { rows } = await c.query('select data from public.backup_files where path = $1', [path]);
  if (!rows.length) throw new ApiError('ไม่พบไฟล์สำรอง', 404);
  return rows[0].data;
}

async function removeBackup(c, path) {
  if (!PATH_RE.test(path)) throw new ApiError('ชื่อไฟล์ไม่ถูกต้อง');
  await c.query('delete from public.backup_files where path = $1', [path]);
}

module.exports = { runBackup, autoSkipReason, readBackup, removeBackup, bkk, TABLES };
