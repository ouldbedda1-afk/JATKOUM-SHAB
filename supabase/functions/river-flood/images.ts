// صور الأقمار الصناعية لنهر السنغال عند كل محطة (نحو 13×13 كم حول المدينة والنهر)، عبر Copernicus Data Space
// (السرّان SH_CLIENT_ID وSH_CLIENT_SECRET، كدالة fire-hotspots):
//   radar   — Sentinel-1 (رادار يرى عبر الغيوم ليلاً ونهاراً): المياه الجديدة بالأحمر، أي ما هو ماء الآن وكان
//             جافاً في موسم الجفاف (أبريل–مايو). المقارنة بموسم الجفاف تُبقي مجرى النهر والكثبان الملساء
//             (تظهر داكنة في الرادار كالماء) بلونها الرمادي فلا تُحسب فيضاناً. تُقاس مساحة المياه الجديدة بالكم².
//   optical — Sentinel-2 بالألوان الطبيعية، في أحدث يوم صافٍ.
// تُحفظ آخر صورة لكل محطة ونوع في الحاوية river-images، وكل مشهد في جدول river_images (مع مساحة المياه).

import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { RIVER_STATIONS } from '../_shared/riverStations.ts';

const SH_CLIENT_ID = Deno.env.get('SH_CLIENT_ID') ?? '';
const SH_CLIENT_SECRET = Deno.env.get('SH_CLIENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SITE = 'https://www.jatkoumshab.com';
const HALF_DEG = 0.06;
const PX = 600;
const RADAR_DAYS = 14;        // Sentinel-1 يمر كل 6 أيام تقريباً
const OPTICAL_DAYS = 20;
const MAX_CLOUD = 20;
const IMAGES_PER_RUN = 5;     // حدّ الدالة الزمني؛ ما يتبقى يُكمَل في تشغيل الغد
const KEEP_DAYS = 120;

// ماء الآن (أقل من ‎-18 ديسيبل) وأفتح بـ 3 ديسيبل فأكثر في موسم الجفاف = مياه جديدة، بالأحمر
const RADAR_EVALSCRIPT = `//VERSION=3
function setup(){return{input:[{datasource:'now',bands:['VV','dataMask']},{datasource:'ref',bands:['VV','dataMask']}],output:{bands:3}}}
function db(v){return 10*Math.log(Math.max(v,1e-5))/Math.LN10}
function evaluatePixel(s){
  var n=s.now[0], r=s.ref[0];
  if(!n||!n.dataMask) return [0,0,0];
  var dn=db(n.VV), g=Math.max(0,Math.min(1,(dn+25)/20));
  if(r&&r.dataMask&&dn<-18&&db(r.VV)-dn>3) return [0.94,0.2,0.2];
  return [g,g,g];
}`;
const OPTICAL_EVALSCRIPT = `//VERSION=3
function setup(){return{input:['B02','B03','B04'],output:{bands:3}}}
function evaluatePixel(s){return [2.5*s.B04,2.5*s.B03,2.5*s.B02]}`;

const box = (st: typeof RIVER_STATIONS[number]) =>
  [st.view[0] - HALF_DEG, st.view[1] - HALF_DEG, st.view[0] + HALF_DEG, st.view[1] + HALF_DEG];

async function shToken() {
  const res = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: SH_CLIENT_ID, client_secret: SH_CLIENT_SECRET }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`Copernicus token: ${JSON.stringify(body).slice(0, 120)}`);
  return body.access_token as string;
}

// أحدث مشهد فوق المحطة في الأيام الأخيرة (للصور البصرية: بغيوم لا تتجاوز MAX_CLOUD)
async function latestScene(token: string, collection: string, bbox: number[], days: number) {
  const res = await fetch('https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      collections: [collection], bbox, datetime: `${new Date(Date.now() - days * 86400000).toISOString()}/${new Date().toISOString()}`,
      limit: 50, fields: { include: ['properties.datetime', 'properties.eo:cloud_cover'] },
    }),
  });
  const body = await res.json();
  const list = (body.features ?? []).map((f: { properties: { datetime: string; 'eo:cloud_cover'?: number } }) => f.properties)
    .filter((p: { 'eo:cloud_cover'?: number }) => collection !== 'sentinel-2-l2a' || (p['eo:cloud_cover'] ?? 100) <= MAX_CLOUD)
    .map((p: { datetime: string }) => p.datetime).sort();
  return list[list.length - 1] as string | undefined;
}

const dayRange = (iso: string) => ({ from: `${iso.slice(0, 10)}T00:00:00Z`, to: `${iso.slice(0, 10)}T23:59:59Z` });
// موسم الجفاف المرجعي: أبريل–مايو من هذا العام، أو من العام الماضي قبل يونيو
function dryRange() {
  const now = new Date();
  const y = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { from: `${y}-04-01T00:00:00Z`, to: `${y}-05-31T23:59:59Z` };
}

async function render(token: string, bbox: number[], kind: 'radar' | 'optical', sceneIso: string) {
  const s1 = (id: string, timeRange: { from: string; to: string }) => ({
    id, type: 'sentinel-1-grd',
    dataFilter: { timeRange, acquisitionMode: 'IW', polarization: 'DV', mosaickingOrder: 'mostRecent' },
    processing: { backCoeff: 'SIGMA0_ELLIPSOID', orthorectify: true },
  });
  const data = kind === 'radar'
    ? [s1('now', dayRange(sceneIso)), s1('ref', dryRange())]
    : [{ type: 'sentinel-2-l2a', dataFilter: { timeRange: dayRange(sceneIso), mosaickingOrder: 'leastCC' } }];
  const res = await fetch('https://sh.dataspace.copernicus.eu/api/v1/process', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      input: { bounds: { bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } }, data },
      output: { width: PX, height: PX, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
      evalscript: kind === 'radar' ? RADAR_EVALSCRIPT : OPTICAL_EVALSCRIPT,
    }),
  });
  if (!res.ok) throw new Error(`Sentinel Hub ${kind} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return new Uint8Array(await res.arrayBuffer());
}

let overlays: Promise<Image[]> | null = null;
const loadOverlays = () => (overlays ||= Promise.all(['fire-mark.png', 'credit-s.png', 'center-mark.png'].map(async (f) => {
  const res = await fetch(`${SITE}/brand/${f}`);
  if (!res.ok) throw new Error(`${f}: ${res.status}`);
  return await Image.decode(new Uint8Array(await res.arrayBuffer())) as Image;
})));

// يدمج «جاتكم اسحاب» شفافاً في الوسط واسم الموقع في الزاوية السفلى اليمنى ونسبة Copernicus في اليسرى، ويعدّ بكسلات المياه الجديدة
// (الحمراء) قبل ذلك ويحوّلها إلى كم²
async function brand(png: Uint8Array, lat: number) {
  const [mark, credit, centerMark] = await loadOverlays();
  const img = await Image.decode(png) as Image;
  let red = 0;
  for (let y = 1; y <= img.height; y++) {
    for (let x = 1; x <= img.width; x++) {
      const c = img.getPixelAt(x, y);
      if ((c >>> 24) > 200 && ((c >>> 16) & 255) < 90 && ((c >>> 8) & 255) < 90) red++;
    }
  }
  const pxKm2 = ((2 * HALF_DEG * 111.32 * Math.cos(lat * Math.PI / 180)) / img.width) * ((2 * HALF_DEG * 110.57) / img.height);
  img.composite(centerMark, Math.round((img.width - centerMark.width) / 2), Math.round((img.height - centerMark.height) / 2));
  img.composite(mark, img.width - mark.width - 6, img.height - mark.height - 6);
  img.composite(credit, 4, img.height - credit.height - 4);
  return { jpeg: await img.encodeJPEG(85), km2: Math.round(red * pxKm2 * 100) / 100 };
}

export async function updateRiverImages(supabase: SupabaseClient) {
  if (!SH_CLIENT_ID || !SH_CLIENT_SECRET) return 'بلا مفتاح Copernicus';
  const token = await shToken();
  const { data: rows } = await supabase.from('river_images').select('station, kind, image_date')
    .order('image_date', { ascending: false }).limit(200);
  const latest = new Map<string, string>();
  for (const r of rows ?? []) if (!latest.has(`${r.station}|${r.kind}`)) latest.set(`${r.station}|${r.kind}`, r.image_date);

  let made = 0;
  const failed: string[] = [];
  for (const [i, st] of RIVER_STATIONS.entries()) {
    for (const kind of ['radar', 'optical'] as const) {
      if (made >= IMAGES_PER_RUN) break;
      try {
        const bbox = box(st);
        const scene = await latestScene(token, kind === 'radar' ? 'sentinel-1-grd' : 'sentinel-2-l2a', bbox, kind === 'radar' ? RADAR_DAYS : OPTICAL_DAYS);
        const prev = latest.get(`${st.name}|${kind}`);
        if (!scene || (prev && new Date(prev).getTime() >= new Date(scene).getTime() - 3600000)) continue;
        const { jpeg, km2 } = await brand(await render(token, bbox, kind, scene), st.view[1]);
        const path = `st${i}-${kind}.jpg`;
        const { error: upErr } = await supabase.storage.from('river-images').upload(path, jpeg, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        const url = `${SUPABASE_URL}/storage/v1/object/public/river-images/${path}?v=${scene.slice(0, 10)}`;
        const { error } = await supabase.from('river_images').upsert({
          station: st.name, kind, image_date: scene, image_url: url, flood_km2: kind === 'radar' ? km2 : null,
        }, { onConflict: 'station,kind,image_date' });
        if (error) throw error;
        made++;
      } catch (e) {
        failed.push(`${st.name}/${kind}: ${e}`);
      }
    }
  }
  await supabase.from('river_images').delete().lt('image_date', new Date(Date.now() - KEEP_DAYS * 86400000).toISOString());
  return { made, failed };
}
