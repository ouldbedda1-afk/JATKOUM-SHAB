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
export { wilayaToSlug } from './src/wilayaUrlSlugs.js';
export { ERA5_CITIES, ERA5_REFERENCE, ERA5_SOURCE } from './src/rainEra5Normals.js';
export { WILAYA_LANDMARKS } from './src/wilayaLandmarks.js';
export { WILAYA_SHAPES } from './src/mauritaniaWilayaShapes.js';`,
    resolveDir: root,
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: bundle,
  logLevel: 'error',
});
const { mauritanianCities, toArabicCommune, wilayaToSlug, ERA5_CITIES, ERA5_REFERENCE, ERA5_SOURCE, WILAYA_LANDMARKS, WILAYA_SHAPES } = await import(pathToFileURL(bundle).href);
fs.rmSync(tmp, { recursive: true, force: true });

// Same naming as the site: the Arabic commune name, else the key itself.
// Villages are labelled so the bulletins never present them as communes.
const seen = new Set();
const places = [];
for (const [key, c] of Object.entries(mauritanianCities)) {
  const city = (toArabicCommune(key) || key) + (c.type === 'قرية' ? ' (قرية)' : '');
  const wilaya = c.wilaya || '';
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon) || seen.has(`${city}|${wilaya}`)) continue;
  seen.add(`${city}|${wilaya}`);
  places.push({ city, wilaya, lat: c.lat, lon: c.lon });
}

// URL slug of each wilaya, as the site builds it (forecast-<slug>-YYYY-MM-DD)
const slugs = Object.fromEntries([...new Set(places.map((p) => p.wilaya).filter(Boolean))].map((w) => [w, wilayaToSlug(w)]));

const out = path.join(root, 'supabase/functions/_shared/mauritaniaPlaces.ts');
fs.writeFileSync(out,
  '// مولَّد آلياً من src/mauritaniaCityTable.js بالأمر npm run generate:places — لا تعدّله يدوياً.\n' +
  '// المدن والبلديات التي يتابعها الموقع (والقرى موسومة بـ «(قرية)»)، بأسمائها العربية وولاياتها الرسمية.\n\n' +
  `export const PLACES: { city: string; wilaya: string; lat: number; lon: number }[] = [\n` +
  places.map((p) => `  ${JSON.stringify(p)},`).join('\n') +
  '\n];\n\n' +
  '// معرّف الولاية في الروابط، كما يبنيه الموقع (wilayaToSlug)\n' +
  `export const WILAYA_SLUGS: Record<string, string> = ${JSON.stringify(slugs, null, 2)};\n`);
console.log(`${places.length} places -> ${path.relative(root, out)}`);

// ERA5 normals of the wilaya capitals (src/rainEra5Normals.js), for the seasonal bulletin
const era5Out = path.join(root, 'supabase/functions/_shared/era5Normals.ts');
const era5Cities = ERA5_CITIES.map(({ name, wilaya, lat, lon, normal, cumulative }) => ({ name, wilaya, lat, lon, normal, cumulative }));
fs.writeFileSync(era5Out, [
  '// مولَّد آلياً من src/rainEra5Normals.js بالأمر npm run generate:places — لا تعدّله يدوياً.',
  '// معدل 1991–2020 لهطول الأمطار في عواصم الولايات حسب ERA5. cumulative[i]: المعدل التراكمي',
  '// من 1 يناير حتى اليوم i (الفهرس 0 = 1 يناير، والسنة بـ366 يوماً).',
  '',
  `export const ERA5_SOURCE = ${JSON.stringify(ERA5_SOURCE)};`,
  `export const ERA5_REFERENCE = ${JSON.stringify(ERA5_REFERENCE)};`,
  'export const ERA5_CITIES: { name: string; wilaya: string; lat: number; lon: number; normal: number; cumulative: number[] }[] = ' +
    `${JSON.stringify(era5Cities)};`,
  '',
].join('\n'));
console.log(`${era5Cities.length} ERA5 capitals -> ${path.relative(root, era5Out)}`);

// Landmark photo of each wilaya (src/wilayaLandmarks.js), the featured image of its forecast posts
const landmarksOut = path.join(root, 'supabase/functions/_shared/wilayaLandmarks.ts');
const landmarkSrc = Object.fromEntries(Object.entries(WILAYA_LANDMARKS).map(([w, l]) => [w, l.src]));
fs.writeFileSync(landmarksOut, [
  '// مولَّد آلياً من src/wilayaLandmarks.js بالأمر npm run generate:places — لا تعدّله يدوياً.',
  '// صورة معلم كل ولاية (مسار في public/landmarks)، صورةً بارزة لمنشورات توقعاتها.',
  '',
  `export const WILAYA_LANDMARK_SRC: Record<string, string> = ${JSON.stringify(landmarkSrc, null, 2)};`,
  '',
].join('\n'));
console.log(`${Object.keys(landmarkSrc).length} landmarks -> ${path.relative(root, landmarksOut)}`);

// Simplified wilaya boundaries (src/mauritaniaWilayaShapes.js), for the pasture (NDVI) averages
const shapesOut = path.join(root, 'supabase/functions/_shared/wilayaShapes.ts');
fs.writeFileSync(shapesOut, [
  '// مولَّد آلياً من src/mauritaniaWilayaShapes.js بالأمر npm run generate:places — لا تعدّله يدوياً.',
  '// حدود الولايات مبسّطة، [خط الطول، خط العرض]. المصدر: geoBoundaries، رخصة CC BY-SA 3.0.',
  '',
  'export const WILAYA_SHAPES: { wilaya: string; rings: [number, number][][] }[] = ' +
    `${JSON.stringify(WILAYA_SHAPES)};`,
  '',
].join('\n'));
console.log(`${WILAYA_SHAPES.length} wilaya shapes -> ${path.relative(root, shapesOut)}`);
