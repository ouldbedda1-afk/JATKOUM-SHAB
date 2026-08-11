-- جدولة ami-rain-scraper تلقائياً عبر pg_cron + pg_net
-- يُشغَّل كل 3 ساعات للتحقق من خلاصة RSS لموقع الوكالة الموريتانية للأنباء
-- ويستخرج تقارير المقاييس الجديدة تلقائياً دون أي تدخّل يدوي.
--
-- القيم أدناه مأخوذة من .env تلقائياً — لا حاجة لتعديل يدوي

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
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/ami-rain-scraper',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- للتحقق بعد التشغيل:
-- SELECT * FROM cron.job WHERE jobname = 'ami-rain-scraper';
-- SELECT * FROM cron.job_run_details WHERE jobname = 'ami-rain-scraper' ORDER BY start_time DESC LIMIT 10;
