/**
 * تتبّع خلايا المطر/البرق وتوليد أخبار حركة على مستوى البلدية.
 *
 * المدخلات:
 *  - rainingNow: مخرجات الرادار (RainViewer) لكل بلدية [{ city, wilaya, mmh, label }]
 *  - weatherData: بيانات المدن (تشمل الإحداثيات، اتجاه الريح، كود الطقس للبرق)
 *
 * المنطق:
 *  1. لكل خلية مطر مرصودة بالرادار نحدد موقعها (البلدية) وشدتها (خفيفة/قوية).
 *  2. نحسب اتجاه حركة الخلية من اتجاه الريح (الريح "قادمة من" → الحركة عكسها).
 *  3. نبحث عن أقرب بلدية في مسار الحركة → "تتجه صوب البلدية الفلانية".
 *  4. نقرأ حالة أجواء البلدية المجاورة (صافية/غائمة/ممطرة) لإثراء الخبر.
 *  5. نلتقط البرق عبر كود الطقس (≥95).
 *  6. ندرس الطاقة الكامنة (CAPE) وكبح الحمل الحراري (CIN) للبلدية الهدف.
 */

import { getCurrentConvection } from './convection';
import { toArabicCommune } from './mauritaniaCommuneNamesAr';

const EARTH_RADIUS_KM = 6371;
const DEG2RAD = Math.PI / 180;

// موسم الأمطار في موريتانيا (يونيو→أكتوبر): حركة الخلايا غربية مع الموجات الشرقية
function isRainySeason() {
  const m = new Date().getMonth() + 1;
  return m >= 6 && m <= 10;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// الاتجاه (bearing) من نقطة إلى أخرى بالدرجات (0=شمال، 90=شرق)
function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * DEG2RAD;
  const φ2 = lat2 * DEG2RAD;
  const Δλ = (lon2 - lon1) * DEG2RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / DEG2RAD + 360) % 360;
}

// فرق زاوي مطلق بين اتجاهين (0-180)
function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// اسم الجهة العربية من درجة الاتجاه
function compassAr(deg) {
  const dirs = ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'];
  return dirs[Math.round(deg / 45) % 8];
}

// وصف حالة أجواء بلدية الهدف
function describeTargetSky({ isRaining, code }) {
  if (isRaining) return 'وتشهد أمطاراً بالفعل';
  if (code >= 95) return 'وأجواؤها رعدية';
  if (code >= 51) return 'وأجواؤها ممطرة';
  if (code >= 3) return 'وسماؤها ملبّدة بالغيوم (أرض مهيأة)';
  if (code >= 1) return 'وسماؤها غائمة جزئياً';
  return 'وسماؤها صافية حالياً';
}

/**
 * يولّد أخبار حركة خلايا المطر/البرق.
 * @returns Array<{ id, title, message, icon, color, tags }>
 */
export function buildRainMovementAlerts({ rainingNow, weatherData, maxAlerts = 4 }) {
  if (!rainingNow || rainingNow.length === 0) return [];
  if (!weatherData || weatherData.length === 0) return [];

  const byCity = new Map(weatherData.map((c) => [c.city, c]));
  const rainingSet = new Set(rainingNow.map((r) => r.city));

  // قائمة بلديات بإحداثيات (للبحث عن الهدف)
  const coordList = weatherData
    .map((c) => ({
      city: c.city,
      wilaya: c.wilaya || '',
      lat: c.latitude ?? c.lat,
      lon: c.longitude ?? c.lon,
    }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));

  // الخلايا المهمة — مع تحقّق متقاطع لتفادي بكسل رادار كاذب فوق منطقة صافية:
  //  • القوية (≥8): الرادار وحده كافٍ.
  //  • الخفيفة/المتوسطة (2–8): تُنشَر فقط إذا أكّدها النموذج (هطول/كود ماطر) أو شدة عالية.
  const cells = rainingNow
    .filter((r) => {
      const mmh = r.mmh ?? 0;
      if (mmh >= 8) return true;
      if (mmh < 2) return false;
      const src = byCity.get(r.city);
      if (!src) return mmh >= 6; // نقاط شبكة/IMERG بلا نموذج: نشترط شدة أعلى
      const code = src.current?.weather_code ?? 0;
      const precip = src.current?.precipitation ?? 0;
      return precip > 0 || code >= 51; // النموذج يؤكّد وجود مطر/سحب ماطرة
    })
    .slice(0, maxAlerts);

  const alerts = [];

  for (const cell of cells) {
    const src = byCity.get(cell.city);
    if (!src) continue;
    const lat = src.latitude ?? src.lat;
    const lon = src.longitude ?? src.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const windFrom = src.current?.wind_direction_10m;
    const windSpeed = Math.round(src.current?.wind_speed_10m ?? 0);
    const code = src.current?.weather_code ?? 0;
    const hasThunder = code >= 95 || cell.mmh >= 50;

    // اتجاه حركة الخلية:
    // في موسم الأمطار (يونيو→أكتوبر) تتحرك الخلايا غرباً/جنوب غربياً مع الموجات الشرقية
    // الإفريقية والتيار الشرقي العلوي — لا مع رياح السطح الموسمية (التي تهبّ نحو الشمال الشرقي).
    const rainy = isRainySeason();
    let target = null;
    let moveBearing = null;
    if (rainy) {
      moveBearing = 255; // غرب/جنوب غربي (حركة موسمية)
    } else if (Number.isFinite(windFrom)) {
      moveBearing = (windFrom + 180) % 360;
    }
    if (Number.isFinite(moveBearing)) {
      let best = null;
      for (const cand of coordList) {
        if (cand.city === cell.city) continue;
        const d = distanceKm(lat, lon, cand.lat, cand.lon);
        if (d < 8 || d > 90) continue; // ضمن نطاق معقول للحركة القريبة
        const b = bearingDeg(lat, lon, cand.lat, cand.lon);
        const ad = angleDiff(b, moveBearing);
        if (ad > 55) continue; // يجب أن تكون في مسار الحركة تقريباً
        const score = ad + d * 0.6; // الأقرب والأكثر محاذاة أفضل
        if (!best || score < best.score) best = { ...cand, d, score };
      }
      target = best;
    }

    const strong = cell.mmh >= 20 || hasThunder;
    const intensityWord = strong ? 'قوية' : 'خفيفة';
    const labelWord = cell.label || (strong ? 'غزيرة' : 'خفيفة');

    const cellAr = toArabicCommune(cell.city);
    const title = `${hasThunder ? '⛈️ عاصفة رعدية' : '🌧️ خلية مطرية'} قرب ${cellAr}`;

    let message = `رصدت الأقمار الصناعية (الرادار) أمطاراً ${labelWord} (${intensityWord}) فوق ${cellAr}${cell.wilaya ? ` بولاية ${cell.wilaya}` : ''}.`;
    if (hasThunder) message += `\n⚡ مصحوبة ببرق ورعد — يُرجى الحذر من الصواعق والأودية.`;

    if (target) {
      const targetAr = toArabicCommune(target.city);
      const tw = byCity.get(target.city);
      const tcode = tw?.current?.weather_code ?? 0;
      const sky = describeTargetSky({ isRaining: rainingSet.has(target.city), code: tcode });
      message += `\nتتحرك نحو ${compassAr(moveBearing)} وتتجه صوب ${targetAr}${target.wilaya && target.wilaya !== cell.wilaya ? ` (${target.wilaya})` : ''} على بُعد ~${Math.round(target.d)} كم ${sky}.`;
      // دراسة الطاقة الكامنة وكبح الحمل الحراري للبلدية الهدف
      const tConv = getCurrentConvection(tw);
      if (tConv) {
        if (tConv.primed) {
          message += `\n🔥 ${targetAr} تختزن طاقة كامنة ${tConv.level === 'extreme' ? 'شديدة' : 'عالية'} (CAPE ${Math.round(tConv.cape)}) — مرشحة لتطوّر العاصفة عند وصولها.`;
        } else if (tConv.level === 'suppressed') {
          message += `\nℹ️ ${targetAr} بها طاقة محبوسة بكبح حراري (CIN ${Math.round(tConv.cin)}) قد يحدّ من تطورها.`;
        }
      }
    } else if (Number.isFinite(moveBearing)) {
      message += rainy
        ? `\nاتجاه الحركة المرجّح نحو ${compassAr(moveBearing)} (حركة غربية موسمية مع الموجات الشرقية).`
        : `\nاتجاه الحركة المرجّح نحو ${compassAr(moveBearing)}${windSpeed ? ` (رياح ${windSpeed} كم/س)` : ''}.`;
    }

    alerts.push({
      id: `rain-move-${cell.city}`,
      title,
      message,
      icon: hasThunder ? '⚡' : '🌧️',
      color: hasThunder ? 'bg-red-800' : strong ? 'bg-blue-800' : 'bg-sky-700',
      tags: [
        hasThunder ? '🛰️ برق ورعد' : '🛰️ رادار مباشر',
        `${cell.mmh} mm/h`,
        target ? `صوب ${toArabicCommune(target.city)}` : 'خلية محلية',
      ].filter(Boolean),
    });
  }

  return alerts;
}
