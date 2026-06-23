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

// تقدير شدة المطر المتوقعة عند الوجهة حسب تأهّل أجوائها (CAPE/CIN)
function expectedRainAtTarget(name, conv) {
  const cape = Math.round(conv.cape || 0);
  switch (conv.level) {
    case 'extreme':
      return `🔥 أجواء ${name} مهيأة لمطر غزير ورعدي عند وصولها (CAPE ${cape}).`;
    case 'high':
      return `🔥 أجواء ${name} مهيأة لمطر متوسط إلى غزير عند وصولها (CAPE ${cape}).`;
    case 'moderate':
      return `أجواء ${name} تؤهّل لمطر متوسط إن وصلها (CAPE ${cape}).`;
    case 'suppressed':
      return `ℹ️ ${name} بها كبح حراري (CIN ${Math.round(conv.cin || 0)}) قد يحدّ من المطر.`;
    default:
      return `أجواء ${name} لا تؤهّل إلا لمطر خفيف إن وصلها (CAPE ${cape}).`;
  }
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
  // كتل سحب Meteosat كلها حقيقية (قمم باردة مرصودة) — لا حاجة لتحقّق ضد ضجيج الرادار
  const valid = tracks.filter((t) => (t.mmh ?? 0) >= 4);

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
    // قمة شديدة البرودة (mmh التقديري ≥20) = عاصفة رعدية مرجّحة
    const hasThunder = mmh >= 20;
    const strong = mmh >= 20;
    const labelWord = mmh >= 20 ? 'كثيفة جداً' : mmh >= 8 ? 'كثيفة' : 'متوسطة';

    // الاتجاه: المسار الحقيقي المرصود إن توفّر، وإلا الحركة الغربية الموسمية
    let moveBearing = Number.isFinite(t.heading) ? t.heading : (rainy ? 255 : null);

    // البحث عن البلدية الهدف في مسار الحركة — مع دراسة أجواء الجيران:
    // العاصفة تميل/تتسع نحو الجار الأعلى طاقة كامنة (CAPE) ضمن قطاع الحركة.
    let target = null;
    if (Number.isFinite(moveBearing)) {
      let best = null;
      for (const cand of coordList) {
        if (cand.city === rep.city) continue;
        const d = distanceKm(lat, lon, cand.lat, cand.lon);
        if (d < 8 || d > 110) continue;
        const ad = angleDiff(bearingDeg(lat, lon, cand.lat, cand.lon), moveBearing);
        if (ad > 55) continue;
        const conv = getCurrentConvection(byCity.get(cand.city));
        const capeBonus = conv ? Math.min(conv.cape || 0, 2500) / 120 : 0; // ميل نحو عدم الاستقرار
        const score = ad + d * 0.6 - capeBonus;
        if (!best || score < best.score) best = { ...cand, d, score, conv };
      }
      target = best;
    }

    // حالة المتابعة الزمنية
    const ageMin = Math.round((now - t.firstSeen) / 60000);
    let status;
    if ((t.missing || 0) > 0) status = 'بدأت بالتلاشي';
    else if (ageMin < 6) status = 'خلية جديدة';
    else status = `متابَعة منذ ${ageMin} دقيقة`;

    const title = `${hasThunder ? '⛈️ عاصفة رعدية' : '🌩️ سحب رعدية'} ${sep} ${cellAr}`;
    let message = `سحب رعدية ${labelWord} فوق ${cellAr}${rep.wilaya ? ` (${rep.wilaya})` : ''} — ${status}.`;

    // بيانات منظّمة للعرض الجميل
    const data = {
      location: cellAr,
      wilaya: rep.wilaya || '',
      intensity: labelWord,
      isStorm: hasThunder,
      status,
      movement: null,
    };

    if (target) {
      const targetAr = toArabicCommune(target.city);
      const tw = byCity.get(target.city);
      const tcode = tw?.current?.weather_code ?? 0;
      const sky = describeTargetSky({ isRaining: rainingSet.has(target.city), code: tcode });
      const tw2 = target.wilaya && target.wilaya !== rep.wilaya ? ` (${target.wilaya})` : '';
      const targetDir = compassAr(bearingDeg(lat, lon, target.lat, target.lon));
      const moveVerb = t.speed
        ? `تتحرك نحو ${targetDir} بسرعة ~${t.speed} كم/س`
        : `يُرجّح تحركها نحو ${targetDir} (تقدير موسمي)`;
      message += `\n${moveVerb} صوب ${targetAr}${tw2} على بُعد ~${Math.round(target.d)} كم ${sky}.`;
      const tConv = target.conv || getCurrentConvection(tw);
      const expectation = tConv ? expectedRainAtTarget(targetAr, tConv) : null;
      if (expectation) message += `\n${expectation}`;
      data.movement = {
        dir: targetDir,
        speed: t.speed || null,
        target: targetAr,
        targetWilaya: target.wilaya && target.wilaya !== rep.wilaya ? target.wilaya : '',
        distance: Math.round(target.d),
        sky,
        expectation,
        isMeasured: Boolean(t.speed),
      };
    } else if (Number.isFinite(moveBearing)) {
      const dir = compassAr(moveBearing);
      message += t.speed
        ? `\nتتحرك نحو ${dir} بسرعة ~${t.speed} كم/س.`
        : `\nيُرجّح اتجاهها نحو ${dir} (تقدير موسمي).`;
      data.movement = { dir, speed: t.speed || null, target: null, isMeasured: Boolean(t.speed) };
    }

    alerts.push({
      id: `track-${t.id}`,
      title,
      message,
      data,
      icon: hasThunder ? '⚡' : '🌧️',
      color: hasThunder ? 'bg-red-800' : strong ? 'bg-blue-800' : 'bg-sky-700',
      tags: [
        '🛰️ تتبّع حيّ بالأقمار',
        status,
        target ? `صوب ${toArabicCommune(target.city)}` : 'محلية',
      ].filter(Boolean),
    });
  }

  return alerts;
}
