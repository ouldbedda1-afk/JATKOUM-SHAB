// Generates supabase/functions/_shared/mauritaniaPlaces.ts from the site's city table
// (src/mauritaniaCityTable.js), so the server publisher forecasts exactly the places the site shows.
// Run after changing communes or coordinates: npm run generate:places
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'places-'));
const bundle = path.join(tmp, 'table.mjs');

await build({
  stdin: {
    contents: `export { mauritanianCities } from './src/mauritaniaCityTable.js';
export { toArabicCommune } from './src/mauritaniaCommuneNamesAr.js';
export { wilayaToSlug } from './src/wilayaUrlSlugs.js';`,
    resolveDir: root,
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: bundle,
  logLevel: 'error',
});
const { mauritanianCities, toArabicCommune, wilayaToSlug } = await import(pathToFileURL(bundle).href);
fs.rmSync(tmp, { recursive: true, force: true });

// Same naming as the site: the Arabic commune name, else the key itself.
// Villages stay on the site's weather pages but are left out of the published bulletins.
const seen = new Set();
const places = [];
for (const [key, c] of Object.entries(mauritanianCities)) {
  const city = toArabicCommune(key) || key;
  const wilaya = c.wilaya || '';
  if (c.type === 'قرية') continue;
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon) || seen.has(`${city}|${wilaya}`)) continue;
  seen.add(`${city}|${wilaya}`);
  places.push({ city, wilaya, lat: c.lat, lon: c.lon });
}

// URL slug of each wilaya, as the site builds it (forecast-<slug>-YYYY-MM-DD)
const slugs = Object.fromEntries([...new Set(places.map((p) => p.wilaya).filter(Boolean))].map((w) => [w, wilayaToSlug(w)]));

const out = path.join(root, 'supabase/functions/_shared/mauritaniaPlaces.ts');
fs.writeFileSync(out,
  '// مولَّد آلياً من src/mauritaniaCityTable.js بالأمر npm run generate:places — لا تعدّله يدوياً.\n' +
  '// المدن والبلديات التي يتابعها الموقع (دون القرى)، بأسمائها العربية وولاياتها الرسمية.\n\n' +
  `export const PLACES: { city: string; wilaya: string; lat: number; lon: number }[] = [\n` +
  places.map((p) => `  ${JSON.stringify(p)},`).join('\n') +
  '\n];\n\n' +
  '// معرّف الولاية في الروابط، كما يبنيه الموقع (wilayaToSlug)\n' +
  `export const WILAYA_SLUGS: Record<string, string> = ${JSON.stringify(slugs, null, 2)};\n`);
console.log(`${places.length} places -> ${path.relative(root, out)}`);
