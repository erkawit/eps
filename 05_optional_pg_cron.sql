-- =====================================================================
--  05 (ไม่บังคับ) — ตั้งเวลาสำรองข้อมูลให้ตรง 00:00 น. เป๊ะด้วย Supabase pg_cron
--
--  Vercel Cron แผนฟรี (Hobby) อาจเรียกช้าได้ภายในชั่วโมงนั้น (00:00–00:59 น.)
--  ถ้าต้องการให้ตรงเวลา ให้รันไฟล์นี้ (แก้ 2 ค่าข้างล่างก่อน)
--  ระบบป้องกันการสำรองซ้ำในวันเดียวกันอยู่แล้ว ใช้ร่วมกับ Vercel Cron ได้
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('envelope-auto-backup')
 where exists (select 1 from cron.job where jobname = 'envelope-auto-backup');

-- 0 17 * * * (UTC) = 00:00 น. เวลาประเทศไทย
select cron.schedule(
  'envelope-auto-backup',
  '0 17 * * *',
  $$
  select net.http_get(
    url     := 'https://YOUR-APP.vercel.app/api/backup',               -- << แก้เป็นโดเมนของคุณ
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'), -- << ค่าเดียวกับ CRON_SECRET ใน Vercel
    timeout_milliseconds := 60000
  );
  $$
);
