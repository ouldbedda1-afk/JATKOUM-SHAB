// Supabase Edge Function: fb-post-article
// ينشر أي خبر يُنشر على الموقع (news_articles) مباشرة كمنشور على صفحة فيسبوك — بلا مراجعة.
// يُستدعى من دوال الخادم وحدها (admin-news، wilaya-publisher، forecast-publisher،
// hazard-publisher) بمفتاح الخدمة — فلا يستطيع أحد النشر على الصفحة من المتصفح،
// ويبقى FB_PAGE_ACCESS_TOKEN على الخادم.
//
// النشر:   supabase functions deploy fb-post-article --no-verify-jwt
// الأسرار: FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN (بصلاحية pages_manage_posts), SITE_URL (اختياري)

const FB_PAGE_ID           = Deno.env.get('FB_PAGE_ID') ?? '';
const FB_PAGE_ACCESS_TOKEN = Deno.env.get('FB_PAGE_ACCESS_TOKEN') ?? '';
const SITE                 = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';
const SERVICE_KEY          = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  // دوال الخادم وحدها تنشر على الصفحة (admin-news، wilaya-publisher، forecast-publisher،
  // hazard-publisher) — بمفتاح الخدمة، الذي لا يصل إلى المتصفح
  if (!SERVICE_KEY || req.headers.get('authorization') !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ ok: false, error: 'غير مصرّح' }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } });
  }

  if (!FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ skipped: true, reason: 'fb not configured' }), { headers: { ...cors, 'content-type': 'application/json' } });
  }

  try {
    const { content, title, slug } = await req.json();
    // فيسبوك لا يدعم صيغة **تشديد** — نزيلها هنا فقط، تبقى محفوظة في نص الموقع نفسه
    const body = (content || title || '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
    if (!body) return new Response(JSON.stringify({ skipped: true, reason: 'empty content' }), { headers: { ...cors, 'content-type': 'application/json' } });

    const articleUrl = slug ? `${SITE}/news/${slug}` : '';
    const message = articleUrl ? `${body}\n\n${articleUrl}` : body;

    // الرابط في نص المنشور وحده لا يُضغط دائماً في تطبيق فيسبوك — حقل link
    // يُرفق بطاقة الخبر القابلة للضغط (عنوانها ونصها من api/news-og.js)
    const res = await fetch(`https://graph.facebook.com/v19.0/${FB_PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, ...(articleUrl ? { link: articleUrl } : {}), access_token: FB_PAGE_ACCESS_TOKEN }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('FB post failed:', res.status, err);
      return new Response(JSON.stringify({ ok: false, error: err }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, id: data.id }), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    console.error('fb-post-article error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
  }
});
