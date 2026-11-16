<?php
// สำรองข้อมูลอัตโนมัติจาก Windows Task Scheduler (ทุกวัน 00:00 น.)
//   C:\xampp\php\php.exe C:\xampp\htdocs\envelope-print-system\api\cron_backup.php
// สำรองเมื่อเมื่อวานไม่มีการกด "สำรองข้อมูลตอนนี้" (เพิ่ม --force เพื่อสำรองทุกครั้ง)
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('CLI only'); }
require __DIR__ . '/lib.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/query.php';
require __DIR__ . '/rpc.php';
require __DIR__ . '/backup.php';
try {
  $force = in_array('--force', $argv, true);
  if (!$force && !auto_backup_due()) { echo "skip: มีการสำรองแล้ว\n"; exit(0); }
  $r = run_backup('auto', 'ระบบอัตโนมัติ (Task Scheduler)', null);
  echo "ok: {$r['path']} ({$r['size_bytes']} bytes)\n";
} catch (Throwable $e) { fwrite(STDERR, 'error: ' . $e->getMessage() . "\n"); exit(1); }
