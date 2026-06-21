-- ════════════════════════════════════════════════════════════
--  نظام المراجعة الموحّد: الأخبار + بلاغات الظالة
--  التدفّق: إرسال المستخدم → معلّق → موافقة الإدارة → منشور
-- ════════════════════════════════════════════════════════════

-- ── 1) أخبار المستخدمين ──────────────────────────────────────
create table if not exists public.news_submissions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  category     text default 'عام',          -- مطر، عاصفة، ظالة، عام...
  city         text,
  author_name  text,
  contact      text,
  image_url    text,
  status       text not null default 'pending',  -- pending | approved | rejected
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index if not exists news_submissions_status_idx on public.news_submissions (status, created_at desc);

alter table public.news_submissions enable row level security;

-- أي زائر يرسل خبراً (يُجبَر على pending عبر CHECK)
drop policy if exists "anyone submits news" on public.news_submissions;
create policy "anyone submits news"
  on public.news_submissions for insert
  to anon, authenticated
  with check (status = 'pending');

-- العموم يقرأون المعتمد فقط
drop policy if exists "public reads approved news" on public.news_submissions;
create policy "public reads approved news"
  on public.news_submissions for select
  to anon, authenticated
  using (status = 'approved');

-- ملاحظة: قراءة المعلّقة وتغيير الحالة يتمّان حصراً عبر service_role
--         داخل دالة moderate (لا سياسات anon لذلك).

-- ── 2) إضافة حالة المراجعة لبلاغات الظالة ────────────────────
alter table public.livestock_reports
  add column if not exists status text not null default 'pending';
alter table public.livestock_reports
  add column if not exists reviewed_at timestamptz;
create index if not exists livestock_reports_status_idx on public.livestock_reports (status, created_at desc);

-- البلاغات القديمة تبقى ظاهرة (تُعتبر معتمدة)
update public.livestock_reports set status = 'approved' where status is null or status = 'pending';

-- إن كان RLS مفعّلاً على livestock_reports، اضبط القراءة على المعتمد فقط.
-- (إن لم يكن مفعّلاً سابقاً، فعّله بحذر بعد التأكد من سياسات الإدراج لديك.)
alter table public.livestock_reports enable row level security;

drop policy if exists "anyone submits livestock" on public.livestock_reports;
create policy "anyone submits livestock"
  on public.livestock_reports for insert
  to anon, authenticated
  with check (status = 'pending' or status is null);

drop policy if exists "public reads approved livestock" on public.livestock_reports;
create policy "public reads approved livestock"
  on public.livestock_reports for select
  to anon, authenticated
  using (status = 'approved');
