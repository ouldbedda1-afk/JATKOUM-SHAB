/**
 * تحليل عدم الاستقرار الجوي (إمكان الحمل الحراري / العواصف).
 *
 * المؤشرات (من Open-Meteo، بيانات ساعية):
 *  - CAPE: الطاقة الكامنة المتاحة للحمل الحراري (J/kg) — كلما زادت زاد احتمال العواصف.
 *  - CIN (convective_inhibition): كبح الحمل الحراري (J/kg) — قيمة عالية تمنع تكوّن العواصف ("غطاء").
 *  - Lifted Index: مؤشر الرفع — كلما زاد سلبيةً زاد عدم الاستقرار.
 */

// يجلب قيم الحمل الحراري للساعة الأقرب للآن من بيانات المدينة
export function getCurrentConvection(city) {
  const times = city?.hourly?.time;
  if (!Array.isArray(times) || times.length === 0) return null;

  const now = Date.now();
  let idx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - now);
    if (diff < bestDiff) { bestDiff = diff; idx = i; }
  }

  const cape = city.hourly?.cape?.[idx];
  const cin = city.hourly?.convective_inhibition?.[idx];
  const li = city.hourly?.lifted_index?.[idx];
  if (cape == null && li == null) return null;

  return {
    cape: cape ?? null,
    cin: cin ?? null,
    li: li ?? null,
    ...assessConvection(cape, cin, li),
  };
}

/**
 * يقيّم مستوى عدم الاستقرار.
 * @returns { level, label, primed, score }
 *   level: 'extreme' | 'high' | 'moderate' | 'low' | 'suppressed'
 *   primed: هل الأجواء مهيأة فعلاً للعواصف (طاقة كافية + كبح منخفض)
 */
export function assessConvection(cape, cin, li) {
  const c = Number.isFinite(cape) ? cape : 0;
  const inhib = Number.isFinite(cin) ? cin : 0;
  const lift = Number.isFinite(li) ? li : 0;

  // كبح قوي جداً يمنع العواصف رغم وجود طاقة ("غطاء حراري")
  const stronglyCapped = inhib >= 250 && c < 2500;

  let level = 'low';
  if (c >= 2500 || lift <= -7) level = 'extreme';
  else if (c >= 1500 || lift <= -5) level = 'high';
  else if (c >= 700 || lift <= -2) level = 'moderate';

  if (stronglyCapped && (level === 'high' || level === 'moderate')) {
    level = 'suppressed';
  }

  const labels = {
    extreme: 'عدم استقرار شديد جداً',
    high: 'عدم استقرار عالٍ',
    moderate: 'عدم استقرار متوسط',
    low: 'استقرار نسبي',
    suppressed: 'طاقة محبوسة (غطاء حراري)',
  };

  const primed = (level === 'extreme' || level === 'high') && !stronglyCapped;

  const score =
    Math.min(c, 4000) / 40 + // CAPE → 0..100
    Math.max(0, -lift) * 6 - // كل درجة سالبة من LI
    Math.min(inhib, 400) / 8; // الكبح يخصم

  return { level, label: labels[level], primed, score: Math.round(score) };
}

/**
 * يمسح كل البلديات بحثاً عن أجواء مهيأة للعواصف (طاقة عالية + كبح منخفض).
 * يُستخدم للتنبؤ بالعواصف قبل ظهور المطر على الرادار.
 * @returns { items: [{city, wilaya, cape, li, level}], count } أو null
 */
export function buildConvectiveWatch({ weatherData, maxItems = 5 }) {
  if (!weatherData || weatherData.length === 0) return null;

  const primed = [];
  for (const c of weatherData) {
    const conv = getCurrentConvection(c);
    if (!conv || !conv.primed) continue;
    primed.push({
      city: c.city,
      wilaya: c.wilaya || '',
      cape: conv.cape,
      li: conv.li,
      level: conv.level,
      score: conv.score,
    });
  }

  if (primed.length === 0) return null;
  primed.sort((a, b) => b.score - a.score);
  return { items: primed.slice(0, maxItems), count: primed.length };
}

// وصف مختصر لإدراجه في الأخبار
export function convectionPhrase(conv) {
  if (!conv) return '';
  if (conv.level === 'extreme') return `الطاقة الكامنة شديدة (CAPE ${Math.round(conv.cape)}) — أجواء مهيأة لعواصف قوية`;
  if (conv.level === 'high') return `الطاقة الكامنة عالية (CAPE ${Math.round(conv.cape)}) — مرشحة لتطور العواصف`;
  if (conv.level === 'suppressed') return `طاقة موجودة لكنها محبوسة بكبح حراري (CIN ${Math.round(conv.cin)})`;
  if (conv.level === 'moderate') return `طاقة كامنة متوسطة`;
  return '';
}
