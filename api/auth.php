<?php
// =====================================================================
//  การเข้าสู่ระบบ (PHP session) และสิทธิ์ของผู้ใช้
// =====================================================================
declare(strict_types=1);

function start_session(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
  session_name('EPS_SESSION');
  session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $secure]);
  session_start();
}

/** The signed-in user's profile (or null). Cached per request. */
function me(): ?array {
  static $me = false;
  if ($me !== false) return $me;
  start_session();
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) return $me = null;
  $p = q_one('SELECT p.*, u.email AS login_email FROM profiles p JOIN app_users u ON u.id = p.id WHERE p.id = ?', [$uid]);
  if (!$p) { $_SESSION = []; return $me = null; }
  $p['active'] = (bool)(int)$p['active'];
  $p['perm_envelope'] = (bool)(int)$p['perm_envelope'];
  $p['perm_cheque'] = (bool)(int)$p['perm_cheque'];
  return $me = $p;
}
function me_id(): ?string { $m = me(); return $m['id'] ?? null; }
function me_name(): string { $m = me(); return $m ? (string)($m['full_name'] ?: $m['email']) : ''; }

function is_active_user(): bool { $m = me(); return $m && $m['active']; }
function is_admin(): bool { $m = me(); return $m && $m['active'] && $m['role'] === 'admin'; }
function is_envelope_user(): bool { $m = me(); return $m && $m['active'] && ($m['role'] === 'admin' || $m['perm_envelope']); }
function is_cheque_user(): bool { $m = me(); return $m && $m['active'] && ($m['role'] === 'admin' || $m['perm_cheque']); }

function require_login(): array {
  $m = me();
  if (!$m) throw new ApiError('กรุณาเข้าสู่ระบบ', 401, 'not_signed_in');
  return $m;
}
function require_admin(): void { require_login(); if (!is_admin()) throw new ApiError('เฉพาะผู้ดูแลระบบ', 403); }
function require_envelope(): void { require_login(); if (!is_envelope_user()) throw new ApiError('ไม่มีสิทธิ์ใช้งานระบบพิมพ์ซอง กรุณาติดต่อผู้ดูแลระบบ', 403); }
function require_cheque(): void { require_login(); if (!is_cheque_user()) throw new ApiError('ไม่มีสิทธิ์ใช้งานระบบเช็ค', 403); }

function session_payload(): ?array {
  $m = me();
  if (!$m) return null;
  return ['access_token' => session_id(), 'user' => ['id' => $m['id'], 'email' => $m['login_email'] ?: $m['email']]];
}

/** Creates a login + profile. The very first user becomes the active admin. */
function create_user(string $email, string $password, string $fullName, array $opt = []): string {
  $email = strtolower(trim($email));
  if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) throw new ApiError('อีเมลไม่ถูกต้อง');
  if (strlen($password) < 6) throw new ApiError('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  if (q_val('SELECT COUNT(*) FROM app_users WHERE email = ?', [$email])) throw new ApiError('อีเมลนี้มีผู้ใช้งานแล้ว', 409);
  $first = !q_val('SELECT COUNT(*) FROM profiles');
  $id = uuid4();
  $fullName = trim($fullName) ?: explode('@', $email)[0];
  $role = $first ? 'admin' : ($opt['role'] ?? 'staff');
  $active = $first ? 1 : (int)!empty($opt['active']);
  $permE = $role === 'admin' ? 1 : (int)($opt['perm_envelope'] ?? true);
  $permC = $role === 'admin' ? 1 : (int)($opt['perm_cheque'] ?? false);
  $pdo = db();
  $pdo->beginTransaction();
  try {
    q('INSERT INTO app_users (id, email, password_hash, email_confirmed_at, created_at) VALUES (?,?,?,?,?)', [$id, $email, password_hash($password, PASSWORD_DEFAULT), now_utc(), now_utc()]);
    q('INSERT INTO profiles (id, email, full_name, role, active, perm_envelope, perm_cheque, created_at) VALUES (?,?,?,?,?,?,?,?)', [$id, $email, $fullName, $role, $active, $permE, $permC, now_utc()]);
    $pdo->commit();
  } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
  return $id;
}

function do_login(string $email, string $password): array {
  $email = strtolower(trim($email));
  $u = q_one('SELECT * FROM app_users WHERE email = ?', [$email]);
  if (!$u || !password_verify($password, $u['password_hash'])) {
    usleep(600000); // slow down guessing
    throw new ApiError('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 400, 'invalid_credentials');
  }
  if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) q('UPDATE app_users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
  q('UPDATE app_users SET last_sign_in_at = ? WHERE id = ?', [now_utc(), $u['id']]);
  start_session();
  session_regenerate_id(true);
  $_SESSION['uid'] = $u['id'];
  return ['user' => ['id' => $u['id'], 'email' => $u['email']], 'session' => ['access_token' => session_id(), 'user' => ['id' => $u['id'], 'email' => $u['email']]]];
}

function do_logout(): void {
  start_session();
  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $p['path'], 'httponly' => true, 'samesite' => 'Lax']);
  }
  session_destroy();
}
