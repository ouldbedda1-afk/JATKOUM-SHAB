import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWeatherContext } from '../WeatherContext';
import { requestNotificationPermission, sendLocalNotification } from '../pwa';
import {
  compareMauritaniaWilayaAdminOrder,
  normalizeMauritaniaWilayaName,
  OFFICIAL_MAURITANIA_WILAYA_ORDER,
} from '../mauritaniaPlaceNames';

/* ── تنسيق التواريخ والأوقات بالأحرف اللاتينية فقط ── */
function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}
function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dayName(dateStr) {
  return DAYS_AR[new Date(dateStr).getDay()];
}

function formatShortList(items, limit = 4) {
  const uniqueItems = [...new Set((items || []).filter(Boolean))];
  if (uniqueItems.length === 0) return '';
  if (uniqueItems.length <= limit) return uniqueItems.join('، ');
  return `${uniqueItems.slice(0, limit).join('، ')}، وغيرها`;
}

function uniqueByCity(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = item?.city;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRainCoverageLevel(affectedCities, affectedWilayas, totalCities) {
  if (affectedWilayas >= 5 || affectedCities >= Math.max(8, Math.ceil(totalCities * 0.35))) {
    return 'wide';
  }
  if (affectedWilayas >= 3 || affectedCities >= 4) {
    return 'regional';
  }
  return 'local';
}

function buildLocalAreaLabel(wilayas, cityNames) {
  if ((wilayas || []).length === 1) {
    return `في أجزاء من ${wilayas[0]}`;
  }
  if ((wilayas || []).length > 1) {
    return `على نطاق محلي بين ${formatShortList(wilayas, 3)}`;
  }
  if ((cityNames || []).length > 0) {
    return `حول ${formatShortList(cityNames, 3)}`;
  }
  return 'على نطاق محلي';
}

function getWindDirectionArrow(degrees) {
  if (degrees === undefined || degrees === null) return '';
  if (degrees >= 337.5 || degrees < 22.5) return '↑';
  if (degrees < 67.5) return '↗';
  if (degrees < 112.5) return '→';
  if (degrees < 157.5) return '↘';
  if (degrees < 202.5) return '↓';
  if (degrees < 247.5) return '↙';
  if (degrees < 292.5) return '←';
  return '↖';
}

const WILAYA_THEMES = [
  { bar: 'from-sky-500 to-blue-700', accent: 'text-sky-900', badge: 'bg-sky-50 text-sky-800 border-sky-200', metric: 'bg-sky-50 text-sky-900 border-sky-100' },
  { bar: 'from-blue-500 to-indigo-700', accent: 'text-blue-900', badge: 'bg-blue-50 text-blue-800 border-blue-200', metric: 'bg-blue-50 text-blue-900 border-blue-100' },
  { bar: 'from-cyan-500 to-sky-700', accent: 'text-cyan-900', badge: 'bg-cyan-50 text-cyan-800 border-cyan-200', metric: 'bg-cyan-50 text-cyan-900 border-cyan-100' },
  { bar: 'from-slate-500 to-blue-700', accent: 'text-slate-900', badge: 'bg-slate-50 text-slate-800 border-slate-200', metric: 'bg-slate-50 text-slate-900 border-slate-100' },
  { bar: 'from-sky-400 to-cyan-700', accent: 'text-sky-900', badge: 'bg-sky-50 text-sky-800 border-sky-200', metric: 'bg-sky-50 text-sky-900 border-sky-100' },
  { bar: 'from-indigo-500 to-blue-700', accent: 'text-indigo-900', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200', metric: 'bg-indigo-50 text-indigo-900 border-indigo-100' },
  { bar: 'from-blue-400 to-slate-700', accent: 'text-blue-900', badge: 'bg-blue-50 text-blue-800 border-blue-200', metric: 'bg-blue-50 text-blue-900 border-blue-100' },
  { bar: 'from-cyan-400 to-blue-700', accent: 'text-cyan-900', badge: 'bg-cyan-50 text-cyan-800 border-cyan-200', metric: 'bg-cyan-50 text-cyan-900 border-cyan-100' },
  { bar: 'from-slate-400 to-sky-700', accent: 'text-slate-900', badge: 'bg-slate-50 text-slate-800 border-slate-200', metric: 'bg-slate-50 text-slate-900 border-slate-100' },
  { bar: 'from-sky-500 to-indigo-700', accent: 'text-sky-900', badge: 'bg-sky-50 text-sky-800 border-sky-200', metric: 'bg-sky-50 text-sky-900 border-sky-100' },
  { bar: 'from-blue-500 to-slate-700', accent: 'text-blue-900', badge: 'bg-blue-50 text-blue-800 border-blue-200', metric: 'bg-blue-50 text-blue-900 border-blue-100' },
  { bar: 'from-cyan-500 to-indigo-700', accent: 'text-cyan-900', badge: 'bg-cyan-50 text-cyan-800 border-cyan-200', metric: 'bg-cyan-50 text-cyan-900 border-cyan-100' },
  { bar: 'from-slate-500 to-indigo-700', accent: 'text-slate-900', badge: 'bg-slate-50 text-slate-800 border-slate-200', metric: 'bg-slate-50 text-slate-900 border-slate-100' },
  { bar: 'from-sky-500 to-slate-700', accent: 'text-sky-900', badge: 'bg-sky-50 text-sky-800 border-sky-200', metric: 'bg-sky-50 text-sky-900 border-sky-100' },
  { bar: 'from-blue-500 to-cyan-700', accent: 'text-blue-900', badge: 'bg-blue-50 text-blue-800 border-blue-200', metric: 'bg-blue-50 text-blue-900 border-blue-100' },
];

const WILAYA_THEME_MAP = Object.fromEntries(
  OFFICIAL_MAURITANIA_WILAYA_ORDER.map((wilaya, index) => [wilaya, WILAYA_THEMES[index]])
);

function getWilayaTheme(wilaya) {
  return WILAYA_THEME_MAP[normalizeMauritaniaWilayaName(wilaya)] || WILAYA_THEMES[0];
}

function getForecastHeadline(forecast) {
  if (forecast.thunder.length > 0) return 'احتمال عواصف رعدية وأمطار';
  if (forecast.heavy.length > 0) return 'فرصة أمطار غزيرة';
  if (forecast.moderate.length > 0) return 'فرصة أمطار متوسطة';
  if (forecast.weak.length > 0) return 'فرصة أمطار خفيفة';
  if (forecast.wind.length > 0) return 'نشاط رياح ملحوظ';
  return 'لا مؤشرات بارزة';
}

function getForecastMetrics(forecast) {
  const metrics = [];
  if (forecast.thunder.length > 0) metrics.push({ icon: '⚡', label: 'رعدية', value: forecast.thunder.length });
  if (forecast.heavy.length > 0) metrics.push({ icon: '🌧️', label: 'غزيرة', value: forecast.heavy.length });
  if (forecast.moderate.length > 0) metrics.push({ icon: '🌦️', label: 'متوسطة', value: forecast.moderate.length });
  if (forecast.weak.length > 0) metrics.push({ icon: '🌂', label: 'ضعيفة', value: forecast.weak.length });
  if (forecast.wind.length > 0) {
    metrics.push({
      icon: '🌬️',
      label: 'أقصى رياح',
      value: `${Math.max(...forecast.wind.map((item) => item.w))} كم/س`,
    });
  }
  return metrics.slice(0, 5);
}

function getAverageWindDirection(entries, cities) {
  const cityByName = new Map((cities || []).map((city) => [city.city, city]));
  const values = (entries || [])
    .map((entry) => cityByName.get(entry.city)?.current?.wind_direction_10m)
    .filter((value) => value !== undefined && value !== null && !Number.isNaN(value));

  if (values.length === 0) return null;

  const vector = values.reduce(
    (acc, degrees) => {
      const radians = (degrees * Math.PI) / 180;
      acc.x += Math.cos(radians);
      acc.y += Math.sin(radians);
      return acc;
    },
    { x: 0, y: 0 }
  );

  const angle = (Math.atan2(vector.y, vector.x) * 180) / Math.PI;
  return (angle + 360) % 360;
}

function getLikelyTargetWilaya(primaryWilaya, direction) {
  if (direction === null || direction === undefined || !primaryWilaya) return '';

  const eastward = direction >= 67.5 && direction < 157.5;
  const southeastward = direction >= 112.5 && direction < 202.5;
  const southward = direction >= 157.5 && direction < 247.5;

  if (primaryWilaya === 'الحوض الغربي') {
    if (eastward || southeastward) return 'العصابة';
    if (southward) return 'كيدماغا';
  }
  if (primaryWilaya === 'الحوض الشرقي' && southward) return 'كيدماغا';
  if (primaryWilaya === 'العصابة' && southward) return 'كوركول';
  if (primaryWilaya === 'كوركول' && eastward) return 'كيدماغا';

  return '';
}

function getPotentialRainPaths(cities, hoursAhead = 9) {
  if (!cities || cities.length === 0) return [];

  const now = new Date();
  const paths = [];

  cities.forEach((city) => {
    if (!city?.hourly?.time) return;

    const hourly = city.hourly;
    const windows = [];
    let futureHoursCount = 0;

    for (let i = 0; i < hourly.time.length && futureHoursCount < hoursAhead; i++) {
      const time = new Date(hourly.time[i]);
      if (time < now) continue;
      futureHoursCount += 1;

      const precipProb = hourly.precipitation_probability?.[i] ?? 0;
      const windSpeed = hourly.wind_speed_10m?.[i] ?? city.current?.wind_speed_10m ?? 0;
      const weatherCode = hourly.weather_code?.[i] ?? city.current?.weather_code ?? 0;
      const windDir = hourly.wind_direction_10m?.[i] ?? city.current?.wind_direction_10m ?? null;
      const isStormy = weatherCode >= 95 || (precipProb >= 65 && windSpeed >= 28);
      const isRainy = weatherCode >= 61 || precipProb >= 40;

      if (isStormy || isRainy || precipProb >= 25 || (weatherCode >= 2 && windSpeed >= 18)) {
        windows.push({
          precipProb,
          windSpeed,
          windDir,
          isStormy,
          isRainy,
          activityScore:
            precipProb +
            Math.min(windSpeed, 40) +
            (isStormy ? 30 : 0) +
            (isRainy ? 15 : 0) +
            (weatherCode >= 2 ? 10 : 0),
        });
      }
    }

    if (windows.length === 0) return;

    const avgWindDir = windows
      .filter((item) => item.windDir !== null)
      .reduce((acc, item, _, arr) => acc + item.windDir / arr.length, 0);

    paths.push({
      city: city.city,
      wilaya: city.wilaya || '',
      windDir: avgWindDir || null,
      maxPrecipProb: Math.max(...windows.map((item) => item.precipProb)),
      windSpeed: Math.round(windows.reduce((acc, item) => acc + item.windSpeed, 0) / windows.length),
      isStormy: windows.some((item) => item.isStormy),
      isRainy: windows.some((item) => item.isRainy),
      activityScore: Math.max(...windows.map((item) => item.activityScore)),
    });
  });

  return paths.sort((a, b) => {
    const score = (item) =>
      (item.isStormy ? 100 : 0) + (item.isRainy ? 50 : 0) + item.maxPrecipProb + item.activityScore;
    return score(b) - score(a);
  });
}

function buildCurrentRainNarrative({ rainingNow, modelRainingNow, cities }) {
  const liveEntries = uniqueByCity(rainingNow);
  if (liveEntries.length === 0) return null;

  const cityNames = liveEntries.map((entry) => entry.city);
  const wilayas = [...new Set(liveEntries.map((entry) => entry.wilaya).filter(Boolean))];
  const totalCities = cities?.length || 0;
  const coverage = getRainCoverageLevel(cityNames.length, wilayas.length, totalCities);
  const sourceLabel = 'الرادار والأقمار الصناعية';
  const sourceChip = 'رادار مباشر';
  const topLabel = liveEntries[0]?.label || 'أمطار';
  const averageDirection = getAverageWindDirection(liveEntries, cities);
  const directionArrow = getWindDirectionArrow(averageDirection);
  const primaryWilaya = wilayas[0] || '';
  const targetWilaya = getLikelyTargetWilaya(primaryWilaya, averageDirection);
  const movementText = targetWilaya
    ? ` وتتجه صوب ${targetWilaya}`
    : averageDirection != null
      ? ` مع حركة مرجحة ${directionArrow || ''}`.trimEnd()
      : '';
  const areasText = cityNames.join('، ');

  if (coverage === 'wide') {
    return {
      coverage,
      title: 'رصد اليوم: حالة مطرية واسعة',
      summary: `${sourceLabel} تُظهر حالة مطرية على عدة ولايات من موريتانيا حالياً، مع نشاط ظاهر في ${formatShortList(
        wilayas,
        5
      )}.`,
      details: `المؤشرات الحالية ظهرت في: ${areasText}. هذا يعني أن الحالة ليست محصورة في نقطة واحدة، بل تشمل ${cityNames.length} مقاطعات على الأقل ضمن نطاق متابعة اليوم.`,
      chips: ['على عدة ولايات', sourceChip, `${cityNames.length} مقاطعات`, topLabel, targetWilaya ? `صوب ${targetWilaya}` : null].filter(Boolean),
    };
  }

  if (coverage === 'regional') {
    return {
      coverage,
      title: 'رصد اليوم: نشاط مطري على عدة مناطق',
      summary: `${sourceLabel} تُظهر أمطاراً أو سحباً ماطرة على أجزاء متفرقة من ${formatShortList(
        wilayas,
        4
      )}${movementText}، مع تأثر ${cityNames.length} مقاطعات حتى الآن.`,
      details: `المؤشرات الحالية ظهرت في: ${areasText}. الحالة ليست على عموم الخريطة الموريتانية، لكنها تتجاوز نطاق الخلية المحلية الواحدة وتستحق المتابعة المباشرة.`,
      chips: ['عدة مناطق', sourceChip, `${cityNames.length} مقاطعات`, topLabel, targetWilaya ? `صوب ${targetWilaya}` : null].filter(Boolean),
    };
  }

  return {
    coverage,
    title: 'رصد اليوم: حالة مطرية محلية',
    summary: `${sourceLabel} تُظهر خلايا أو غيوماً ماطرة محلية ${buildLocalAreaLabel(
      wilayas,
      cityNames
    )}${movementText}.`,
    details: `المؤشرات الحالية ظهرت في: ${areasText}${wilayas.length > 0 ? ` ضمن ${formatShortList(wilayas, 3)}` : ''}. ستظهر كل منطقة مرصودة في الصفحة الرئيسية ما دامت المؤشرات قائمة.`,
    chips: ['حالة محلية', sourceChip, `${cityNames.length} مقاطعات`, topLabel, targetWilaya ? `صوب ${targetWilaya}` : null].filter(Boolean),
  };
}

/* ── تصنيف شدة المطر ── */
function rainLevel(mm) {
  if (mm >= 20) return 'غزيرة جداً';
  if (mm >= 10) return 'غزيرة';
  if (mm >= 5)  return 'متوسطة';
  if (mm >= 1)  return 'ضعيفة';
  return null;
}

function getForecastBucketPriority(bucket) {
  switch (bucket) {
    case 'thunder':
      return 5;
    case 'heavy':
      return 4;
    case 'moderate':
      return 3;
    case 'weak':
      return 2;
    case 'wind':
      return 1;
    default:
      return 0;
  }
}

function getWilayaForecastScore(forecast) {
  return (
    (forecast?.thunder?.length || 0) * 100 +
    (forecast?.heavy?.length || 0) * 60 +
    (forecast?.moderate?.length || 0) * 30 +
    (forecast?.weak?.length || 0) * 10 +
    (forecast?.wind?.length || 0) * 5
  );
}

/* موسم الأمطار في موريتانيا: يونيو → أكتوبر
   العواصف الرعدية في هذه الفترة دائماً مصحوبة بأمطار (ITCZ) */
function isRainySeason(dateStr) {
  const m = new Date(dateStr).getMonth() + 1; // 1-12
  return m >= 6 && m <= 10;
}

/* ══════════════════════════════════════════
   مكوّن النشرة الجوية الرسمية (3 أيام موحدة)
══════════════════════════════════════════ */
function WeatherBulletin({ cities, rainingNow, sameDayRainEvents, modelRainingNow }) {
  const [isTodayObservationFlashing, setIsTodayObservationFlashing] = useState(false);
  const flashTimeoutRef = useRef(null);

  // أسماء المقاطعات التي يرصدها الرادار الآن (للتأكيد)
  const satelliteSet = useMemo(
    () => new Set((rainingNow || []).map(r => r.city)),
    [rainingNow]
  );
  const currentRainNarrative = useMemo(
    () => buildCurrentRainNarrative({ rainingNow, modelRainingNow, cities }),
    [rainingNow, modelRainingNow, cities]
  );

  // نجمع البيانات مقسّمة حسب اليوم (3 أيام قادمة)
  const days = useMemo(() => {
    const map = {}; // key = dateStr

    cities.forEach(city => {
      const dates = city.daily?.time               || [];
      const codes = city.daily?.weather_code       || [];
      const rains = city.daily?.precipitation_sum  || [];
      const winds = city.daily?.wind_speed_10m_max || [];

      // نبحث عن الغد والأيام التالية (نتجاهل أي يوم <= اليوم الحالي)
      const todayStr = new Date().toISOString().slice(0, 10);
      let count = 0;
      for (let i = 0; i < dates.length && count < 3; i++) {
        if (!dates[i] || dates[i] <= todayStr) continue;
        count++;
        const dateStr = dates[i];
        if (!map[dateStr]) {
          map[dateStr] = {
            dateStr,
            dayAr:     dayName(dateStr),
            dateLabel: fmtDate(dateStr),
            wilayas:   {},
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
          wilayaForecast.thunder.push({ city: city.city, rainDesc, confirmed });
        } else if (mm >= 1 || code >= 61) {
          const lvl = rainLevel(mm);
          if (lvl === 'غزيرة جداً' || lvl === 'غزيرة') wilayaForecast.heavy.push({ city: city.city, confirmed });
          else if (lvl === 'متوسطة')                    wilayaForecast.moderate.push({ city: city.city, confirmed });
          else if (lvl === 'ضعيفة')                     wilayaForecast.weak.push({ city: city.city, confirmed });
        }
        if (w > 55) wilayaForecast.wind.push({ city: city.city, w: Math.round(w) });
      } // end for dates
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
  }, [cities, satelliteSet]);

  const todayDate = fmtDate(new Date());
  const todayDayName = dayName(new Date());
  const issuedAt = `${todayDate} — ${fmtTime(new Date())}`;

  const todayObservation = useMemo(() => {
    if (currentRainNarrative) {
      return {
        tone: 'live',
        coverage: currentRainNarrative.coverage || 'local',
        title: currentRainNarrative.title,
        summary: currentRainNarrative.summary,
        details: currentRainNarrative.details,
        chips: currentRainNarrative.chips,
      };
    }

    if ((sameDayRainEvents || []).length > 0) {
      const topEvents = sameDayRainEvents.slice(0, 4);
      const topEvent = topEvents[0];
      return {
        tone: 'archive',
        title: 'حدث اليوم عبر أرشيف الأقمار الصناعية',
        summary: `سجل أرشيف اليوم أمطاراً غزيرة في ${formatShortList(topEvents.map((event) => event.city), 4)}.`,
        details: topEvent?.firstSeen && topEvent?.lastSeen
          ? `أبرز نافذة رصد اليوم كانت بين ${fmtTime(topEvent.firstSeen)} و${fmtTime(topEvent.lastSeen)}، ما يؤكد أن اليوم شهد حالة مطرية فعلية وليست مجرد توقع.`
          : 'هذا خبر يومي مبني على أرشيف الإطارات المتاحة لليوم نفسه.',
        chips: ['حدث اليوم', 'أرشيف الأقمار', `${sameDayRainEvents.length} مقاطعة`],
      };
    }

    if ((rainingNow || []).length > 0) {
      const topRains = rainingNow.slice(0, 4);
      return {
        tone: 'live',
        title: 'رصد اليوم: أمطار جارية الآن',
        summary: `يرصد النظام حالياً أمطاراً على ${formatShortList(topRains.map((item) => item.city), 4)}.`,
        details: 'تُعرض هذه البطاقة قبل التوقعات لأن الحالة المرصودة اليوم أهم من الاكتفاء ببطاقات الأيام القادمة.',
        chips: ['رصد مباشر', `${rainingNow.length} مقاطعة`, topRains[0]?.label || 'مطر'],
      };
    }

    if ((modelRainingNow || []).length > 0) {
      const topModel = modelRainingNow.slice(0, 4);
      return {
        tone: 'model',
        title: 'رصد اليوم من النموذج',
        summary: `تشير البيانات الحالية إلى هطول قائم أو قريب في ${formatShortList(topModel.map((item) => item.city), 4)}.`,
        details: 'هذه قراءة داعمة من النموذج الحالي، وتُستخدم لإبراز حالة اليوم حتى عندما يكون الرادار اللحظي أقل وضوحاً محلياً.',
        chips: ['اليوم', 'قراءة نموذج', `${modelRainingNow.length} مقاطعة`],
      };
    }

    return {
      tone: 'calm',
      title: 'متابعة اليوم',
      summary: 'لا توجد حالياً مؤشرات مؤكدة كافية لتكوين نشرة رصد قوية لهذا اليوم.',
      details:
        'تستمر متابعة الرادار وأرشيف اليوم وقراءة النموذج وحركة السحب، وتُحدَّث هذه البطاقة تلقائياً عند ظهور أي مؤشرات محلية أو مسار ممطر نحو أي ولاية.',
      chips: ['اليوم', 'متابعة مستمرة', 'تحديث آلي'],
    };
  }, [currentRainNarrative, sameDayRainEvents, rainingNow, modelRainingNow]);

  const todayTheme = useMemo(() => {
    if (todayObservation.tone === 'live') {
      if (todayObservation.coverage === 'wide') {
        return {
          card: 'border-sky-200 bg-gradient-to-br from-sky-500 via-blue-700 to-indigo-900',
          accent: 'text-sky-100',
          pill: 'border-sky-200/30 bg-sky-200/15 text-sky-100',
        };
      }

      return {
        card: 'border-emerald-200 bg-gradient-to-br from-emerald-500 via-green-700 to-lime-900',
        accent: 'text-emerald-100',
        pill: 'border-emerald-200/30 bg-emerald-200/15 text-emerald-100',
      };
    }

    if (todayObservation.tone === 'archive') {
      return {
        card: 'border-violet-200 bg-gradient-to-br from-violet-600 via-fuchsia-700 to-rose-900',
        accent: 'text-violet-100',
        pill: 'border-violet-200/30 bg-violet-200/15 text-violet-100',
      };
    }

    if (todayObservation.tone === 'model') {
      return {
        card: 'border-orange-200 bg-gradient-to-br from-orange-500 via-amber-600 to-orange-900',
        accent: 'text-orange-100',
        pill: 'border-orange-200/30 bg-orange-200/15 text-orange-100',
      };
    }

    return {
      card: 'border-slate-200 bg-gradient-to-br from-slate-500 via-slate-700 to-slate-900',
      accent: 'text-slate-100',
      pill: 'border-slate-200/30 bg-slate-200/15 text-slate-100',
    };
  }, [todayObservation]);

  const todayObservationKey = useMemo(() => {
    if (todayObservation.tone === 'calm') return '';
    return JSON.stringify({
      tone: todayObservation.tone,
      coverage: todayObservation.coverage || '',
      title: todayObservation.title,
      summary: todayObservation.summary,
      chips: todayObservation.chips,
    });
  }, [todayObservation]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!todayObservationKey) {
      setIsTodayObservationFlashing(false);
      return;
    }

    const storageKey = 'last_today_observation_key';
    const lastKey = localStorage.getItem(storageKey);
    if (lastKey === todayObservationKey) return;

    localStorage.setItem(storageKey, todayObservationKey);
    setIsTodayObservationFlashing(true);

    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = window.setTimeout(() => {
      setIsTodayObservationFlashing(false);
    }, 15000);

    requestNotificationPermission()
      .then((granted) => {
        if (!granted) return;
        sendLocalNotification(`رصد اليوم: ${todayObservation.title}`, {
          body: todayObservation.summary,
          tag: 'today-observation',
          renotify: true,
        });
      })
      .catch(() => {});
  }, [todayObservationKey, todayObservation]);

  const buildDaySections = (forecast) => {
    const sections = [];

    if (forecast.thunder.length > 0) {
      sections.push({
        key: 'thunder',
        priority: getForecastBucketPriority('thunder'),
        node: (
          <UnifiedSection
            icon="⚡"
            bg="bg-red-50 border border-red-200"
            dotColor="bg-red-500"
            textColor="text-slate-900"
            label={<>يتوقع بإذن الله هطول أمطار <span className="text-red-700 font-black underline underline-offset-2">مصحوبة بعواصف رعدية قوية</span> — في المناطق التالية:</>}
            items={forecast.thunder.map(t => ({ city: t.city, extra: t.rainDesc, confirmed: t.confirmed }))}
            note="يُنصح بالابتعاد عن الأودية والمناطق المكشوفة والحذر من الصواعق"
          />
        ),
      });
    }

    if (forecast.heavy.length > 0) {
      sections.push({
        key: 'heavy',
        priority: getForecastBucketPriority('heavy'),
        node: (
          <UnifiedSection
            icon="🌧️"
            bg="bg-amber-50 border border-amber-200"
            dotColor="bg-amber-500"
            textColor="text-slate-900"
            label={<>يتوقع بإذن الله هطول أمطار <span className="text-amber-700 font-black underline underline-offset-2">غزيرة</span> — في المناطق التالية:</>}
            items={forecast.heavy}
          />
        ),
      });
    }

    if (forecast.moderate.length > 0) {
      sections.push({
        key: 'moderate',
        priority: getForecastBucketPriority('moderate'),
        node: (
          <UnifiedSection
            icon="🌦️"
            bg="bg-sky-50 border border-sky-200"
            dotColor="bg-sky-500"
            textColor="text-slate-900"
            label={<>يتوقع بإذن الله هطول أمطار <span className="text-sky-700 font-black underline underline-offset-2">متوسطة</span> — في المناطق التالية:</>}
            items={forecast.moderate}
          />
        ),
      });
    }

    if (forecast.weak.length > 0) {
      sections.push({
        key: 'weak',
        priority: getForecastBucketPriority('weak'),
        node: (
          <UnifiedSection
            icon="🌂"
            bg="bg-slate-50 border border-slate-200"
            dotColor="bg-slate-400"
            textColor="text-slate-900"
            label={<>يتوقع بإذن الله هطول أمطار <span className="text-slate-700 font-black underline underline-offset-2">ضعيفة</span> — في المناطق التالية:</>}
            items={forecast.weak}
          />
        ),
      });
    }

    if (forecast.wind.length > 0) {
      sections.push({
        key: 'wind',
        priority: getForecastBucketPriority('wind'),
        node: (
          <UnifiedSection
            icon="🌬️"
            bg="bg-cyan-50 border border-cyan-200"
            dotColor="bg-cyan-500"
            textColor="text-slate-900"
            label={<>يتوقع بإذن الله <span className="text-cyan-700 font-black underline underline-offset-2">رياح قوية</span> — في المناطق التالية:</>}
            items={forecast.wind.map(w => ({ city: w.city, extra: `${w.w} km/h` }))}
          />
        ),
      });
    }

    if (sections.length === 0) {
      sections.push({
        key: 'stable',
        node: (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="mb-2 text-base font-black text-slate-900">ℹ️ لا مؤشرات بارزة في التوقعات لهذا التاريخ</p>
            <p className="text-sm leading-relaxed text-slate-700">
              لا تُظهر بيانات التوقعات المتاحة لهذا التاريخ تنبيهات بارزة حالياً، مع بقاء احتمال تشكل حالات محلية أو تطورات سريعة حسب حركة السحب والرصد المباشر.
            </p>
          </div>
        ),
      });
    }

    return sections.sort((a, b) => b.priority - a.priority);
  };

  const renderDayCard = (day, idx, forecast, sections) => {
    const displayWilaya = normalizeMauritaniaWilayaName(forecast.wilaya) || forecast.wilaya;
    const theme = getWilayaTheme(displayWilaya);
    const headline = getForecastHeadline(forecast);
    const metrics = getForecastMetrics(forecast);
    return (
      <article
        key={`${day.dateStr}-${displayWilaya}`}
        className="relative h-fit overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white text-slate-900 shadow-lg"
      >
        <div className={`h-1.5 w-full bg-gradient-to-l ${theme.bar}`} />
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-xl shadow-sm ring-1 ring-sky-100">📅</span>
              <div>
                <span className={`block text-xl font-black ${theme.accent}`}>{displayWilaya}</span>
                <span className="mt-1 block text-[11px] text-slate-500">
                  {`${day.dayAr || `اليوم ${idx + 1}`} • توقعات هذه الولاية`}
                </span>
              </div>
            </div>
            <div className="text-left">
              <span className={`inline-flex rounded-xl border px-3 py-1.5 text-xs font-black shadow-sm ${theme.badge}`}>
                {day.dateLabel || fmtDate(day.dateStr)}
              </span>
              <span className="mt-1 block text-[10px] text-slate-500">
                {`بطاقة اليوم ${idx + 1}`}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${theme.badge}`}>
              {headline}
            </span>
            {metrics.map((item) => (
              <span
                key={`${displayWilaya}-${item.label}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${theme.metric}`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                <span className="font-black">{item.value}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3 bg-gradient-to-b from-white to-slate-50 px-5 py-4">
          {sections.map((section) => (
            <React.Fragment key={section.key}>{section.node}</React.Fragment>
          ))}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* رأس النشرة */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-2xl text-white shadow-lg">📋</span>
          <div>
            <h3 className="text-lg font-black text-gray-800 dark:text-white">النشرة الجوية</h3>
            <p className="text-[11px] text-gray-500">عرض يومي منفصل لرصد اليوم والتوقعات والتنبيهات</p>
          </div>
        </div>
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 font-mono shadow-sm">{issuedAt}</span>
      </div>

      <div className="space-y-5">
        <article
          className={`${todayTheme.card} ${
            isTodayObservationFlashing ? 'animate-pulse ring-4 ring-white/20 shadow-[0_0_45px_rgba(255,255,255,0.28)]' : ''
          } relative h-fit rounded-[2rem] border-2 text-white shadow-2xl ring-1 ring-white/10 overflow-hidden transition-all duration-500`}
        >
            <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-white/15 bg-black/15">
              <div className="flex items-center gap-3">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-xl shadow-sm ${isTodayObservationFlashing ? 'animate-bounce' : ''}`}>🛰️</span>
                <div>
                  <span className={`block font-black text-xl ${todayTheme.accent}`}>رصد اليوم</span>
                  <span className="block text-[11px] text-white/70 mt-1">بطاقة اليوم قبل بطاقات التوقعات القادمة</span>
                </div>
              </div>
              <div className="text-left">
                <div className={`rounded-2xl border px-4 py-2 shadow-sm ${todayTheme.pill}`}>
                  <span className="block text-lg font-black leading-none md:text-xl">
                    {todayDate}
                  </span>
                  <span className="mt-1 block text-[11px] font-bold text-white/80">
                    {todayDayName}
                  </span>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {isTodayObservationFlashing && (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black text-white shadow-sm animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                  رصد جديد
                </div>
              )}
              <div className="rounded-2xl p-4 shadow-lg backdrop-blur-sm bg-white/10 border border-white/15">
                <p className="text-base font-black text-white mb-2">{todayObservation.title}</p>
                <p className="text-sm font-bold text-white/95 leading-relaxed mb-2">{todayObservation.summary}</p>
                <p className="text-sm text-white/85 leading-relaxed">{todayObservation.details}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {todayObservation.chips.map((chip) => (
                    <span key={chip} className="px-3 py-1 rounded-full border border-white/15 bg-white/10 text-[10px] font-black text-white/90">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>

        {days.flatMap((day, idx) => {
          if ((day.forecasts || []).length === 0) {
            return renderDayCard(
              day,
              idx,
              { wilaya: 'عموم المتابعة', thunder: [], heavy: [], moderate: [], weak: [], wind: [] },
              buildDaySections({ thunder: [], heavy: [], moderate: [], weak: [], wind: [] })
            );
          }

          return day.forecasts.map((forecast) =>
            renderDayCard(day, idx, forecast, buildDaySections(forecast))
          );
        })}
      </div>
    </div>
  );
}

function UnifiedSection({ icon, bg, dotColor, label, items, note, textColor = 'text-slate-900' }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${bg}`}>
      <p className={`text-base font-black ${textColor} mb-3 leading-relaxed`}>
        {icon} {label}
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 rounded-xl border border-white/70 bg-white/80 px-2.5 py-2 text-sm text-slate-800">
            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0 mt-1.5 shadow-sm`} />
            <div className="leading-relaxed">
              <span className="font-black">{item.city}</span>
              {item.extra && (
                <span className="mr-1 text-xs text-slate-500">— {item.extra}</span>
              )}
              {item.confirmed && (
                <span className="mr-1 inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                  🛰️ مؤكدة
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-3 border-t border-slate-200 pt-2 text-xs italic text-slate-600">{note}</p>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════
   المكوّن الرئيسي للتنبيهات
══════════════════════════════════════════ */
const WeatherAlerts = () => {
  const {
    weatherData: citiesWeather,
    manualAlerts,
    rainReports,
    rainingNow,
    modelRainingNow,
    sameDayRainEvents,
    loading,
    lastUpdated,
  } = useWeatherContext();
  const currentRainNarrative = useMemo(
    () => buildCurrentRainNarrative({
      rainingNow,
      modelRainingNow,
      cities: citiesWeather,
    }),
    [rainingNow, modelRainingNow, citiesWeather]
  );

  const weatherAlerts = useMemo(() => {
    if (loading) return [];

    const dataAgeMs  = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
    const dataIsFresh = dataAgeMs < 60 * 60 * 1000;

    const adminAlerts = [];
    const priorityArchiveAlerts = [];
    const result = [];
    const cities = citiesWeather || [];

    /* ── 0. تنبيهات يدوية من الإدارة ── */
    (manualAlerts || []).forEach(alert => {
      adminAlerts.push({
        id: `manual-${alert.id}`,
        title: alert.title,
        message: alert.message,
        icon: alert.icon || '⚠️',
        color: 'bg-red-700',
        tags: Array.isArray(alert.tags) ? alert.tags : JSON.parse(alert.tags || '[]'),
      });
    });

    /* ── 1. حدث في نفس اليوم: أرشيف الأقمار الصناعية ── */
    if (sameDayRainEvents && sameDayRainEvents.length > 0) {
      const topEvents = sameDayRainEvents.slice(0, 4);
      const topEvent = topEvents[0];
      const cityList = topEvents
        .map(event => `${event.city}${event.wilaya ? ` (${event.wilaya})` : ''}`)
        .join('، ');
      const timeWindow = topEvent?.firstSeen && topEvent?.lastSeen
        ? `${fmtTime(topEvent.firstSeen)} - ${fmtTime(topEvent.lastSeen)}`
        : '';

      priorityArchiveAlerts.push({
        id: 'same-day-archive-event',
        title: 'خبر حدث في نفس اليوم 🛰️',
        message: `يكشف أرشيف الأقمار الصناعية اليوم عن أمطار غزيرة مرصودة في:\n${cityList}\n${
          timeWindow ? `أبرز نافذة رصد: ${timeWindow}.\n` : ''
        }تم تسجيل هذا الحدث من خلال إطارات اليوم نفسه، وهو خبر أرشيفي مستقل عن الرصد الآني الحالي.`,
        icon: '🛰️',
        color: 'bg-violet-700',
        tags: ['أرشيف اليوم', `${sameDayRainEvents.length} مقاطعة`, topEvent?.label || 'أمطار غزيرة'].filter(Boolean),
      });
    }

    /* ── 2. بلاغات المواطنين (آخر 3 ساعات) ── */
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    const freshReports  = (rainReports || []).filter(
      r => r.created_at && new Date(r.created_at).getTime() > threeHoursAgo
    );
    if (freshReports.length > 0) {
      const locs = freshReports.map(r => {
        const t = r.created_at ? ` [${fmtTime(r.created_at)}]` : '';
        return `${r.location}${t}`;
      });
      result.push({
        id: 'rain-now-citizen',
        title: 'بلاغات ميدانية: أمطار الآن',
        message: `وردت بلاغات ميدانية من المواطنين بهطول أمطار في:\n${locs.join('\n')}\nجعلها الله أمطار خير وبركة.`,
        icon: '🌧️',
        color: 'bg-teal-700',
        tags: ['بلاغ ميداني', `${freshReports.length} بلاغ`, 'آخر 3 ساعات']
      });
    }

    if (dataIsFresh) {
      /* ── 4. عواصف رعدية الآن — مؤكدة بالأقمار الصناعية فقط ──
         weather_code هو توقع نموذج رياضي وليس رصداً حقيقياً
         المصدر الوحيد الموثوق "الآن" هو رادار RainViewer (rainingNow) ── */
      if (rainingNow && rainingNow.length > 0) {
        // نتحقق هل أي مقاطعة ترصد فيها الأقمار أمطاراً وكودها >= 95 (عاصفة)
        const satelliteCityNames = new Set(rainingNow.map(r => r.city));
        const confirmedThunder = cities.filter(
          c => satelliteCityNames.has(c.city) && (c.current?.weather_code ?? 0) >= 95
        );
        if (confirmedThunder.length > 0) {
          result.push({
            id: 'thunder-now-confirmed',
            title: 'تحذير عاجل: عواصف رعدية مؤكدة بالأقمار 🛰️⚡',
            message: `رصدت الأقمار الصناعية عواصف رعدية مصحوبة بأمطار الآن في:\n${confirmedThunder.map(c => c.city).join('، ')}\nيُرجى الحذر من الصواعق والابتعاد عن الأودية.`,
            icon: '⚡',
            color: 'bg-red-800',
            tags: ['🛰️ مؤكد بالرادار', 'عواصف رعدية', fmtTime(new Date())]
          });
        }
      }

      /* ── 5. رياح قوية الآن (wind_speed موثوق من محطات) ── */
      const windNow = cities.filter(c => (c.current?.wind_speed_10m ?? 0) >= 45);
      if (windNow.length > 0) {
        result.push({
          id: 'wind-now',
          title: 'تحذير: رياح قوية الآن',
          message: `رياح قوية تتجاوز 45 km/h في: ${windNow.map(c => `${c.city} (${Math.round(c.current.wind_speed_10m)} km/h)`).join('، ')}.`,
          icon: '🌬️',
          color: 'bg-orange-700',
          tags: ['رياح عاتية', fmtTime(new Date())]
        });
      }

      /* ── 6. موجة حر ── */
      const heatNow = cities.filter(c => (c.current?.temperature_2m ?? 0) >= 45);
      if (heatNow.length > 0) {
        result.push({
          id: 'heat-now',
          title: 'تحذير: موجة حر شديدة',
          message: `درجات حرارة تتجاوز 45°C في: ${heatNow.map(c => `${c.city} (${Math.round(c.current.temperature_2m)}°C)`).join('، ')}.\nيُرجى شرب السوائل وتجنّب الشمس.`,
          icon: '🔥',
          color: 'bg-orange-600',
          tags: ['موجة حر', fmtDate(new Date())]
        });
      }
    }

    return [...adminAlerts, ...priorityArchiveAlerts, ...result];
  }, [loading, citiesWeather, manualAlerts, rainReports, rainingNow, modelRainingNow, sameDayRainEvents, lastUpdated, currentRainNarrative]);

  /* إشعارات المتصفح */
  useEffect(() => {
    if (!loading && weatherAlerts.length > 0) {
      if (weatherAlerts[0].id === 'same-day-archive-event') return;
      const key = weatherAlerts[0].id + weatherAlerts[0].title;
      if (localStorage.getItem('last_alert_id') !== key) {
        sendLocalNotification(`تنبيه جوي: ${weatherAlerts[0].title}`, {
          body: weatherAlerts[0].message.substring(0, 100) + '...',
          tag: 'weather-alert'
        });
        localStorage.setItem('last_alert_id', key);
      }
    }
  }, [loading, weatherAlerts]);

  if (loading || !citiesWeather || citiesWeather.length === 0) return null;

  const cities = citiesWeather || [];

  return (
    <div className="space-y-4" dir="rtl">

      {/* تنبيهات فورية */}
      {weatherAlerts.map(alert => (
        <div key={alert.id}
          className={`${alert.color} text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden border-4 border-white/10`}>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="animate-ping w-2 h-2 bg-white rounded-full shrink-0" />
              <h3 className="text-xl font-black">{alert.title}</h3>
            </div>
            <div className="text-sm font-bold leading-relaxed whitespace-pre-wrap">
              {alert.message}
            </div>
            {alert.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {alert.tags.map((tag, i) => (
                  <span key={i}
                    className="px-3 py-1 bg-white/20 text-white text-[10px] font-black rounded-full backdrop-blur-sm font-mono">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="absolute -bottom-4 -left-4 opacity-20">
            <span className="text-8xl">{alert.icon}</span>
          </div>
        </div>
      ))}

      {/* ═══ النشرة الجوية (3 أيام) ═══ */}
      <WeatherBulletin
        cities={cities}
        rainingNow={rainingNow}
        sameDayRainEvents={sameDayRainEvents}
        modelRainingNow={modelRainingNow}
      />

    </div>
  );
};

export default WeatherAlerts;
