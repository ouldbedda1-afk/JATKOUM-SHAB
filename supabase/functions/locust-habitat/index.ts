// Supabase Edge Function: locust-habitat
// المناطق المهيأة لتكاثر الجراد الصحراوي في موريتانيا، من الأقمار الصناعية.
//
// القمر الصناعي لا يرى الجراد، لكنه يرى ما يحتاجه للتكاثر: مطر يرطّب التربة فتضع فيها الإناث
// البيض، ثم نبات أخضر تتغذى عليه اليرقات. نفحص ذلك في موائل الجراد فقط (_shared/locustHabitat.ts:
// خلايا نصف درجة مسحها المركز الوطني لمكافحة الجراد، وما جاورها):
//   - النبات الأخضر: نسبة النقاط التي اخضرّت مقارنةً بموسم الجفاف (20 مايو)، من صور MODIS لثمانية أيام
//     (NASA GIBS). المقارنة بالنقطة نفسها في الجفاف تلتقط نبات الأودية المتفرق في الشمال، الذي لا يبلغ
//     عتبة ثابتة: في اختبار على مسوحات أكتوبر 2026 وقع 83% مما وُجد فيه جراد داخل الخلايا الخضراء بهذه
//     الطريقة، مقابل 18% بعتبة NDVI ثابتة قدرها 0.15.
//   - المطر: مجموع آخر 30 يوماً من Open-Meteo.
// الحالة: 3 مطر ونبات أخضر (مهيأة للتكاثر)، 2 نبات أخضر، 1 مطر بلا اخضرار بعد، 0 جافة.
//
// يُستدعى عبر pg_cron يومياً، ويستبدل محتوى جدول locust_habitat كله.
// النشر:  supabase functions deploy locust-habitat --no-verify-jwt
// الطلب (POST): {}

import { createClient } from 'npm:@supabase/supabase-js@2';
import { HABITAT, HABITAT_CELL } from '../_shared/locustHabitat.ts';
import { GIBS_WMS, decodePng, loadColormap, ndviAt } from '../_shared/gibsNdvi.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const LAYER = 'MODIS_Terra_NDVI_8Day';
const COLORMAP = 'https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_NDVI.xml';
const LON0 = -17.2, LON1 = -4.7, LAT0 = 14.6, LAT1 = 27.4;
const W = 417, H = 427;
// نقطة خضراء: NDVI ≥ 0.10 وأعلى بـ0.03 على الأقل من قيمتها في موسم الجفاف. والخلية خضراء إذا كانت
// 10% من نقاطها خضراء
const GREEN_MIN = 0.1;
const GREEN_RISE = 0.03;
const GREEN_SHARE = 0.1;
// مطر يكفي لترطيب التربة ووضع البيض
const WET_MM = 20;
const RAIN_DAYS = 30;

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function ndviImage(date: string, colors: Map<number, number>) {
  const url = `${GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${LAYER}&CRS=EPSG:4326` +
    `&BBOX=${LAT0},${LON0},${LAT1},${LON1}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/png&TIME=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIBS ${res.status} ${date}`);
  const { width, height, rgba } = await decodePng(new Uint8Array(await res.arrayBuffer()));
  if (width !== W || height !== H) throw new Error(`مقاس غير متوقع ${width}×${height}`);
  const values = new Float32Array(W * H).fill(NaN);
  for (let i = 0; i < W * H; i++) { const v = ndviAt(rgba, i, colors); if (v !== undefined) values[i] = v; }
  return values;
}

// نسبة النقاط التي اخضرّت مقارنةً بصورة الجفاف، ومتوسط NDVI، في كل خلية
function cellGreenness(now: Float32Array, dry: Float32Array) {
  const dx = (LON1 - LON0) / W, dy = (LAT1 - LAT0) / H, half = HABITAT_CELL / 2;
  let valid = 0;
  const cells = HABITAT.map((c) => {
    const x0 = Math.max(0, Math.floor((c.lon - half - LON0) / dx)), x1 = Math.min(W, Math.ceil((c.lon + half - LON0) / dx));
    const y0 = Math.max(0, Math.floor((LAT1 - c.lat - half) / dy)), y1 = Math.min(H, Math.ceil((LAT1 - c.lat + half) / dy));
    let n = 0, green = 0, sum = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const v = now[y * W + x], ref = dry[y * W + x];
      if (Number.isNaN(v) || Number.isNaN(ref)) continue;
      n++; sum += v; if (v >= GREEN_MIN && v - ref >= GREEN_RISE) green++;
    }
    valid += n;
    return n ? { share: green / n, mean: sum / n } : null;
  });
  return { cells, valid };
}

// مجموع المطر في آخر 30 يوماً وآخر 10 أيام، لكل الخلايا (100 خلية في كل طلب)
async function cellRain() {
  const out: { r30: number; r10: number }[] = [];
  for (let i = 0; i < HABITAT.length; i += 100) {
    const part = HABITAT.slice(i, i + 100);
    const url = 'https://api.open-meteo.com/v1/forecast?daily=precipitation_sum&timezone=GMT' +
      `&past_days=${RAIN_DAYS}&forecast_days=1` +
      `&latitude=${part.map((c) => c.lat).join(',')}&longitude=${part.map((c) => c.lon).join(',')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = await res.json();
    for (const loc of Array.isArray(data) ? data : [data]) {
      // اليوم الأخير هو اليوم الجاري (توقع)، فلا يُحسب
      const p: (number | null)[] = loc.daily.precipitation_sum.slice(0, -1);
      const sum = (arr: (number | null)[]) => +arr.reduce((a: number, v) => a + (v ?? 0), 0).toFixed(1);
      out.push({ r30: sum(p), r10: sum(p.slice(-10)) });
    }
  }
  return out;
}

Deno.serve(async () => {
  try {
    const colors = await loadColormap(COLORMAP);

    // صورة الجفاف: 20 مايو قبل آخر موسم أمطار (يبدأ في يوليو)
    const today = new Date();
    const dryYear = today.getUTCMonth() >= 6 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
    const dry = await ndviImage(`${dryYear}-05-20`, colors);

    // أحدث صورة: تُحدَّث يومياً، وقد تتأخر يوماً أو يومين
    let date = '', green: ReturnType<typeof cellGreenness>['cells'] | null = null;
    for (let back = 1; back <= 6 && !green; back++) {
      date = new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
      const g = cellGreenness(await ndviImage(date, colors), dry);
      if (g.valid > HABITAT.length * 50) green = g.cells;
    }
    if (!green) return json({ ok: false, error: 'لا صورة NDVI في آخر ستة أيام' }, 502);
    const prevDate = new Date(new Date(date).getTime() - 16 * 86400000).toISOString().slice(0, 10);
    const prev = cellGreenness(await ndviImage(prevDate, colors), dry).cells;
    const rain = await cellRain();

    const now = new Date().toISOString();
    const rows = HABITAT.map((c, i) => {
      const g = green![i], r = rain[i];
      const isGreen = !!g && g.share >= GREEN_SHARE, isWet = !!r && r.r30 >= WET_MM;
      return {
        lat: c.lat, lon: c.lon, wilaya: c.wilaya, surveys: c.surveys, positive: c.positive,
        green_share: g ? +g.share.toFixed(3) : null,
        ndvi_mean: g ? +g.mean.toFixed(4) : null,
        green_share_prev: prev[i] ? +prev[i]!.share.toFixed(3) : null,
        rain_30d: r?.r30 ?? null, rain_10d: r?.r10 ?? null,
        status: isWet && isGreen ? 3 : isGreen ? 2 : isWet ? 1 : 0,
        ndvi_date: date, computed_at: now,
      };
    });

    const { error: delError } = await supabase.from('locust_habitat').delete().gte('lat', -90);
    if (delError) throw delError;
    const { error } = await supabase.from('locust_habitat').insert(rows);
    if (error) throw error;
    const counts = [0, 1, 2, 3].map((s) => rows.filter((r) => r.status === s).length);
    return json({ ok: true, ndvi_date: date, cells: rows.length, dry: counts[0], wet: counts[1], green: counts[2], favourable: counts[3] });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
