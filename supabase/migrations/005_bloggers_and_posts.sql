-- المدوّنون وصفحاتهم
create table if not exists public.bloggers (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  slug         text        not null unique,          -- مثال: ahmed-vall
  bio          text,
  specialty    text,                                  -- مثال: رصد العواصف
  facebook_id  text,                                  -- الرقم من رابط الملف الشخصي
  facebook_url text,
  wilaya       text,
  active       boolean     not null default true,
  created_at   timestamptz not null default now()
);

-- مقالات المدوّنين
create table if not exists public.posts (
  id           uuid        primary key default gen_random_uuid(),
  blogger_id   uuid        not null references public.bloggers(id) on delete cascade,
  title        text        not null,
  content      text        not null,
  cover_url    text,
  wilaya       text,
  published    boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- قراءة عامة
alter table public.bloggers enable row level security;
alter table public.posts     enable row level security;

create policy "قراءة المدوّنين" on public.bloggers for select using (active = true);
create policy "قراءة المقالات"  on public.posts     for select using (published = true);

-- المدوّن الأول
insert into public.bloggers (name, slug, bio, specialty, facebook_id, facebook_url, wilaya)
values (
  'مدوّن الطقس',
  'blogger-1',
  'متابع لحركة السحب والأمطار في موريتانيا',
  'رصد العواصف',
  '100003655539542',
  'https://web.facebook.com/profile.php?id=100003655539642',
  'موريتانيا'
);
