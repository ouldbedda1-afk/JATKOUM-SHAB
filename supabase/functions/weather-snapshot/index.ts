// Supabase Edge Function: weather-snapshot
// نسخة واحدة من طقس المدن يقرؤها كل الزوار من جدول weather_snapshot، بدل أن يطلب كل متصفح
// طقس 227 مدينة من Open-Meteo بنفسه كل خمس دقائق. الحد المجاني لـ Open-Meteo (10 آلاف طلب يومياً
// لكل عنوان IP) كان يُستنفد من تبويب واحد مفتوح ساعتين، فينقطع الطقس عمّن يشاركه العنوان نفسه.
//
// الصفوف (key):
//   core     — المدن الأساسية: الطقس الحالي، والساعي لثلاثة أيام (مع مؤشرات العواصف)، واليومي.
//   communes — البلديات الأخرى: الطقس الحالي واليومي.
// الحقول كما يطلبها الموقع في src/weatherApi.js، وpayload مصفوفة { city, data } بترتيب النقاط.
// الموقع يحسب "الآن" من الساعة الجارية في التوقع الساعي، فتبقى النسخة صالحة بين تحديثين.
//
// يُستدعى عبر pg_cron كل ثلاث ساعات (نحو 4 آلاف طلب يومياً في المجموع).
// النشر:  supabase functions deploy weather-snapshot --no-verify-jwt
// الطلب (POST): {}

import { createClient } from 'npm:@supabase/supabase-js@2';
import { SNAPSHOT_POINTS } from '../_shared/weatherSnapshotPoints.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const CHUNK = 100;

const FIELDS: Record<'core' | 'communes', Record<string, string>> = {
  core: {
    current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,pressure_msl,precipitation',
    hourly: 'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code,cape,convective_inhibition,lifted_index',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
  },
  communes: {
    current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
  },
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function fetchPoints(key: 'core' | 'communes') {
  const points = SNAPSHOT_POINTS[key];
  const out: { city: string; data: unknown }[] = [];
  for (let start = 0; start < points.length; start += CHUNK) {
    const chunk = points.slice(start, start + CHUNK);
    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat).join(','),
      longitude: chunk.map((p) => p.lon).join(','),
      ...FIELDS[key],
      timezone: 'Africa/Nouakchott',
      forecast_days: '3',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const items = Array.isArray(body) ? body : [body];
    if (items.length !== chunk.length || items.some((i: { current?: unknown }) => !i.current)) {
      throw new Error(`Open-Meteo: ${items.length} نتيجة لـ ${chunk.length} نقطة`);
    }
    items.forEach((data: unknown, i: number) => out.push({ city: chunk[i].city, data }));
  }
  return out;
}

Deno.serve(async () => {
  const results: Record<string, unknown> = {};
  for (const key of ['core', 'communes'] as const) {
    try {
      const payload = await fetchPoints(key);
      const { error } = await supabase.from('weather_snapshot')
        .upsert({ key, payload, fetched_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      results[key] = payload.length;
    } catch (e) {
      // تبقى النسخة السابقة، والموقع يعود إلى Open-Meteo مباشرة إن قدمت كثيراً
      results[key] = String(e);
    }
  }
  const ok = Object.values(results).every((v) => typeof v === 'number');
  return json({ ok, ...results }, ok ? 200 : 502);
});
