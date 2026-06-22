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
export function buildRainMovementAlerts({ tracks, weatherData, maxAlerts = 7 }) {
  if (!tracks || tracks.length === 0) return [];
  if (!weatherData || weatherData.length === 0) return [];

  const byCity = new Map(weatherData.map((c) => [c.city, c]));
  const now = Date.now();
  const rainy = isRainySeason();

  // كل البلديات التي تمطر الآن (لوصف سماء الهدف)
  const rainingSet = new Set();
  tracks.forEach((t) => (t.cities || []).forEach((m) => rainingSet.add(m.city)));

  const coordList = weatherData
    .map((c) => ({ city: c.city, wilaya: c.wilaya || '', lat: c.latitude ?? c.lat, lon: c.longitude ?? c.lon }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));

  // تصفية الخلايا الموثوقة (تفادي بكسل كاذب معزول عابر):
  //  قوية، أو متماسكة مكانياً (≥نقطتين)، أو استمرّت عبر الإطارات، أو يؤكّدها النموذج.
  const valid = tracks.filter((t) => {
    const mmh = t.mmh ?? 0;
    if (mmh >= 8) return true;
    if ((t.cities?.length || 1) >= 2) return true;
    if ((t.path?.length || 1) >= 2) return true; // رُصدت في أكثر من إطار
    const rep = t.cities?.[0];
    const src = rep && byCity.get(rep.city);
    if (!src) return false;
    const code = src.current?.weather_code ?? 0;
    const precip = src.current?.precipitation ?? 0;
    return precip > 0 || code >= 51;
  });

  const sorted = valid.sort((a, b) => (b.mmh || 0) - (a.mmh || 0)).slice(0, maxAlerts);
  const alerts = [];

  for (const t of sorted) {
    const rep = t.cities?.[0] || {};
    const cellAr = toArabicCommune(rep.city);
    // مسمّى الشبكة يحوي مسافة "(~كم)" → نستخدم فاصلة بدل "قرب" تفادياً لـ"قرب ... (~كم)"
    const sep = /~\d+كم/.test(cellAr) ? '—' : 'قرب';
    const lat = t.lat, lon = t.lon;
    const mmh = t.mmh || 0;

    const repSrc = byCity.get(rep.city);
    const code = repSrc?.current?.weather_code ?? 0;
    const hasThunder = code >= 95 || mmh >= 50;
    const strong = mmh >= 20 || hasThunder;
    const labelWord = mmh >= 20 ? 'غزيرة' : mmh >= 8 ? 'متوسطة' : 'خفيفة';

    // الاتجاه: المسار الحقيقي المرصود إن توفّر، وإلا الحركة الغربية الموسمية
    let moveBearing = Number.isFinite(t.heading) ? t.heading : (rainy ? 255 : null);

    // البحث عن البلدية الهدف في مسار الحركة
    let target = null;
    if (Number.isFinite(moveBearing)) {
      let best = null;
      for (const cand of coordList) {
        if (cand.city === rep.city) continue;
        const d = distanceKm(lat, lon, cand.lat, cand.lon);
        if (d < 8 || d > 110) continue;
        const ad = angleDiff(bearingDeg(lat, lon, cand.lat, cand.lon), moveBearing);
        if (ad > 55) continue;
        const score = ad + d * 0.6;
        if (!best || score < best.score) best = { ...cand, d, score };
      }
      target = best;
    }

    // حالة المتابعة الزمنية
    const ageMin = Math.round((now - t.firstSeen) / 60000);
    let status;
    if ((t.missing || 0) > 0) status = 'بدأت بالتلاشي';
    else if (ageMin < 6) status = 'خلية جديدة';
    else status = `متابَعة منذ ${ageMin} دقيقة`;

    const title = `${hasThunder ? '⛈️ عاصفة رعدية' : '🌧️ خلية مطرية'} ${sep} ${cellAr}`;
    let message = `رصد متواصل: أمطار ${labelWord} فوق ${cellAr}${rep.wilaya ? ` (${rep.wilaya})` : ''} — ${status}.`;
    if (hasThunder) message += `\n⚡ مصحوبة ببرق ورعد — احذر الصواعق والأودية.`;

    if (target) {
      const targetAr = toArabicCommune(target.city);
      const tw = byCity.get(target.city);
      const tcode = tw?.current?.weather_code ?? 0;
      const sky = describeTargetSky({ isRaining: rainingSet.has(target.city), code: tcode });
      const speedTxt = t.speed ? ` بسرعة ~${t.speed} كم/س` : '';
      message += `\nتتحرك نحو ${compassAr(moveBearing)}${speedTxt} وتتجه صوب ${targetAr}${target.wilaya && target.wilaya !== rep.wilaya ? ` (${target.wilaya})` : ''} على بُعد ~${Math.round(target.d)} كم ${sky}.`;
      const tConv = getCurrentConvection(tw);
      if (tConv) {
        if (tConv.primed) {
          message += `\n🔥 ${targetAr} تختزن طاقة كامنة ${tConv.level === 'extreme' ? 'شديدة' : 'عالية'} (CAPE ${Math.round(tConv.cape)}) — مرشحة لتطوّر العاصفة عند وصولها.`;
        } else if (tConv.level === 'suppressed') {
          message += `\nℹ️ ${targetAr} بها طاقة محبوسة بكبح حراري (CIN ${Math.round(tConv.cin)}) قد يحدّ من تطورها.`;
        }
      }
    } else if (Number.isFinite(moveBearing)) {
      const speedTxt = t.speed ? ` (~${t.speed} كم/س)` : '';
      message += `\nاتجاه الحركة نحو ${compassAr(moveBearing)}${speedTxt}.`;
    }

    alerts.push({
      id: `track-${t.id}`,
      title,
      message,
      icon: hasThunder ? '⚡' : '🌧️',
      color: hasThunder ? 'bg-red-800' : strong ? 'bg-blue-800' : 'bg-sky-700',
      tags: [
        hasThunder ? '🛰️ برق ورعد' : '🛰️ رصد متواصل',
        `${mmh} mm/h`,
        status,
        target ? `صوب ${toArabicCommune(target.city)}` : 'خلية محلية',
      ].filter(Boolean),
    });
  }

  return alerts;
}
