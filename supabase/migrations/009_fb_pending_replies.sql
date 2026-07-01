-- ردود تعليقات فيسبوك المقترحة — بانتظار موافقة الأدمن عبر تيليجرام قبل النشر الفعلي
-- comment_id: معرّف التعليق الأصلي على فيسبوك (نردّ عليه عند الموافقة)
-- status: pending | approved | rejected

create table if not exists fb_pending_replies (
  id             uuid        primary key default gen_random_uuid(),
  post_id        text,
  comment_id     text        not null,
  comment_text   text        not null,
  proposed_reply text        not null,
  status         text        not null default 'pending',
  created_at     timestamptz not null default now()
);

-- RLS — هذا الجدول داخلي للإدارة فقط، يصل إليه service role (Edge Functions) حصراً
alter table fb_pending_replies enable row level security;

create index if not exists fb_pending_replies_status_idx on fb_pending_replies (status, created_at desc);
