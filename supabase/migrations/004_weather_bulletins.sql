-- نشرات الطقس الإدارية — تُنشر مباشرة عبر تيليجرام وتظهر في "رصد اليوم"
create table if not exists public.weather_bulletins (
  id         uuid        primary key default gen_random_uuid(),
  text       text        not null,
  icon       text        not null default '📢',
  expires_at timestamptz,          -- null = لا تنتهي إلا بالحذف اليدوي
  created_at timestamptz not null default now()
);

-- السماح للقراءة العامة (القراء بدون تسجيل دخول)
alter table public.weather_bulletins enable row level security;
create policy "قراءة عامة" on public.weather_bulletins
  for select using (true);
-- الكتابة والحذف للـ service_role فقط (Edge Functions)
