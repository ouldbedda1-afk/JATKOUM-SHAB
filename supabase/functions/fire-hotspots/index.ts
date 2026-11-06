// Supabase Edge Function: fire-hotspots
// بؤر الحرائق النشطة في موريتانيا من نظام NASA FIRMS: كل رصد حراري لأقمار VIIRS
// (NOAA-20 وNOAA-21 وSuomi-NPP) بدقة نحو 375 متراً، عدة مرات يومياً. تُحفظ في جدول fire_hotspots.
//
// نطلب إطار موريتانيا ثم نُبقي ما يقع داخل حدودها الفعلية (_shared/wilayaShapes.ts)، ونربط كل بؤرة
// بأقرب بلدية (_shared/mauritaniaPlaces.ts). يُحفظ آخر 10 أيام.
// المشرف يُنبَّه على تيليغرام بالحرائق الكبيرة الجديدة فقط: تجمّع 5 بؤر فأكثر متقاربة (نحو 3 كم)،
// أو بؤرة طاقتها الإشعاعية 30 ميغاواط فأكثر.
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
    await supabase.from('fire_hotspots').delete()
      .lt('detected_at', new Date(Date.now() - KEEP_DAYS * 86400000).toISOString());

    // حرائق كبيرة جديدة: تجمّعات متقاربة أو بؤرة شديدة
    const cells = new Map<string, Record<string, unknown>[]>();
    for (const r of fresh) {
      const key = `${Math.round((r.lat as number) / CLUSTER_DEG)},${Math.round((r.lon as number) / CLUSTER_DEG)}`;
      (cells.get(key) || cells.set(key, []).get(key)!).push(r);
    }
    const big = [...cells.values()]
      .filter((c) => c.length >= CLUSTER_MIN || c.some((r) => (r.frp as number) >= BIG_FRP_MW))
      .map((c) => c.reduce((a, b) => ((b.frp as number) > (a.frp as number) ? b : a)));
    if (big.length) {
      const lines = big.slice(0, 12).map((r) =>
        `🔥 ${r.wilaya}: على بعد ${r.distance_km} كم ${directionFrom(r.direction as string, r.place as string)} (${Math.round(r.frp as number)} ميغاواط)`);
      await tg(`🛰️ *حرائق جديدة رصدتها الأقمار الصناعية*\n\n${lines.join('\n')}` +
        `${big.length > 12 ? `\n… و${big.length - 12} أخرى` : ''}\n\nالمصدر: NASA FIRMS\n🔗 ${SITE}/pastures`);
    }

    return json({ ok: true, hotspots: list.length, fresh: fresh.length, big: big.length, failed });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
