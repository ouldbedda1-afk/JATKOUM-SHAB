// Supabase Edge Function: pasture-ndvi
// حالة المراعي في كل ولاية من مؤشر الغطاء النباتي (NDVI) لصور القمر الصناعي MODIS،
// كما تنشرها ناسا عبر GIBS (خدمة WMS مفتوحة، بلا مفتاح). تُحفظ في جدول pasture_ndvi.
//
// MODIS Terra L3 NDVI: صورة مركّبة كل 16 يوماً (تبدأ في اليوم 1، 17، 33… من السنة)،
// متاحة منذ سنة 2000. نقارن كل فترة بالفترة نفسها في السنوات العشر السابقة (وتُحفظ قيمة كل سنة في history)،
// وبالفترة التي قبلها.
//
// الطريقة: نطلب صورة لموريتانيا كلها بدقة 0.03°، ونحوّل لون كل نقطة إلى قيمة NDVI
// بجدول ألوان GIBS (كل لون يقابل مجالاً عرضه 0.005)، ثم نأخذ متوسط النقاط داخل حدود كل ولاية.
//
// يُستدعى عبر pg_cron يومياً، ولا يعمل إلا إذا ظهرت فترة جديدة لم تُحفظ بعد.
// النشر:  supabase functions deploy pasture-ndvi --no-verify-jwt
// الطلب (POST): {} — أو { "force": true } بمفتاح الخدمة لإعادة حساب آخر فترة.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { WILAYA_SHAPES } from '../_shared/wilayaShapes.ts';
import { GIBS_WMS, decodePng, loadColormap, ndviAt } from '../_shared/gibsNdvi.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const LAYER = 'MODIS_Terra_L3_NDVI_16Day';
const COLORMAP = 'https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_L3_NDVI.xml';
// إطار موريتانيا: الطول من -17.2 إلى -4.7، والعرض من 14.6 إلى 27.4
const LON0 = -17.2, LON1 = -4.7, LAT0 = 14.6, LAT1 = 27.4;
const W = 417, H = 427;
const BASELINE_YEARS = 10;
// نواكشوط مدينة بلا مراعٍ
const SKIP = new Set(['نواكشوط']);

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// ── قناع الولايات: لكل نقطة في الصورة رقم ولايتها (أو -1) بطريقة المسح الأفقي ──
function buildMask(): Int16Array {
  const mask = new Int16Array(W * H).fill(-1);
  const dx = (LON1 - LON0) / W, dy = (LAT1 - LAT0) / H;
  WILAYA_SHAPES.forEach((shape, wi) => {
    for (const ring of shape.rings) {
      for (let y = 0; y < H; y++) {
        const lat = LAT1 - (y + 0.5) * dy;
        const xs: number[] = [];
        for (let i = 0; i < ring.length; i++) {
          const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
          if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + (lat - y1) / (y2 - y1) * (x2 - x1));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const from = Math.max(0, Math.round((xs[k] - LON0) / dx));
          const to = Math.min(W, Math.round((xs[k + 1] - LON0) / dx));
          for (let x = from; x < to; x++) mask[y * W + x] = wi;
        }
      }
    }
  });
  return mask;
}

// ── متوسط NDVI لكل ولاية في فترة ما ──────────────────────────────────────
async function wilayaMeans(date: string, mask: Int16Array, colors: Map<number, number>) {
  const url = `${GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${LAYER}&CRS=EPSG:4326` +
    `&BBOX=${LAT0},${LON0},${LAT1},${LON1}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/png&TIME=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIBS ${res.status} ${date}`);
  const { width, height, rgba } = await decodePng(new Uint8Array(await res.arrayBuffer()));
  if (width !== W || height !== H) throw new Error(`مقاس غير متوقع ${width}×${height}`);
  const sum = new Float64Array(WILAYA_SHAPES.length), count = new Int32Array(WILAYA_SHAPES.length);
  for (let i = 0; i < mask.length; i++) {
    const wi = mask[i];
    if (wi < 0) continue;
    const v = ndviAt(rgba, i, colors);
    if (v === undefined) continue;
    sum[wi] += v; count[wi]++;
  }
  return WILAYA_SHAPES.map((_, wi) => ({ ndvi: count[wi] ? sum[wi] / count[wi] : null, pixels: count[wi] }));
}

// تاريخ بداية الفترة رقم doy (1، 17، 33…) في سنة ما
const periodDate = (year: number, doy: number) =>
  new Date(Date.UTC(year, 0, doy)).toISOString().slice(0, 10);
const dayOfYear = (d: Date) => Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const isService = req.headers.get('authorization') === `Bearer ${SERVICE_KEY}`;
    const force = isService && body.force === true;

    const [colors, mask] = [await loadColormap(COLORMAP), buildMask()];
    const minPixels = 0.5 * mask.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);

    // أحدث فترة متاحة: تتأخر الصورة المركّبة أسبوعين تقريباً عن نهاية فترتها
    const now = new Date();
    let year = now.getUTCFullYear(), doy = Math.floor((dayOfYear(now) - 1) / 16) * 16 + 1;
    let current: Awaited<ReturnType<typeof wilayaMeans>> | null = null;
    for (let tries = 0; tries < 4 && !current; tries++) {
      const date = periodDate(year, doy);
      // فترة محسوبة قبل حفظ قيم السنوات (038) تُعاد مرة لتُملأ history
      const { data: done } = await supabase.from('pasture_ndvi').select('wilaya, history').eq('period', date).limit(1);
      if (done?.length && done[0].history && !force) return json({ ok: true, skipped: date });
      const means = await wilayaMeans(date, mask, colors);
      if (means.reduce((n, m) => n + m.pixels, 0) >= minPixels) { current = means; break; }
      doy -= 16;
      if (doy < 1) { year--; doy = 353; }
    }
    if (!current) return json({ ok: false, error: 'لا صورة متاحة في آخر أربع فترات' }, 502);
    const period = periodDate(year, doy);

    const prevDoy = doy > 16 ? doy - 16 : 353;
    const previous = await wilayaMeans(periodDate(doy > 16 ? year : year - 1, prevDoy), mask, colors);

    const history: (number | null)[][] = [];
    for (let y = year - BASELINE_YEARS; y < year; y++) {
      history.push((await wilayaMeans(periodDate(y, doy), mask, colors)).map((m) => m.ndvi));
    }

    const rows = WILAYA_SHAPES.flatMap((shape, wi) => {
      if (SKIP.has(shape.wilaya) || current![wi].ndvi === null) return [];
      const past = history.map((h) => h[wi]).filter((v): v is number => v !== null);
      const mean = past.reduce((a, b) => a + b, 0) / (past.length || 1);
      const std = past.length > 1
        ? Math.sqrt(past.reduce((a, b) => a + (b - mean) ** 2, 0) / (past.length - 1)) : 0;
      return [{
        wilaya: shape.wilaya, period,
        ndvi: +current![wi].ndvi!.toFixed(4),
        prev_ndvi: previous[wi].ndvi === null ? null : +previous[wi].ndvi!.toFixed(4),
        mean_ndvi: +mean.toFixed(4), std_ndvi: +std.toFixed(4),
        min_ndvi: past.length ? +Math.min(...past).toFixed(4) : null,
        max_ndvi: past.length ? +Math.max(...past).toFixed(4) : null,
        baseline_years: past.length, pixels: current![wi].pixels,
        // قيمة الفترة نفسها في كل سنة من السنوات العشر، لمقارنة السنوات في صفحة المراعي
        history: Object.fromEntries(history.flatMap((h, k) => (h[wi] === null ? [] : [[String(year - BASELINE_YEARS + k), +h[wi]!.toFixed(4)]]))),
        updated_at: new Date().toISOString(),
      }];
    });

    const { error } = await supabase.from('pasture_ndvi').upsert(rows, { onConflict: 'wilaya,period' });
    if (error) throw error;
    return json({ ok: true, period, rows: rows.length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
