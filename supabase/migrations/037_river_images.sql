-- صور الأقمار الصناعية لنهر السنغال عند كل محطة (دالة river-flood، images.ts) وصفحة /river.
-- كل مشهد صف: radar (Sentinel-1، المياه الجديدة بالأحمر ومساحتها flood_km2) أو optical (Sentinel-2).
-- تُحفظ آخر صورة لكل محطة ونوع في الحاوية العامة river-images، ويُحذف ما قدُم عن 120 يوماً.
-- يكتبها مفتاح الخدمة وحده، ويقرؤها الجميع.

create table if not exists public.river_images (
  station    text not null,
  kind       text not null check (kind in ('radar', 'optical')),
  image_date timestamptz not null,
  image_url  text not null,
  flood_km2  real,
  created_at timestamptz not null default now(),
  primary key (station, kind, image_date)
);
alter table public.river_images enable row level security;
drop policy if exists river_images_read on public.river_images;
create policy river_images_read on public.river_images for select to anon, authenticated using (true);
grant select on public.river_images to anon, authenticated;
grant select, insert, update, delete on public.river_images to service_role;

insert into storage.buckets (id, name, public)
values ('river-images', 'river-images', true)
on conflict (id) do nothing;

-- الصور تجعل التشغيل اليومي أطول: مهلة دقيقتين ونصف بدل دقيقة
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
      timeout_milliseconds := 150000
    ) as request_id;
  $$
);

-- للتحقق:
-- select station, kind, image_date, flood_km2 from public.river_images order by image_date desc;
