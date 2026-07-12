// Generates public/sitemap.xml including all published article slugs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://udtdfkvtmqfxjezhxaah.supabase.co';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SITE_URL = 'https://www.jatkoumshab.com';

if (!SUPABASE_ANON) {
  console.warn('[sitemap] SUPABASE_ANON_KEY not set — skipping sitemap generation');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const staticPages = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/news', changefreq: 'hourly', priority: '0.9' },
  { loc: '/forecast', changefreq: 'daily', priority: '0.7' },
  { loc: '/althala', changefreq: 'weekly', priority: '0.6' },
];

const { data: articles, error } = await supabase
  .from('news_articles')
  .select('slug, published_at, updated_at')
  .eq('is_published', true)
  .order('published_at', { ascending: false });

if (error) { console.error('[sitemap] error:', error.message); process.exit(1); }

const articleUrls = (articles || []).map((a) => ({
  loc: `/news/${a.slug}`,
  changefreq: 'weekly',
  priority: '0.8',
  lastmod: (a.updated_at || a.published_at || '').split('T')[0],
}));

const allUrls = [...staticPages, ...articleUrls];

const urlEls = allUrls.map((u) => `
  <url>
    <loc>${SITE_URL}${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`).join('');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urlEls}
</urlset>`;

const out = path.join(__dirname, '..', 'public', 'sitemap.xml');
fs.writeFileSync(out, sitemap, 'utf8');
console.log(`[sitemap] wrote ${allUrls.length} URLs → public/sitemap.xml`);
