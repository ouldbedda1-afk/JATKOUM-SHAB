// قراءة نسخة الطقس المشتركة (جدول weather_snapshot) التي تجلبها دالة weather-snapshot على الخادم
// كل ثلاث ساعات، بدل أن يطلب كل متصفح طقس المدن من Open-Meteo بنفسه.

// أقدم من هذا (تحديثان فائتان): نعود إلى Open-Meteo مباشرة
const MAX_AGE_MS = 7 * 60 * 60 * 1000;

const loaded = new Map(); // key -> { fetchedAt, byCity: Map<city, data> }

async function loadSnapshot(key) {
  // استيراد متأخر: weatherApi.js يُحمَّل أيضاً في سكربتات Node التي لا تعرف متغيرات Vite
  const { supabase, isSupabaseConfigured } = await import('./supabase');
  if (!isSupabaseConfigured) return null;

  // عمود التاريخ وحده أولاً (صغير)، والنسخة كاملة (مئات الكيلوبايتات) فقط إن تغيّرت
  const { data: head, error } = await supabase.from('weather_snapshot').select('fetched_at').eq('key', key).maybeSingle();
  if (error || !head) return null;
  if (Date.now() - Date.parse(head.fetched_at) > MAX_AGE_MS) return null;
  const cached = loaded.get(key);
  if (cached?.fetchedAt === head.fetched_at) return cached;

  const { data: row, error: rowError } = await supabase.from('weather_snapshot').select('payload, fetched_at').eq('key', key).maybeSingle();
  if (rowError || !Array.isArray(row?.payload)) return null;
  const snapshot = { fetchedAt: row.fetched_at, byCity: new Map(row.payload.map((p) => [p.city, p.data])) };
  loaded.set(key, snapshot);
  return snapshot;
}

// "الآن" من الساعة الجارية في التوقع الساعي، فلا يبقى طقس النسخة كما كان لحظة جلبها.
// توقيت موريتانيا هو UTC، والأوقات في الرد بصيغة 2026-11-05T17:00
function withCurrentHour(data) {
  const hourly = data?.hourly;
  if (!hourly?.time) return data;
  const i = hourly.time.indexOf(`${new Date().toISOString().slice(0, 13)}:00`);
  if (i < 0) return data;
  const pick = (field) => (hourly[field]?.[i] ?? data.current?.[field]);
  return {
    ...data,
    current: {
      ...data.current,
      time: hourly.time[i],
      temperature_2m: pick('temperature_2m'),
      weather_code: pick('weather_code'),
      wind_speed_10m: pick('wind_speed_10m'),
      wind_direction_10m: pick('wind_direction_10m'),
      precipitation: pick('precipitation'),
    },
  };
}

/**
 * طقس المدن المطلوبة من النسخة المشتركة: Map<city, data>، أو null إن لم تتوفر نسخة حديثة
 * تغطي 90% منها على الأقل.
 */
export async function getSnapshotWeather(cityNames) {
  try {
    const snapshots = (await Promise.all(['core', 'communes'].map(loadSnapshot))).filter(Boolean);
    if (!snapshots.length) return null;
    const found = new Map();
    for (const name of cityNames) {
      const data = snapshots.map((s) => s.byCity.get(name)).find(Boolean);
      if (data) found.set(name, withCurrentHour(data));
    }
    return found.size >= cityNames.length * 0.9 ? found : null;
  } catch {
    return null;
  }
}
