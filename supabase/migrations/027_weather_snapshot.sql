-- نسخة مشتركة من طقس المدن يقرؤها كل الزوار (src/weatherApi.js)، بدل أن يطلبها كل متصفح من Open-Meteo.
-- تملؤها دالة weather-snapshot كل ثلاث ساعات. صفان: core (المدن الأساسية) و communes (البلديات الأخرى).
-- الموقع يقرأ فقط.
--
-- ترتيب التطبيق: انشر الدالة weather-snapshot أولاً، ثم هذا الملف.

create table if not exists public.weather_snapshot (
  key         text        primary key,
  payload     jsonb       not null,    -- [{ city, data }]: data رد Open-Meteo لتلك النقطة
  fetched_at  timestamptz not null
);

alter table public.weather_snapshot enable row level security;
drop policy if exists weather_snapshot_read on public.weather_snapshot;
create policy weather_snapshot_read on public.weather_snapshot for select to anon, authenticated using (true);
grant select on public.weather_snapshot to anon, authenticated;
grant select, insert, update, delete on public.weather_snapshot to service_role;

-- كل ثلاث ساعات عند الدقيقة 5
select cron.unschedule('weather-snapshot') where exists (select 1 from cron.job where jobname = 'weather-snapshot');
select cron.schedule(
  'weather-snapshot',
  '5 */3 * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/weather-snapshot',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb'
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
  $$
);

-- للتحقق:
-- select key, jsonb_array_length(payload), fetched_at from public.weather_snapshot;
