// Supabase Edge Function: fire-hotspots
// بؤر الحرائق النشطة في موريتانيا من نظام NASA FIRMS: كل رصد حراري لأقمار VIIRS
// (NOAA-20 وNOAA-21 وSuomi-NPP) بدقة نحو 375 متراً، عدة مرات يومياً. تُحفظ في جدول fire_hotspots.
//
// نطلب إطار موريتانيا ثم نُبقي ما يقع داخل حدودها الفعلية (_shared/wilayaShapes.ts)، ونربط كل بؤرة
// بأقرب بلدية (_shared/mauritaniaPlaces.ts). يُحفظ آخر 10 أيام.
// المشرف يُنبَّه على تيليغرام بالحرائق الكبيرة الجديدة فقط: تجمّع 5 بؤر فأكثر متقاربة (نحو 3 كم)،
// أو بؤرة طاقتها الإشعاعية 30 ميغاواط فأكثر.
//
// صور الحرائق الكبيرة: يتابع كل حريق كبير حتى تلتقط أقمار Sentinel-2 (دقة 10 أمتار، كل يومين إلى ثلاثة)
// أول صورة صافية بعد رصده، فيحفظها في الحاوية fire-images (نحو 11×11 كم، اللهب النشط بالأحمر) ويرسلها
// إلى المشرف. وإلى أن يمر القمر تُحفظ أحدث صورة صافية للمكان قبل الحريق (‎<id>-before.jpg) تُعرض
// بدلها ثم معها للمقارنة. عبر Copernicus Data Space (السرّان SH_CLIENT_ID وSH_CLIENT_SECRET).
//
// يُستدعى عبر pg_cron كل ثلاث ساعات. مفتاح FIRMS في السر FIRMS_MAP_KEY.
// النشر:  supabase functions deploy fire-hotspots --no-verify-jwt
// الطلب (POST): {}

import { createClient } from 'npm:@supabase/supabase-js@2';
import { WILAYA_SHAPES } from '../_shared/wilayaShapes.ts';
import { PLACES } from '../_shared/mauritaniaPlaces.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const MAP_KEY = Deno.env.get('FIRMS_MAP_KEY') ?? '';
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const SITE = 'https://www.jatkoumshab.com';

const SOURCES = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT'];
const BBOX = '-17.2,14.6,-4.7,27.4';   // غرب، جنوب، شرق، شمال
const DAYS = 2;
const KEEP_DAYS = 10;
const BIG_FRP_MW = 30;
const CLUSTER_DEG = 0.03;              // نحو 3 كم
const CLUSTER_MIN = 5;

const SH_CLIENT_ID = Deno.env.get('SH_CLIENT_ID') ?? '';
const SH_CLIENT_SECRET = Deno.env.get('SH_CLIENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const IMAGE_HALF_DEG = 0.05;     // نصف ضلع الصورة: نحو 11×11 كم
const IMAGE_PX = 600;
const MAX_CLOUD = 60;            // نسبة الغيوم القصوى في المشهد
const IMAGES_PER_RUN = 5;
// ألوان طبيعية، واللهب النشط بالأحمر: انعكاس عالٍ في الأشعة تحت الحمراء القصيرة (B12) يفوق B11،
// مع أزرق خافت (B02) يستبعد حواف الغيوم، فهي ساطعة في B12 أيضاً
const EVALSCRIPT = `//VERSION=3
function setup(){return{input:['B02','B03','B04','B11','B12'],output:{bands:3}}}
function evaluatePixel(s){
  if (s.B12 > 0.45 && s.B12 > 1.2 * s.B11 && s.B02 < 0.1) return [1, 0.1, 0];
  return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02];
}`;

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function inside([x, y]: [number, number], ring: [number, number][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const wilayaAt = (lat: number, lon: number) =>
  WILAYA_SHAPES.find((s) => s.rings.some((r) => inside([lon, lat], r)))?.wilaya ?? null;

function km(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
// اتجاه الحريق من البلدية
function direction(fromLat: number, fromLon: number, lat: number, lon: number) {
  const dy = lat - fromLat, dx = (lon - fromLon) * Math.cos(fromLat * Math.PI / 180);
  const deg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'][Math.round(deg / 45) % 8];
}
const VILLAGE_SUFFIX = ' (قرية)';
// «غرب اركيز»، والمركّب «في الجنوب الغربي من اركيز»
const COMPOUND: Record<string, string> = {
  'شمال شرق': 'الشمال الشرقي', 'شمال غرب': 'الشمال الغربي', 'جنوب شرق': 'الجنوب الشرقي', 'جنوب غرب': 'الجنوب الغربي',
};
const directionFrom = (dir: string, place: string) => (COMPOUND[dir] ? `في ${COMPOUND[dir]} من ${place}` : `${dir} ${place}`);

async function fetchSource(source: string) {
  const res = await fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/${source}/${BBOX}/${DAYS}`);
  const text = await res.text();
  if (!res.ok || !text.startsWith('latitude')) throw new Error(`FIRMS ${source}: ${text.slice(0, 120)}`);
  const [header, ...lines] = text.trim().split('\n');
  const cols = header.split(',');
  return lines.filter(Boolean).map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}

async function tg(text: string) {
  if (!BOT_TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

// ── صور Sentinel-2 ────────────────────────────────────────────────────────
async function shToken() {
  const res = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: SH_CLIENT_ID, client_secret: SH_CLIENT_SECRET }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`Copernicus token: ${JSON.stringify(body).slice(0, 120)}`);
  return body.access_token as string;
}

const boxAround = (lat: number, lon: number) =>
  [lon - IMAGE_HALF_DEG, lat - IMAGE_HALF_DEG, lon + IMAGE_HALF_DEG, lat + IMAGE_HALF_DEG];

// مشاهد Sentinel-2 فوق الموضع بين تاريخين بغيوم لا تتجاوز maxCloud، من الأقدم إلى الأحدث
async function scenesBetween(token: string, lat: number, lon: number, fromIso: string, toIso: string, maxCloud: number) {
  const res = await fetch('https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'], bbox: boxAround(lat, lon), datetime: `${fromIso}/${toIso}`,
      limit: 50, fields: { include: ['properties.datetime', 'properties.eo:cloud_cover'] },
    }),
  });
  const body = await res.json();
  return (body.features ?? [])
    .map((f: { properties: { datetime: string; 'eo:cloud_cover': number } }) => f.properties)
    .filter((p: { 'eo:cloud_cover': number }) => p['eo:cloud_cover'] <= maxCloud)
    .map((p: { datetime: string }) => p.datetime)
    .sort() as string[];
}

// أول مشهد بعد الرصد، أو undefined إن لم يمر القمر بعد
const firstSceneAfter = async (token: string, lat: number, lon: number, fromIso: string) =>
  (await scenesBetween(token, lat, lon, fromIso, new Date().toISOString(), MAX_CLOUD))[0];

// أحدث مشهد صافٍ قبل الرصد (خلال 30 يوماً)، لصورة المكان قبل الحريق
const BEFORE_MAX_CLOUD = 30;
async function latestSceneBefore(token: string, lat: number, lon: number, untilIso: string) {
  const from = new Date(new Date(untilIso).getTime() - 30 * 86400000).toISOString();
  const scenes = await scenesBetween(token, lat, lon, from, untilIso, BEFORE_MAX_CLOUD);
  return scenes[scenes.length - 1];
}

async function storeImage(path: string, bytes: Uint8Array) {
  const { error } = await supabase.storage.from('fire-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return `${SUPABASE_URL}/storage/v1/object/public/fire-images/${path}`;
}

async function sceneImage(token: string, lat: number, lon: number, sceneIso: string) {
  const day = sceneIso.slice(0, 10);
  const res = await fetch('https://sh.dataspace.copernicus.eu/api/v1/process', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      input: {
        bounds: { bbox: boxAround(lat, lon), properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
        data: [{ type: 'sentinel-2-l2a', dataFilter: { timeRange: { from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z` }, mosaickingOrder: 'mostRecent' } }],
      },
      output: { width: IMAGE_PX, height: IMAGE_PX, responses: [{ identifier: 'default', format: { type: 'image/jpeg' } }] },
      evalscript: EVALSCRIPT,
    }),
  });
  if (!res.ok) throw new Error(`Sentinel Hub ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function tgPhoto(photoUrl: string, caption: string) {
  if (!BOT_TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, photo: photoUrl, caption }),
  }).catch(() => {});
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const arDate = (iso: string) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}`; };

// الحرائق الكبيرة التي لم تصلها صورة بعد: يُبحث لكل منها عن أول مشهد صافٍ بعد رصده؛ وإلى أن يمر
// القمر تُحفظ أحدث صورة صافية للمكان قبل الحريق (لا تُرسل إلى تيليغرام)
async function attachImages() {
  if (!SH_CLIENT_ID || !SH_CLIENT_SECRET) return 'بلا مفتاح Copernicus';
  const { data: pending } = await supabase.from('fire_hotspots')
    .select('id, lat, lon, detected_at, wilaya, place, distance_km, direction, image_tries, before_image_url')
    .eq('big', true).is('image_url', null)
    // الأقل بحثاً أولاً، فلا تبقى حرائق خارج الدفعة دائماً
    .order('image_tries', { ascending: true }).order('detected_at', { ascending: false }).limit(IMAGES_PER_RUN);
  if (!pending?.length) return 0;
  const token = await shToken();
  let attached = 0;
  for (const f of pending) {
    const scene = await firstSceneAfter(token, f.lat, f.lon, f.detected_at);
    await supabase.from('fire_hotspots').update({ image_tries: (f.image_tries ?? 0) + 1 }).eq('id', f.id);
    if (!scene) {
      if (!f.before_image_url) {
        const before = await latestSceneBefore(token, f.lat, f.lon, f.detected_at);
        if (before) {
          const beforeUrl = await storeImage(`${f.id}-before.jpg`, await sceneImage(token, f.lat, f.lon, before));
          await supabase.from('fire_hotspots').update({ before_image_url: beforeUrl, before_image_date: before }).eq('id', f.id);
        }
      }
      continue;
    }
    const url = await storeImage(`${f.id}.jpg`, await sceneImage(token, f.lat, f.lon, scene));
    await supabase.from('fire_hotspots').update({ image_url: url, image_date: scene }).eq('id', f.id);
    attached++;
    await tgPhoto(url,
      `🛰️ صورة الحريق: ${f.wilaya} — على بعد ${f.distance_km} كم ${directionFrom(f.direction, f.place)}\n` +
      `رُصد الحريق ${arDate(f.detected_at)}، والتقط Sentinel-2 الصورة ${arDate(scene)}.\n` +
      'مركز الصورة موضع الحريق، والأحمر لهب نشط إن وُجد وقت مرور القمر. المصدر: Copernicus Sentinel-2');
  }
  return attached;
}

Deno.serve(async () => {
  try {
    if (!MAP_KEY) return json({ ok: false, error: 'FIRMS_MAP_KEY غير معرّف' }, 500);

    const rows = new Map<string, Record<string, unknown>>();
    const failed: string[] = [];
    for (const source of SOURCES) {
      let records: Record<string, string>[];
      try { records = await fetchSource(source); } catch (e) { failed.push(String(e)); continue; }
      for (const r of records) {
        const lat = Number(r.latitude), lon = Number(r.longitude);
        const wilaya = wilayaAt(lat, lon);
        if (!wilaya) continue;
        const t = String(r.acq_time).padStart(4, '0');
        const id = `${r.satellite}-${r.acq_date}-${t}-${lat.toFixed(4)}-${lon.toFixed(4)}`;
        let best = PLACES[0], bestKm = Infinity;
        for (const p of PLACES) { const d = km(lat, lon, p.lat, p.lon); if (d < bestKm) { bestKm = d; best = p; } }
        rows.set(id, {
          id, lat, lon, detected_at: `${r.acq_date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`,
          satellite: r.satellite, frp: Number(r.frp) || 0, confidence: r.confidence, daynight: r.daynight,
          wilaya, place: best.city.replace(VILLAGE_SUFFIX, ''), place_wilaya: best.wilaya,
          distance_km: Math.round(bestKm), direction: direction(best.lat, best.lon, lat, lon),
        });
      }
    }
    if (failed.length === SOURCES.length) throw new Error(failed.join(' | '));
    const list = [...rows.values()];

    // الجديد منذ آخر تشغيل، للتنبيه
    const { data: known } = await supabase.from('fire_hotspots').select('id').in('id', list.map((r) => r.id as string));
    const knownIds = new Set((known ?? []).map((r) => r.id));
    const fresh = list.filter((r) => !knownIds.has(r.id as string));

    for (let i = 0; i < list.length; i += 500) {
      const { error } = await supabase.from('fire_hotspots').upsert(list.slice(i, i + 500), { onConflict: 'id' });
      if (error) throw error;
    }
    // ما قدُم عن 10 أيام يُحذف، ومعه صوره
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
    const { data: oldImages } = await supabase.from('fire_hotspots').select('id').lt('detected_at', cutoff).eq('big', true);
    if (oldImages?.length) {
      await supabase.storage.from('fire-images').remove(oldImages.flatMap((r) => [`${r.id}.jpg`, `${r.id}-before.jpg`]));
    }
    await supabase.from('fire_hotspots').delete().lt('detected_at', cutoff);

    // حرائق كبيرة: تجمّعات متقاربة أو بؤرة شديدة، في كل بؤر اليومين (لا الجديدة وحدها،
    // فالتجمّع قد يكتمل على دفعات). يُعلَّم الحريق مرة واحدة: إن كانت إحدى بؤره معلَّمة فهو معروف
    const cells = new Map<string, Record<string, unknown>[]>();
    for (const r of list) {
      const key = `${Math.round((r.lat as number) / CLUSTER_DEG)},${Math.round((r.lon as number) / CLUSTER_DEG)}`;
      (cells.get(key) || cells.set(key, []).get(key)!).push(r);
    }
    const { data: marked } = await supabase.from('fire_hotspots').select('id').eq('big', true).in('id', list.map((r) => r.id as string));
    const markedIds = new Set((marked ?? []).map((r) => r.id));
    const bigCells = [...cells.values()]
      .filter((c) => c.length >= CLUSTER_MIN || c.some((r) => (r.frp as number) >= BIG_FRP_MW))
      .filter((c) => !c.some((r) => markedIds.has(r.id as string)));
    const big = bigCells.map((c) => c.reduce((a, b) => ((b.frp as number) > (a.frp as number) ? b : a)));
    // البؤرة الأشد في كل تجمّع تمثّل الحريق الكبير، وتُتابَع حتى تصلها صورة
    for (let k = 0; k < big.length; k++) {
      await supabase.from('fire_hotspots').update({ big: true, cluster_size: bigCells[k].length }).eq('id', big[k].id as string);
    }
    if (big.length) {
      const lines = big.slice(0, 12).map((r) =>
        `🔥 ${r.wilaya}: على بعد ${r.distance_km} كم ${directionFrom(r.direction as string, r.place as string)} (${Math.round(r.frp as number)} ميغاواط)`);
      await tg(`🛰️ *حرائق جديدة رصدتها الأقمار الصناعية*\n\n${lines.join('\n')}` +
        `${big.length > 12 ? `\n… و${big.length - 12} أخرى` : ''}\n\nالمصدر: NASA FIRMS\n🔗 ${SITE}/pastures`);
    }

    const images = await attachImages().catch((e) => `صور: ${e}`);
    return json({ ok: true, hotspots: list.length, fresh: fresh.length, big: big.length, images, failed });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
