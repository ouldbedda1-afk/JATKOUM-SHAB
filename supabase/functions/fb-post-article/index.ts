// Supabase Edge Function: fb-post-article
// ينشر أي خبر يُنشر على الموقع (news_articles) مباشرة كمنشور على صفحة فيسبوك — بلا مراجعة.
// يُستدعى من adminCreateNews في src/supabase.js فور نشر أي خبر (fire-and-forget من المتصفح)،
// بحيث يبقى FB_PAGE_ACCESS_TOKEN على السيرفر فقط ولا يُكشف في كود المتصفح.
//
// النشر:   supabase functions deploy fb-post-article --no-verify-jwt
// الأسرار: FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN (بصلاحية pages_manage_posts), SITE_URL (اختياري)

const FB_PAGE_ID           = Deno.env.get('FB_PAGE_ID') ?? '';
const FB_PAGE_ACCESS_TOKEN = Deno.env.get('FB_PAGE_ACCESS_TOKEN') ?? '';
const SITE                 = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  if (!FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ skipped: true, reason: 'fb not configured' }), { headers: { ...cors, 'content-type': 'application/json' } });
  }

  try {
    const { content, title, slug } = await req.json();
    const body = (content || title || '').trim();
    if (!body) return new Response(JSON.stringify({ skipped: true, reason: 'empty content' }), { headers: { ...cors, 'content-type': 'application/json' } });

    const link = slug ? `\n\n${SITE}/#/news/${slug}` : '';
    const message = `${body}${link}`;

    const res = await fetch(`https://graph.facebook.com/v19.0/${FB_PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, access_token: FB_PAGE_ACCESS_TOKEN }),
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
