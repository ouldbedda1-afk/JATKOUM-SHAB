// ═══════════════════════════════════════════════════
// المقارنة المطرية المناخية حسب إعادة التحليل ERA5 (المركز الأوروبي ECMWF).
//
// المقارنة كلها داخل ERA5: هطول السنة في عاصمة الولاية مقابل معدل 1991–2020
// للنقطة نفسها والفترة نفسها من السنة. لا تدخل فيها قراءات مقاييس الأرشيف:
// قيم ERA5 بالمليمتر أقل من قراءات المقاييس (نحو النصف في الوسيط)، فلا يصح
// قياس أحدهما على معدل الآخر.
// ═══════════════════════════════════════════════════

import { rainDeficit } from './rainTotals';

const CACHE_TTL = 12 * 60 * 60 * 1000;

// معدل مرجعي دون هذا الحد (مم) شبه منعدم: قسمة عليه تعطي نسباً بلا معنى
// (ملليمتر واحد زائد في فبراير = «+300%»)، فلا تُعرض له نتيجة
export const MIN_REFERENCE_MM = 5;

// فهرس اليوم في سنة من 366 يوماً (0 = 1 يناير)، كما في جدول المعدلات التراكمية
const DAYS_BEFORE_MONTH = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
export function dayIndex(monthDay) {
  const [month, day] = monthDay.split('-').map(Number);
  return DAYS_BEFORE_MONTH[month - 1] + day - 1;
}

/**
 * مقارنة كل عاصمة بمعدلها.
 * سنة مكتملة: مجموعها مقابل المعدل السنوي.
 * السنة الجارية (current): مجموعها من 1 يناير حتى آخر يوم متاح مقابل المعدل التراكمي
 * حتى اليوم نفسه — لا تُقارن أشهر من السنة بمعدل السنة كاملة.
 * current: { through: 'YYYY-MM-DD', totals: { [اسم العاصمة]: مم أو null إن نقصت بياناتها } }
 *
 * status: 'below' أقل من المعدل، 'above' أعلى من المعدل، 'normal' عند المعدل،
 * 'not-computable' بيانات ناقصة أو معدل مرجعي منعدم (لا تُعرض له نتيجة).
 */
export function era5Anomalies(cities, year, current = null) {
  const rows = cities.map((city) => {
    const recorded = current ? current.totals[city.name] : city.years[year];
    const reference = current ? city.cumulative[dayIndex(current.through.slice(5))] : city.normal;
    const usable = Number.isFinite(recorded) && Number.isFinite(reference) && reference >= MIN_REFERENCE_MM;
    const deficit = usable ? rainDeficit(recorded, reference) : { status: 'not-computable', pct: null };
    return {
      name: city.name,
      wilaya: city.wilaya,
      // خانة عشرية واحدة: حتى توافق النسبةُ المعروضة الرقمين المعروضين
      recorded: usable ? Math.round(recorded * 10) / 10 : null,
      reference: usable ? Math.round(reference * 10) / 10 : null,
      status: { deficit: 'below', surplus: 'above', normal: 'normal', 'not-computable': 'not-computable' }[deficit.status],
      pct: deficit.pct,
    };
  });
  return {
    year: Number(year),
    partial: Boolean(current),
    through: current ? current.through : null,
    rows,
    below: rows.filter((r) => r.status === 'below').length,
    above: rows.filter((r) => r.status === 'above').length,
    computable: rows.filter((r) => r.status !== 'not-computable').length,
  };
}

/**
 * مجموع كل عاصمة في السنة الجارية حتى آخر يوم متاح في ERA5 (يتأخر نحو 5 أيام).
 * طلب واحد لكل العواصم، بالمصدر والنموذج والإحداثيات نفسها التي حُسبت بها المعدلات.
 */
export async function fetchEra5CurrentYear(cities, source, today = new Date()) {
  const year = today.getUTCFullYear();
  const params = new URLSearchParams({
    latitude: cities.map((c) => c.lat).join(','),
    longitude: cities.map((c) => c.lon).join(','),
    start_date: `${year}-01-01`,
    end_date: today.toISOString().slice(0, 10),
    daily: source.variable,
    models: source.model,
    timezone: source.timezone,
  });
  const res = await fetch(`${source.api}?${params}`);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const body = await res.json();
  const series = Array.isArray(body) ? body : [body];
  if (series.length !== cities.length) throw new Error('open-meteo: unexpected response');
  return summariseCurrentYear(cities, series);
}

/** يحوّل سلاسل السنة الجارية إلى { through, totals }. يُفصل عن الجلب ليُختبر وحده. */
export function summariseCurrentYear(cities, series) {
  // آخر يوم متاح لكل العواصم معاً: الأيام الأخيرة تعود فارغة (null) حتى تكتمل في ERA5
  let last = Infinity;
  series.forEach((s) => {
    const values = s.daily.precipitation_sum;
    let i = values.length - 1;
    while (i >= 0 && values[i] === null) i--;
    last = Math.min(last, i);
  });
  if (!Number.isFinite(last) || last < 0) throw new Error('open-meteo: no data yet for this year');

  const totals = {};
  series.forEach((s, idx) => {
    const values = s.daily.precipitation_sum.slice(0, last + 1);
    // يوم ناقص وسط الفترة = مجموع ناقص: لا نتيجة لهذه العاصمة
    totals[cities[idx].name] = values.some((v) => v === null) ? null : values.reduce((a, v) => a + v, 0);
  });
  return { through: series[0].daily.time[last], totals };
}

/**
 * نتيجة سنة معيّنة جاهزة للعرض. المعدلات تُحمَّل عند الحاجة فقط (ملف مولَّد).
 * يعيد null إن لم تتوفر السنة، أو تعذّر جلب السنة الجارية.
 */
export async function loadEra5Deficit(year, today = new Date()) {
  const { ERA5_CITIES, ERA5_REFERENCE, ERA5_SOURCE } = await import('./rainEra5Normals.js');
  const target = Number(year);
  const meta = { reference: ERA5_REFERENCE, source: ERA5_SOURCE };
  if (target <= ERA5_REFERENCE.lastFullYear) {
    if (ERA5_CITIES[0].years[target] === undefined) return null;
    return { ...era5Anomalies(ERA5_CITIES, target), ...meta };
  }
  if (target !== today.getUTCFullYear()) return null;

  // السنة الجارية: نتيجة الجلب تُحفظ 12 ساعة (ERA5 يُحدَّث مرة في اليوم)
  const cacheKey = `era5_current_v2_${target}`;
  let current = null;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.at < CACHE_TTL) current = cached.data;
  } catch { /* تخزين محلي غير متاح أو تالف → نجلب من الشبكة */ }
  if (!current) {
    try {
      current = await fetchEra5CurrentYear(ERA5_CITIES, ERA5_SOURCE, today);
    } catch {
      return null;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: current }));
    } catch { /* تجاوز الحصة أو وضع خاص → نكمل بلا تخزين */ }
  }
  return { ...era5Anomalies(ERA5_CITIES, target, current), ...meta };
}
