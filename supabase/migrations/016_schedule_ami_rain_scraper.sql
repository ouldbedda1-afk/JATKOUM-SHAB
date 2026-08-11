-- جدولة ami-rain-scraper تلقائياً عبر pg_cron + pg_net
-- يُشغَّل كل 3 ساعات للتحقق من خلاصة RSS لموقع الوكالة الموريتانية للأنباء
-- ويستخرج تقارير المقاييس الجديدة تلقائياً دون أي تدخّل يدوي.
--
-- ⚠️ قبل تشغيل هذا الـ migration، استبدل القيمتين الآتيتين:
--    YOUR_PROJECT_REF  ← مرجع مشروعك في Supabase (Project Settings → General)
--    YOUR_ANON_KEY     ← anon/public key  (Project Settings → API)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- إزالة الجدول القديم إن وُجد (لمنع التكرار عند إعادة التشغيل)
select cron.unschedule('ami-rain-scraper')
where exists (select 1 from cron.job where jobname = 'ami-rain-scraper');

-- الجدولة: كل 3 ساعات على الساعة (00:00 / 03:00 / 06:00 ...)
select cron.schedule(
  'ami-rain-scraper',
  '0 */3 * * *',
  $$
    select net.http_post(
      url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/ami-rain-scraper',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- للتحقق بعد التشغيل:
-- SELECT * FROM cron.job WHERE jobname = 'ami-rain-scraper';
-- SELECT * FROM cron.job_run_details WHERE jobname = 'ami-rain-scraper' ORDER BY start_time DESC LIMIT 10;
