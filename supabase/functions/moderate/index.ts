// Supabase Edge Function: moderate
// لوحة المراجعة الخادمية: قراءة المعلّقة + موافقة/رفض — للأخبار وبلاغات الظالة.
// محمية بتوكن إدارة (سرّ خادمي) لا يمرّ عبر anon key.
//
// النشر:  supabase functions deploy moderate
// السرّ:   supabase secrets set ADMIN_TOKEN=<كلمة سر قوية>
//
// الطلب (POST) بترويسة x-admin-token:
//   { "action": "list",     "kind": "news"|"livestock" }
//   { "action": "approve",  "kind": "news"|"livestock", "id": "..." }
//   { "action": "reject",   "kind": "news"|"livestock", "id": "..." }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const ADMIN_TOKEN = Deno.env.get('ADMIN_TOKEN') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TABLE: Record<string, string> = {
  news: 'news_submissions',
  livestock: 'livestock_reports',
  rain: 'rain_reports',
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // تحقق توكن الإدارة
  const token = req.headers.get('x-admin-token') ?? '';
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return json({ error: 'غير مصرّح' }, 401);
  }

  try {
    const { action, kind, id } = await req.json();
    const table = TABLE[kind];
    if (!table) return json({ error: 'نوع غير معروف' }, 400);

    if (action === 'list') {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return json({ items: data ?? [] });
    }

    if (action === 'approve' || action === 'reject') {
      if (!id) return json({ error: 'id مطلوب' }, 400);
      const status = action === 'approve' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from(table)
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return json({ ok: true, id, status });
    }

    return json({ error: 'إجراء غير معروف' }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
