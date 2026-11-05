-- أرقام النشرة الموسمية لصفحة /seasonal (الخريطة والجداول)، صف لكل نشرة بـslug مقالها في news_articles.
-- تملؤه دالة seasonal-bulletin مع المسودة. لا يقرؤه الزوار إلا بعد نشر المقال (is_published).
--
-- ترتيب التطبيق: هذا الملف أولاً، ثم انشر الدالة seasonal-bulletin.

create table if not exists public.seasonal_outlooks (
  slug          text        primary key,        -- seasonal-YYYY-MM
  issued_on     date        not null,
  months        text[]      not null,           -- YYYY-MM-01 للأشهر الستة
  groups        jsonb       not null,           -- لكل ولاية: rain/normal/rain_class/rain_text/temp_anomaly/temp_text/rain_later…
  accumulation  jsonb,                          -- { label, lines: [{ name, recorded, reference, text }] }
  created_at    timestamptz not null default now()
);

alter table public.seasonal_outlooks enable row level security;
drop policy if exists seasonal_outlooks_read on public.seasonal_outlooks;
create policy seasonal_outlooks_read on public.seasonal_outlooks for select to anon, authenticated
  using (exists (
    select 1 from public.news_articles a
    where a.slug = seasonal_outlooks.slug and a.is_published
  ));
grant select on public.seasonal_outlooks to anon, authenticated;
grant select, insert, update, delete on public.seasonal_outlooks to service_role;

-- للتحقق:
-- select slug, issued_on, jsonb_array_length(groups) from public.seasonal_outlooks;
