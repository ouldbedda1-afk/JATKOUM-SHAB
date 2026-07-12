/**
 * شبكة نقاط رصد رادارية تملأ فراغات التغطية (المناطق الصحراوية البعيدة عن البلديات).
 * أي مطر يُرصد عند نقطة شبكة يُنسب لأقرب مدينة معروفة + الجهة (مثل "شمال شرق زويرات").
 *
 * تُستبعد النقاط القريبة من بلدية مرصودة أصلاً (لتفادي التكرار) والنقاط فوق المحيط.
 */

import { mauritaniaCommunesList } from './mauritaniaCommunes';

// مدن/بلدات مرجعية للتسمية (اسم عربي + إحداثيات)
const REFERENCE_TOWNS = [
  { name: 'زويرات', lat: 22.74, lon: -12.48 },
  { name: 'بير أم اكرين', lat: 25.23, lon: -11.62 },
  { name: 'افديرك', lat: 22.68, lon: -12.71 },
  { name: 'أطار', lat: 20.52, lon: -13.05 },
  { name: 'شنقيط', lat: 20.46, lon: -12.36 },
  { name: 'وادان', lat: 20.93, lon: -11.62 },
  { name: 'أكجوجت', lat: 19.75, lon: -14.39 },
  { name: 'بنيشاب', lat: 21.83, lon: -14.52 },
  { name: 'نواذيبو', lat: 20.93, lon: -17.03 },
  { name: 'نواكشوط', lat: 18.08, lon: -15.98 },
  { name: 'تجكجة', lat: 18.55, lon: -11.43 },
  { name: 'تيشيت', lat: 18.45, lon: -9.50 },
  { name: 'ولاته', lat: 17.30, lon: -7.02 },
  { name: 'النعمة', lat: 16.61, lon: -7.25 },
  { name: 'لعيون', lat: 16.66, lon: -9.61 },
  { name: 'كيفه', lat: 16.62, lon: -11.40 },
  { name: 'كيهيدي', lat: 16.15, lon: -13.50 },
  { name: 'روصو', lat: 16.51, lon: -15.80 },
  { name: 'سيلبابي', lat: 15.16, lon: -12.18 },
  { name: 'بوتلميت', lat: 17.55, lon: -14.69 },
  { name: 'تمبدغة', lat: 16.24, lon: -8.17 },
  // معالم الجنوب والوسط (لتسمية أدق)
  { name: 'ألاك', lat: 17.05, lon: -13.91 },
  { name: 'مقطع لحجار', lat: 17.50, lon: -13.08 },
  { name: 'بوݣي', lat: 16.58, lon: -14.26 },
  { name: 'كنكوصة', lat: 15.93, lon: -11.53 },
  { name: 'باركيول', lat: 16.67, lon: -12.36 },
  { name: 'مقامة', lat: 15.51, lon: -12.85 },
  { name: 'امبود', lat: 16.02, lon: -12.58 },
  { name: 'كوبني', lat: 15.93, lon: -11.21 },
  { name: 'الطينطان', lat: 16.39, lon: -10.16 },
  { name: 'تامشكط', lat: 17.23, lon: -10.66 },
  { name: 'باسكنو', lat: 15.86, lon: -5.95 },
  { name: 'عدل بكرو', lat: 15.68, lon: -7.02 },
  { name: 'جيكني', lat: 15.74, lon: -8.67 },
  { name: 'امرج', lat: 16.11, lon: -7.21 },
  { name: 'موجريه', lat: 17.85, lon: -12.27 },
  { name: 'كرمسين', lat: 16.48, lon: -16.21 },
  { name: 'المذرذرة', lat: 16.91, lon: -15.65 },
  // الزاوية الجنوبية الشرقية
  { name: 'فصاله', lat: 15.56, lon: -5.52 },
  { name: 'عدل بكرو', lat: 15.68, lon: -7.02 },
  { name: 'انبيكت لحواش', lat: 16.85, lon: -5.94 },
];

const DEG2RAD = Math.PI / 180;
function distKm(aLat, aLon, bLat, bLon) {
  const dLat = (bLat - aLat) * DEG2RAD;
  const dLon = (bLon - aLon) * DEG2RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * DEG2RAD) * Math.cos(bLat * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function bearingDeg(aLat, aLon, bLat, bLon) {
  const y = Math.sin((bLon - aLon) * DEG2RAD) * Math.cos(bLat * DEG2RAD);
  const x = Math.cos(aLat * DEG2RAD) * Math.sin(bLat * DEG2RAD) -
    Math.sin(aLat * DEG2RAD) * Math.cos(bLat * DEG2RAD) * Math.cos((bLon - aLon) * DEG2RAD);
  return (Math.atan2(y, x) / DEG2RAD + 360) % 360;
}
function compassAr(deg) {
  return ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'][Math.round(deg / 45) % 8];
}

// أقرب بلدية (من القائمة الكاملة) — لتحديد الفراغات
const COMMUNE_POINTS = mauritaniaCommunesList
  .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
  .map((c) => ({ lat: c.lat, lon: c.lon }));

function nearestCommuneKm(lat, lon) {
  let min = Infinity;
  for (const p of COMMUNE_POINTS) {
    const d = distKm(lat, lon, p.lat, p.lon);
    if (d < min) min = d;
    if (min < 12) break;
  }
  return min;
}

// تسمية نقطة بأقرب مدينة مرجعية + الجهة
function labelFor(lat, lon) {
  let best = null;
  for (const t of REFERENCE_TOWNS) {
    const d = distKm(lat, lon, t.lat, t.lon);
    if (!best || d < best.d) best = { ...t, d };
  }
  if (!best) return null;
  // لا معلَم قريب بما يكفي للتسمية (صحراء بعيدة) → نتجاهل النقطة
  if (best.d > 120) return null;
  if (best.d <= 25) return `قرب ${best.name}`;
  const dir = compassAr(bearingDeg(best.lat, best.lon, lat, lon));
  return `${dir} ${best.name} (~${Math.round(best.d)}كم)`;
}

// بناء الشبكة مرة واحدة
function buildGrid() {
  const points = [];
  const LAT_MIN = 15, LAT_MAX = 27, LON_MIN = -16.3, LON_MAX = -5, STEP = 0.45;
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP) {
    for (let lon = LON_MIN; lon <= LON_MAX; lon += STEP) {
      // نملأ ما بين البلديات وحولها: نستبعد فقط الملتصق جداً (<15كم) ببلدية مرصودة
      if (nearestCommuneKm(lat, lon) < 15) continue;
      const label = labelFor(lat, lon);
      if (!label) continue;
      points.push({ city: label, wilaya: '', lat, lon, isGridArea: true });
    }
  }
  return points;
}

export const MAURITANIA_RADAR_GRID = buildGrid();
