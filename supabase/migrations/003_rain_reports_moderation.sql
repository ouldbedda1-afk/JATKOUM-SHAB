-- ════════════════════════════════════════════════════════════
--  مراجعة بلاغات المطر (تبشيرات المطر) قبل النشر + بيانات الناشر
-- ════════════════════════════════════════════════════════════

alter table public.rain_reports add column if not exists status text not null default 'pending';
alter table public.rain_reports add column if not exists reviewed_at timestamptz;
alter table public.rain_reports add column if not exists facebook_id text;
alter table public.rain_reports add column if not exists facebook_picture text;

create index if not exists rain_reports_status_idx on public.rain_reports (status, created_at desc);

-- البلاغات القديمة تبقى ظاهرة (تُعتبر معتمدة)
update public.rain_reports set status = 'approved' where status is null or status = 'pending';

-- تفعيل RLS: العموم يقرأون المعتمد فقط، وأي زائر يرسل بلاغاً معلّقاً
alter table public.rain_reports enable row level security;

drop policy if exists "anyone submits rain" on public.rain_reports;
create policy "anyone submits rain"
  on public.rain_reports for insert
  to anon, authenticated
  with check (status = 'pending' or status is null);

drop policy if exists "public reads approved rain" on public.rain_reports;
create policy "public reads approved rain"
  on public.rain_reports for select
  to anon, authenticated
  using (status = 'approved');

-- قراءة المعلّقة وتغيير الحالة يتمّان حصراً عبر دالة moderate (service_role).
