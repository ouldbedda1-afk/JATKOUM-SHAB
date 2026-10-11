-- سجل تقارير مقاييس الأمطار: صف واحد لكل مقال حاولت ami-rain-scraper معالجته.
--
-- الغرض:
--   (1) منع إدراج التقرير نفسه مرتين عند تزامن تشغيلين: الدالة تحجز report_url
--       هنا (مفتاح أساسي) قبل أن تُدرج قراءاته في rain_measurements.
--   (2) سجل واضح لكل محاولة: نجحت (وكم قراءة) أو فشلت (ولماذا)، مع إعادة
--       المحاولة الآمنة لما فشل.
--
-- ترحيل إضافي فقط: جدول جديد، لا يمسّ rain_measurements ولا أي بيانات موجودة.
-- الدالة تعمل بدونه (تتجاوز السجل بصمت إن لم يُطبَّق).

create table if not exists public.rain_report_log (
  report_url   text        primary key,
  wp_id        text,
  title        text,
  published_at timestamptz,
  -- processing: محجوز والإدراج جارٍ — imported: حُفظت قراءاته —
  -- failed: تعذّر (السبب في error) ويُعاد في التشغيل التالي
  status       text        not null check (status in ('processing', 'imported', 'failed', 'no-data')),
  rows_count   integer,
  issues       jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- لا سياسات لـ anon/authenticated: يُدار حصراً عبر service_role داخل الدالة.
alter table public.rain_report_log enable row level security;

create index if not exists rain_report_log_status_idx on public.rain_report_log (status, updated_at desc);
