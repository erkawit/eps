<?php
// =====================================================================
//  คำสั่งอ่าน/เขียนตารางจากหน้าเว็บ (select / insert / update / delete)
//  ทุกคำสั่งตรวจสิทธิ์ตามตาราง (แทน Row Level Security ของ Supabase)
// =====================================================================
declare(strict_types=1);

/*
 * Rule levels: active = ผู้ใช้ที่อนุมัติแล้ว, env = สิทธิ์ระบบซอง, chq = สิทธิ์ระบบเช็ค,
 * admin = ผู้ดูแล, none = ห้าม. Suffixes: _own = เฉพาะแถวของตัวเอง (user_id),
 * self = เฉพาะโปรไฟล์ตัวเอง, chq_normal = เฉพาะเช็คที่ยังไม่ยกเลิก.
 * Admins may do everything that is not "none".
 */
const RULES = [
  'settings'          => ['select' => 'active', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'titles'            => ['select' => 'active', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'provinces'         => ['select' => 'active', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'postcodes'         => ['select' => 'active', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'customers'         => ['select' => 'env', 'insert' => 'env', 'update' => 'env', 'delete' => 'admin'],
  'books'             => ['select' => 'env', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'letters'           => ['select' => 'env', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'print_logs'        => ['select' => 'env', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'profiles'          => ['select' => 'self', 'insert' => 'none', 'update' => 'admin', 'delete' => 'admin'],
  'backup_logs'       => ['select' => 'admin', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'envelope_layouts'  => ['select' => 'env', 'insert' => 'env_own', 'update' => 'admin', 'delete' => 'own'],
  'cheque_banks'      => ['select' => 'chq', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'cheque_accounts'   => ['select' => 'chq', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'cheque_print_logs' => ['select' => 'chq', 'insert' => 'admin', 'update' => 'admin', 'delete' => 'admin'],
  'cheques'           => ['select' => 'chq', 'insert' => 'chq', 'update' => 'chq_normal', 'delete' => 'admin'],
  'cheque_forms'      => ['select' => 'chq', 'insert' => 'chq_own', 'update' => 'own', 'delete' => 'own'],
];

/** Returns extra WHERE conditions [sql, params] for this rule, or throws when not allowed. */
class NoRows extends Exception {}

function rule_scope(string $table, string $op): array {
  try { return rule_scope_inner($table, $op); }
  catch (NoRows $e) { return ['0 = 1', []]; }
}
function rule_scope_inner(string $table, string $op): array {
  require_login();
  if (!isset(RULES[$table])) throw new ApiError("ไม่อนุญาตให้เข้าถึงตาราง $table", 403);
  $rule = RULES[$table][$op];
  if ($rule === 'none') throw new ApiError('ไม่อนุญาตคำสั่งนี้', 403);
  if (is_admin()) return ['', []];
  // like Row Level Security: reading without permission returns no rows; writing is refused
  if ($op === 'select') $deny = function () { throw new NoRows(); };
  else $deny = function () { throw new ApiError('ไม่มีสิทธิ์ทำรายการนี้ (กรุณาติดต่อผู้ดูแลระบบ)', 403); };
  switch ($rule) {
    case 'active': if (!is_active_user()) $deny(); return ['', []];
    case 'env': if (!is_envelope_user()) $deny(); return ['', []];
    case 'chq': if (!is_cheque_user()) $deny(); return ['', []];
    case 'admin': $deny();
    case 'self': return ['`id` = ?', [me_id()]];
    case 'own': return ['`user_id` = ?', [me_id()]];
    case 'env_own': if (!is_envelope_user()) $deny(); return ['', []];
    case 'chq_own': if (!is_cheque_user()) $deny(); return ['', []];
    case 'chq_normal': if (!is_cheque_user()) $deny(); return ["`status` = 'normal'", []];
  }
  $deny();
  return ['', []];
}

function col_check(string $table, string $col): string {
  $m = table_meta($table);
  if (!valid_ident($col) || !isset($m[$col])) throw new ApiError("ไม่พบคอลัมน์ $table.$col");
  return $col;
}

/** Builds WHERE from filters [{c, op, v}] and or-groups ["name.ilike.%x%,code.eq.1"]. */
function build_where(string $table, array $filters, array $ors, array $scope): array {
  $parts = []; $params = [];
  $m = table_meta($table);
  $cond = function (string $c, string $op, $v) use ($table, $m, &$params): string {
    col_check($table, $c);
    $kind = $m[$c];
    switch ($op) {
      case 'eq': if ($v === null) return "`$c` IS NULL"; $params[] = val_in($kind, $v); return "`$c` = ?";
      case 'neq': if ($v === null) return "`$c` IS NOT NULL"; $params[] = val_in($kind, $v); return "`$c` <> ?";
      case 'gt': $params[] = val_in($kind, $v); return "`$c` > ?";
      case 'gte': $params[] = val_in($kind, $v); return "`$c` >= ?";
      case 'lt': $params[] = val_in($kind, $v); return "`$c` < ?";
      case 'lte': $params[] = val_in($kind, $v); return "`$c` <= ?";
      case 'like': case 'ilike': $params[] = str_replace('*', '%', (string)$v); return "`$c` LIKE ?";
      case 'is':
        if ($v === null || $v === 'null') return "`$c` IS NULL";
        if ($v === true || $v === 'true') return "`$c` = 1";
        if ($v === false || $v === 'false') return "`$c` = 0";
        throw new ApiError('is ใช้กับ null/true/false เท่านั้น');
      case 'in':
        $vals = is_array($v) ? $v : [];
        if (!$vals) return '0 = 1';
        foreach ($vals as $x) $params[] = val_in($kind, $x);
        return "`$c` IN (" . implode(',', array_fill(0, count($vals), '?')) . ')';
    }
    throw new ApiError("ไม่รองรับเงื่อนไข $op");
  };
  foreach ($filters as $f) $parts[] = $cond((string)$f['c'], (string)$f['op'], $f['v'] ?? null);
  foreach ($ors as $or) {
    // "col.op.value,col.op.value" — split only where a new "col.op." begins
    $items = preg_split('/,(?=[a-z_][a-z0-9_]*\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is)\.)/', (string)$or);
    $sub = [];
    foreach ($items as $it) {
      if (!preg_match('/^([a-z_][a-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)$/s', $it, $mm)) throw new ApiError('เงื่อนไขค้นหาไม่ถูกต้อง');
      $v = $mm[3];
      if ($mm[2] === 'is' || ($v === 'null' && in_array($mm[2], ['eq', 'neq'], true))) $v = $v === 'null' ? null : $v;
      $sub[] = $cond($mm[1], $mm[2], $v);
    }
    if ($sub) $parts[] = '(' . implode(' OR ', $sub) . ')';
  }
  if ($scope[0] !== '') { $parts[] = $scope[0]; array_push($params, ...$scope[1]); }
  return [$parts ? ' WHERE ' . implode(' AND ', $parts) : '', $params];
}

function select_cols(string $table, string $cols): string {
  $cols = trim($cols);
  if ($cols === '' || $cols === '*') return '*';
  $list = array_map('trim', explode(',', $cols));
  return implode(', ', array_map(function ($c) use ($table) { return '`' . col_check($table, $c) . '`'; }, $list));
}

function fetch_rows(string $table, string $sql, array $params): array {
  return array_map(function ($r) use ($table) { return row_out($table, $r); }, q_all($sql, $params));
}

function handle_query(): array {
  $b = body();
  $table = (string)($b['table'] ?? '');
  $op = (string)($b['op'] ?? 'select');
  if (!valid_ident($table)) throw new ApiError('ชื่อตารางไม่ถูกต้อง');
  if (!in_array($op, ['select', 'insert', 'update', 'delete'], true)) throw new ApiError('คำสั่งไม่ถูกต้อง');
  $scope = rule_scope($table, $op);
  table_meta($table);
  $filters = $b['filters'] ?? []; $ors = $b['or'] ?? [];
  if ($op === 'select') return do_select($table, $b, $filters, $ors, $scope);
  if ($op === 'insert') return do_insert($table, $b['values'] ?? []);
  if (!$filters && !$ors) throw new ApiError('ต้องระบุเงื่อนไขสำหรับการแก้ไข/ลบ');
  [$where, $params] = build_where($table, $filters, $ors, $scope);
  $ids = array_column(q_all("SELECT `id` FROM `$table`$where", $params), 'id');
  if ($op === 'update') return do_update($table, $b['values'] ?? [], $ids);
  return do_delete($table, $ids);
}

function do_select(string $table, array $b, array $filters, array $ors, array $scope): array {
  [$where, $params] = build_where($table, $filters, $ors, $scope);
  $res = ['data' => null, 'count' => null];
  if (!empty($b['count'])) $res['count'] = (int)q_val("SELECT COUNT(*) FROM `$table`$where", $params);
  if (!empty($b['head'])) return $res;
  $sql = 'SELECT ' . select_cols($table, (string)($b['columns'] ?? '*')) . " FROM `$table`$where";
  $order = [];
  foreach ($b['order'] ?? [] as $o) $order[] = '`' . col_check($table, (string)$o['c']) . '`' . (empty($o['asc']) ? ' DESC' : ' ASC');
  if ($order) $sql .= ' ORDER BY ' . implode(', ', $order);
  if (isset($b['range'])) { $from = max(0, (int)$b['range'][0]); $to = max($from, (int)$b['range'][1]); $sql .= ' LIMIT ' . ($to - $from + 1) . ' OFFSET ' . $from; }
  elseif (isset($b['limit'])) $sql .= ' LIMIT ' . max(0, (int)$b['limit']);
  $res['data'] = fetch_rows($table, $sql, $params);
  return $res;
}

function prepare_values(string $table, array $row, bool $isInsert): array {
  $m = table_meta($table);
  $out = [];
  foreach ($row as $c => $v) {
    if (!isset($m[$c])) throw new ApiError("ไม่พบคอลัมน์ $table.$c");
    if ($isInsert && $c === 'id' && $v === null) continue;
    $out[$c] = val_in($m[$c], $v);
  }
  $uid = me_id();
  if ($isInsert) {
    if (isset($m['created_by']) && !array_key_exists('created_by', $out)) $out['created_by'] = $uid;
    if (isset($m['user_id'])) { if (!is_admin() || !array_key_exists('user_id', $out) || !$out['user_id']) $out['user_id'] = $uid; }
    foreach (['created_at', 'updated_at'] as $t) if (isset($m[$t]) && empty($out[$t])) $out[$t] = now_utc();
  } else {
    if (isset($m['updated_at']) && !array_key_exists('updated_at', $out)) $out['updated_at'] = now_utc();
    unset($out['id']);
    if (!is_admin()) unset($out['user_id'], $out['created_by']);
  }
  return $out;
}

function do_insert(string $table, $values): array {
  $rows = isset($values[0]) || $values === [] ? $values : [$values];
  if (!$rows) throw new ApiError('ไม่มีข้อมูลที่จะบันทึก');
  $ids = [];
  $pdo = db();
  $pdo->beginTransaction();
  try {
    foreach ($rows as $row) {
      $v = prepare_values($table, (array)$row, true);
      if ($table === 'customers') $v['code'] = isset($v['code']) && $v['code'] !== '' ? $v['code'] : null;
      $cols = array_keys($v);
      q("INSERT INTO `$table` (`" . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($v));
      $id = $v['id'] ?? $pdo->lastInsertId();
      if ($table === 'customers' && empty($v['code'])) customer_code((int)$id);
      $ids[] = $id;
    }
    $pdo->commit();
  } catch (PDOException $e) { $pdo->rollBack(); throw friendly_pdo($e); }
  return ['data' => rows_by_ids($table, $ids)];
}

function do_update(string $table, array $values, array $ids): array {
  if (!$ids) return ['data' => []];
  $v = prepare_values($table, $values, false);
  if (!$v) return ['data' => rows_by_ids($table, $ids)];
  $set = implode(', ', array_map(function ($c) { return "`$c` = ?"; }, array_keys($v)));
  try { q("UPDATE `$table` SET $set WHERE `id` IN (" . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge(array_values($v), $ids)); }
  catch (PDOException $e) { throw friendly_pdo($e); }
  return ['data' => rows_by_ids($table, $ids)];
}

function do_delete(string $table, array $ids): array {
  if (!$ids) return ['data' => []];
  $rows = rows_by_ids($table, $ids);
  $in = implode(',', array_fill(0, count($ids), '?'));
  try {
    if ($table === 'profiles') q("DELETE FROM app_users WHERE id IN ($in)", $ids); // the login goes with the profile
    else q("DELETE FROM `$table` WHERE `id` IN ($in)", $ids);
  } catch (PDOException $e) { throw friendly_pdo($e); }
  return ['data' => $rows];
}

function rows_by_ids(string $table, array $ids): array {
  if (!$ids) return [];
  return fetch_rows($table, "SELECT * FROM `$table` WHERE `id` IN (" . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY `id`', $ids);
}

/** Customer code: PREFIX + BE yy + running id (same as the old Access rule), e.g. CUS69003730 */
function customer_code(int $id): void {
  $s = q_one('SELECT customer_prefix, customer_year, customer_length FROM settings WHERE id = 1') ?: [];
  $code = ($s['customer_prefix'] ?? 'CUS')
    . ((int)($s['customer_year'] ?? 1) ? str_pad((string)(be_year() % 100), 2, '0', STR_PAD_LEFT) : '')
    . str_pad((string)$id, (int)($s['customer_length'] ?? 6), '0', STR_PAD_LEFT);
  q('UPDATE customers SET code = ? WHERE id = ?', [$code, $id]);
}

function friendly_pdo(PDOException $e): ApiError {
  $m = $e->getMessage();
  if (strpos($m, '1062') !== false || stripos($m, 'Duplicate') !== false) return new ApiError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 409, '23505');
  if (strpos($m, '1451') !== false) return new ApiError('ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงรายการนี้อยู่', 409, '23503');
  if (strpos($m, '1452') !== false) return new ApiError('ข้อมูลอ้างอิงไม่ถูกต้อง', 400, '23503');
  if (strpos($m, '1048') !== false) return new ApiError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ', 400, '23502');
  return new ApiError(db_error_text($e), 400);
}
