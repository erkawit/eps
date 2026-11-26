// =====================================================================
//  npm run db:migrate-from-supabase — copy all data from Supabase to Neon
//
//  แบบที่ 1: คัดลอกตรงจากฐานข้อมูล Supabase (แนะนำ — ผู้ใช้ใช้รหัสผ่านเดิมได้)
//    SUPABASE_DB_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
//    DATABASE_URL="postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" \
//    npm run db:migrate-from-supabase
//
//    (ไม่บังคับ) ถ้าต้องการย้ายไฟล์สำรองเดิมใน Supabase Storage มาด้วย ให้ตั้งเพิ่ม
//    SUPABASE_URL="https://xxxx.supabase.co"  SUPABASE_SERVICE_ROLE_KEY="..."
//
//  แบบที่ 2: Supabase ใช้ไม่ได้แล้ว → ใช้ไฟล์สำรองของระบบ (.json หรือ .json.gz)
//    DATABASE_URL="..." npm run db:migrate-from-supabase -- --from-backup=backup_2569-10-23_103015_manual.json.gz --temp-password=Temp1234
//    (ไฟล์สำรองไม่มีรหัสผ่านของผู้ใช้ → ทุกคนเข้าด้วยรหัสชั่วคราวนี้ แล้วเปลี่ยนเองที่ชื่อผู้ใช้มุมซ้ายล่าง)
//
//  ตัวเลือก:  --replace   ล้างข้อมูลใน Neon ก่อน (ถ้ามีข้อมูลอยู่แล้ว ปกติจะหยุดเพื่อป้องกันข้อมูลหาย)
//  Windows PowerShell: $env:SUPABASE_DB_URL="..."; $env:DATABASE_URL="..."; npm run db:migrate-from-supabase
// =====================================================================
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const flag = (k) => process.argv.includes(`--${k}`);

const TARGET = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
const SOURCE = process.env.SUPABASE_DB_URL;
const FROM_BACKUP = arg('from-backup');
const TEMP_PW = arg('temp-password');

// copy order (parents before children)
const TABLES = ['settings', 'titles', 'provinces', 'postcodes', 'customers', 'books', 'letters', 'print_logs',
  'profiles', 'envelope_layouts', 'cheque_banks', 'cheque_accounts', 'cheques', 'cheque_forms', 'cheque_print_logs', 'backup_logs'];
const SCHEMA_FILES = ['00_auth_shim.sql', '01_schema.sql', '06_cheque_schema.sql'];
const BATCH = 500;

function die(msg) { console.error(`\n✕ ${msg}`); process.exit(1); }
const isLocal = (u) => /@(localhost|127\.0\.0\.1)[:/]/.test(u);
const client = (u, raw) => new Client({
  connectionString: u,
  ssl: isLocal(u) ? false : { rejectUnauthorized: false },
  // read every value as text (json as objects) so nothing is changed on the way
  ...(raw ? { types: { getTypeParser: (oid) => ((oid === 114 || oid === 3802) ? (v) => JSON.parse(v) : (v) => v) } } : {}),
});

async function columns(c, schema, table) {
  const { rows } = await c.query('select column_name from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position', [schema, table]);
  return rows.map((r) => r.column_name);
}

async function insertRows(dst, fq, allCols, rows) {
  // only columns the source has (others keep their default value)
  const cols = allCols.filter((c) => rows.some((r) => r[c] !== undefined));
  if (!rows.length || !cols.length) return;
  const list = cols.map((c) => `"${c}"`).join(', ');
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH).map((r) => Object.fromEntries(cols.map((c) => [c, r[c] === undefined ? null : r[c]])));
    await dst.query(`insert into ${fq} (${list}) select ${list} from json_populate_recordset(null::${fq}, $1::json)`, [JSON.stringify(part)]);
  }
}

async function loadBackupFile(file) {
  let buf = fs.readFileSync(path.resolve(file));
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const j = JSON.parse(buf.toString('utf8'));
  if (!j.tables) die('ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบ (ไม่พบ tables)');
  return j.tables;
}

(async () => {
  if (!TARGET) die('ต้องตั้ง DATABASE_URL (connection string ของ Neon)');
  if (!SOURCE && !FROM_BACKUP) die('ต้องตั้ง SUPABASE_DB_URL (Supabase → Connect → Session pooler) หรือใช้ --from-backup=<ไฟล์สำรอง>');
  if (FROM_BACKUP && (!TEMP_PW || TEMP_PW.length < 6)) die('ใช้ --from-backup ต้องกำหนด --temp-password=<รหัสชั่วคราวอย่างน้อย 6 ตัว> ด้วย');

  const dst = client(TARGET, false);
  await dst.connect();
  console.log('เชื่อมต่อ Neon แล้ว — สร้าง/อัปเดตโครงสร้างตาราง');
  for (const f of SCHEMA_FILES) await dst.query(fs.readFileSync(path.join(__dirname, '..', 'neon', f), 'utf8'));

  // ---- read the source ----
  const data = {}; let users = [];
  let src = null;
  if (SOURCE) {
    src = client(SOURCE, true);
    try { await src.connect(); } catch (e) { die(`เชื่อมต่อ Supabase ไม่ได้: ${e.message}\n  (ถ้าโปรเจกต์ถูก pause ให้กด Restore ที่ supabase.com ก่อน หรือใช้ --from-backup)`); }
    console.log('เชื่อมต่อ Supabase แล้ว — อ่านข้อมูล');
    users = (await src.query(`select id, coalesce(email, id::text || '@no-email.local') as email, coalesce(encrypted_password, '') as encrypted_password,
                                     email_confirmed_at, last_sign_in_at, coalesce(raw_user_meta_data, '{}'::jsonb) as raw_user_meta_data, created_at, updated_at
                                from auth.users order by created_at`)).rows;
    for (const t of TABLES) {
      const has = await src.query("select 1 from information_schema.tables where table_schema = 'public' and table_name = $1", [t]);
      data[t] = has.rowCount ? (await src.query(`select * from public."${t}" order by id`)).rows : [];
    }
  } else {
    const tables = await loadBackupFile(FROM_BACKUP);
    for (const t of TABLES) data[t] = tables[t] || [];
    const hash = await bcrypt.hash(TEMP_PW, 10);
    users = data.profiles.map((p) => ({ id: p.id, email: p.email || `${p.id}@no-email.local`, encrypted_password: hash, email_confirmed_at: new Date().toISOString(), raw_user_meta_data: { full_name: p.full_name || '' }, created_at: p.created_at }));
  }

  // ---- old backup files (Supabase Storage) ----
  const files = [];
  const sUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (sUrl && sKey) {
    console.log(`ดาวน์โหลดไฟล์สำรองเดิมจาก Supabase Storage (${data.backup_logs.length} ไฟล์)`);
    for (const l of data.backup_logs) {
      const r = await fetch(`${sUrl}/storage/v1/object/backups/${l.path}`, { headers: { apikey: sKey, ...(sKey.startsWith('eyJ') ? { Authorization: `Bearer ${sKey}` } : {}) } });
      if (r.ok) files.push({ path: l.path, data: Buffer.from(await r.arrayBuffer()), created_at: l.created_at });
      else console.log(`  ! ข้าม ${l.path} (HTTP ${r.status})`);
    }
  }
  // keep only backup history whose file exists in Neon (otherwise "ดาวน์โหลด" would fail)
  const have = new Set(files.map((f) => f.path));
  const skippedLogs = data.backup_logs.filter((l) => !have.has(l.path)).length;
  data.backup_logs = data.backup_logs.filter((l) => have.has(l.path));

  // ---- write to Neon in one transaction ----
  await dst.query('begin');
  try {
    const existing = Number((await dst.query('select (select count(*) from auth.users) + (select count(*) from public.customers) + (select count(*) from public.letters) + (select count(*) from public.cheques) as n')).rows[0].n);
    if (existing && !flag('replace')) die('ฐานข้อมูล Neon มีข้อมูลอยู่แล้ว — ถ้าต้องการล้างแล้วคัดลอกใหม่ทั้งหมด ให้เพิ่ม --replace');
    await dst.query(`truncate ${[...TABLES, 'backup_files'].map((t) => `public."${t}"`).join(', ')}, auth.users restart identity cascade`);
    // keep values exactly as they are (no auto profile / customer code / updated_at)
    for (const t of ['auth.users', 'public.customers', 'public.cheques']) await dst.query(`alter table ${t} disable trigger user`);

    const uCols = await columns(dst, 'auth', 'users');
    await insertRows(dst, 'auth.users', uCols, users);
    console.log(`  auth.users (ผู้ใช้/รหัสผ่าน): ${users.length}`);
    const userIds = new Set(users.map((u) => u.id));
    for (const t of TABLES) {
      const cols = await columns(dst, 'public', t);
      let rows = data[t];
      if (t === 'profiles') rows = rows.filter((p) => userIds.has(p.id));
      await insertRows(dst, `public."${t}"`, cols, rows);
      console.log(`  ${t}: ${rows.length}`);
    }
    for (const f of files) {
      await dst.query('insert into public.backup_files (path, data, size_bytes, created_at) values ($1, $2, $3, $4)', [f.path, f.data, f.data.length, f.created_at]);
    }
    if (files.length) console.log(`  backup_files: ${files.length}`);

    for (const t of ['auth.users', 'public.customers', 'public.cheques']) await dst.query(`alter table ${t} enable trigger user`);
    // continue running numbers after the copied rows
    for (const t of TABLES) {
      const seq = (await dst.query(`select pg_get_serial_sequence('public."${t}"', 'id') s`)).rows[0].s;
      if (seq) await dst.query(`select setval($1, coalesce((select max(id) from public."${t}"), 0) + 1, false)`, [seq]);
    }
    await dst.query('commit');
  } catch (e) {
    await dst.query('rollback').catch(() => {});
    throw e;
  }

  // ---- verify ----
  console.log('\nตรวจสอบจำนวนแถว (ต้นทาง → Neon):');
  let bad = 0;
  for (const t of TABLES) {
    const n = Number((await dst.query(`select count(*) n from public."${t}"`)).rows[0].n);
    const want = t === 'profiles' ? data[t].filter((p) => users.some((u) => u.id === p.id)).length : data[t].length;
    if (n !== want) bad++;
    console.log(`  ${n === want ? '✔' : '✕'} ${t.padEnd(18)} ${want} → ${n}`);
  }
  await dst.end();
  if (src) await src.end();
  if (skippedLogs) console.log(`\nหมายเหตุ: ไม่ได้ย้ายประวัติไฟล์สำรองเดิม ${skippedLogs} รายการ (ไฟล์อยู่ใน Supabase Storage — ตั้ง SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY แล้วรันใหม่ด้วย --replace ถ้าต้องการย้ายมาด้วย)`);
  if (FROM_BACKUP) console.log(`\nผู้ใช้ทุกคนเข้าสู่ระบบด้วยรหัสชั่วคราว: ${TEMP_PW} — แล้วเปลี่ยนรหัสผ่านเอง`);
  if (bad) die('จำนวนแถวไม่ตรงกัน กรุณาตรวจสอบ');
  console.log(FROM_BACKUP ? '\n✔ ย้ายข้อมูลเสร็จแล้ว' : '\n✔ ย้ายข้อมูลเสร็จแล้ว — ผู้ใช้เข้าสู่ระบบด้วยอีเมลและรหัสผ่านเดิมได้ทันที');
})().catch((e) => die(e.message));
