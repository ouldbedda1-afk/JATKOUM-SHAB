import { normalizeMauritaniaWilayaName, compareMauritaniaWilayaAdminOrder } from './mauritaniaPlaceNames';

/* ── تصنيف شدة المطر ── */
export function rainLevel(mm) {
  if (mm >= 20) return 'غزيرة جداً';
  if (mm >= 10) return 'غزيرة';
  if (mm >= 5)  return 'متوسطة';
  if (mm >= 1)  return 'ضعيفة';
  return null;
}

/* ── هل نحن في موسم الأمطار (يونيو-أكتوبر) ── */
export function isRainySeason(dateStr) {
  const m = new Date(dateStr).getMonth() + 1;
  return m >= 6 && m <= 10;
}

/* تسمية العرض لكل مستوى مطر — نستخدم نفس المقياس (كمية المطر) لتصنيف
   العواصف الرعدية أيضاً، بدل مقياس منفصل (شديدة/متوسطة) مبني على كود الطقس */
const LEVEL_LABEL = {
  'غزيرة جداً': 'غزيرة جداً',
  'غزيرة':      'غزيرة',
  'متوسطة':     'متوسطة',
  'ضعيفة':      'خفيفة',
};
const LEVEL_ORDER = ['غزيرة جداً', 'غزيرة', 'متوسطة', 'ضعيفة', null];

/** يقسّم مقاطعات العواصف الرعدية حسب كمية المطر (نفس مقياس rainLevel) */
export function groupThunderByLevel(items) {
  const buckets = new Map();
  (items || []).forEach(item => {
    const key = item.level || null;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  });
  return LEVEL_ORDER
    .filter(level => buckets.has(level))
    .map(level => ({
      level,
      label: level ? LEVEL_LABEL[level] : 'جافة',
      items: buckets.get(level),
    }));
}

/**
 * يبني توزيع التوقعات لكل يوم (حتى 3 أيام قادمة) مقسّماً حسب الولاية.
 * هذه هي نفس البيانات التي تُعرض في بطاقة "النشرة الجوية" على الصفحة الرئيسية،
 * ويُعاد استخدامها حرفياً في صفحة تفاصيل الولاية حتى تكون امتداداً مباشراً للبطاقة.
 */
export function buildForecastDays(cities, satelliteSet = new Set()) {
  const map = {};

  (cities || []).forEach(city => {
    const dates = city.daily?.time               || [];
    const codes = city.daily?.weather_code       || [];
    const rains = city.daily?.precipitation_sum  || [];
    const winds = city.daily?.wind_speed_10m_max || [];

    const todayStr = new Date().toISOString().slice(0, 10);
    let count = 0;
    for (let i = 0; i < dates.length && count < 3; i++) {
      if (!dates[i] || dates[i] <= todayStr) continue;
      count++;
      const dateStr = dates[i];
      if (!map[dateStr]) {
        map[dateStr] = {
          dateStr,
          wilayas: {},
        };
      }
      const d    = map[dateStr];
      const code = codes[i] ?? 0;
      const mm   = rains[i] ?? 0;
      const w    = winds[i] ?? 0;
      const confirmed = satelliteSet.has(city.city);
      const wilayaKey = normalizeMauritaniaWilayaName(city.wilaya) || 'مناطق أخرى';

      if (!d.wilayas[wilayaKey]) {
        d.wilayas[wilayaKey] = {
          wilaya: wilayaKey,
          thunder: [],
          heavy: [],
          moderate: [],
          weak: [],
          wind: [],
        };
      }

      const wilayaForecast = d.wilayas[wilayaKey];

      if (code >= 95) {
        let rainDesc;
        if (isRainySeason(dateStr)) {
          rainDesc = mm >= 10 ? 'مصحوبة بأمطار غزيرة' : 'مصحوبة بأمطار';
        } else {
          rainDesc = mm >= 5 ? 'مصحوبة بأمطار غزيرة'
                   : mm >= 1 ? 'مصحوبة بأمطار'
                   : 'جافة (صواعق ورياح)';
        }
        wilayaForecast.thunder.push({ city: city.city, rainDesc, level: rainLevel(mm), confirmed });
      } else if (mm >= 1 || code >= 61) {
        const lvl = rainLevel(mm);
        if (lvl === 'غزيرة جداً' || lvl === 'غزيرة') wilayaForecast.heavy.push({ city: city.city, confirmed });
        else if (lvl === 'متوسطة')                    wilayaForecast.moderate.push({ city: city.city, confirmed });
        else if (lvl === 'ضعيفة')                     wilayaForecast.weak.push({ city: city.city, confirmed });
      }
      if (w > 55) wilayaForecast.wind.push({ city: city.city, w: Math.round(w) });
    }
  });

  return Object.values(map)
    .map((day) => ({
      ...day,
      forecasts: Object.values(day.wilayas)
        .filter(
          (forecast) =>
            forecast.thunder.length > 0 ||
            forecast.heavy.length > 0 ||
            forecast.moderate.length > 0 ||
            forecast.weak.length > 0 ||
            forecast.wind.length > 0
        )
        .sort((a, b) => compareMauritaniaWilayaAdminOrder(a.wilaya, b.wilaya)),
    }))
    .sort((a, b) => new Date(a.dateStr) - new Date(b.dateStr))
    .slice(0, 3);
}
