// =====================================================================
//  sb.rpc('<name>', {...}) → the PostgreSQL functions in neon/01 + neon/06
//  (the same functions the Supabase version used). auth.uid() inside them
//  is the signed-in user (set by api/db.js with set_config).
// =====================================================================
const { ApiError } = require('./db');

// name → { args: {param: type}, ret: 'rows' | 'value' | 'void' }
const FNS = {
  issue_letters:          { ret: 'rows', args: { p_book_id: 'int', p_customer_ids: 'bigint[]', p_subject: 'text', p_urgency: 'text', p_envelope: 'text' } },
  mark_printed:           { ret: 'value', args: { p_ids: 'bigint[]', p_envelope: 'text' } },
  cancel_letter:          { ret: 'void', args: { p_id: 'bigint', p_reason: 'text' } },
  update_letter:          { ret: 'void', args: { p_id: 'bigint', p_name: 'text', p_address: 'text', p_amphur: 'text', p_province: 'text', p_postcode: 'text', p_subject: 'text', p_urgency: 'text' } },
  print_report:           { ret: 'rows', args: { p_period: 'text', p_from: 'date', p_to: 'date' } },
  print_report_items:     { ret: 'rows', args: { p_from: 'date', p_to: 'date', p_envelope: 'text' } },
  admin_user_auth_status: { ret: 'rows', args: {} },
  admin_confirm_user:     { ret: 'void', args: { p_id: 'uuid' } },
  mark_cheques_printed:   { ret: 'value', args: { p_ids: 'bigint[]', p_form_id: 'bigint', p_crossing: 'text' } },
  cancel_cheque:          { ret: 'void', args: { p_id: 'bigint', p_reason: 'text' } },
};

async function handleRpc(c, me, b) {
  if (!me) throw new ApiError('กรุณาเข้าสู่ระบบ', 401, 'not_signed_in');
  const fn = String(b.fn || '');
  const def = FNS[fn];
  if (!def) throw new ApiError(`ไม่รู้จักคำสั่ง ${fn}`, 404, 'PGRST202');
  const a = b.args || {};
  const params = []; const named = [];
  for (const [k, type] of Object.entries(def.args)) {
    if (!(k in a)) continue; // use the function's default
    params.push(a[k] === undefined ? null : a[k]);
    named.push(`${k} => $${params.length}::${type}`);
  }
  const { rows } = await c.query(`select * from public.${fn}(${named.join(', ')})`, params);
  if (def.ret === 'rows') return rows;
  if (def.ret === 'void') return null;
  const r = rows[0];
  return r ? r[fn] ?? Object.values(r)[0] : null;
}

module.exports = { handleRpc };
