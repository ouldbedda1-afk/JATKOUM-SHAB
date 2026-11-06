-- بؤر الحرائق النشطة في موريتانيا من NASA FIRMS (أقمار VIIRS)، آخر 10 أيام.
-- تملؤه دالة fire-hotspots كل ثلاث ساعات. الموقع يقرأ فقط (شريط الأخبار وصفحة المراعي).
--
-- ترتيب التطبيق: اضبط السر FIRMS_MAP_KEY وانشر الدالة fire-hotspots، ثم هذا الملف.

create table if not exists public.fire_hotspots (
  id            text        primary key,     -- القمر-التاريخ-الوقت-الإحداثيات
  lat           double precision not null,
  lon           double precision not null,
  detected_at   timestamptz not null,
  satellite     text,
  frp           real,                          -- الطاقة الإشعاعية للحريق (ميغاواط)
  confidence    text,                          -- l / n / h
  daynight      text,
  wilaya        text        not null,
  place         text,                          -- أقرب بلدية
  place_wilaya  text,
  distance_km   int,
  direction     text                           -- اتجاه الحريق من البلدية
);

create index if not exists fire_hotspots_detected_idx on public.fire_hotspots (detected_at desc);

alter table public.fire_hotspots enable row level security;
drop policy if exists fire_hotspots_read on public.fire_hotspots;
create policy fire_hotspots_read on public.fire_hotspots for select to anon, authenticated using (true);
grant select on public.fire_hotspots to anon, authenticated;
grant select, insert, update, delete on public.fire_hotspots to service_role;

-- كل ثلاث ساعات عند الدقيقة 25 (تصل أرصاد FIRMS بعد نحو ثلاث ساعات من مرور القمر)
select cron.unschedule('fire-hotspots') where exists (select 1 from cron.job where jobname = 'fire-hotspots');
select cron.schedule(
  'fire-hotspots',
  '25 */3 * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/fire-hotspots',
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
-- select wilaya, count(*), max(detected_at) from public.fire_hotspots group by wilaya order by 2 desc;
