-- المراعي والجراد: صفحة /pastures
--
-- pasture_ndvi: متوسط مؤشر الغطاء النباتي (NDVI) في كل ولاية لكل فترة 16 يوماً من صور MODIS،
--   مع معدل الفترة نفسها في السنوات العشر السابقة. تملؤه دالة pasture-ndvi.
-- locust_observations: مواقع مسح الجراد الصحراوي في موريتانيا من الفاو (RAMSES).
--   تملؤه دالة locust-observations.
-- الموقع يقرأ فقط.
--
-- ترتيب التطبيق: انشر الدالتين pasture-ndvi و locust-observations أولاً، ثم هذا الملف.

create table if not exists public.pasture_ndvi (
  wilaya          text    not null,
  period          date    not null,        -- أول يوم في الفترة (16 يوماً)
  ndvi            real    not null,        -- متوسط الولاية
  prev_ndvi       real,                    -- الفترة السابقة
  mean_ndvi       real,                    -- معدل الفترة نفسها في السنوات السابقة
  std_ndvi        real,
  min_ndvi        real,
  max_ndvi        real,
  baseline_years  int,
  pixels          int,                     -- عدد النقاط الصالحة (كل نقطة نحو 3×3 كم)
  updated_at      timestamptz not null default now(),
  primary key (wilaya, period)
);

alter table public.pasture_ndvi enable row level security;
drop policy if exists pasture_ndvi_read on public.pasture_ndvi;
create policy pasture_ndvi_read on public.pasture_ndvi for select to anon, authenticated using (true);
grant select on public.pasture_ndvi to anon, authenticated;
grant select, insert, update, delete on public.pasture_ndvi to service_role;

create table if not exists public.locust_observations (
  id                text    primary key,   -- OBJECTID في طبقة الفاو
  report_id         text,
  obs_date          date    not null,
  region            text,                  -- اسم الولاية في بيانات الفاو
  wilaya            text,                  -- اسمها في الموقع
  district          text,
  village           text,
  lat               double precision not null,
  lon               double precision not null,
  locust_type       text,                  -- NO LOCUST / ADULT / HOPPER / ADULT GROUPS / SWARM / BAND…
  presence_type     text,
  phase             text,
  behaviour         text,
  maturity          text,
  breeding          text,
  area_treated_ha   real    not null default 0,
  vegetation_state  text,
  severity          smallint not null      -- 0 لا جراد، 1 أفراد، 2 تجمعات أو تكاثر، 3 أسراب أو حشود
);

create index if not exists locust_observations_date_idx on public.locust_observations (obs_date desc);

alter table public.locust_observations enable row level security;
drop policy if exists locust_observations_read on public.locust_observations;
create policy locust_observations_read on public.locust_observations for select to anon, authenticated using (true);
grant select on public.locust_observations to anon, authenticated;
grant select, insert, update, delete on public.locust_observations to service_role;

-- يومياً 05:40: تظهر صورة الفترة الجديدة بعد أسبوعين تقريباً من نهايتها، والدالة تتخطى ما حُفظ
select cron.unschedule('pasture-ndvi') where exists (select 1 from cron.job where jobname = 'pasture-ndvi');
select cron.schedule(
  'pasture-ndvi',
  '40 5 * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/pasture-ndvi',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb'
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);

-- مرتين يومياً 06:10 و18:10
select cron.unschedule('locust-observations') where exists (select 1 from cron.job where jobname = 'locust-observations');
select cron.schedule(
  'locust-observations',
  '10 6,18 * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/locust-observations',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- للتحقق:
-- select wilaya, period, ndvi, mean_ndvi from public.pasture_ndvi order by period desc, wilaya;
-- select obs_date, wilaya, locust_type, severity from public.locust_observations order by obs_date desc limit 20;
