-- المناطق المهيأة لتكاثر الجراد الصحراوي، من الأقمار الصناعية (صفحة /pastures)
--
-- locust_habitat: لكل خلية نصف درجة من موائل الجراد (المطر في آخر 30 يوماً، ونسبة ما اخضرّ فيها
-- مقارنةً بموسم الجفاف) وحالتها: 3 مطر ونبات أخضر، 2 نبات أخضر، 1 مطر فقط، 0 جافة.
-- تستبدل دالة locust-habitat محتواه كل يوم. الموقع يقرأ فقط.
--
-- ترتيب التطبيق: انشر الدالة locust-habitat أولاً، ثم هذا الملف.

create table if not exists public.locust_habitat (
  lat               real    not null,     -- مركز الخلية
  lon               real    not null,
  wilaya            text    not null,
  surveys           int     not null default 0,   -- مسوحات الفاو فيها منذ 2023
  positive          int     not null default 0,   -- منها ما وُجد فيه جراد
  green_share       real,                 -- نسبة النقاط التي اخضرّت مقارنةً بالجفاف
  ndvi_mean         real,
  green_share_prev  real,                 -- قبل 16 يوماً
  rain_30d          real,                 -- مم
  rain_10d          real,
  status            smallint not null,
  ndvi_date         date    not null,
  computed_at       timestamptz not null default now(),
  primary key (lat, lon)
);

alter table public.locust_habitat enable row level security;
drop policy if exists locust_habitat_read on public.locust_habitat;
create policy locust_habitat_read on public.locust_habitat for select to anon, authenticated using (true);
grant select on public.locust_habitat to anon, authenticated;
grant select, insert, update, delete on public.locust_habitat to service_role;

-- يومياً 06:30، بعد تحديث صورة MODIS لثمانية أيام
select cron.unschedule('locust-habitat') where exists (select 1 from cron.job where jobname = 'locust-habitat');
select cron.schedule(
  'locust-habitat',
  '30 6 * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/locust-habitat',
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
-- select status, count(*) from public.locust_habitat group by status order by status;
