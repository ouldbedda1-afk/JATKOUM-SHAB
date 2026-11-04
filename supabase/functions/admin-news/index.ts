// Supabase Edge Function: admin-news
// كتابة الأخبار (news_articles) من لوحة الإدارة وأزرار "نشر كخبر". جدول الأخبار
// مغلق أمام الكتابة بالمفتاح العام، فكل إنشاء/تعديل/حذف يمرّ من هنا بتوكن الإدارة
// نفسه الذي تستعمله دالة moderate.
//
// النشر:  supabase functions deploy admin-news --no-verify-jwt
// السرّ:   ADMIN_TOKEN (مشترك مع moderate)
//
// الطلب (POST) بترويسة x-admin-token:
//   { "action": "list",   "limit": 50, "offset": 0, "search": "..." }  — كل الأخبار، المنشورة وغيرها
//   { "action": "create", "article": {...}, "skipFbPost": false }       — يُنشر على فيسبوك أيضاً إن كان منشوراً
//   { "action": "update", "id": "...", "updates": {...} }
//   { "action": "delete", "id": "..." }

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_TOKEN = Deno.env.get('ADMIN_TOKEN') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// نفس slugify في src/supabase.js: العنوان + لاحقة زمنية
function slugify(text: string): string {
  return text.trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^؀-ۿa-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, 100) + '-' + Date.now().toString(36);
}

// الأعمدة التي يملأها الخادم وحده
function clean(row: Record<string, unknown>) {
  const { id: _id, created_at: _c, views: _v, ...rest } = row || {};
  return rest;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const token = req.headers.get('x-admin-token') ?? '';
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return json({ error: 'غير مصرّح' }, 401);

  try {
    const body = await req.json();

    if (body.action === 'list') {
      const limit = Math.min(Number(body.limit) || 50, 500), offset = Number(body.offset) || 0;
      let q = supabase.from('news_articles')
        .select('*', { count: 'exact' })  // كامل الخبر: محرّر الإدارة يُملأ من هذه القائمة
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (body.search) q = q.ilike('title', `%${body.search}%`);
      const { data, count, error } = await q;
      if (error) throw error;
      return json({ data: data ?? [], count: count ?? 0 });
    }

    if (body.action === 'create') {
      const article = clean(body.article);
      if (!article.title) return json({ error: 'العنوان مطلوب' }, 400);
      const row = {
        ...article,
        slug: article.slug || slugify(String(article.title)),
        published_at: article.is_published ? (article.published_at || new Date().toISOString()) : null,
      };
      const { data, error } = await supabase.from('news_articles').insert([row]).select().single();
      if (error) return json({ error: error.message }, error.code === '23505' ? 409 : 400);

      // كل خبر منشور يُنشر على صفحة فيسبوك أيضاً، ويُحفظ معرّف المنشور لعرض تفاعله
      if (data.is_published && !body.skipFbPost) {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/fb-post-article`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ title: data.title, content: data.content, slug: data.slug }),
        }).catch(() => null);
        const fb = await res?.json().catch(() => null);
        if (fb?.ok && fb.id) {
          await supabase.from('news_articles').update({ fb_post_id: fb.id }).eq('id', data.id);
          data.fb_post_id = fb.id;
        }
      }
      return json({ data });
    }

    if (body.action === 'update') {
      if (!body.id) return json({ error: 'id مطلوب' }, 400);
      const { data, error } = await supabase.from('news_articles').update(clean(body.updates)).eq('id', body.id).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ data });
    }

    if (body.action === 'delete') {
      if (!body.id) return json({ error: 'id مطلوب' }, 400);
      const { error } = await supabase.from('news_articles').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'إجراء غير معروف' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
