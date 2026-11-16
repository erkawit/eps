<?php
// =====================================================================
//  ตั้งค่าการเชื่อมต่อฐานข้อมูล + ติดตั้งโครงสร้าง/ข้อมูลเริ่มต้น
//  • ยังไม่เคยตั้งค่า → ทุกคนเปิดหน้าตั้งค่าได้ (ครั้งแรกหลังติดตั้ง)
//  • ตั้งค่าแล้วแต่เชื่อมต่อไม่ได้ → แก้ได้จากเครื่องเซิร์ฟเวอร์เท่านั้น (localhost)
//  • ปกติ → เฉพาะผู้ดูแลระบบ (เมนู "การเชื่อมต่อฐานข้อมูล")
// =====================================================================
declare(strict_types=1);

const DB_DIR = APP_ROOT . '/database';
const REQUIRED_TABLES = ['settings', 'titles', 'provinces', 'postcodes', 'customers', 'books', 'letters', 'print_logs', 'backup_logs', 'app_users', 'profiles', 'envelope_layouts', 'cheque_banks', 'cheque_accounts', 'cheques', 'cheque_forms', 'cheque_print_logs'];

/** Columns added in later versions — added to an existing database automatically (MySQL has no ADD COLUMN IF NOT EXISTS). */
const LATER_COLUMNS = [
  ['cheque_banks', 'bg_image', 'MEDIUMTEXT NULL'],
  ['cheques', 'extra', 'LONGTEXT NULL'],
];
function migrate_schema(PDO $pdo): void {
  foreach (LATER_COLUMNS as [$t, $c, $def]) {
    $st = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$t, $c]);
    if (!(int)$st->fetchColumn()) $pdo->exec("ALTER TABLE `$t` ADD COLUMN `$c` $def");
  }
}

function is_local_request(): bool { return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true); }

/** Connection state, used by the page before the login screen. */
function conn_status(): array {
  $c = load_cfg();
  $s = ['configured' => (bool)$c, 'connected' => false, 'installed' => false, 'has_users' => false, 'missing' => [], 'error' => null, 'can_setup' => false, 'local' => is_local_request()];
  if ($c) {
    try {
      $pdo = db();
      $s['connected'] = true;
      $have = $pdo->query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()')->fetchAll(PDO::FETCH_COLUMN);
      $s['missing'] = array_values(array_diff(REQUIRED_TABLES, $have));
      $s['installed'] = !$s['missing'];
      if ($s['installed']) { try { migrate_schema($pdo); } catch (Throwable $e) { error_log('migrate: ' . $e->getMessage()); } }
      if ($s['installed']) $s['has_users'] = (bool)q_val('SELECT COUNT(*) FROM app_users');
    } catch (ApiError $e) { $s['error'] = $e->getMessage(); }
  }
  // who may open the setup page without signing in
  $s['can_setup'] = !$s['configured'] || (!$s['connected'] && $s['local']) || ($s['connected'] && !$s['has_users']);
  if ($c && $s['can_setup']) $s['cfg'] = ['host' => $c['host'], 'port' => $c['port'], 'database' => $c['database'], 'username' => $c['username']]; // never the password
  return $s;
}

function require_setup_access(): void {
  if (conn_status()['can_setup']) return;
  start_session();
  try { if (is_admin()) return; } catch (Throwable $e) { /* DB down */ }
  throw new ApiError('เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนการเชื่อมต่อฐานข้อมูลได้', 403);
}

function cfg_from_body(bool $keepPassword): array {
  $b = body();
  $c = ['host' => trim((string)($b['host'] ?? 'localhost')), 'port' => (int)($b['port'] ?? 3306) ?: 3306, 'database' => trim((string)($b['database'] ?? '')), 'username' => trim((string)($b['username'] ?? 'root')), 'password' => (string)($b['password'] ?? '')];
  if ($keepPassword && !empty($b['keep_password'])) { $old = load_cfg(); $c['password'] = (string)($old['password'] ?? ''); }
  if ($c['host'] === '' || !preg_match('/^[A-Za-z0-9.\-:\[\]_]+$/', $c['host'])) throw new ApiError('Host ไม่ถูกต้อง');
  if (!valid_db_name($c['database'])) throw new ApiError('ชื่อฐานข้อมูลใช้ได้เฉพาะ a-z, 0-9 และ _ (ไม่เกิน 64 ตัว)');
  if ($c['username'] === '') throw new ApiError('กรุณากรอกชื่อผู้ใช้ MySQL');
  return $c;
}

/** Test a connection without saving. */
function setup_test(): array {
  require_setup_access();
  $c = cfg_from_body(true);
  try { $pdo = make_pdo($c, false); }
  catch (PDOException $e) { return ['ok' => false, 'server' => false, 'message' => db_error_text($e)]; }
  $ver = (string)$pdo->query('SELECT VERSION()')->fetchColumn();
  $exists = (bool)$pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = " . $pdo->quote($c['database']))->fetchColumn();
  $tables = []; $users = 0;
  if ($exists) {
    $tables = $pdo->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = " . $pdo->quote($c['database']))->fetchAll(PDO::FETCH_COLUMN);
    if (in_array('app_users', $tables, true)) $users = (int)$pdo->query("SELECT COUNT(*) FROM `{$c['database']}`.app_users")->fetchColumn();
  }
  $missing = array_values(array_diff(REQUIRED_TABLES, $tables));
  $msg = !$exists ? "เชื่อมต่อ MySQL ได้ (เวอร์ชัน $ver) — ยังไม่มีฐานข้อมูล \"{$c['database']}\" ระบบจะสร้างให้"
    : ($missing ? "เชื่อมต่อได้ — พบฐานข้อมูลแล้ว แต่ยังไม่มีตารางของระบบ " . count($missing) . " ตาราง ระบบจะติดตั้งให้"
      : "เชื่อมต่อสำเร็จ — พบตารางของระบบครบ" . ($users ? " (มีผู้ใช้ $users คน)" : ''));
  return ['ok' => true, 'server' => true, 'version' => $ver, 'db_exists' => $exists, 'installed' => !$missing, 'users' => $users, 'message' => $msg];
}

/** Split an SQL file into statements (ignores ; inside quotes and -- comment lines). */
function split_sql(string $sql): array {
  $sql = preg_replace('/^\s*--[^\n]*$/m', '', $sql);
  $out = []; $buf = ''; $q = false; $n = strlen($sql);
  for ($i = 0; $i < $n; $i++) {
    $ch = $sql[$i];
    if ($ch === "'") { if ($q && $i + 1 < $n && $sql[$i + 1] === "'") { $buf .= "''"; $i++; continue; } $q = !$q; }
    if ($ch === ';' && !$q) { if (trim($buf) !== '') $out[] = trim($buf); $buf = ''; continue; }
    $buf .= $ch;
  }
  if (trim($buf) !== '') $out[] = trim($buf);
  return $out;
}

function run_sql_file(PDO $pdo, string $file): int {
  $n = 0;
  foreach (split_sql((string)file_get_contents($file)) as $st) { $pdo->exec($st); $n++; }
  return $n;
}

function seed_files(): array {
  $f = glob(DB_DIR . '/seed_*.sql') ?: [];
  sort($f);
  return array_map('basename', $f);
}

/** Save the connection: create the database if needed and install the tables. */
function setup_save(): array {
  require_setup_access();
  @set_time_limit(300);
  $c = cfg_from_body(true);
  try {
    $pdo = make_pdo($c, false);
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$c['database']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `{$c['database']}`");
    run_sql_file($pdo, DB_DIR . '/schema.sql');
    migrate_schema($pdo);
    $empty = !(int)$pdo->query('SELECT COUNT(*) FROM settings')->fetchColumn();
  } catch (PDOException $e) { throw new ApiError('ติดตั้งฐานข้อมูลไม่สำเร็จ: ' . db_error_text($e)); }
  start_session();
  $by = '';
  try { $by = me_name(); } catch (Throwable $e) { /* ignore */ }
  $old = load_cfg();
  $c['saved_by'] = $by ?: 'หน้าตั้งค่าครั้งแรก';
  save_cfg($c);
  $changed = !$old || $old['host'] !== $c['host'] || (int)$old['port'] !== (int)$c['port'] || $old['database'] !== $c['database'];
  if ($changed) { $_SESSION = []; } // users of another database must sign in again
  return ['ok' => true, 'seed_files' => seed_files(), 'needs_seed' => $empty, 'relogin' => $changed];
}

/** Import one seed file (called once per file so the page can show progress). */
function setup_seed(): array {
  require_setup_access();
  @set_time_limit(300);
  $file = (string)(body()['file'] ?? '');
  if (!in_array($file, seed_files(), true)) throw new ApiError('ไม่พบไฟล์ข้อมูล');
  try { $n = run_sql_file(db(), DB_DIR . '/' . $file); }
  catch (PDOException $e) { throw new ApiError("นำเข้า $file ไม่สำเร็จ: " . db_error_text($e)); }
  return ['ok' => true, 'file' => $file, 'statements' => $n];
}

/** Current connection (admin page) — the password is never sent back. */
function conn_info(): array {
  require_admin();
  $c = load_cfg();
  $pdo = db();
  $ver = (string)$pdo->query('SELECT VERSION()')->fetchColumn();
  $counts = [];
  foreach (['profiles', 'customers', 'letters', 'cheques', 'backup_logs'] as $t) $counts[$t] = (int)q_val("SELECT COUNT(*) FROM `$t`");
  $size = (float)q_val('SELECT COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  return ['host' => $c['host'], 'port' => $c['port'], 'database' => $c['database'], 'username' => $c['username'], 'has_password' => $c['password'] !== '',
    'saved_at' => $c['saved_at'] ?? null, 'saved_by' => $c['saved_by'] ?? null, 'version' => $ver, 'counts' => $counts, 'size_bytes' => $size,
    'backup_dir_ok' => backup_dir_ok(), 'php' => PHP_VERSION, 'status' => conn_status()];
}
