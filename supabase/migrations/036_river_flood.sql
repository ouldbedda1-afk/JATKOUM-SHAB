-- فيضان نهر السنغال (دالة river-flood وصفحة /river): آخر مستوى متوقع لكل محطة، حتى لا يتكرر
-- تنبيه المشرف كل صباح. level: ‏0 عادي، 1 أعلى من المعتاد، 2 خطر فيضان، 3 فيضان كبير.
-- تكتبه الدالة وحدها بمفتاح الخدمة.

create table if not exists public.river_flood_state (
  station    text primary key,
  level      int not null default 0,
  peak       int,
  peak_day   date,
  updated_at timestamptz not null default now()
);
alter table public.river_flood_state enable row level security;
grant select, insert, update, delete on public.river_flood_state to service_role;

-- يومياً الساعة 06:10 (تُحدَّث توقعات GloFAS مرة في اليوم)
select cron.unschedule('river-flood') where exists (select 1 from cron.job where jobname = 'river-flood');
select cron.schedule(
  'river-flood',
  '10 6 * * *',
  $$
    select net.http_post(
      url     := 'https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/river-flood',
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
-- select * from public.river_flood_state order by station;
