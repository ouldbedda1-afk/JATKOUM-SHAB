-- أرشيف التوقعات اليومية
-- snapshot_date: تاريخ أخذ اللقطة (اليوم)
-- forecasts: مصفوفة JSON بالتوقعات الهامة (ولايات × أيام)

create table if not exists weather_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  snapshot_date date        not null unique,
  forecasts     jsonb       not null default '[]',
  cities_count  int         not null default 0,
  created_at    timestamptz not null default now()
);

-- RLS
alter table weather_snapshots enable row level security;

-- القراءة مفتوحة للجميع
create policy "snapshots_read" on weather_snapshots
  for select using (true);

-- الكتابة فقط عبر service role (Edge Function أو anon في حالتنا)
create policy "snapshots_insert" on weather_snapshots
  for insert with check (true);

create policy "snapshots_update" on weather_snapshots
  for update using (true);

-- فهرس على التاريخ للبحث السريع
create index if not exists weather_snapshots_date_idx on weather_snapshots (snapshot_date desc);
