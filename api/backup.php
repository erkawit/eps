<?php
// =====================================================================
//  สำรองข้อมูล — ไฟล์ .json.gz เก็บใน private/backups/<ปี พ.ศ.>/<เดือน>/<วันที่>/
//  • กดสำรองจากหน้าเว็บ (manual)
//  • อัตโนมัติ: ทุกวันหลัง 00:00 น. ถ้าเมื่อวานไม่มีการกดสำรอง ระบบสำรองให้เอง
//    (ทำงานเมื่อมีคนเปิดใช้ระบบครั้งแรกของวัน หรือตั้ง Task Scheduler เรียก api/cron_backup.php)
// =====================================================================
declare(strict_types=1);

function backup_dir_ok(): bool {
  if (!is_dir(BACKUP_DIR)) @mkdir(BACKUP_DIR, 0775, true);
  return is_dir(BACKUP_DIR) && is_writable(BACKUP_DIR);
}

function valid_backup_path(string $p): bool { return (bool)preg_match('#^\d{4}/\d{2}/\d{2}/backup_[0-9_\-]+_(manual|auto)\.json\.gz$#', $p); }

/** Exports every table and writes one gzip file. Returns the log row data. */
function run_backup(string $type, string $byName, ?string $byId): array {
  if (!backup_dir_ok()) throw new ApiError('เขียนไฟล์ในโฟลเดอร์ private/backups ไม่ได้ — ตรวจสอบสิทธิ์โฟลเดอร์', 500);
  @set_time_limit(300);
  $tables = []; $counts = [];
  foreach (BACKUP_TABLES as $t) {
    $rows = [];
    try { $rows = fetch_rows($t, "SELECT * FROM `$t` ORDER BY `id`", []); } catch (Throwable $e) { $rows = []; }
    $tables[$t] = $rows; $counts[$t] = count($rows);
  }
  $b = bkk_parts();
  $path = "{$b['be']}/{$b['mm']}/{$b['dd']}/backup_{$b['be']}-{$b['mm']}-{$b['dd']}_{$b['hh']}{$b['mi']}{$b['ss']}_{$type}.json.gz";
  $c = load_cfg();
  $json = json_encode(['meta' => ['app' => 'envelope-print-system', 'format' => 2, 'type' => $type, 'path' => $path, 'created_at' => gmdate('c'), 'created_by' => $byName, 'database' => ($c['database'] ?? ''), 'row_counts' => $counts], 'tables' => $tables], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $gz = gzencode($json, 6);
  $full = BACKUP_DIR . '/' . $path;
  if (!is_dir(dirname($full))) mkdir(dirname($full), 0775, true);
  if (file_put_contents($full, $gz, LOCK_EX) === false) throw new ApiError('บันทึกไฟล์สำรองไม่สำเร็จ', 500);
  q('INSERT INTO backup_logs (backup_type, path, size_bytes, row_counts, created_by, created_by_name, created_at) VALUES (?,?,?,?,?,?,?)',
    [$type, $path, strlen($gz), json_encode($counts), $byId, $byName, now_utc()]);
  return ['ok' => true, 'path' => $path, 'size_bytes' => strlen($gz), 'row_counts' => $counts];
}

/** Daily automatic backup rule (same as before): today's first run backs up unless someone pressed "สำรองข้อมูลตอนนี้" yesterday. */
function auto_backup_due(): ?string {
  $today = bkk_parts()['ce'];
  [$tFrom] = bkk_range($today, $today);
  $yest = bkk_parts(time() - 86400)['ce'];
  [$yFrom, $yTo] = bkk_range($yest, $yest);
  if (q_val("SELECT COUNT(*) FROM backup_logs WHERE backup_type = 'auto' AND created_at >= ?", [$tFrom])) return null;
  if (q_val("SELECT COUNT(*) FROM backup_logs WHERE backup_type = 'manual' AND created_at >= ? AND created_at < ?", [$yFrom, $yTo])) return null;
  return 'due';
}

function maybe_auto_backup(): void {
  try {
    if (!auto_backup_due()) return;
    // one process at a time
    $lock = @fopen(BACKUP_DIR . '/.auto.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return;
    if (auto_backup_due()) run_backup('auto', 'ระบบอัตโนมัติ', null);
    flock($lock, LOCK_UN); fclose($lock);
  } catch (Throwable $e) { error_log('auto backup: ' . $e->getMessage()); }
}

function stream_backup(string $path): void {
  if (!valid_backup_path($path)) throw new ApiError('ชื่อไฟล์ไม่ถูกต้อง');
  $full = BACKUP_DIR . '/' . $path;
  if (!is_file($full)) throw new ApiError('ไม่พบไฟล์สำรอง', 404);
  header('Content-Type: application/gzip');
  header('Content-Length: ' . filesize($full));
  header('Content-Disposition: attachment; filename="' . basename($path) . '"');
  header('Cache-Control: no-store');
  readfile($full);
  exit;
}

function remove_backup(string $path): void {
  if (!valid_backup_path($path)) throw new ApiError('ชื่อไฟล์ไม่ถูกต้อง');
  $full = BACKUP_DIR . '/' . $path;
  if (is_file($full) && !@unlink($full)) throw new ApiError('ลบไฟล์ไม่สำเร็จ', 500);
}
