-- النشرة الموسمية كل شهرين (seasonal-bulletin): يوم 7 من يناير ومارس ومايو ويوليو وسبتمبر
-- ونوفمبر الساعة 09:00، بعد يومين من تحديث ECMWF SEAS5 (يوم 5). تُحفظ مسودة وتصل الإدارةَ
-- على تيليغرام؛ النشر يدوي.
--
-- ترتيب التطبيق: انشر الدالتين seasonal-bulletin وtelegram-webhook أولاً، ثم هذا الملف.

select cron.unschedule('seasonal-bulletin')
where exists (select 1 from cron.job where jobname = 'seasonal-bulletin');

select cron.schedule(
  'seasonal-bulletin',
  '0 9 7 1,3,5,7,9,11 *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/seasonal-bulletin',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- للتحقق:
-- select * from cron.job where jobname = 'seasonal-bulletin';
