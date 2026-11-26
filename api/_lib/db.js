// =====================================================================
//  Neon PostgreSQL connection (Vercel Serverless Functions)
//  • DATABASE_URL = Neon connection string (Vercel → Environment Variables;
//    the Neon integration on Vercel sets it automatically)
//  • On Neon the WebSocket driver @neondatabase/serverless is used.
//    For a local PostgreSQL (localhost) the normal "pg" driver is used.
// =====================================================================
const ws = require('ws');

function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
}

let drv = null;
function driver(url) {
  if (drv) return drv;
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || process.env.DB_DRIVER === 'pg';
  if (local) {
    drv = require('pg');
  } else {
    drv = require('@neondatabase/serverless');
    drv.neonConfig.webSocketConstructor = ws;
  }
  // return values the way Supabase (PostgREST) did: numbers as numbers, dates as text
  const { types } = drv;
  types.setTypeParser(20, (v) => Number(v));                         // int8
  types.setTypeParser(1700, (v) => Number(v));                       // numeric
  types.setTypeParser(1082, (v) => v);                               // date → 'YYYY-MM-DD'
  types.setTypeParser(1184, (v) => new Date(v).toISOString());       // timestamptz → ISO (UTC)
  types.setTypeParser(1114, (v) => new Date(`${v}Z`).toISOString()); // timestamp (no tz) → ISO
  return drv;
}

class ApiError extends Error {
  constructor(message, status = 400, code = '') { super(message); this.status = status; this.code = code; }
}

/** Runs fn(client) on one connection. tx = wrap in a transaction. */
async function withClient(fn, { tx = false, userId = null } = {}) {
  const url = dbUrl();
  if (!url) throw new ApiError('ยังไม่ได้ตั้งค่า DATABASE_URL (Neon) ใน Vercel → Environment Variables', 503, 'not_configured');
  const { Pool } = driver(url);
  const pool = new Pool({ connectionString: url, max: 1 });
  let client;
  try {
    try { client = await pool.connect(); }
    catch (e) { throw new ApiError(`เชื่อมต่อฐานข้อมูล Neon ไม่ได้: ${e.message}`, 503, 'db_unreachable'); }
    if (!tx) return await fn(client);
    await client.query('begin');
    try {
      if (userId) await client.query("select set_config('app.user_id', $1, true)", [userId]);
      const r = await fn(client);
      await client.query('commit');
      return r;
    } catch (e) {
      try { await client.query('rollback'); } catch { /* ignore */ }
      throw e;
    }
  } finally {
    if (client) client.release();
    await pool.end().catch(() => {});
  }
}

/** PostgreSQL error → Thai message (same wording as the PHP version). */
function friendly(e) {
  if (e instanceof ApiError) return e;
  switch (e.code) {
    case '23505': return new ApiError('ข้อมูลซ้ำกับที่มีอยู่แล้ว (duplicate key)', 409, '23505');
    case '23503': return new ApiError('ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงรายการนี้อยู่ (foreign key)', 409, '23503');
    case '23502': return new ApiError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ', 400, '23502');
    case '23514': return new ApiError('ข้อมูลไม่ถูกต้องตามเงื่อนไขของระบบ', 400, '23514');
    case '22P02': case '22007': case '22008': return new ApiError(`รูปแบบข้อมูลไม่ถูกต้อง: ${e.message}`, 400, e.code);
    case 'P0001': return new ApiError(e.message, 400, 'P0001'); // raise exception in a database function
    case '42P01': return new ApiError('ยังไม่ได้สร้างตารางในฐานข้อมูล — รัน npm run db:setup (ดู README)', 500, '42P01');
  }
  return new ApiError(e.message || String(e), e.status || 500, e.code || '');
}

module.exports = { dbUrl, withClient, ApiError, friendly };
