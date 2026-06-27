-- جدول خلايا العواصف النشطة (مزامنة من المتصفح كل 5 دقائق)
create table if not exists storm_cells (
  id            text primary key,
  city          text,
  wilaya        text,
  lat           double precision,
  lon           double precision,
  mmh           double precision,
  first_seen    timestamptz default now(),
  last_seen     timestamptz default now(),
  notified_at   timestamptz,
  suppressed_until timestamptz
);

alter table storm_cells enable row level security;

-- القراءة العامة مسموحة (الواجهة تقرأ الخلايا المُخمَدة)
create policy "storm_cells_read" on storm_cells for select using (true);

-- الكتابة فقط عبر service_role (الواجهة الخلفية)
create policy "storm_cells_write" on storm_cells for all using (
  auth.role() = 'service_role'
);

-- جدول الإخماد اليدوي (يُقرأ من المتصفح لتطبيق suppression محلياً)
create table if not exists storm_suppressions (
  id            serial primary key,
  lat           double precision not null,
  lon           double precision not null,
  suppressed_until timestamptz not null,
  created_at    timestamptz default now()
);

alter table storm_suppressions enable row level security;
create policy "suppressions_read" on storm_suppressions for select using (true);
create policy "suppressions_write" on storm_suppressions for all using (
  auth.role() = 'service_role'
);
