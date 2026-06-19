-- جدول اشتراكات Web Push
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions (endpoint);

-- تفعيل أمان الصفوف
alter table public.push_subscriptions enable row level security;

-- السماح لأي زائر (anon) بإضافة/تحديث اشتراكه الخاص
create policy "anyone can insert a subscription"
  on public.push_subscriptions for insert
  to anon, authenticated
  with check (true);

create policy "anyone can upsert by endpoint"
  on public.push_subscriptions for update
  to anon, authenticated
  using (true) with check (true);

create policy "anyone can delete own endpoint"
  on public.push_subscriptions for delete
  to anon, authenticated
  using (true);

-- القراءة وإرسال الإشعارات تتم فقط عبر service_role (الدالة الخلفية)،
-- لذا لا نمنح anon صلاحية SELECT لحماية قائمة المشتركين.

-- جدول حالة منع التكرار: يضمن إرسال إشعار واحد لكل حدث خلال نافذة زمنية
create table if not exists public.push_state (
  key      text primary key,
  signature text,
  sent_at  timestamptz not null default now()
);

alter table public.push_state enable row level security;
-- لا سياسات لـ anon: يُدار حصراً عبر service_role داخل الدالة الخلفية.
