// ═══════════════════════════════════════════════════
// العجز/الفائض المطري حسب إعادة التحليل ERA5 (المركز الأوروبي ECMWF).
//
// المقارنة كلها داخل ERA5: هطول السنة في عاصمة الولاية مقابل معدل 1991–2020
// للنقطة نفسها والفترة نفسها من السنة. لا تدخل فيها قراءات مقاييس الأرشيف:
// قيم ERA5 بالمليمتر أقل من قراءات المقاييس (نحو النصف في الوسيط)، فلا يصح
// قياس أحدهما على معدل الآخر.
// ═══════════════════════════════════════════════════

import { rainDeficit } from './rainTotals';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const CACHE_TTL = 12 * 60 * 60 * 1000;

// فهرس اليوم في سنة من 366 يوماً (0 = 1 يناير)، كما في جدول المعدلات التراكمية
const DAYS_BEFORE_MONTH = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
export function dayIndex(monthDay) {
  const [month, day] = monthDay.split('-').map(Number);
  return DAYS_BEFORE_MONTH[month - 1] + day - 1;
}

/**
 * نسبة كل مدينة إلى معدلها.
 * سنة مكتملة: مجموعها مقابل المعدل السنوي.
 * السنة الجارية (current): مجموعها حتى آخر يوم متاح مقابل المعدل التراكمي حتى اليوم
 * نفسه — لا تُقارن أشهر من السنة بمعدل السنة كاملة.
 * current: { through: 'YYYY-MM-DD', totals: { [اسم المدينة]: مم } }
 */
export function era5Anomalies(cities, year, current = null) {
  const rows = cities.map((city) => {
    const recorded = current ? current.totals[city.name] : city.years[year];
    const reference = current ? city.cumulative[dayIndex(current.through.slice(5))] : city.normal;
    const deficit = rainDeficit(recorded, reference);
    return {
      name: city.name,
      wilaya: city.wilaya,
      recorded: Number.isFinite(recorded) ? Math.round(recorded) : null,
      reference: Number.isFinite(reference) ? Math.round(reference) : null,
      status: deficit.status,
      pct: deficit.pct,
    };
  });
  return {
    year: Number(year),
    partial: Boolean(current),
    through: current ? current.through : null,
    rows,
    below: rows.filter((r) => r.status === 'deficit').length,
    above: rows.filter((r) => r.status === 'surplus').length,
    computable: rows.filter((r) => r.status !== 'not-computable').length,
  };
}

/** مجموع كل مدينة في السنة الجارية حتى آخر يوم متاح في ERA5 (يتأخر نحو 5 أيام). طلب واحد لكل المدن. */
export async function fetchEra5CurrentYear(cities, today = new Date()) {
  const year = today.getUTCFullYear();
  const params = new URLSearchParams({
    latitude: cities.map((c) => c.lat).join(','),
    longitude: cities.map((c) => c.lon).join(','),
    start_date: `${year}-01-01`,
    end_date: today.toISOString().slice(0, 10),
    daily: 'precipitation_sum',
    models: 'era5',
    timezone: 'GMT',
  });
  const res = await fetch(`${ARCHIVE_URL}?${params}`);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const body = await res.json();
  const series = Array.isArray(body) ? body : [body];
  if (series.length !== cities.length) throw new Error('open-meteo: unexpected response');

  // آخر يوم متاح لكل المدن معاً: الأيام الأخيرة تعود فارغة (null) حتى تكتمل في ERA5
  let last = Infinity;
  series.forEach((s) => {
    let i = s.daily.precipitation_sum.length - 1;
    while (i >= 0 && s.daily.precipitation_sum[i] === null) i--;
    last = Math.min(last, i);
  });
  if (!Number.isFinite(last) || last < 0) throw new Error('open-meteo: no data yet for this year');

  const totals = {};
  series.forEach((s, idx) => {
    totals[cities[idx].name] = s.daily.precipitation_sum.slice(0, last + 1).reduce((a, v) => a + (v ?? 0), 0);
  });
  return { through: series[0].daily.time[last], totals };
}

/**
 * نتيجة سنة معيّنة جاهزة للعرض. المعدلات تُحمَّل عند الحاجة فقط (ملف مولَّد كبير نسبياً).
 * يعيد null للسنة الجارية إن تعذّر جلب بياناتها.
 */
export async function loadEra5Deficit(year, today = new Date()) {
  const { ERA5_CITIES, ERA5_REFERENCE } = await import('./rainEra5Normals.js');
  const target = Number(year);
  const reference = ERA5_REFERENCE;
  if (target <= reference.lastFullYear) {
    if (ERA5_CITIES[0].years[target] === undefined) return null;
    return { ...era5Anomalies(ERA5_CITIES, target), reference };
  }
  if (target !== today.getUTCFullYear()) return null;

  const cacheKey = `era5_current_${target}`;
  let current = null;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.at < CACHE_TTL) current = cached.data;
  } catch { /* تخزين محلي غير متاح أو تالف → نجلب من الشبكة */ }
  if (!current) {
    try {
      current = await fetchEra5CurrentYear(ERA5_CITIES, today);
    } catch {
      return null;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: current }));
    } catch { /* تجاوز الحصة أو وضع خاص → نكمل بلا تخزين */ }
  }
  return { ...era5Anomalies(ERA5_CITIES, target, current), reference };
}
