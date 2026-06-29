import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWeatherContext } from '../WeatherContext';
import { buildConvectiveWatch } from '../convection';
import { buildLightningReport } from '../lightningBlitzortung';
import { toArabicCommune } from '../mauritaniaCommuneNamesAr';
import BreakingNowBox from './BreakingNowBox';
import { requestNotificationPermission } from '../pwa';
import {
  compareMauritaniaWilayaAdminOrder,
  normalizeMauritaniaWilayaName,
  OFFICIAL_MAURITANIA_WILAYA_ORDER,
} from '../mauritaniaPlaceNames';
import { adminCreateNews } from '../supabase';
import { autoPublishForecastNews } from '../forecastToNews';
import { getImageForAlert } from '../weatherImages';
import { useNavigate, Link } from 'react-router-dom';
import { wilayaToSlug } from '../wilayaUrlSlugs';

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

const SITE_URL   = 'https://www.jatkoumshab.com';
const WORKER_URL = 'https://jatkoumshab-share.workers.dev';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dayName(dateStr) {
  return DAYS_AR[new Date(dateStr).getDay()];
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function arabicFullDate(dateStr) {
  const d = new Date(dateStr);
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}
// صياغة قائمة مدن بالعربية: واحدة كما هي، اثنتان بـ"و"، أكثر بفواصل
function joinCitiesAr(list) {
  const a = [...new Set((list || []).filter(Boolean))];
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} و${a[1]}`;
  return a.join('، ');
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
    if (eastward || southeastward) return 'لعصابه';
    if (southward) return 'كيدماغا';
  }
  if (primaryWilaya === 'الحوض الشرقي' && southward) return 'كيدماغا';
  if (primaryWilaya === 'لعصابه' && southward) return 'كوركول';
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

  const cityNames = liveEntries.map((entry) => toArabicCommune(entry.city));
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

/* ── رابط صفحة التوقع المستقلة: /forecast/{date}/{wilaya-slug} ── */
function makeWilayaForecastPath(wilaya) {
  const date = new Date().toISOString().slice(0, 10);
  return `/forecast/${date}/${wilayaToSlug(wilaya)}`;
}

/* ── أزرار مشاركة بطاقة الولاية ── */
function WilayaShareButtons({ wilaya, entries, compact = false }) {
  const [copied, setCopied] = useState(false);
  const forecastPath = makeWilayaForecastPath(wilaya);
  const date         = new Date().toISOString().slice(0, 10);
  const articleUrl   = `${SITE_URL}/#${forecastPath}`;
  const fbUrl        = encodeURIComponent(`${WORKER_URL}/forecast/${date}/${wilayaToSlug(wilaya)}`);

  const anyThunder = entries.some(e => e.forecast.thunder.length > 0);
  const summary = anyThunder
    ? `⛈️ تحذير: عواصف رعدية مع أمطار متوقعة في ولاية ${wilaya}`
    : `🌧️ توقعات أمطار في ولاية ${wilaya}`;
  const waText = encodeURIComponent(`${summary}\n\n📍 التفاصيل الكاملة:\n${articleUrl}\n\n— جاتكم اسحاب 🌦️`);

  const copyLink = () => {
    navigator.clipboard?.writeText(articleUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${fbUrl}`}
          target="_blank" rel="noreferrer"
          className="flex items-center justify-center w-9 h-9 bg-[#1877F2] text-white rounded-xl hover:bg-[#166FE5] transition-colors shadow-sm"
          title="مشاركة على فيسبوك"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07z"/></svg>
        </a>
        <a href={`https://wa.me/?text=${waText}`}
          target="_blank" rel="noreferrer"
          className="flex items-center justify-center w-9 h-9 bg-[#25D366] text-white rounded-xl hover:bg-[#1ebe5d] transition-colors shadow-sm"
          title="مشاركة على واتساب"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97s-.47-.15-.67.15-.77.97-.94 1.17-.35.22-.64.07a8.08 8.08 0 0 1-2.38-1.47 8.96 8.96 0 0 1-1.65-2.05c-.17-.3 0-.46.13-.6s.3-.35.44-.52a2 2 0 0 0 .3-.5.55.55 0 0 0 0-.52c-.07-.15-.67-1.62-.92-2.22s-.49-.5-.67-.5h-.57a1.1 1.1 0 0 0-.8.37 3.37 3.37 0 0 0-1.04 2.5 5.84 5.84 0 0 0 1.22 3.1c.15.2 2.1 3.2 5.08 4.49a17.2 17.2 0 0 0 1.7.63 4.1 4.1 0 0 0 1.87.12 3.1 3.1 0 0 0 2.03-1.43 2.5 2.5 0 0 0 .17-1.43c-.07-.13-.27-.2-.57-.35zM12 0A12 12 0 0 0 1.05 17.6L0 24l6.57-1.72A12 12 0 1 0 12 0zm0 21.82a9.82 9.82 0 0 1-5-1.37l-.36-.21-3.7.97.99-3.6-.23-.37A9.84 9.84 0 1 1 12 21.82z"/></svg>
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-bold text-slate-500">شارك التوقع:</span>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${fbUrl}`}
        target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-[#1877F2] text-white px-3 py-1.5 rounded-xl text-xs font-black hover:bg-[#166FE5] transition-colors shadow-sm"
      >
        <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07z"/></svg>
        Facebook
      </a>
      <a href={`https://wa.me/?text=${waText}`}
        target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1.5 rounded-xl text-xs font-black hover:bg-[#1ebe5d] transition-colors shadow-sm"
      >
        <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97s-.47-.15-.67.15-.77.97-.94 1.17-.35.22-.64.07a8.08 8.08 0 0 1-2.38-1.47 8.96 8.96 0 0 1-1.65-2.05c-.17-.3 0-.46.13-.6s.3-.35.44-.52a2 2 0 0 0 .3-.5.55.55 0 0 0 0-.52c-.07-.15-.67-1.62-.92-2.22s-.49-.5-.67-.5h-.57a1.1 1.1 0 0 0-.8.37 3.37 3.37 0 0 0-1.04 2.5 5.84 5.84 0 0 0 1.22 3.1c.15.2 2.1 3.2 5.08 4.49a17.2 17.2 0 0 0 1.7.63 4.1 4.1 0 0 0 1.87.12 3.1 3.1 0 0 0 2.03-1.43 2.5 2.5 0 0 0 .17-1.43c-.07-.13-.27-.2-.57-.35zM12 0A12 12 0 0 0 1.05 17.6L0 24l6.57-1.72A12 12 0 1 0 12 0zm0 21.82a9.82 9.82 0 0 1-5-1.37l-.36-.21-3.7.97.99-3.6-.23-.37A9.84 9.84 0 1 1 12 21.82z"/></svg>
        WhatsApp
      </a>
      <button onClick={copyLink}
        className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-black hover:bg-slate-200 transition-colors shadow-sm"
      >
        {copied ? '✅ تم النسخ' : '🔗 نسخ الرابط'}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   مكوّن النشرة الجوية الرسمية (3 أيام موحدة)
══════════════════════════════════════════ */
function WeatherBulletin({ cities, rainingNow, sameDayRainEvents, modelRainingNow, lightningStrikes, trackedCells, stormClouds, weatherBulletins }) {
  const [isTodayObservationFlashing, setIsTodayObservationFlashing] = useState(false);
  const [confirmedForecasts, setConfirmedForecasts] = useState([]);
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

  // (مُعطّل) مراقبة CAPE — نعتمد رصد سحب Meteosat IR وحده الآن
  const convectiveWatch = useMemo(() => null, []);

  // ⚡ برق حقيقي مرصود (Blitzortung) — أعلى أولوية
  const lightningReport = useMemo(
    () => buildLightningReport(lightningStrikes, cities, 5),
    [lightningStrikes, cities]
  );

  // متتبّع التأكيد: ما يتوقّعه النموذج ثم يؤكّده الرادار لاحقاً → "✅ تأكّد بالرادار"
  useEffect(() => {
    const PENDING_KEY = 'model_forecast_pending';
    const CONFIRMED_KEY = 'model_forecast_confirmed';
    const PENDING_MAX = 12 * 60 * 60 * 1000; // نتتبّع توقّع النموذج حتى 12 ساعة
    const CONFIRMED_MAX = 3 * 60 * 60 * 1000; // نعرض التأكيد حتى 3 ساعات
    const now = Date.now();

    const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
    const pending = load(PENDING_KEY);
    const confirmed = load(CONFIRMED_KEY);

    // تنظيف القديم
    for (const c of Object.keys(pending)) if (now - pending[c] > PENDING_MAX) delete pending[c];
    for (const c of Object.keys(confirmed)) if (now - confirmed[c] > CONFIRMED_MAX) delete confirmed[c];

    const radarSet = new Set((rainingNow || []).map((r) => r.city));

    // توقّع سابق أكّده الرادار الآن → ننقله إلى "مؤكّد"
    for (const city of radarSet) {
      if (pending[city]) {
        confirmed[city] = now;
        delete pending[city];
      }
    }

    // نسجّل توقّعات النموذج الجديدة (غير المرصودة بالرادار بعد)
    (modelRainingNow || []).forEach((m) => {
      if (!radarSet.has(m.city) && !pending[m.city] && !confirmed[m.city]) {
        pending[m.city] = now;
      }
    });

    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      localStorage.setItem(CONFIRMED_KEY, JSON.stringify(confirmed));
    } catch { /* تجاهل */ }

    // نعرض المؤكّدة التي ما زالت تمطر فعلاً
    const stillRaining = Object.keys(confirmed).filter((c) => radarSet.has(c));
    setConfirmedForecasts(stillRaining);
  }, [rainingNow, modelRainingNow]);

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
    // أولوية 0: نشرة إدارية مباشرة من تيليجرام
    if (weatherBulletins && weatherBulletins.length > 0) {
      const latest = weatherBulletins[0];
      return {
        tone: 'live',
        coverage: 'regional',
        title: `${latest.icon} ${latest.text.slice(0, 60)}${latest.text.length > 60 ? '...' : ''}`,
        summary: latest.text,
        chips: ['📢 نشرة إدارية', fmtTime(latest.created_at)],
        _isAdminBulletin: true,
        _allBulletins: weatherBulletins,
      };
    }

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
        summary: `سجل أرشيف اليوم أمطاراً غزيرة في ${formatShortList(topEvents.map((event) => toArabicCommune(event.city)), 4)}.`,
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
        summary: `يرصد النظام حالياً أمطاراً على ${formatShortList(topRains.map((item) => toArabicCommune(item.city)), 4)}.`,
        details: 'تُعرض هذه البطاقة قبل التوقعات لأن الحالة المرصودة اليوم أهم من الاكتفاء ببطاقات الأيام القادمة.',
        chips: ['رصد مباشر', `${rainingNow.length} مقاطعة`, topRains[0]?.label || 'مطر'],
      };
    }

    if ((modelRainingNow || []).length > 0) {
      const topModel = modelRainingNow.slice(0, 4);
      return {
        tone: 'model',
        title: 'توقّع اليوم (قراءة نموذجية غير مؤكدة بالرادار)',
        summary: `كان يشير النموذج إلى احتمال هطول في ${formatShortList(topModel.map((item) => toArabicCommune(item.city)), 4)} — قيد المتابعة بالرادار للتأكيد.`,
        chips: ['توقّع نموذجي', 'غير مؤكد بالرادار', `${modelRainingNow.length} مقاطعة`],
      };
    }

    // تنبؤي: لا مطر نشط لكن طاقة كامنة عالية مهيأة للعواصف
    if (convectiveWatch && convectiveWatch.items.length > 0) {
      const top = convectiveWatch.items[0];
      const areas = convectiveWatch.items.map((it) => toArabicCommune(it.city)).join('، ');
      return {
        tone: 'model',
        title: 'رصد اليوم: أجواء مهيأة للعواصف (طاقة كامنة عالية)',
        summary: `دراسة الطاقة الكامنة في الهواء (CAPE) تُظهر عدم استقرار جوي في ${convectiveWatch.count} بلدية، أبرزها ${areas}.`,
        details: `أعلى طاقة في ${toArabicCommune(top.city)} (CAPE ${Math.round(top.cape)}، مؤشر رفع ${top.li != null ? top.li.toFixed(1) : '—'}). هذه الأجواء مرشحة لتكوّن عواصف رعدية وأمطار محلية إذا انخفض كبح الحمل الحراري — تستمر المتابعة عبر الرادار.`,
        chips: ['طاقة كامنة', `${convectiveWatch.count} بلدية مهيأة`, `CAPE ${Math.round(top.cape)}`],
      };
    }

    // برق فقط (بلا سحب متتبَّعة) — يصبح هو الرصد الرئيسي
    if (lightningReport && lightningReport.areas.length > 0) {
      const areasText = lightningReport.areas.map((a) => toArabicCommune(a.city)).join('، ');
      return {
        tone: 'live',
        coverage: lightningReport.areas.length >= 3 ? 'wide' : 'regional',
        title: `⚡ برق مرصود فعلياً الآن (${lightningReport.total} ضربة)`,
        summary: `قرب: ${areasText}.`,
        chips: ['⚡ برق حقيقي', 'Blitzortung'],
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
  }, [lightningReport, convectiveWatch, currentRainNarrative, sameDayRainEvents, rainingNow, modelRainingNow, weatherBulletins]);

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

    // الإشعارات موقوفة
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

  // فقرات الشدّة لتوقّع يوم واحد
  const narrativeLines = (forecast) => {
    const ar = (arr) => [...new Set((arr || []).map((x) => toArabicCommune(x.city)))];
    const thunder = ar(forecast.thunder);
    const heavy = ar(forecast.heavy);
    const moderate = ar(forecast.moderate);
    const weak = ar(forecast.weak);
    const wind = [...new Set((forecast.wind || []).map((w) => toArabicCommune(w.city)))];
    const lines = [];
    if (thunder.length > 0) lines.push(<p key="t">🌩️ <span className="font-black text-red-700">عواصف رعدية مصحوبة بأمطار، بعضها غزير:</span> {joinCitiesAr(thunder)}.</p>);
    if (heavy.length > 0) lines.push(<p key="h">🌧️ <span className="font-black text-amber-700">أمطار غزيرة متوقعة</span> في {heavy.length > 1 ? 'كل من ' : ''}{joinCitiesAr(heavy)}.</p>);
    if (moderate.length > 0) lines.push(<p key="m">🌦️ <span className="font-black text-sky-700">أمطار متوسطة متوقعة</span> في {joinCitiesAr(moderate)}.</p>);
    if (weak.length > 0) lines.push(<p key="w">🌂 <span className="font-black text-slate-700">أمطار ضعيفة متوقعة</span> في {joinCitiesAr(weak)}.</p>);
    if (wind.length > 0) lines.push(<p key="wind">🌬️ <span className="font-black text-cyan-700">رياح قوية</span> في {joinCitiesAr(wind)}.</p>);
    return lines;
  };

  // دالة مساعدة: بصمة التوقع (لتحديد هل يومان متطابقان)
  const forecastFingerprint = (forecast) => {
    const ar = (arr) => [...new Set((arr || []).map((x) => toArabicCommune(x.city)))].sort().join(',');
    return [ar(forecast.thunder), ar(forecast.heavy), ar(forecast.moderate), ar(forecast.weak)].join('|');
  };

  // دمج الأيام ذات التوقع نفسه تحت نطاق تاريخي واحد (يُزيل مظهر التكرار)
  const mergeEntries = (entries) => {
    const groups = [];
    entries.forEach((e) => {
      const fp = forecastFingerprint(e.forecast);
      const last = groups[groups.length - 1];
      if (last && last.fp === fp) {
        last.dates.push(e.day.dateStr);
      } else {
        groups.push({ fp, dates: [e.day.dateStr], forecast: e.forecast });
      }
    });
    return groups;
  };

  // بطاقة واحدة لكل ولاية تجمع أيامها (حتى 3 أيام قادمة)
  const renderWilayaCard = (wilaya, entries) => {
    const theme = getWilayaTheme(wilaya);
    const anyThunder = entries.some((e) => e.forecast.thunder.length > 0);

    // ملخص قصير: أبرز المناطق المتأثرة
    const topCities = [...new Set([
      ...entries.flatMap(e => e.forecast.thunder.map(t => toArabicCommune(t.city))),
      ...entries.flatMap(e => e.forecast.heavy.map(c => toArabicCommune(c.city))),
      ...entries.flatMap(e => e.forecast.moderate.map(c => toArabicCommune(c.city))),
    ])].filter(Boolean).slice(0, 3);

    const daysLabel = [...new Set(entries.map(e => dayName(e.day.dateStr)))].join(' و');

    const headline = anyThunder
      ? `⛈️ عواصف رعدية مع أمطار — ${wilaya}`
      : `🌧️ أمطار متوقعة — ${wilaya}`;

    const shortSummary = topCities.length > 0
      ? `${daysLabel} — أبرز المناطق: ${topCities.join('، ')}`
      : daysLabel;

    const forecastPath = makeWilayaForecastPath(wilaya);

    return (
      <article
        key={wilaya}
        className="relative overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white text-slate-900 shadow-lg"
      >
        <div className={`h-1.5 w-full bg-gradient-to-l ${theme.bar}`} />
        <div className="px-5 py-4" dir="rtl">

          {/* رأس البطاقة */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className={`text-lg font-black ${theme.accent}`}>{headline}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{shortSummary}</p>
            </div>
            {anyThunder && (
              <span className="shrink-0 flex items-center gap-1 bg-red-100 text-red-700 text-[10px] font-black px-2.5 py-1 rounded-full border border-red-200">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                تحذير
              </span>
            )}
          </div>

          {/* ملخص سطر واحد فقط — النص الكامل في صفحة التفاصيل */}
          <p className="text-sm text-slate-600 leading-7 line-clamp-2">
            {anyThunder
              ? `تشير التوقعات إلى عواصف رعدية مصحوبة بأمطار غزيرة على عدة مناطق من الولاية خلال الأيام القادمة، يُنصح بالحذر والابتعاد عن الأودية.`
              : `تشير التوقعات إلى فرص لهطول أمطار متفاوتة الشدة على عدة مناطق من الولاية خلال الأيام القادمة.`
            }
          </p>

          {/* زر "اقرأ التوقعات كاملة" */}
          <div className="mt-4 flex items-center gap-3">
            <Link
              to={forecastPath}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all shadow-sm bg-gradient-to-l ${theme.bar} text-white hover:opacity-90`}
            >
              عرض التفاصيل كاملة
              <span className="text-base">←</span>
            </Link>
            <WilayaShareButtons wilaya={wilaya} entries={entries} compact />
          </div>

        </div>
      </article>
    );
  };

  // تجميع التوقعات حسب الولاية (كل ولاية → أيامها)، مرتّبة إدارياً
  const wilayaGroups = (() => {
    const map = new Map();
    days.forEach((day) => {
      (day.forecasts || []).forEach((forecast) => {
        const w = normalizeMauritaniaWilayaName(forecast.wilaya) || forecast.wilaya;
        if (!map.has(w)) map.set(w, []);
        map.get(w).push({ day, forecast });
      });
    });
    return [...map.entries()].sort((a, b) => compareMauritaniaWilayaAdminOrder(a[0], b[0]));
  })();

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
        {/* ⚡ رصد البرق (Blitzortung) */}
        {lightningReport && lightningReport.areas.length > 0 && (
          <article className="rounded-[2rem] border-2 border-yellow-400/60 bg-gradient-to-br from-yellow-500 via-amber-600 to-orange-700 p-5 shadow-2xl text-white">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl shadow-sm animate-pulse">⚡</span>
              <div>
                <p className="font-black text-xl text-white">برق مرصود الآن</p>
                <p className="text-[11px] text-white/70">رصد Blitzortung المباشر</p>
              </div>
              <div className="mr-auto bg-white/20 rounded-full px-3 py-1 text-xs font-black">{lightningReport.total} ضربة</div>
            </div>
            <p className="text-sm font-bold text-white/95 leading-relaxed">
              قرب: <span className="font-black text-yellow-100">{lightningReport.areas.map((a) => toArabicCommune(a.city)).join('، ')}</span>
            </p>
            <p className="text-xs text-white/70 mt-2">احذر الصواعق وابتعد عن الأماكن المكشوفة</p>
          </article>
        )}

        {/* صندوق المتابعة/الرصد العاجل — فوق التوقعات */}
        <BreakingNowBox />

        {wilayaGroups.length > 0 ? (
          wilayaGroups.map(([wilaya, entries]) => renderWilayaCard(wilaya, entries))
        ) : (
          <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-lg" dir="rtl">
            <p className="text-base font-black text-slate-800">توقعات الأيام الثلاثة القادمة</p>
            <p className="text-sm text-slate-600 mt-1">لا توقعات أمطار بارزة على الولايات خلال الأيام القادمة، بإذن الله.</p>
          </article>
        )}

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
    trackedCells,
    stormClouds,
    lightningStrikes,
    weatherBulletins,
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

      /* ── 5. رياح قوية الآن ── */
      const windNow = cities.filter(c => (c.current?.wind_speed_10m ?? 0) >= 45);
      if (windNow.length > 0) {
        const dateStr = fmtDate(new Date());
        const citiesList = windNow.map(c => `${toArabicCommune(c.city) || c.city}: ${Math.round(c.current.wind_speed_10m)} km/h`).join('\n');
        const topCities = windNow.slice(0, 3).map(c => toArabicCommune(c.city) || c.city).join('، ');
        result.push({
          id: 'wind-now',
          title: 'تحذير من رياح قوية',
          message: `📅 ${dateStr}\n💨 رُصدت رياح قوية تتجاوز 45 km/h في:\n\n${citiesList}\n\n⚠️ يُنصح بتأمين الأشياء غير الثابتة في الهواء الطلق وتجنّب الطرق الصحراوية خلال هذه الفترة.\n\nنسأل الله السلامة للجميع. 🤲`,
          newsTitle: `تحذير من رياح قوية — ${topCities}`,
          newsContent: `📅 ${dateStr}\n💨 رُصدت رياح قوية تتجاوز 45 كيلومتراً في الساعة في عدة مناطق موريتانية:\n\n${citiesList}\n\n⚠️ يُنصح بتأمين الأشياء غير الثابتة في الهواء الطلق، وتجنّب الطرق الصحراوية خلال هذه الفترة، وتوخّي الحذر أثناء القيادة.\n\nنسأل الله السلامة للجميع. 🤲\n\nالمصدر: Open-Meteo — جاتكم اسحاب`,
          newsCategory: 'طقس',
          icon: '🌬️',
          color: 'bg-orange-700',
          tags: ['رياح عاتية', fmtTime(new Date())]
        });
      }

      /* ── 6. موجة حر ── */
      const heatNow = cities.filter(c => (c.current?.temperature_2m ?? 0) >= 45);
      if (heatNow.length > 0) {
        const dateStr = fmtDate(new Date());
        const citiesList = heatNow.map(c => `${toArabicCommune(c.city) || c.city}: ${Math.round(c.current.temperature_2m)}°م`).join('\n');
        const topCities = heatNow.slice(0, 3).map(c => toArabicCommune(c.city) || c.city).join('، ');
        result.push({
          id: 'heat-now',
          title: 'تحذير من موجة حر شديدة',
          message: `📅 ${dateStr}\n🌡️ يُتوقع بإذن الله أن تتجاوز درجات الحرارة 45°م في:\n\n${citiesList}\n\n⚠️ يُنصح بالإكثار من شرب السوائل، وتجنب التعرض المباشر لأشعة الشمس، خاصة خلال ساعات الظهيرة.\n\nنسأل الله السلامة للجميع. 🤲`,
          newsTitle: `تحذير من موجة حر شديدة — ${topCities}`,
          newsContent: `📅 ${dateStr}\n🌡️ يُتوقع بإذن الله أن تتجاوز درجات الحرارة 45 درجة مئوية في عدة مناطق موريتانية:\n\n${citiesList}\n\n⚠️ يُنصح بالإكثار من شرب السوائل، وتجنب التعرض المباشر لأشعة الشمس خاصة خلال ساعات الظهيرة (12:00 — 16:00)، وإيلاء الاهتمام الخاص للأطفال وكبار السن.\n\nنسأل الله السلامة للجميع. 🤲\n\nالمصدر: Open-Meteo — جاتكم اسحاب`,
          newsCategory: 'طقس حار',
          icon: '🔥',
          color: 'bg-orange-600',
          tags: ['موجة حر', dateStr]
        });
      }
    }

    return [...adminAlerts, ...priorityArchiveAlerts, ...result];
  }, [loading, citiesWeather, manualAlerts, rainReports, rainingNow, modelRainingNow, sameDayRainEvents, lastUpdated, currentRainNarrative]);

  /* إشعارات المتصفح */
  const navigate = useNavigate();
  const [publishingAlert, setPublishingAlert] = useState(null);
  const publishingInFlight = useRef(new Set());
  // نشر أوتوماتيكي للتوقعات — مرة واحدة في اليوم عند تحميل البيانات
  const forecastPublishDone = useRef(false);
  useEffect(() => {
    if (loading || !citiesWeather?.length || forecastPublishDone.current) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `forecast_news_published_${today}`;
    if (localStorage.getItem(key)) return;
    forecastPublishDone.current = true;
    autoPublishForecastNews(citiesWeather)
      .then(() => {
        // نحفظ المفتاح دائمًا بعد الاكتمال (حتى لو كانت المقالات موجودة مسبقًا)
        localStorage.setItem(key, '1');
      })
      .catch(() => { forecastPublishDone.current = false; });
  }, [loading, citiesWeather]);

  // إشعارات + auto-publish لكل تحذير جديد له newsTitle
  useEffect(() => {
    if (!loading && weatherAlerts.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      weatherAlerts.forEach(async (alert) => {
        if (alert.id === 'same-day-archive-event') return;
        // الإشعارات موقوفة
        // auto-publish للتحذيرات التي لها newsTitle (حر / رياح)
        if (!alert.newsTitle) return;
        const publishKey = `alert_published_${alert.id}_${today}`;
        // تحقق مزدوج: localStorage + ref (يمنع race condition)
        if (localStorage.getItem(publishKey)) return;
        if (publishingInFlight.current.has(publishKey)) return;
        publishingInFlight.current.add(publishKey); // احجز الموضع فوراً
        try {
          await adminCreateNews({
            title: alert.newsTitle,
            excerpt: alert.newsTitle,
            content: alert.newsContent || alert.message,
            category: alert.newsCategory || 'طقس',
            author: 'جاتكم اسحاب',
            is_published: true,
            tags: ['تحذير', alert.newsCategory || 'طقس', today],
            featured_image: getImageForAlert(alert.newsCategory || '', alert.newsTitle || ''),
          });
          localStorage.setItem(publishKey, '1');
        } catch (e) {
          publishingInFlight.current.delete(publishKey); // أعد المحاولة لاحقاً
          console.warn('تعذّر نشر التحذير كخبر:', e);
        }
      });
    }
  }, [loading, weatherAlerts]);

  const publishAlertAsNews = async (alert) => {
    setPublishingAlert(alert.id);
    try {
      const article = await adminCreateNews({
        title: alert.newsTitle || alert.title,
        excerpt: alert.newsTitle || alert.title,
        content: alert.newsContent || alert.message,
        category: alert.newsCategory || 'طقس',
        author: 'جاتكم اسحاب',
        is_published: true,
        tags: ['تحذير', alert.newsCategory || 'طقس'],
        featured_image: getImageForAlert(alert.newsCategory || '', alert.newsTitle || alert.title || ''),
      });
      if (article?.slug) navigate(`/news/${article.slug}`);
    } catch (e) {
      console.error(e);
    } finally {
      setPublishingAlert(null);
    }
  };

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
                {alert.newsTitle && (
                  <button
                    onClick={() => publishAlertAsNews(alert)}
                    disabled={publishingAlert === alert.id}
                    className="px-3 py-1 bg-white/25 hover:bg-white/40 text-white text-[11px] font-black rounded-full transition-all disabled:opacity-60"
                  >
                    {publishingAlert === alert.id ? '⏳ جارٍ النشر...' : '📰 نشر كخبر'}
                  </button>
                )}
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
        lightningStrikes={lightningStrikes}
        trackedCells={trackedCells}
        stormClouds={stormClouds}
        weatherBulletins={weatherBulletins}
      />

    </div>
  );
};

export default WeatherAlerts;
