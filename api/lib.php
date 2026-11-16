<?php
// =====================================================================
//  ฟังก์ชันกลางของ API (PHP 7.4+ / 8.x + MySQL/MariaDB ของ XAMPP)
// =====================================================================
declare(strict_types=1);

const APP_ROOT = __DIR__ . '/..';
const CFG_FILE = APP_ROOT . '/private/config.php';
const BACKUP_DIR = APP_ROOT . '/private/backups';
const JSON_COLS = ['layout', 'row_counts', 'extra'];
const BACKUP_TABLES = ['settings', 'titles', 'provinces', 'postcodes', 'customers', 'books', 'letters', 'print_logs', 'profiles', 'envelope_layouts', 'cheque_banks', 'cheque_accounts', 'cheques', 'cheque_forms', 'cheque_print_logs', 'backup_logs'];

class ApiError extends Exception {
  public $status;
  public $codeName;
  public function __construct(string $msg, int $status = 400, string $code = '') { parent::__construct($msg); $this->status = $status; $this->codeName = $code; }
}

function out($data, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
  exit;
}

function body(): array {
  static $b = null;
  if ($b !== null) return $b;
  $raw = file_get_contents('php://input');
  $b = $raw ? (json_decode($raw, true) ?: []) : [];
  return $b;
}

// ---------------------------------------------------------------------
//  Connection config (private/config.php) and PDO
// ---------------------------------------------------------------------
function load_cfg(): ?array {
  clearstatcache(true, CFG_FILE);
  if (!is_file(CFG_FILE)) return null;
  if (function_exists('opcache_invalidate')) @opcache_invalidate(CFG_FILE, true); // always read the latest saved settings
  $c = include CFG_FILE;
  return is_array($c) && !empty($c['host']) && !empty($c['database']) ? $c : null;
}

function save_cfg(array $c): void {
  $dir = dirname(CFG_FILE);
  if (!is_dir($dir)) mkdir($dir, 0775, true);
  $data = [
    'host' => (string)$c['host'], 'port' => (int)($c['port'] ?: 3306), 'database' => (string)$c['database'],
    'username' => (string)$c['username'], 'password' => (string)$c['password'],
    'saved_at' => gmdate('c'), 'saved_by' => (string)($c['saved_by'] ?? ''),
  ];
  $php = "<?php\n// ค่าการเชื่อมต่อฐานข้อมูล — สร้างโดยหน้า \"ตั้งค่าการเชื่อมต่อฐานข้อมูล\" (ห้ามเผยแพร่ไฟล์นี้)\nreturn " . var_export($data, true) . ";\n";
  if (@file_put_contents(CFG_FILE, $php, LOCK_EX) === false) throw new ApiError('บันทึกไฟล์ private/config.php ไม่ได้ — ตรวจสอบสิทธิ์การเขียนโฟลเดอร์ private', 500);
  if (function_exists('opcache_invalidate')) @opcache_invalidate(CFG_FILE, true);
}

function valid_db_name(string $n): bool { return (bool)preg_match('/^[A-Za-z0-9_]{1,64}$/', $n); }

function make_pdo(array $c, bool $withDb = true): PDO {
  $dsn = 'mysql:host=' . $c['host'] . ';port=' . (int)($c['port'] ?: 3306) . ';charset=utf8mb4' . ($withDb ? ';dbname=' . $c['database'] : '');
  $pdo = new PDO($dsn, $c['username'], $c['password'] ?? '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::ATTR_STRINGIFY_FETCHES => false,
    PDO::ATTR_TIMEOUT => 5,
  ]);
  $pdo->exec("SET time_zone = '+00:00'");
  return $pdo;
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $c = load_cfg();
  if (!$c) throw new ApiError('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล', 503, 'not_configured');
  try { $pdo = make_pdo($c); }
  catch (PDOException $e) { throw new ApiError('เชื่อมต่อฐานข้อมูลไม่ได้: ' . db_error_text($e), 503, 'db_unreachable'); }
  return $pdo;
}

function db_error_text(Throwable $e): string {
  $m = $e->getMessage();
  if (strpos($m, '1045') !== false || stripos($m, 'Access denied') !== false) return 'ชื่อผู้ใช้หรือรหัสผ่าน MySQL ไม่ถูกต้อง';
  if (strpos($m, '1049') !== false || stripos($m, 'Unknown database') !== false) return 'ไม่พบฐานข้อมูลที่ระบุ';
  if (strpos($m, '2002') !== false || stripos($m, 'Connection refused') !== false || stripos($m, 'No such file') !== false) return 'ติดต่อ MySQL ไม่ได้ — เปิด MySQL ใน XAMPP Control Panel แล้วหรือยัง? (ตรวจสอบ Host/Port)';
  if (stripos($m, 'getaddrinfo') !== false || stripos($m, 'Unknown MySQL server host') !== false) return 'ไม่พบเครื่องเซิร์ฟเวอร์ (Host) ที่ระบุ';
  return preg_replace('/^SQLSTATE\[[^\]]*\]:?\s*/', '', $m);
}

function q(string $sql, array $params = []): PDOStatement {
  $st = db()->prepare($sql);
  $st->execute(array_values($params));
  return $st;
}
function q_all(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function q_one(string $sql, array $p = []): ?array { $r = q($sql, $p)->fetch(); return $r === false ? null : $r; }
function q_val(string $sql, array $p = []) { $r = q($sql, $p)->fetchColumn(); return $r === false ? null : $r; }

function uuid4(): string {
  $d = random_bytes(16);
  $d[6] = chr(ord($d[6]) & 0x0f | 0x40);
  $d[8] = chr(ord($d[8]) & 0x3f | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

function now_utc(): string { return gmdate('Y-m-d H:i:s') . '.' . sprintf('%03d', (int)(microtime(true) * 1000) % 1000); }
function bkk_parts(?int $ts = null): array {
  $t = ($ts ?? time()) + 7 * 3600;
  return ['ce' => gmdate('Y-m-d', $t), 'be' => (int)gmdate('Y', $t) + 543, 'mm' => gmdate('m', $t), 'dd' => gmdate('d', $t), 'hh' => gmdate('H', $t), 'mi' => gmdate('i', $t), 'ss' => gmdate('s', $t)];
}
function be_year(): int { return bkk_parts()['be']; }

// ---------------------------------------------------------------------
//  Table metadata (columns + types) — used to validate and convert values
// ---------------------------------------------------------------------
function table_meta(string $table): array {
  static $cache = [];
  if (isset($cache[$table])) return $cache[$table];
  $rows = q_all('SELECT COLUMN_NAME c, DATA_TYPE t, COLUMN_TYPE ct FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [$table]);
  if (!$rows) throw new ApiError("ไม่พบตาราง $table — กรุณาติดตั้งโครงสร้างฐานข้อมูลในหน้าตั้งค่าการเชื่อมต่อ", 500, 'no_table');
  $m = [];
  foreach ($rows as $r) {
    $t = strtolower($r['t']); $ct = strtolower($r['ct']); $c = $r['c'];
    $kind = 'str';
    if (in_array($c, JSON_COLS, true)) $kind = 'json';
    elseif ($t === 'tinyint' && strpos($ct, 'tinyint(1)') === 0) $kind = 'bool';
    elseif (in_array($t, ['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint'], true)) $kind = 'int';
    elseif (in_array($t, ['decimal', 'numeric', 'float', 'double', 'real'], true)) $kind = 'num';
    elseif (in_array($t, ['datetime', 'timestamp'], true)) $kind = 'datetime';
    elseif ($t === 'date') $kind = 'date';
    $m[$c] = $kind;
  }
  return $cache[$table] = $m;
}

/** DB row → JSON-friendly row (bool / number / ISO time / decoded JSON). */
function row_out(string $table, array $row): array {
  $m = table_meta($table);
  foreach ($row as $k => $v) {
    if ($v === null || !isset($m[$k])) continue;
    switch ($m[$k]) {
      case 'bool': $row[$k] = (bool)(int)$v; break;
      case 'int': $row[$k] = (int)$v; break;
      case 'num': $row[$k] = (float)$v; break;
      case 'datetime':
        $s = (string)$v; $ms = '000';
        if (preg_match('/\.(\d{1,6})$/', $s, $mm)) { $ms = substr(str_pad($mm[1], 3, '0'), 0, 3); $s = preg_replace('/\.\d+$/', '', $s); }
        $row[$k] = str_replace(' ', 'T', $s) . '.' . $ms . '+00:00'; break;
      case 'date': $row[$k] = substr((string)$v, 0, 10); break;
      case 'json': $d = json_decode((string)$v, true); $row[$k] = json_last_error() === JSON_ERROR_NONE ? $d : $v; break;
    }
  }
  return $row;
}

/** JSON value → DB value for a column. */
function val_in(string $kind, $v) {
  if ($v === null) return null;
  switch ($kind) {
    case 'bool': return ($v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 't') ? 1 : 0;
    case 'json': return is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    case 'datetime': return to_utc_datetime($v);
    case 'date': return substr((string)$v, 0, 10);
    case 'int': return is_bool($v) ? (int)$v : (is_numeric($v) ? (int)$v : $v);
    default: return is_bool($v) ? (int)$v : (is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v);
  }
}

function to_utc_datetime($v): ?string {
  if ($v === null || $v === '') return null;
  $s = (string)$v;
  if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return $s . ' 00:00:00.000';
  try {
    $d = new DateTime($s, new DateTimeZone('UTC'));
    $d->setTimezone(new DateTimeZone('UTC'));
    return $d->format('Y-m-d H:i:s.v');
  } catch (Exception $e) { throw new ApiError('รูปแบบวันเวลาไม่ถูกต้อง: ' . $s); }
}

function valid_ident(string $s): bool { return (bool)preg_match('/^[a-z_][a-z0-9_]{0,63}$/', $s); }
