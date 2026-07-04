// Supabase Edge Function: fb-stats
// يجلب عدد متابعي صفحة فيسبوك، ومؤشر تفاعل (إعجاب + تعليق + مشاركة) لمنشور معيّن أو لعدة منشورات دفعة واحدة.
// يبقى FB_PAGE_ACCESS_TOKEN على السيرفر فقط، ولا يُستدعى Graph API مباشرة من المتصفح.
//
// ملاحظة: مقاييس "المشاهدات/الوصول" الحقيقية لكل منشور (post_impressions) أُلغتها فيسبوك من
// Graph API نهائياً منذ 2023 لكل التطبيقات — لا يوجد أي صلاحية تُعيدها. لذلك نعرض بدلاً منها
// مؤشر تفاعل حقيقي (إعجابات + تعليقات + مشاركات) وهو أقرب بيانات علنية متاحة فعلاً.
//
// النشر:   supabase functions deploy fb-stats --no-verify-jwt
// الأسرار: FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN
//
// الاستخدام:
//   POST /fb-stats { postIds: ["id1","id2"] } → { followers, engagement: { id1: n, id2: n } }

const FB_PAGE_ID           = Deno.env.get('FB_PAGE_ID') ?? '';
const FB_PAGE_ACCESS_TOKEN = Deno.env.get('FB_PAGE_ACCESS_TOKEN') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function getFollowerCount(): Promise<number | null> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${FB_PAGE_ID}?fields=followers_count,fan_count&access_token=${FB_PAGE_ACCESS_TOKEN}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.followers_count ?? data.fan_count ?? null;
}

async function getPostEngagement(postId: string): Promise<number | null> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${postId}?fields=shares,comments.summary(true),reactions.summary(true)&access_token=${FB_PAGE_ACCESS_TOKEN}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const shares    = data?.shares?.count ?? 0;
  const comments  = data?.comments?.summary?.total_count ?? 0;
  const reactions = data?.reactions?.summary?.total_count ?? 0;
  return shares + comments + reactions;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'fb not configured' }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
  }

  try {
    let postIds: string[] = [];
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      postIds = Array.isArray(body.postIds) ? body.postIds.slice(0, 20) : [];
    }

    const [followers, engagementEntries] = await Promise.all([
      getFollowerCount(),
      Promise.all(postIds.map(async (id) => [id, await getPostEngagement(id)] as const)),
    ]);

    const engagement: Record<string, number | null> = {};
    for (const [id, v] of engagementEntries) engagement[id] = v;

    return new Response(JSON.stringify({ followers, engagement }), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    console.error('fb-stats error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
  }
});
