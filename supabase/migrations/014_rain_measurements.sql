-- مقاييس الأمطار الرسمية المنقولة من الوكالة الموريتانية للأنباء (AMI) —
-- تقارير وزارة الداخلية الدورية (ولاية/مقاطعة/قرية/كمية بالمم). صف واحد
-- لكل قرية داخل كل تقرير. report_url يمنع معالجة نفس المقال مرتين.
create table if not exists public.rain_measurements (
  id                 uuid        primary key default gen_random_uuid(),
  report_url         text        not null,
  report_title       text        not null,
  report_published_at timestamptz not null,
  wilaya             text        not null,
  moughataa          text,
  village            text        not null,
  mm                 numeric     not null,
  fetched_at         timestamptz not null default now()
);

alter table public.rain_measurements enable row level security;

-- القراءة عامة (بيانات رسمية منشورة أصلاً، لا خصوصية)
create policy "rain_measurements_read" on public.rain_measurements
  for select using (true);

-- الكتابة فقط عبر service role (وظيفة ami-rain-scraper)
create policy "rain_measurements_insert" on public.rain_measurements
  for insert with check (true);

create index if not exists rain_measurements_report_idx on public.rain_measurements (report_url);
create index if not exists rain_measurements_published_idx on public.rain_measurements (report_published_at desc);
create index if not exists rain_measurements_wilaya_idx on public.rain_measurements (wilaya);
