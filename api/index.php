<?php
// =====================================================================
//  API ของระบบ — หน้าเว็บเรียกไฟล์นี้ทั้งหมด:  api/index.php?a=<คำสั่ง>
// =====================================================================
declare(strict_types=1);
require __DIR__ . '/lib.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/query.php';
require __DIR__ . '/rpc.php';
require __DIR__ . '/backup.php';
require __DIR__ . '/setup.php';

ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e) {
  if ($e instanceof ApiError) out(['data' => null, 'error' => ['message' => $e->getMessage(), 'code' => $e->codeName]], $e->status);
  if ($e instanceof PDOException) { $f = friendly_pdo($e); out(['data' => null, 'error' => ['message' => $f->getMessage(), 'code' => $f->codeName]], $f->status); }
  error_log((string)$e);
  out(['data' => null, 'error' => ['message' => 'เกิดข้อผิดพลาดในระบบ: ' . $e->getMessage()]], 500);
});

$a = (string)($_GET['a'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
// state-changing calls must be JSON POSTs from this site (blocks cross-site form posts)
if ($method === 'POST' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === false) throw new ApiError('ต้องส่งข้อมูลแบบ JSON', 415);

switch ($a) {
  // ---------- การเชื่อมต่อฐานข้อมูล ----------
  case 'status':      out(conn_status());
  case 'setup_test':  out(setup_test());
  case 'setup_save':  out(setup_save());
  case 'setup_seed':  out(setup_seed());
  case 'conn_info':   out(conn_info());

  // ---------- เข้าสู่ระบบ ----------
  case 'session': {
    $s = session_payload();
    if ($s && is_active_user()) maybe_auto_backup();
    out(['data' => ['session' => $s], 'error' => null]);
  }
  case 'login': {
    $b = body();
    out(['data' => do_login((string)($b['email'] ?? ''), (string)($b['password'] ?? '')), 'error' => null]);
  }
  case 'logout': do_logout(); out(['data' => null, 'error' => null]);
  case 'signup': {
    $b = body();
    $id = create_user((string)($b['email'] ?? ''), (string)($b['password'] ?? ''), (string)($b['full_name'] ?? ''));
    out(['data' => ['user' => ['id' => $id, 'email' => strtolower(trim((string)$b['email']))]], 'error' => null]);
  }
  case 'admin_create_user': {
    require_admin();
    $b = body();
    $role = ($b['role'] ?? '') === 'admin' ? 'admin' : 'staff';
    $pe = $role === 'admin' ? true : ($b['perm_envelope'] ?? true) !== false;
    $pc = $role === 'admin' ? true : !empty($b['perm_cheque']);
    if (!$pe && !$pc) throw new ApiError('กรุณาเลือกสิทธิ์อย่างน้อย 1 ระบบ');
    if (trim((string)($b['full_name'] ?? '')) === '') throw new ApiError('กรุณากรอกชื่อ');
    $id = create_user((string)($b['email'] ?? ''), (string)($b['password'] ?? ''), (string)$b['full_name'], ['role' => $role, 'active' => true, 'perm_envelope' => $pe, 'perm_cheque' => $pc]);
    out(['ok' => true, 'id' => $id, 'email' => strtolower(trim((string)$b['email']))]);
  }
  case 'admin_set_password': {
    require_admin();
    $b = body();
    if (strlen((string)($b['password'] ?? '')) < 6) throw new ApiError('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
    if (!q('UPDATE app_users SET password_hash = ? WHERE id = ?', [password_hash((string)$b['password'], PASSWORD_DEFAULT), (string)($b['id'] ?? '')])->rowCount()) throw new ApiError('ไม่พบผู้ใช้');
    out(['ok' => true]);
  }
  case 'change_password': {
    $m = require_login();
    $b = body();
    $u = q_one('SELECT password_hash FROM app_users WHERE id = ?', [$m['id']]);
    if (!$u || !password_verify((string)($b['old'] ?? ''), $u['password_hash'])) throw new ApiError('รหัสผ่านเดิมไม่ถูกต้อง');
    if (strlen((string)($b['password'] ?? '')) < 6) throw new ApiError('รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร');
    q('UPDATE app_users SET password_hash = ? WHERE id = ?', [password_hash((string)$b['password'], PASSWORD_DEFAULT), $m['id']]);
    out(['ok' => true]);
  }

  // ---------- ข้อมูล ----------
  case 'query': out(handle_query() + ['error' => null]);
  case 'rpc':   require_login(); out(['data' => handle_rpc(), 'error' => null]);

  // ---------- สำรองข้อมูล ----------
  case 'backup_status': require_admin(); out(['configured' => backup_dir_ok(), 'mode' => 'php']);
  case 'backup_run': {
    require_admin();
    $type = (body()['type'] ?? 'manual') === 'auto' ? 'auto' : 'manual';
    out(run_backup($type, me_name() . ($type === 'auto' ? ' (สั่งจากหน้าเว็บ)' : ''), me_id()));
  }
  case 'backup_download': require_admin(); stream_backup((string)($_GET['path'] ?? ''));
  case 'backup_remove': require_admin(); remove_backup((string)(body()['path'] ?? '')); out(['ok' => true]);
}
throw new ApiError('ไม่รู้จักคำสั่ง', 404);
