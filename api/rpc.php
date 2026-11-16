<?php
// =====================================================================
//  คำสั่งเฉพาะของระบบ (เดิมเป็นฟังก์ชันใน Supabase) — ทำงานใน transaction
// =====================================================================
declare(strict_types=1);

function ids_arg($v): array {
  $ids = array_values(array_filter(array_map('intval', is_array($v) ? $v : []), function ($x) { return $x > 0; }));
  return $ids;
}
function in_list(array $ids): string { return implode(',', array_fill(0, count($ids), '?')); }
function tx(callable $fn) {
  $pdo = db(); $pdo->beginTransaction();
  try { $r = $fn(); $pdo->commit(); return $r; }
  catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e instanceof PDOException ? friendly_pdo($e) : $e; }
}
/** UTC range covering Bangkok dates [from, to] (inclusive). */
function bkk_range(string $from, string $to): array {
  $f = new DateTime($from . ' 00:00:00', new DateTimeZone('Asia/Bangkok'));
  $t = new DateTime($to . ' 00:00:00', new DateTimeZone('Asia/Bangkok')); $t->modify('+1 day');
  $u = new DateTimeZone('UTC'); $f->setTimezone($u); $t->setTimezone($u);
  return [$f->format('Y-m-d H:i:s'), $t->format('Y-m-d H:i:s')];
}

function handle_rpc() {
  $b = body();
  $fn = (string)($b['fn'] ?? '');
  $a = $b['args'] ?? [];
  require_login();
  switch ($fn) {
    // ------------------------------------------------ ระบบพิมพ์ซอง
    case 'issue_letters': {
      require_envelope();
      $cids = ids_arg($a['p_customer_ids'] ?? []);
      if (!$cids) throw new ApiError('กรุณาเลือกผู้รับอย่างน้อย 1 รายการ');
      return tx(function () use ($a, $cids) {
        $bk = q_one('SELECT * FROM books WHERE id = ? FOR UPDATE', [(int)($a['p_book_id'] ?? 0)]);
        if (!$bk || !(int)$bk['active']) throw new ApiError('ไม่พบเล่มทะเบียน หรือเล่มทะเบียนถูกปิดใช้งาน');
        $cur = be_year();
        $year = (int)$bk['year']; $next = (int)$bk['next_no'];
        if ((int)$bk['auto_reset'] && $year < $cur) { $year = $cur; $next = 1; }
        // never re-use a number, even if an admin moved next_no backwards
        $next = max($next, (int)q_val('SELECT COALESCE(MAX(doc_no), 0) + 1 FROM letters WHERE book_id = ? AND year = ?', [$bk['id'], $year]));
        $cs = q_all('SELECT cu.*, pr.name AS province_name, t.name AS title_name FROM customers cu LEFT JOIN provinces pr ON pr.id = cu.province_id LEFT JOIN titles t ON t.id = cu.title_id WHERE cu.id IN (' . in_list($cids) . ')', $cids);
        $byId = []; foreach ($cs as $c) $byId[(int)$c['id']] = $c;
        $subject = trim((string)($a['p_subject'] ?? '')); $urg = (string)($a['p_urgency'] ?? 'ปกติ') ?: 'ปกติ'; $env = ($a['p_envelope'] ?? 'white') === 'brown' ? 'brown' : 'white';
        $new = [];
        foreach ($cids as $cid) {
          if (!isset($byId[$cid])) continue;
          $c = $byId[$cid];
          $name = trim(((int)$c['title_id'] > 0 && $c['title_name'] ? $c['title_name'] . ' ' : '') . $c['name']);
          q('INSERT INTO letters (book_id, year, doc_no, doc_number, customer_id, recipient_name, recipient_address, recipient_amphur, recipient_province, recipient_postcode, subject, urgency, envelope, created_by, created_by_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$bk['id'], $year, $next, $bk['prefix'] . '/' . $next, $cid, $name, $c['address'], $c['amphur'], ($c['province_name'] === '-' ? null : $c['province_name']), $c['postcode'], $subject !== '' ? $subject : null, $urg, $env, me_id(), me_name(), now_utc()]);
          $new[] = (int)db()->lastInsertId();
          $next++;
        }
        if (!$new) throw new ApiError('ไม่พบข้อมูลผู้รับที่เลือก');
        q('UPDATE books SET year = ?, next_no = ? WHERE id = ?', [$year, $next, $bk['id']]);
        return fetch_rows('letters', 'SELECT * FROM letters WHERE id IN (' . in_list($new) . ') ORDER BY doc_no', $new);
      });
    }
    case 'mark_printed': {
      require_envelope();
      $ids = ids_arg($a['p_ids'] ?? []); if (!$ids) return 0;
      $env = in_array($a['p_envelope'] ?? null, ['white', 'brown'], true) ? $a['p_envelope'] : null;
      return tx(function () use ($ids, $env) {
        $st = q("UPDATE letters SET status = 'printed', print_count = print_count + 1, printed_at = ?, envelope = COALESCE(?, envelope) WHERE id IN (" . in_list($ids) . ") AND status <> 'cancelled'", array_merge([now_utc(), $env], $ids));
        q('INSERT INTO print_logs (letter_id, envelope, printed_at, printed_by, printed_by_name) SELECT id, envelope, ?, ?, ? FROM letters WHERE id IN (' . in_list($ids) . ") AND status <> 'cancelled'", array_merge([now_utc(), me_id(), me_name()], $ids));
        return $st->rowCount();
      });
    }
    case 'cancel_letter': {
      require_envelope();
      $sql = "UPDATE letters SET status = 'cancelled', cancel_reason = ? WHERE id = ?" . (is_admin() ? '' : ' AND created_by = ?');
      $p = [trim((string)($a['p_reason'] ?? '')) ?: null, (int)($a['p_id'] ?? 0)]; if (!is_admin()) $p[] = me_id();
      if (!q($sql, $p)->rowCount()) throw new ApiError('ยกเลิกได้เฉพาะเลขที่ตนเองออก (หรือผู้ดูแลระบบ)');
      return null;
    }
    case 'update_letter': {
      require_envelope();
      $t = function ($k) use ($a) { $v = trim((string)($a[$k] ?? '')); return $v === '' ? null : $v; };
      if (!$t('p_name')) throw new ApiError('กรุณากรอกชื่อผู้รับ');
      $id = (int)($a['p_id'] ?? 0);
      if (!q_val("SELECT COUNT(*) FROM letters WHERE id = ? AND status <> 'cancelled'", [$id])) throw new ApiError('ไม่พบรายการ หรือรายการถูกยกเลิกแล้ว');
      q('UPDATE letters SET recipient_name = ?, recipient_address = ?, recipient_amphur = ?, recipient_province = ?, recipient_postcode = ?, subject = ?, urgency = COALESCE(?, urgency) WHERE id = ?',
        [$t('p_name'), $t('p_address'), $t('p_amphur'), $t('p_province'), $t('p_postcode'), $t('p_subject'), $t('p_urgency'), $id]);
      return null;
    }
    case 'print_report': {
      require_envelope();
      [$f, $to] = bkk_range((string)$a['p_from'], (string)$a['p_to']);
      $len = ($a['p_period'] ?? 'day') === 'year' ? 4 : (($a['p_period'] ?? 'day') === 'month' ? 7 : 10);
      $rows = q_all("SELECT LEFT(DATE_FORMAT(DATE_ADD(printed_at, INTERVAL 7 HOUR), '%Y-%m-%d'), $len) AS period_key,
          SUM(envelope = 'white') AS white, SUM(envelope = 'brown') AS brown, COUNT(*) AS total, COUNT(DISTINCT letter_id) AS envelopes
        FROM print_logs WHERE printed_at >= ? AND printed_at < ? GROUP BY period_key ORDER BY period_key", [$f, $to]);
      return array_map(function ($r) { foreach (['white', 'brown', 'total', 'envelopes'] as $k) $r[$k] = (int)$r[$k]; return $r; }, $rows);
    }
    case 'print_report_items': {
      require_envelope();
      [$f, $to] = bkk_range((string)$a['p_from'], (string)$a['p_to']);
      $p = [$f, $to]; $envSql = '';
      if (!empty($a['p_envelope'])) { $envSql = ' AND l.envelope = ?'; $p[] = $a['p_envelope']; }
      $rows = q_all("SELECT t.id AS letter_id, t.book_id, t.year, t.doc_no, t.doc_number, t.created_at AS issued_at,
          t.recipient_name, t.recipient_province, t.subject, t.status,
          SUM(l.envelope = 'white') AS white, SUM(l.envelope = 'brown') AS brown, COUNT(*) AS prints, MAX(l.printed_at) AS last_printed_at,
          GROUP_CONCAT(DISTINCT l.printed_by_name ORDER BY l.printed_by_name SEPARATOR ', ') AS printed_by
        FROM print_logs l JOIN letters t ON t.id = l.letter_id
        WHERE l.printed_at >= ? AND l.printed_at < ?$envSql
        GROUP BY t.id, t.book_id, t.year, t.doc_no, t.doc_number, t.created_at, t.recipient_name, t.recipient_province, t.subject, t.status
        ORDER BY t.book_id, t.year, t.doc_no", $p);
      return array_map(function ($r) {
        foreach (['letter_id', 'book_id', 'year', 'doc_no', 'white', 'brown', 'prints'] as $k) $r[$k] = (int)$r[$k];
        foreach (['issued_at', 'last_printed_at'] as $k) if ($r[$k]) $r[$k] = str_replace(' ', 'T', preg_replace('/\.\d+$/', '', (string)$r[$k])) . '+00:00';
        return $r;
      }, $rows);
    }
    // ------------------------------------------------ ผู้ใช้งาน
    case 'admin_user_auth_status': {
      require_admin();
      return array_map(function ($r) {
        foreach (['email_confirmed_at', 'last_sign_in_at'] as $k) if ($r[$k]) $r[$k] = str_replace(' ', 'T', preg_replace('/\.\d+$/', '', (string)$r[$k])) . '+00:00';
        return $r;
      }, q_all('SELECT id, email_confirmed_at, last_sign_in_at FROM app_users'));
    }
    case 'admin_confirm_user': {
      require_admin();
      if (!q('UPDATE app_users SET email_confirmed_at = COALESCE(email_confirmed_at, ?) WHERE id = ?', [now_utc(), (string)($a['p_id'] ?? '')])->rowCount()
        && !q_val('SELECT COUNT(*) FROM app_users WHERE id = ?', [(string)($a['p_id'] ?? '')])) throw new ApiError('ไม่พบผู้ใช้');
      return null;
    }
    // ------------------------------------------------ ระบบพิมพ์เช็ค
    case 'mark_cheques_printed': {
      require_cheque();
      $ids = ids_arg($a['p_ids'] ?? []); if (!$ids) return 0;
      $cross = in_array($a['p_crossing'] ?? null, ['ac', 'nonac'], true) ? $a['p_crossing'] : null;
      $formId = isset($a['p_form_id']) && $a['p_form_id'] ? (int)$a['p_form_id'] : null;
      return tx(function () use ($ids, $cross, $formId) {
        $fname = $formId ? q_val('SELECT name FROM cheque_forms WHERE id = ?', [$formId]) : null;
        $st = q('UPDATE cheques SET print_count = print_count + 1, printed_at = ?, crossing = COALESCE(?, crossing), updated_at = ? WHERE id IN (' . in_list($ids) . ") AND status = 'normal'", array_merge([now_utc(), $cross, now_utc()], $ids));
        q('INSERT INTO cheque_print_logs (cheque_id, form_id, form_name, crossing, printed_at, printed_by, printed_by_name) SELECT id, ?, ?, ?, ?, ?, ? FROM cheques WHERE id IN (' . in_list($ids) . ") AND status = 'normal'", array_merge([$formId, $fname, $cross, now_utc(), me_id(), me_name()], $ids));
        return $st->rowCount();
      });
    }
    case 'cancel_cheque': {
      require_cheque();
      $today = bkk_parts()['ce'];
      $n = q("UPDATE cheques SET status = 'cancelled', cancel_date = ?, cancel_amount = amount, cancel_reason = ?, updated_at = ? WHERE id = ? AND status = 'normal'",
        [$today, trim((string)($a['p_reason'] ?? '')) ?: null, now_utc(), (int)($a['p_id'] ?? 0)])->rowCount();
      if (!$n) throw new ApiError('ไม่พบเช็ค หรือเช็คถูกยกเลิกแล้ว');
      return null;
    }
  }
  throw new ApiError("ไม่รู้จักคำสั่ง $fn", 404);
}
