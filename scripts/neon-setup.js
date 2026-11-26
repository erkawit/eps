// =====================================================================
//  npm run db:setup — create the tables on a new Neon database
//
//    DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" npm run db:setup
//    (Windows PowerShell:  $env:DATABASE_URL="..."; npm run db:setup)
//
//  Runs neon/*.sql in order. Every file is safe to re-run.
//    --schema-only   only tables/functions (00, 01, 06) and the base settings (02) — no old data
// =====================================================================
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const url = process.env.DATABASE_URL || process.argv.find((a) => /^postgres(ql)?:\/\//.test(a));
if (!url) {
  console.error('ต้องระบุ DATABASE_URL ของ Neon เช่น\n  DATABASE_URL="postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" npm run db:setup');
  process.exit(1);
}
const schemaOnly = process.argv.includes('--schema-only');
const dir = path.join(__dirname, '..', 'neon');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .filter((f) => !schemaOnly || /^(00|01|02|06)_/.test(f));

(async () => {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const c = new Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  await c.connect();
  for (const f of files) {
    process.stdout.write(`→ ${f} ... `);
    const t = Date.now();
    await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    console.log(`ok (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
  await c.end();
  console.log('\nเสร็จแล้ว — เปิดเว็บแล้วกด "ขอสิทธิ์ใช้งาน" ผู้ใช้คนแรกจะเป็นผู้ดูแลระบบ');
})().catch((e) => { console.error(`\nผิดพลาด: ${e.message}`); process.exit(1); });
