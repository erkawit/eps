// =====================================================================
//  Table read / write from the web page (select / insert / update / delete)
//  Same request format as api/query.php (MySQL) — see assets/db.js.
//  Permissions are checked per table here (same rules as the Row Level
//  Security policies of the Supabase version).
// =====================================================================
const { ApiError } = require('./db');

/*
 * active = approved user, env = envelope system, chq = cheque system,
 * admin = administrator, none = never. _own = only rows of the user (user_id),
 * self = only the user's own profile, chq_normal = only cheques not cancelled.
 * Admins may do everything that is not "none".
 */
const RULES = {
  settings:          { select: 'active', insert: 'admin', update: 'admin', delete: 'admin' },
  titles:            { select: 'active', insert: 'admin', update: 'admin', delete: 'admin' },
  provinces:         { select: 'active', insert: 'admin', update: 'admin', delete: 'admin' },
  postcodes:         { select: 'active', insert: 'admin', update: 'admin', delete: 'admin' },
  customers:         { select: 'env', insert: 'env', update: 'env', delete: 'admin' },
  books:             { select: 'env', insert: 'admin', update: 'admin', delete: 'admin' },
  letters:           { select: 'env', insert: 'admin', update: 'admin', delete: 'admin' },
  print_logs:        { select: 'env', insert: 'admin', update: 'admin', delete: 'admin' },
  profiles:          { select: 'self', insert: 'none', update: 'admin', delete: 'admin' },
  backup_logs:       { select: 'admin', insert: 'admin', update: 'admin', delete: 'admin' },
  envelope_layouts:  { select: 'env', insert: 'env_own', update: 'admin', delete: 'own' },
  cheque_banks:      { select: 'chq', insert: 'admin', update: 'admin', delete: 'admin' },
  cheque_accounts:   { select: 'chq', insert: 'admin', update: 'admin', delete: 'admin' },
  cheque_print_logs: { select: 'chq', insert: 'admin', update: 'admin', delete: 'admin' },
  cheques:           { select: 'chq', insert: 'chq', update: 'chq_normal', delete: 'admin' },
  cheque_forms:      { select: 'chq', insert: 'chq_own', update: 'own', delete: 'own' },
};

const perms = (me) => {
  const active = !!(me && me.active);
  const admin = active && me.role === 'admin';
  return { active, admin, env: active && (admin || me.perm_envelope), chq: active && (admin || me.perm_cheque) };
};

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const q = (id) => `"${id}"`;

const metaCache = new Map();
/** column name → kind (bool / int / num / json / ts / date / uuid / text) */
async function tableMeta(c, table) {
  if (metaCache.has(table)) return metaCache.get(table);
  const { rows } = await c.query(
    `select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`, [table]);
  if (!rows.length) throw new ApiError(`ไม่พบตาราง ${table} — รัน npm run db:setup เพื่อสร้างตาราง (ดู README)`, 500, '42P01');
  const m = {};
  for (const r of rows) {
    const t = r.data_type;
    m[r.column_name] = t === 'boolean' ? 'bool'
      : /^(smallint|integer|bigint)$/.test(t) ? 'int'
        : /^(numeric|real|double precision)$/.test(t) ? 'num'
          : /^jsonb?$/.test(t) ? 'json'
            : /^timestamp/.test(t) ? 'ts'
              : t === 'date' ? 'date'
                : t === 'uuid' ? 'uuid' : 'text';
  }
  metaCache.set(table, m);
  return m;
}

/** JS value → SQL parameter for a column kind */
function valIn(kind, v) {
  if (v === null || v === undefined) return null;
  if (kind === 'json') return JSON.stringify(v);
  if (kind === 'bool') return v === true || v === 1 || v === '1' || v === 'true' || v === 't';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

class Sql {
  constructor() { this.params = []; }
  p(v) { this.params.push(v); return `$${this.params.length}`; }
}

/** permission → extra WHERE (string), or throws. Reading without permission returns no rows (like RLS). */
function scopeFor(table, op, me, sql) {
  const rule = RULES[table]?.[op];
  if (!rule) throw new ApiError(`ไม่อนุญาตให้เข้าถึงตาราง ${table}`, 403, '42501');
  if (rule === 'none') throw new ApiError('ไม่อนุญาตคำสั่งนี้ (permission denied)', 403, '42501');
  const P = perms(me);
  if (P.admin) return '';
  const deny = () => {
    if (op === 'select') return 'false';
    throw new ApiError('ไม่มีสิทธิ์ทำรายการนี้ (กรุณาติดต่อผู้ดูแลระบบ)', 403, '42501');
  };
  switch (rule) {
    case 'active': return P.active ? '' : deny();
    case 'env': case 'env_own': return P.env ? '' : deny();
    case 'chq': case 'chq_own': return P.chq ? '' : deny();
    case 'self': return `"id" = ${sql.p(me.id)}`;
    case 'own': return `"user_id" = ${sql.p(me.id)}`;
    case 'chq_normal': return P.chq ? `"status" = 'normal'` : deny();
    default: return deny();
  }
}

function colCheck(meta, table, col) {
  if (!IDENT.test(String(col)) || !meta[col]) throw new ApiError(`ไม่พบคอลัมน์ ${table}.${col}`, 400, '42703');
  return q(col);
}

const OR_SPLIT = /,(?=[a-z_][a-z0-9_]*\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is)\.)/;
const OR_ITEM = /^([a-z_][a-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.([\s\S]*)$/;

function buildWhere(table, meta, filters, ors, scope, sql) {
  const parts = [];
  const cond = (c, op, v) => {
    const col = colCheck(meta, table, c);
    const kind = meta[c];
    switch (op) {
      case 'eq': return v === null ? `${col} is null` : `${col} = ${sql.p(valIn(kind, v))}`;
      case 'neq': return v === null ? `${col} is not null` : `${col} <> ${sql.p(valIn(kind, v))}`;
      case 'gt': return `${col} > ${sql.p(valIn(kind, v))}`;
      case 'gte': return `${col} >= ${sql.p(valIn(kind, v))}`;
      case 'lt': return `${col} < ${sql.p(valIn(kind, v))}`;
      case 'lte': return `${col} <= ${sql.p(valIn(kind, v))}`;
      case 'like': return `${col}::text like ${sql.p(String(v).replace(/\*/g, '%'))}`;
      case 'ilike': return `${col}::text ilike ${sql.p(String(v).replace(/\*/g, '%'))}`;
      case 'is':
        if (v === null || v === 'null') return `${col} is null`;
        if (v === true || v === 'true') return `${col} is true`;
        if (v === false || v === 'false') return `${col} is false`;
        throw new ApiError('is ใช้กับ null/true/false เท่านั้น');
      case 'in': {
        const vals = Array.isArray(v) ? v : [];
        if (!vals.length) return 'false';
        return `${col} in (${vals.map((x) => sql.p(valIn(kind, x))).join(', ')})`;
      }
    }
    throw new ApiError(`ไม่รองรับเงื่อนไข ${op}`);
  };
  for (const f of filters || []) parts.push(cond(String(f.c), String(f.op), f.v === undefined ? null : f.v));
  for (const or of ors || []) {
    const sub = String(or).split(OR_SPLIT).map((it) => {
      const m = OR_ITEM.exec(it);
      if (!m) throw new ApiError('เงื่อนไขค้นหาไม่ถูกต้อง');
      let v = m[3];
      if (m[2] === 'is' || (v === 'null' && (m[2] === 'eq' || m[2] === 'neq'))) v = v === 'null' ? null : v;
      return cond(m[1], m[2], v);
    });
    if (sub.length) parts.push(`(${sub.join(' or ')})`);
  }
  if (scope) parts.push(scope);
  return parts.length ? ` where ${parts.join(' and ')}` : '';
}

function selectCols(meta, table, cols) {
  cols = String(cols || '*').trim();
  if (cols === '' || cols === '*') return '*';
  return cols.split(',').map((c) => colCheck(meta, table, c.trim())).join(', ');
}

/** request body {table, op, columns, filters, or, order, range, limit, count, head, values} */
async function handleQuery(c, me, b) {
  if (!me) throw new ApiError('กรุณาเข้าสู่ระบบ', 401, 'not_signed_in');
  const table = String(b.table || '');
  const op = String(b.op || 'select');
  if (!IDENT.test(table)) throw new ApiError('ชื่อตารางไม่ถูกต้อง');
  if (!['select', 'insert', 'update', 'delete'].includes(op)) throw new ApiError('คำสั่งไม่ถูกต้อง');
  const sql = new Sql();
  const scope = scopeFor(table, op, me, sql);
  const meta = await tableMeta(c, table);
  const T = `public.${q(table)}`;

  if (op === 'select') {
    const where = buildWhere(table, meta, b.filters, b.or, scope, sql);
    const res = { data: null, count: null };
    if (b.count) res.count = Number((await c.query(`select count(*) as n from ${T}${where}`, sql.params)).rows[0].n);
    if (b.head) return res;
    let text = `select ${selectCols(meta, table, b.columns)} from ${T}${where}`;
    const order = (b.order || []).map((o) => `${colCheck(meta, table, o.c)} ${o.asc === false ? 'desc' : 'asc'}`);
    if (order.length) text += ` order by ${order.join(', ')}`;
    if (Array.isArray(b.range)) {
      const from = Math.max(0, Number(b.range[0]) | 0); const to = Math.max(from, Number(b.range[1]) | 0);
      text += ` limit ${to - from + 1} offset ${from}`;
    } else if (b.limit != null) text += ` limit ${Math.max(0, Number(b.limit) | 0)}`;
    res.data = (await c.query(text, sql.params)).rows;
    return res;
  }

  const P = perms(me);
  if (op === 'insert') {
    const rows = Array.isArray(b.values) ? b.values : [b.values];
    if (!rows.length || !rows[0]) throw new ApiError('ไม่มีข้อมูลที่จะบันทึก');
    const out = [];
    for (const row of rows) {
      const v = { ...row };
      for (const k of Object.keys(v)) { colCheck(meta, table, k); if (k === 'id' && v[k] == null) delete v[k]; }
      // rows that belong to a user are always saved as the signed-in user (admins may choose)
      if (meta.user_id && (!P.admin || !v.user_id)) v.user_id = me.id;
      const cols = Object.keys(v);
      const s = new Sql();
      const text = cols.length
        ? `insert into ${T} (${cols.map(q).join(', ')}) values (${cols.map((k) => s.p(valIn(meta[k], v[k]))).join(', ')}) returning *`
        : `insert into ${T} default values returning *`;
      out.push(...(await c.query(text, s.params)).rows);
    }
    return { data: out };
  }

  if (!(b.filters || []).length && !(b.or || []).length) throw new ApiError('ต้องระบุเงื่อนไขสำหรับการแก้ไข/ลบ');

  if (op === 'update') {
    const v = { ...(b.values || {}) };
    delete v.id;
    if (!P.admin) { delete v.user_id; delete v.created_by; }
    const cols = Object.keys(v);
    cols.forEach((k) => colCheck(meta, table, k));
    if (meta.updated_at && !cols.includes('updated_at') && table !== 'customers' && table !== 'cheques') cols.push('updated_at');
    if (!cols.length) return { data: [] };
    const set = cols.map((k) => (k === 'updated_at' && !(k in v) ? `"updated_at" = now()` : `${q(k)} = ${sql.p(valIn(meta[k], v[k]))}`));
    const where = buildWhere(table, meta, b.filters, b.or, scope, sql);
    return { data: (await c.query(`update ${T} set ${set.join(', ')}${where} returning *`, sql.params)).rows };
  }

  // delete
  const where = buildWhere(table, meta, b.filters, b.or, scope, sql);
  if (table === 'profiles') {
    // the login goes with the profile (profiles.id → auth.users on delete cascade)
    const rows = (await c.query(`select * from ${T}${where}`, sql.params)).rows;
    if (rows.length) await c.query('delete from auth.users where id = any($1::uuid[])', [rows.map((r) => r.id)]);
    return { data: rows };
  }
  return { data: (await c.query(`delete from ${T}${where} returning *`, sql.params)).rows };
}

module.exports = { handleQuery, perms, RULES };
