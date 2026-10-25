// معاينة الأخبار لروبوتات الشبكات الاجتماعية (فيسبوك، واتساب، تيليغرام…).
// الموقع تطبيق صفحة واحدة: كل رابط /news/<slug> يُرجع index.html بوسوم Open Graph
// العامة للصفحة الرئيسية (og:url = الرئيسية)، فيعرض فيسبوك بطاقة الموقع بدل الخبر
// ويربطها بالرئيسية. vercel.json يوجّه طلبات الروبوتات وحدها إلى هنا لتأخذ
// عنوان الخبر ونصه ورابطه الصحيح؛ الزوار يصلون إلى التطبيق كالمعتاد.

const SITE = 'https://www.jatkoumshab.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://udtdfkvtmqfxjezhxaah.supabase.co';
// المفتاح العام نفسه المنشور في كود الموقع — قراءة الأخبار المنشورة فقط
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb';
const DEFAULT_IMAGE = `${SITE}/logo.png`;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// وصف قصير من نص الخبر: بلا **تشديد** ولا أسطر، حتى 200 حرف
function excerpt(content) {
  const text = String(content || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text;
}

async function fetchArticle(slug) {
  const url = `${SUPABASE_URL}/rest/v1/news_articles?select=title,content,excerpt,featured_image` +
    `&slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

export default async function handler(request, response) {
  const slug = String(request.query?.slug || '');
  const pageUrl = `${SITE}/news/${encodeURIComponent(slug)}`;

  let article = null;
  try {
    if (slug) article = await fetchArticle(slug);
  } catch (error) {
    console.warn('news-og fetch failed:', slug, error);
  }

  const title = article?.title || 'جاتكم اسحاب - رصد جوي مباشر لموريتانيا';
  const description = excerpt(article?.content || article?.excerpt) ||
    'توقعات دقيقة للأمطار وخرائط رصد مباشرة لكل ولايات وبلديات موريتانيا.';
  const image = article?.featured_image || DEFAULT_IMAGE;

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:site_name" content="جاتكم اسحاب">
<meta property="og:locale" content="ar_AR">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary">
</head>
<body>
<h1>${esc(title)}</h1>
<p>${esc(description)}</p>
<p><a href="${esc(pageUrl)}">${esc(pageUrl)}</a></p>
</body>
</html>`;

  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  return response.status(article ? 200 : 404).send(html);
}
