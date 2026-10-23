-- جدولة hazard-publisher تلقائياً عبر pg_cron + pg_net
-- يُشغَّل مرة يومياً الساعة 8:00 UTC (= 8:00 بتوقيت موريتانيا) لنشر نشرات
-- الغبار وارتفاع الموج لليوم ويومين بعده، وتحديثها أو إلغائها إن تغيّرت.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- إزالة الجدول القديم إن وُجد (لمنع التكرار عند إعادة التشغيل)
select cron.unschedule('hazard-publisher')
where exists (select 1 from cron.job where jobname = 'hazard-publisher');

select cron.schedule(
  'hazard-publisher',
  '0 8 * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/hazard-publisher',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- للتحقق بعد التشغيل:
-- SELECT * FROM cron.job WHERE jobname = 'hazard-publisher';
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'hazard-publisher') ORDER BY start_time DESC LIMIT 10;
