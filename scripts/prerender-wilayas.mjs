// After `vite build`: one dist/wilaya/<slug>/index.html per wilaya page, a copy of the app's index.html
// with that wilaya's title, description, canonical URL and Open Graph tags. Vercel serves the file
// before the catch-all rewrite, so search engines and social previews read the wilaya's own head
// without running the app; the app then renders the same page for visitors.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WILAYA_PAGES, wilayaPageTitle, wilayaPageDescription } from '../src/wilayaPages.js';
import { getWilayaLandmark } from '../src/wilayaLandmarks.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.jatkoumshab.com';
const template = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Replaces the content of an existing tag, or fails loudly if index.html changed shape
function setTag(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`prerender-wilayas: ${label} not found in dist/index.html`);
  return html.replace(pattern, replacement);
}

for (const w of WILAYA_PAGES) {
  const url = `${SITE}/wilaya/${w.slug}`;
  const title = esc(wilayaPageTitle(w));
  const description = esc(wilayaPageDescription(w));
  const landmark = getWilayaLandmark(w.name);
  const image = landmark ? `${SITE}${landmark.src}` : `${SITE}/logo.png`;

  let html = template;
  html = setTag(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`, '<title>');
  html = setTag(html, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}" />`, 'description');
  html = setTag(html, /<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`, 'og:url');
  html = setTag(html, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${title}" />`, 'og:title');
  html = setTag(html, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${description}" />`, 'og:description');
  html = html.replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${image}" />`);
  // أبعاد الشعار ونصه البديل لا تصلح لصورة المعلم
  html = html.replace(/\s*<meta property="og:image:(width|height)" content="[^"]*"\s*\/?>/g, '');
  html = html.replace(/<meta property="og:image:alt" content="[^"]*"\s*\/?>/,
    `<meta property="og:image:alt" content="${esc(landmark ? landmark.label : 'شعار جاتكم اسحاب')}" />`);
  html = html.replace(/<link rel="canonical"[^>]*>\s*/g, '');
  html = html.replace('</head>', `  <link rel="canonical" href="${url}" />\n  </head>`);

  const out = path.join(root, 'dist/wilaya', w.slug, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
}
console.log(`prerender-wilayas: ${WILAYA_PAGES.length} wilaya pages -> dist/wilaya/<slug>/index.html`);
