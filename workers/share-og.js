/**
 * Cloudflare Worker — OG Tags for Facebook / WhatsApp / Telegram
 *
 * يعترض بوتات التواصل الاجتماعي ويُرجع HTML مع og:title + og:image فقط
 * (بدون og:description لإجبار الزوار على دخول الموقع لقراءة التفاصيل)
 *
 * المستخدمون العاديون: يُعادون توجيههم فوراً إلى الموقع الأصلي
 */

const SUPABASE_URL = 'https://udtdfkvtmqfxjezhxaah.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tS-r6elQa1GomTr_XEoYgA_bzCWCfFb';
const SITE_URL     = 'https://www.jatkoumshab.com';

// بوتات التواصل الاجتماعي التي تحتاج OG tags
const SOCIAL_BOT = /facebookexternalhit|Facebot|LinkedInBot|Twitterbot|WhatsApp|TelegramBot|Slackbot|Discordbot/i;

const SLUG_TO_WILAYA = {
  'hodh-chargui': 'الحوض الشرقي', 'hodh-gharbi': 'الحوض الغربي',
  'assaba': 'لعصابه', 'brakna': 'لبراكنه', 'gorgol': 'كوركول',
  'guidimakha': 'كيدماغا', 'tagant': 'تاكانت', 'adrar': 'آدرار',
  'inchiri': 'انشيري', 'tiris-zemmour': 'تيرس زمور',
  'dakhlet-nouadhibou': 'داخلت نواذيبو', 'trarza': 'ترارزه',
  'nouakchott-nord': 'نواكشوط الشمالية', 'nouakchott-ouest': 'نواكشوط الغربية',
  'nouakchott-sud': 'نواكشوط الجنوبية', 'nouadhibou': 'نواذيبو',
};

async function fetchArticle(slug) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_articles?slug=eq.${encodeURIComponent(slug)}&select=title,slug,excerpt,featured_image,category,wilaya&limit=1`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function fetchForecastByWilayaDate(wilaya, date) {
  const dayStart = `${date}T00:00:00`;
  const dayEnd   = `${date}T23:59:59`;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_articles?wilaya=eq.${encodeURIComponent(wilaya)}&published_at=gte.${dayStart}&published_at=lte.${dayEnd}&is_published=eq.true&select=title,slug,excerpt,featured_image,category,wilaya&order=published_at.desc&limit=1`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

function absoluteImage(img) {
  if (!img) return `${SITE_URL}/logo.png`;
  if (img.startsWith('http')) return img;
  return `${SITE_URL}${img.startsWith('/') ? '' : '/'}${img}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildOgPage(article, articleUrl) {
  const title   = escapeHtml(article.title);
  const image   = escapeHtml(absoluteImage(article.featured_image));
  // الملخص القصير فقط — يُجبر الزائر على الدخول لقراءة التفاصيل
  const excerpt = article.excerpt
    ? escapeHtml(article.excerpt.slice(0, 120))
    : escapeHtml(article.title);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>

  <!-- Open Graph -->
  <meta property="og:type"        content="article" />
  <meta property="og:site_name"   content="جاتكم اسحاب" />
  <meta property="og:url"         content="${escapeHtml(articleUrl)}" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${excerpt}" />
  <meta property="og:image"       content="${image}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale"      content="ar_AR" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${title}" />
  <meta name="twitter:description" content="${excerpt}" />
  <meta name="twitter:image"       content="${image}" />

  <!-- تحويل فوري للمستخدمين الذين يفتحون الرابط مباشرة -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(articleUrl)}" />
</head>
<body>
  <p>جاري التحويل... <a href="${escapeHtml(articleUrl)}">${title}</a></p>
</body>
</html>`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ua  = request.headers.get('user-agent') || '';

    // ── /forecast/:date/:wilayaSlug ──
    const forecastMatch = url.pathname.match(/^\/forecast\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/?$/);
    if (forecastMatch) {
      const [, date, wilayaSlug] = forecastMatch;
      const canonicalUrl = `${SITE_URL}/#/forecast/${date}/${wilayaSlug}`;
      if (!SOCIAL_BOT.test(ua)) return Response.redirect(canonicalUrl, 302);

      const wilaya  = SLUG_TO_WILAYA[wilayaSlug] || wilayaSlug;
      const article = await fetchForecastByWilayaDate(wilaya, date);
      if (!article) return Response.redirect(canonicalUrl, 302);
      return new Response(buildOgPage(article, canonicalUrl), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    // ── /news/:slug ──
    const newsMatch = url.pathname.match(/^\/news\/([^/]+)\/?$/);
    if (newsMatch) {
      const slug       = newsMatch[1];
      const articleUrl = `${SITE_URL}/#/news/${slug}`;
      if (!SOCIAL_BOT.test(ua)) return Response.redirect(articleUrl, 302);
      const article = await fetchArticle(slug);
      if (!article) return Response.redirect(articleUrl, 302);
      return new Response(buildOgPage(article, articleUrl), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    // أي مسار آخر → الموقع الرئيسي
    return Response.redirect(`${SITE_URL}/#${url.pathname}${url.search}`, 302);
  },
};
