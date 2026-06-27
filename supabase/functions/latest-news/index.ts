// Edge Function: latest-news
// تُعيد الـ 6 أخبار الأخيرة من jatkoumshab — مع CORS مفتوح لأي موقع

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const SITE = 'https://ouldbedda1-afk.github.io/JATKOUM-SHAB';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') || 6), 20);

    const { data, error } = await supabase
      .from('news_articles')
      .select('title, slug, excerpt, published_at, category, featured_image, wilaya')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const articles = (data || []).map((a) => ({
      title:         a.title,
      excerpt:       a.excerpt || '',
      category:      a.category || '',
      wilaya:        a.wilaya  || '',
      published_at:  a.published_at,
      image:         a.featured_image || '',
      url:           `${SITE}/#/news/${a.slug}`,
    }));

    return new Response(JSON.stringify({ source: 'jatkoumshab', articles }), {
      headers: CORS,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS });
  }
});
