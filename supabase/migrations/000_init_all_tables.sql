-- ════════════════════════════════════════════════════════════════
--  جاتكم اسحاب — إنشاء كل الجداول من الصفر (آمن للتشغيل المتكرر)
--  شغّله مرة واحدة في: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════

-- ───── 1) بلاغات الظالة (الماشية المفقودة/الموجودة) ─────
create table if not exists public.livestock_reports (
  id            uuid primary key default gen_random_uuid(),
  report_type   text,                 -- lost | found
  animal_type   text,
  region        text,
  village       text,
  description   text,
  contact_phone text,
  image_url     text,
  voice_url     text,
  status        text not null default 'pending',  -- pending | approved | rejected
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists livestock_status_idx on public.livestock_reports (status, created_at desc);

-- ───── 2) تبشيرات المطر ─────
create table if not exists public.rain_reports (
  id                         uuid primary key default gen_random_uuid(),
  city                       text,
  rain_intensity             text,
  description                text,
  is_verified                boolean default false,
  latitude                   double precision,
  longitude                  double precision,
  nearest_district           text,
  distance_from_district_km  double precision,
  location_accuracy_m        integer,
  facebook_name              text,
  facebook_url               text,
  facebook_picture           text,
  facebook_id                text,
  facebook_account_age       text,
  facebook_followers         integer,
  image_url                  text,
  status                     text not null default 'pending',
  reviewed_at                timestamptz,
  created_at                 timestamptz not null default now()
);
create index if not exists rain_status_idx on public.rain_reports (status, created_at desc);

-- ───── 3) أخبار المستخدمين ─────
create table if not exists public.news_submissions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  category    text default 'عام',
  city        text,
  author_name text,
  contact     text,
  image_url   text,
  status      text not null default 'pending',
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists news_status_idx on public.news_submissions (status, created_at desc);

-- ───── 4) بلاغات البواه (محتفظ بها للتوافق) ─────
create table if not exists public.bawah_reports (
  id               uuid primary key default gen_random_uuid(),
  region           text,
  nearest_district text,
  trend            text,
  description      text,
  is_verified      boolean default true,
  created_at       timestamptz not null default now()
);

-- ───── 5) التنبيهات الإدارية ─────
create table if not exists public.alerts (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  message    text,
  severity   text,
  created_at timestamptz not null default now()
);

-- ───── 6) توقعات الأمطار (إدارية) ─────
create table if not exists public.rain_forecasts (
  id          uuid primary key default gen_random_uuid(),
  date        text,
  date_ar     text,
  cities      jsonb,
  probability integer,
  intensity   text,
  risk_level  text,
  icon        text,
  created_at  timestamptz not null default now()
);

-- ───── 7) اشتراكات الإشعارات الفورية + حالة منع التكرار ─────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create table if not exists public.push_state (
  key       text primary key,
  signature text,
  sent_at   timestamptz not null default now()
);

-- ───── 8) مفضّلة وسجلّ بحث (اختياري) ─────
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    text,
  city_name  text,
  created_at timestamptz not null default now()
);
create table if not exists public.search_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    text,
  query      text,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════
--  أمان الصفوف (RLS) + السياسات
-- ════════════════════════════════════════════════════════════════
alter table public.livestock_reports enable row level security;
alter table public.rain_reports      enable row level security;
alter table public.news_submissions  enable row level security;
alter table public.bawah_reports     enable row level security;
alter table public.alerts            enable row level security;
alter table public.rain_forecasts    enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_state         enable row level security;
alter table public.favorites          enable row level security;
alter table public.search_history     enable row level security;

-- الجداول الخاضعة للمراجعة: إدراج عام + قراءة المعتمد فقط
do $$
declare t text;
begin
  foreach t in array array['livestock_reports','rain_reports','news_submissions'] loop
    execute format('drop policy if exists "%s_insert" on public.%I;', t, t);
    execute format('create policy "%s_insert" on public.%I for insert to anon, authenticated with check (true);', t, t);
    execute format('drop policy if exists "%s_select" on public.%I;', t, t);
    execute format('create policy "%s_select" on public.%I for select to anon, authenticated using (status = ''approved'');', t, t);
  end loop;
end $$;

-- جداول للقراءة العامة فقط (تُدار عبر الإدارة)
do $$
declare t text;
begin
  foreach t in array array['bawah_reports','alerts','rain_forecasts'] loop
    execute format('drop policy if exists "%s_read" on public.%I;', t, t);
    execute format('create policy "%s_read" on public.%I for select to anon, authenticated using (true);', t, t);
  end loop;
end $$;

-- اشتراكات الإشعارات: إدراج/تحديث/حذف عام (القراءة عبر service_role فقط)
drop policy if exists "push_sub_insert" on public.push_subscriptions;
create policy "push_sub_insert" on public.push_subscriptions for insert to anon, authenticated with check (true);
drop policy if exists "push_sub_update" on public.push_subscriptions;
create policy "push_sub_update" on public.push_subscriptions for update to anon, authenticated using (true) with check (true);
drop policy if exists "push_sub_delete" on public.push_subscriptions;
create policy "push_sub_delete" on public.push_subscriptions for delete to anon, authenticated using (true);

-- مفضّلة وسجلّ بحث: مفتوحة للزائر
do $$
declare t text;
begin
  foreach t in array array['favorites','search_history'] loop
    execute format('drop policy if exists "%s_all" on public.%I;', t, t);
    execute format('create policy "%s_all" on public.%I for all to anon, authenticated using (true) with check (true);', t, t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
--  تخزين الصور والصوت (Storage)
-- ════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('images','images',true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('audio','audio',true)   on conflict (id) do nothing;

drop policy if exists "public read images" on storage.objects;
create policy "public read images" on storage.objects for select to anon, authenticated using (bucket_id in ('images','audio'));
drop policy if exists "public upload images" on storage.objects;
create policy "public upload images" on storage.objects for insert to anon, authenticated with check (bucket_id in ('images','audio'));
