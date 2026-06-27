// og-proxy: يُعيد HTML بـ Open Graph tags ديناميكية لمشاركة روابط الظالة
// عند فتحه من متصفح بشري يُحوّله فوراً للصفحة الأصلية

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE    = 'https://ouldbedda1-afk.github.io/JATKOUM-SHAB';
const DEFAULT_IMG = `${SITE}/logo.png`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function esc(s: string) {
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  const url  = new URL(req.url);
  const id   = url.searchParams.get('id')   || '';
  const type = url.searchParams.get('type') || 'livestock';

  if (!id) {
    return Response.redirect(SITE, 302);
  }

  try {
    let title = 'جاتكم اسحاب';
    let description = 'الطقس والظالة في موريتانيا';
    let image = DEFAULT_IMG;
    let pageUrl = SITE;

    if (type === 'livestock') {
      const { data } = await supabase
        .from('livestock_reports')
        .select('report_type, animal_type, region, village, description, contact_phone, image_url')
        .eq('id', id)
        .maybeSingle();

      if (data) {
        const isLost = data.report_type === 'lost';
        const loc    = [data.village, data.region].filter(Boolean).join('، ');
        title       = `${isLost ? '🔴 ضالة' : '🟢 وُجد'}: ${data.animal_type}${loc ? ' في ' + loc : ''}`;
        description = data.description
          || (isLost ? `الرجاء التواصل إذا وجدتم ${data.animal_type}` : `تم العثور على ${data.animal_type}، تواصل للمطالبة`)
          + (data.contact_phone ? ` — ${data.contact_phone}` : '');
        if (data.image_url) image = data.image_url;
        pageUrl = `${SITE}/#/althala/${id}`;
      }
    } else if (type === 'news') {
      const { data } = await supabase
        .from('news_articles')
        .select('title, excerpt, featured_image, slug')
        .eq('id', id)
        .maybeSingle();

      if (data) {
        title       = data.title;
        description = data.excerpt || data.title;
        if (data.featured_image) image = data.featured_image;
        pageUrl = `${SITE}/#/news/${data.slug}`;
      }
    }

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(title)}</title>

  <!-- Open Graph -->
  <meta property="og:type"        content="article"/>
  <meta property="og:site_name"   content="جاتكم اسحاب"/>
  <meta property="og:title"       content="${esc(title)}"/>
  <meta property="og:description" content="${esc(description)}"/>
  <meta property="og:image"       content="${esc(image)}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:url"         content="${esc(pageUrl)}"/>

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image"/>
  <meta name="twitter:title"       content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(description)}"/>
  <meta name="twitter:image"       content="${esc(image)}"/>

  <!-- WhatsApp -->
  <meta property="og:image:secure_url" content="${esc(image)}"/>

  <!-- تحويل فوري للصفحة الأصلية -->
  <meta http-equiv="refresh" content="0; url=${esc(pageUrl)}"/>
  <script>window.location.replace("${pageUrl.replace(/"/g,'\\"')}");</script>
</head>
<body>
  <p>جارٍ التحويل... <a href="${esc(pageUrl)}">اضغط هنا إذا لم يتم التحويل</a></p>
</body>
</html>`;

    return new Response(html, { headers: CORS });

  } catch (err) {
    return Response.redirect(SITE, 302);
  }
});
