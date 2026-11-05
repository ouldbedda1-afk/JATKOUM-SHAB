// Generates supabase/functions/_shared/locustHabitat.ts: the half-degree cells of Mauritania where
// desert locusts live, taken from every FAO DLIS (RAMSES) survey site in the country since 2023,
// plus the cells next to them. The national locust centre surveys where locusts breed, so its
// footprint is a fair map of the habitat. The locust-habitat function checks rain and green
// vegetation in these cells only.
// Run now and then (the habitat changes little): npm run generate:locust-habitat
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WILAYA_SHAPES } from '../src/mauritaniaWilayaShapes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYER = 'https://services5.arcgis.com/sjP4Ugu5s0dZWLjd/arcgis/rest/services/Ramses_Observations_Dashboard_View/FeatureServer/0/query';
const CELL = 0.5;

const rows = [];
for (let offset = 0; ; offset += 1000) {
  const params = new URLSearchParams({
    where: "Country='Mauritania'", outFields: 'Latitude,Longitude,Locust_Type', returnGeometry: 'false',
    orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: '1000', f: 'json',
  });
  const data = await (await fetch(`${LAYER}?${params}`)).json();
  if (data.error) throw new Error(data.error.message);
  rows.push(...data.features.map((f) => f.attributes));
  if (data.features.length < 1000) break;
}

function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const wilayaAt = (pt) => WILAYA_SHAPES.find((s) => s.rings.some((r) => inside(pt, r)))?.wilaya ?? null;

const key = (i, j) => `${i},${j}`;
const surveyed = new Map();
for (const r of rows) {
  if (r.Latitude == null || r.Longitude == null) continue;
  const k = key(Math.floor(r.Latitude / CELL), Math.floor(r.Longitude / CELL));
  const c = surveyed.get(k) || { surveys: 0, positive: 0 };
  c.surveys++;
  if (r.Locust_Type && r.Locust_Type !== 'NO LOCUST') c.positive++;
  surveyed.set(k, c);
}

const cells = new Map();
for (const k of surveyed.keys()) {
  const [i, j] = k.split(',').map(Number);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const kk = key(i + di, j + dj);
    if (cells.has(kk)) continue;
    const lat = +((i + di + 0.5) * CELL).toFixed(2), lon = +((j + dj + 0.5) * CELL).toFixed(2);
    const wilaya = wilayaAt([lon, lat]);
    if (!wilaya) continue;
    const s = surveyed.get(kk) || { surveys: 0, positive: 0 };
    cells.set(kk, { lat, lon, wilaya, ...s });
  }
}
const list = [...cells.values()].sort((a, b) => b.lat - a.lat || a.lon - b.lon);

const out = path.join(root, 'supabase/functions/_shared/locustHabitat.ts');
fs.writeFileSync(out, [
  '// مولَّد آلياً بالأمر npm run generate:locust-habitat — لا تعدّله يدوياً.',
  `// موائل الجراد الصحراوي في موريتانيا: خلايا ${CELL}° فيها مواقع مسح للفاو منذ 2023 (${rows.length} موقعاً)،`,
  '// والخلايا المجاورة لها. lat/lon مركز الخلية، surveys و positive عدد المسوحات وما وُجد فيه جراد.',
  '',
  `export const HABITAT_CELL = ${CELL};`,
  'export const HABITAT: { lat: number; lon: number; wilaya: string; surveys: number; positive: number }[] = [',
  ...list.map((c) => `  ${JSON.stringify(c)},`),
  '];',
  '',
].join('\n'));
console.log(`${rows.length} surveys -> ${surveyed.size} surveyed cells -> ${list.length} habitat cells -> ${path.relative(root, out)}`);
