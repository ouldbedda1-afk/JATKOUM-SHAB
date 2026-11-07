// توقعات فيضان نهر السنغال على الضفة الموريتانية، كما تقرؤها صفحة /river وشريط الأخبار العاجلة وصفحات
// ولايات الضفة: تصريف آخر 30 يوماً وتوقعات 30 يوماً في كل محطة (Copernicus GloFAS عبر Open-Meteo)،
// تُخزَّن في المتصفح ثلاث ساعات فلا يتكرر الطلب بين الصفحات.
import { RIVER_STATIONS, RIVER_PLACES, normalDischarge, riverLevel } from './riverStations';

const DAYS_PAST = 30, DAYS_AHEAD = 30;
const CACHE_KEY = 'river_flood_v1', CACHE_MS = 3 * 3600 * 1000;
export const RIVER_WILAYAS = ['الترارزة', 'البراكنة', 'كوركول', 'كيدماغا'];

export const LEVELS = [
  { label: 'عادي', icon: '✅', color: '#16a34a', badge: 'bg-green-50 text-green-700 border-green-200' },
  { label: 'أعلى من المعتاد', icon: '🔼', color: '#ca8a04', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  { label: 'خطر فيضان', icon: '⚠️', color: '#ea580c', badge: 'bg-orange-50 text-orange-800 border-orange-200' },
  { label: 'فيضان كبير', icon: '🚨', color: '#dc2626', badge: 'bg-red-50 text-red-700 border-red-200' },
];

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const fmtDay = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
export const fmtQ = (q) => Math.round(q).toLocaleString('en-US');

async function fetchRiver() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (c && Date.now() - c.at < CACHE_MS) return c.data;
  } catch { /* تخزين المتصفح غير متاح */ }
  const params = new URLSearchParams({
    latitude: RIVER_STATIONS.map((s) => s.lat).join(','),
    longitude: RIVER_STATIONS.map((s) => s.lon).join(','),
    daily: 'river_discharge,river_discharge_p25,river_discharge_p75',
    past_days: String(DAYS_PAST), forecast_days: String(DAYS_AHEAD),
  });
  const res = await fetch(`https://flood-api.open-meteo.com/v1/flood?${params}`);
  if (!res.ok) throw new Error(`خطأ ${res.status}`);
  const raw = await res.json();
  const data = (Array.isArray(raw) ? raw : [raw]).map((s) => s.daily);
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* */ }
  return data;
}

// ملخص كل محطة: الآن، الاتجاه، مقارنةً بالمعتاد، وذروة التوقعات ومستواها
function summarize(st, i, daily) {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Math.max(0, daily.time.indexOf(today));
  const q = daily.river_discharge.map((v) => v ?? 0);
  const now = q[t0], before = q[Math.max(0, t0 - 3)];
  const ahead = q.slice(t0);
  const peakK = ahead.indexOf(Math.max(...ahead));
  const peak = ahead[peakK], peakDay = daily.time[t0 + peakK];
  const level = riverLevel(st, peak);
  // أول يوم يبلغ فيه النهر مستوى الذروة المتوقعة
  const firstK = ahead.findIndex((v) => riverLevel(st, v) >= level);
  const normal = normalDischarge(i, today);
  return {
    st, i, daily, t0, now, peak, peakDay, level, nowLevel: riverLevel(st, now),
    from: daily.time[t0 + Math.max(0, firstK)],
    trend: now > before * 1.05 ? 'up' : now < before * 0.95 ? 'down' : 'flat',
    vsNormal: normal > 0 ? now / normal : 1,
  };
}

let pending = null;
// ملخص المحطات السبع بترتيبها من المنبع إلى المصب؛ طلب واحد مشترك وإن استدعته عدة مكونات معاً
export function loadRiverForecast() {
  pending ||= fetchRiver()
    .then((data) => RIVER_STATIONS.map((st, i) => summarize(st, i, data[i])))
    .catch((e) => { pending = null; throw e; });
  return pending;
}

// المحطات المتوقع أن تبلغ «خطر فيضان» فأعلى، مع بلديات الضفة القريبة من كل منها
export function floodRisks(rows, wilaya = null) {
  return rows.filter((r) => r.level >= 2 && (!wilaya || r.st.wilaya === wilaya))
    .map((r) => ({ ...r, places: RIVER_PLACES.filter((p) => p.station === r.i).map((p) => p.name) }));
}
