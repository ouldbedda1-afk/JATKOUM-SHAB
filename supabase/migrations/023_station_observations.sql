-- قراءات محطات الأرصاد الجوية الموريتانية (wis2box: wis2.meteomauritanie.mr)
--
-- تملؤها دالة station-observations كل ساعة بمفتاح الخدمة: قراءة لكل محطة في كل ساعة
-- (الحرارة، الرطوبة، الضغط، الرياح، أمطار الساعة). الموقع يقرأ فقط.
--
-- ترتيب التطبيق: انشر الدالة station-observations أولاً، ثم هذا الملف.

create table if not exists public.station_observations (
  station_id   text        not null,          -- معرّف WIGOS
  name_ar      text        not null,
  wilaya       text,                           -- null للموانئ
  lat          double precision not null,
  lon          double precision not null,
  observed_at  timestamptz not null,
  temperature  real,                           -- °م
  humidity     real,                           -- %
  pressure     real,                           -- hPa، عند المحطة
  wind_dir     real,                           -- درجات
  wind_speed   real,                           -- م/ث
  precip_1h    real,                           -- مم خلال الساعة المنتهية في observed_at
  primary key (station_id, observed_at)
);

create index if not exists station_observations_observed_at_idx
  on public.station_observations (observed_at desc);

alter table public.station_observations enable row level security;

drop policy if exists station_observations_read on public.station_observations;
create policy station_observations_read on public.station_observations
  for select to anon, authenticated using (true);

grant select on public.station_observations to anon, authenticated;
grant select, insert, update, delete on public.station_observations to service_role;

-- آخر قراءة لكل محطة، مع مجموع أمطار آخر 24 ساعة قبلها وعدد الساعات المُبلَّغ عنها
create or replace view public.station_latest
with (security_invoker = true) as
select l.*,
       r.rain_24h,
       r.hours_24h
from (
  select distinct on (station_id) *
  from public.station_observations
  order by station_id, observed_at desc
) l
cross join lateral (
  select coalesce(sum(o.precip_1h), 0)::real as rain_24h,
         count(*)::int                       as hours_24h
  from public.station_observations o
  where o.station_id = l.station_id
    and o.observed_at >  l.observed_at - interval '24 hours'
    and o.observed_at <= l.observed_at
) r;

grant select on public.station_latest to anon, authenticated, service_role;

-- كل ساعة عند الدقيقة 20: تصل قراءة الساعة إلى wis2box بعد دقائق من رأس الساعة
select cron.unschedule('station-observations')
where exists (select 1 from cron.job where jobname = 'station-observations');

select cron.schedule(
  'station-observations',
  '20 * * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/station-observations',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- للتحقق:
-- select station_id, name_ar, observed_at, temperature, rain_24h from public.station_latest order by name_ar;
-- select * from cron.job where jobname = 'station-observations';
