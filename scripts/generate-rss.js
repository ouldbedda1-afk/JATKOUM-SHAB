// Generates public/rss.xml from published news_articles in Supabase
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://udtdfkvtmqfxjezhxaah.supabase.co';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SITE_URL = 'https://www.jatkoumshab.com';

if (!SUPABASE_ANON) {
  console.warn('[rss] SUPABASE_ANON_KEY not set — skipping RSS generation');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const { data: articles, error } = await supabase
  .from('news_articles')
  .select('title, slug, excerpt, featured_image, category, wilaya, published_at, author')
  .eq('is_published', true)
  .order('published_at', { ascending: false })
  .limit(50);

if (error) { console.error('[rss] error:', error.message); process.exit(1); }

const items = (articles || []).map((a) => `
  <item>
    <title>${esc(a.title)}</title>
    <link>${SITE_URL}/#/news/${esc(a.slug)}</link>
    <guid isPermaLink="false">${SITE_URL}/#/news/${esc(a.slug)}</guid>
    <description>${esc(a.excerpt || a.title)}</description>
    <pubDate>${new Date(a.published_at).toUTCString()}</pubDate>
    <author>${esc(a.author || 'جاتكم اسحاب')}</author>
    <category>${esc(a.category)}</category>
    ${a.featured_image ? `<enclosure url="${esc(a.featured_image)}" type="image/jpeg" length="0" />` : ''}
  </item>`).join('');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>جاتكم اسحاب | الأخبار الجوية</title>
    <link>${SITE_URL}</link>
    <description>آخر أخبار الطقس والمناخ في موريتانيا</description>
    <language>ar</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

const out = path.join(__dirname, '..', 'public', 'rss.xml');
fs.writeFileSync(out, rss, 'utf8');
console.log(`[rss] wrote ${articles?.length || 0} articles → public/rss.xml`);
