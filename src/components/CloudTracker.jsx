import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';

const { FiCloud, FiTrendingUp, FiTrendingDown, FiShare2, FiBell, FiClock, FiMapPin } =
  FiIcons;

/**
 * حساب اتجاه حركة السحب (bearing) من سرعة الرياح
 * Open-Meteo يعطي wind_speed و wind_direction (إذا طُلب)
 * لكننا هنا نستخدم wind_direction_10m إذا كان متاحاً، أو نستنتج من التغيرات
 */
function getWindDirectionArrow(degrees) {
  if (degrees === undefined || degrees === null) return '↗️';
  if (degrees >= 337.5 || degrees < 22.5) return '↑';
  if (degrees < 67.5) return '↗';
  if (degrees < 112.5) return '→';
  if (degrees < 157.5) return '↘';
  if (degrees < 202.5) return '↓';
  if (degrees < 247.5) return '↙';
  if (degrees < 292.5) return '←';
  return '↖';
}

function getWindDirectionText(degrees) {
  if (degrees === undefined || degrees === null) return 'غير معروف';
  if (degrees >= 337.5 || degrees < 22.5) return 'شمال';
  if (degrees < 67.5) return 'شمال شرقي';
  if (degrees < 112.5) return 'شرق';
  if (degrees < 157.5) return 'جنوب شرقي';
  if (degrees < 202.5) return 'جنوب';
  if (degrees < 247.5) return 'جنوب غربي';
  if (degrees < 292.5) return 'غرب';
  return 'شمال غربي';
}

function formatLastUpdated(lastUpdated) {
  if (!lastUpdated) return 'آخر تحديث غير متوفر';

  const date = new Date(lastUpdated);
  if (Number.isNaN(date.getTime())) return 'آخر تحديث غير متوفر';

  return `${date.toLocaleDateString('en-GB')} - ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })}`;
}

function getPathTheme(path) {
  if (path.isStormy) {
    return {
      card: 'border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50',
      badge: 'bg-amber-100 text-amber-800 border border-amber-200',
      panel: 'bg-white/80 border-amber-100',
      title: 'text-amber-950',
      sub: 'text-amber-700',
      accent: 'text-amber-600',
      label: 'سحب رعدية',
      icon: '⛈️',
    };
  }

  if (path.isRainy) {
    return {
      card: 'border-sky-200 bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50',
      badge: 'bg-sky-100 text-sky-800 border border-sky-200',
      panel: 'bg-white/80 border-sky-100',
      title: 'text-sky-950',
      sub: 'text-sky-700',
      accent: 'text-sky-600',
      label: 'أمطار محتملة',
      icon: '🌧️',
    };
  }

  return {
    card: 'border-slate-200 bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50',
    badge: 'bg-slate-100 text-slate-700 border border-slate-200',
    panel: 'bg-white/80 border-slate-100',
    title: 'text-slate-900',
    sub: 'text-slate-600',
    accent: 'text-slate-600',
    label: 'سحب متفرقة',
    icon: '☁️',
  };
}

const SOUTH_WILAYAS = new Set(['الحوض الغربي', 'الحوض الشرقي', 'العصابة', 'كيدماغا', 'كوركول']);

function formatShortList(items, limit = 4) {
  const uniqueItems = [...new Set((items || []).filter(Boolean))];
  if (uniqueItems.length === 0) return '';
  if (uniqueItems.length <= limit) return uniqueItems.join('، ');
  return `${uniqueItems.slice(0, limit).join('، ')}، وغيرها`;
}

function getReportLocation(report) {
  return report?.city || report?.location || report?.wilaya || '';
}

function buildAutoBulletin({
  paths,
  rainingNow,
  rainReports,
  manualAlerts,
  weatherData,
  lastUpdated,
}) {
  const freshReports = (rainReports || []).filter((report) => {
    if (!report?.created_at) return false;
    return Date.now() - new Date(report.created_at).getTime() <= 3 * 60 * 60 * 1000;
  });

  const cityByName = new Map((weatherData || []).map((city) => [city.city, city]));
  const satelliteThunderCities = (rainingNow || [])
    .filter((entry) => {
      const city = cityByName.get(entry.city);
      return (city?.current?.weather_code ?? 0) >= 95;
    })
    .map((entry) => entry.city);

  const southernSatellite = (rainingNow || []).filter((entry) => {
    const city = cityByName.get(entry.city);
    return SOUTH_WILAYAS.has(city?.wilaya);
  });

  const southernReports = freshReports.filter((report) =>
    SOUTH_WILAYAS.has(report?.wilaya || '')
  );

  const southernPaths = (paths || []).filter((path) => SOUTH_WILAYAS.has(path.wilaya));
  const topSouthPath = southernPaths[0] || paths[0] || null;
  const radarAge = rainingNow?.[0]?.radarAge;
  const lastUpdatedLabel = formatLastUpdated(lastUpdated);

  if ((manualAlerts || []).length > 0) {
    const firstManual = manualAlerts[0];
    return {
      tone: 'danger',
      title: 'نشرة أوتوماتيكية: تنبيه نشط',
      summary: firstManual.title || 'يوجد تنبيه جوي نشط حالياً.',
      details:
        firstManual.message ||
        'توجد نشرة يدوية مفعلة من الإدارة، ويُنصح بمتابعة التحديثات المتلاحقة.',
      chips: ['إداري', 'أولوية عالية', lastUpdatedLabel],
    };
  }

  if (satelliteThunderCities.length > 0) {
    return {
      tone: 'danger',
      title: 'نشرة أوتوماتيكية: أمطار رعدية الآن',
      summary: `رصد الرادار أمطاراً مع إشارات رعدية محتملة قرب ${formatShortList(
        satelliteThunderCities,
        3
      )}.`,
      details: topSouthPath
        ? `تُظهر المعطيات أيضاً دفعاً للسحب نحو ${getWindDirectionText(
            topSouthPath.windDir
          )} مع متابعة خاصة لـ ${topSouthPath.city}.`
        : 'تتطلب الحالة متابعة مباشرة لاحتمال استمرار البرق أو تمدد الخلايا الرعدية.',
      chips: ['رادار', '⚡ برق محتمل', radarAge != null ? `قبل ${radarAge} د` : lastUpdatedLabel].filter(
        Boolean
      ),
    };
  }

  if (southernSatellite.length > 0) {
    return {
      tone: 'rain',
      title: 'نشرة أوتوماتيكية: أمطار مرصودة جنوباً',
      summary: `الأقمار الصناعية ترصد أمطاراً حالياً في ${formatShortList(
        southernSatellite.map((entry) => entry.city),
        4
      )}.`,
      details: topSouthPath
        ? `المسار المرجح حالياً يشير إلى سحب ${topSouthPath.isStormy ? 'رعدية' : 'ممطرة'} تتحرك نحو ${getWindDirectionText(
            topSouthPath.windDir
          )} بسرعة ${topSouthPath.windSpeed} كم/س، وأبرز منطقة متابعة هي ${topSouthPath.city}.`
        : 'تُتابَع الخلايا الجنوبية تحسباً لأي تمدد إضافي نحو الداخل خلال الساعات القادمة.',
      chips: ['رادار مباشر', `${southernSatellite.length} مناطق`, radarAge != null ? `قبل ${radarAge} د` : lastUpdatedLabel].filter(
        Boolean
      ),
    };
  }

  if (southernReports.length > 0) {
    return {
      tone: 'field',
      title: 'نشرة أوتوماتيكية: بلاغات ميدانية حديثة',
      summary: `وردت بلاغات ميدانية خلال الساعات الأخيرة من ${formatShortList(
        southernReports.map(getReportLocation),
        4
      )}.`,
      details:
        'هذا مؤشر داعم على نشاط محلي أو قريب من الجنوب، ويُستحسن متابعة الرادار ومسار السحب مع أي تحديث جديد.',
      chips: ['بلاغات', `${southernReports.length} تقارير`, 'آخر 3 ساعات'],
    };
  }

  if (topSouthPath && (topSouthPath.isStormy || topSouthPath.isRainy)) {
    return {
      tone: topSouthPath.isStormy ? 'danger' : 'rain',
      title: 'نشرة أوتوماتيكية: سحب متجهة نحو الجنوب',
      summary: `تشير البيانات إلى ${topSouthPath.isStormy ? 'نشاط رعدي محتمل' : 'سحب ممطرة'} قرب ${topSouthPath.city} خلال ${
        topSouthPath.hours
      } ساعات.`,
      details: `اتجاه الحركة الحالي ${getWindDirectionArrow(topSouthPath.windDir)} ${getWindDirectionText(
        topSouthPath.windDir
      )}، واحتمال المطر يصل إلى ${topSouthPath.maxPrecipProb}% مع رياح دافعة بنحو ${
        topSouthPath.windSpeed
      } كم/س.`,
      chips: [topSouthPath.isStormy ? '⚡ رعد محتمل' : '🌧️ مطر محتمل', topSouthPath.wilaya, lastUpdatedLabel].filter(
        Boolean
      ),
    };
  }

  return {
    tone: 'calm',
    title: 'نشرة أوتوماتيكية: استقرار نسبي',
    summary: 'لا توجد حالياً مؤشرات قوية على خلايا ممطرة أو رعدية مؤثرة في الجنوب.',
    details:
      'تستمر المتابعة الآلية للرادار ومسارات السحب والبلاغات الميدانية، وقد تتغير القراءة مع أي تطور جديد خلال الساعات القادمة.',
    chips: ['متابعة آلية', 'دون مؤشرات بارزة', lastUpdatedLabel],
  };
}

/**
 * تتبع مسار السحب: نحدد المدن التي ستصلها السحب القادمة
 * بناءً على اتجاه الرياح والسحب الحالية
 */
function predictCloudPath(weatherData, hoursAhead = 6) {
  if (!weatherData || weatherData.length === 0) return [];

  const now = new Date();
  const paths = [];

  weatherData.forEach((city) => {
    if (!city.hourly || !city.hourly.time) return;

    const hourly = city.hourly;
    const currentCode = city.current?.weather_code ?? 0;

    const nextHours = [];
    for (let i = 0; i < hoursAhead && i < hourly.time.length; i++) {
      const timeStr = hourly.time[i];
      const time = new Date(timeStr);
      if (time < now) continue;

      const temp = hourly.temperature_2m?.[i];
      const precipProb = hourly.precipitation_probability?.[i] ?? 0;
      const windSpeed = hourly.wind_speed_10m?.[i] ?? city.current?.wind_speed_10m ?? 0;
      const windDir = city.current?.wind_direction_10m ?? null;
      const weatherCode = currentCode;

      // نعتمد فقط على الحقول المتاحة فعلاً من المصدر الحالي.
      const hasClouds = weatherCode >= 1 || precipProb >= 20 || windSpeed >= 18;

      if (hasClouds) {
        const isStormy = weatherCode >= 95 || (precipProb >= 65 && windSpeed >= 28);
        const isRainy = weatherCode >= 61 || precipProb >= 40;
        nextHours.push({
          hour: time.getHours(),
          temp,
          precipProb,
          windSpeed,
          windDir,
          weatherCode,
          isStormy,
          isRainy,
          activityScore:
            precipProb +
            Math.min(windSpeed, 40) +
            (isStormy ? 30 : 0) +
            (weatherCode >= 3 ? 10 : 0),
        });
      }
    }

    if (nextHours.length > 0) {
      // احسب الاتجاه السائد للرياح
      const avgWindDir = nextHours
        .filter((h) => h.windDir !== null)
        .reduce((acc, h, _, arr) => acc + h.windDir / arr.length, 0);

      const avgWindSpeed = nextHours.reduce((acc, h) => acc + h.windSpeed, 0) / nextHours.length;
      const maxPrecipProb = Math.max(...nextHours.map((h) => h.precipProb));
      const strongestActivity = Math.max(...nextHours.map((h) => h.activityScore));
      const anyStormy = nextHours.some((h) => h.isStormy);
      const anyRainy = nextHours.some((h) => h.isRainy);

      paths.push({
        city: city.city,
        cityType: city.cityType || 'مقاطعة',
        wilaya: city.wilaya || '',
        lat: city.latitude || city.lat,
        lon: city.longitude || city.lon,
        windDir: avgWindDir || null,
        windSpeed: Math.round(avgWindSpeed),
        hours: nextHours.length,
        maxPrecipProb,
        strongestActivity,
        isStormy: anyStormy,
        isRainy: anyRainy,
        severity: anyStormy ? 'نشاط رعدي' : anyRainy ? 'سحب ممطرة' : 'سحب متحركة',
      });
    }
  });

  // رتب: الأكثر خطورة أولاً
  return paths.sort((a, b) => {
    const score = (p) =>
      (p.isStormy ? 100 : 0) + (p.isRainy ? 50 : 0) + p.maxPrecipProb + p.strongestActivity;
    return score(b) - score(a);
  });
}

/**
 * نشر التوقعات: إنشاء نص جاهز للمشاركة
 */
function generateForecastShareText(paths, lastUpdated) {
  const nowStr = formatLastUpdated(lastUpdated);
  let text = `📡 *تتبع حركة السحب والنشرة الأوتوماتيكية - جاتكم اسحاب*\n`;
  text += `📅 ${nowStr}\n\n`;

  if (paths.length === 0) {
    text += `☀️ الأجواء صافية بشكل عام في عموم مقاطعات موريتانيا.\n`;
  } else {
    const stormy = paths.filter((p) => p.isStormy).slice(0, 3);
    const rainy = paths.filter((p) => p.isRainy && !p.isStormy).slice(0, 3);

    if (stormy.length > 0) {
      text += `⚠️ *تنبيه: سحب رعدية قادمة*\n`;
      stormy.forEach((p) => {
        text += `• ${p.cityType} ${p.city}: ${getWindDirectionArrow(p.windDir)} ${getWindDirectionText(p.windDir)} (${p.windSpeed} كم/س)\n`;
      });
      text += `\n`;
    }

    if (rainy.length > 0) {
      text += `🌧️ *سحب ممطرة متوقعة*\n`;
      rainy.forEach((p) => {
        text += `• ${p.cityType} ${p.city}: ${getWindDirectionArrow(p.windDir)} ${getWindDirectionText(p.windDir)} (${p.windSpeed} كم/س)\n`;
      });
      text += `\n`;
    }
  }

  text += `تابع التحديثات المباشرة: ${window.location.origin}`;
  return text;
}

/**
 * CloudTracker - مكون تتبع مسار السحب وتوقع حركتها
 * يعرض:
 * 1. خريطة ذهنية لمسار السحب
 * 2. المدن التي ستصلها السحب القادمة
 * 3. أزرار نشر التوقعات على WhatsApp
 * 4. إشعارات فورية
 */
const CloudTracker = () => {
  const {
    weatherData,
    rainingNow,
    rainReports,
    manualAlerts,
    loading,
    lastUpdated,
  } = useWeatherContext();
  const [selectedPath, setSelectedPath] = useState(null);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [subscribedCities, setSubscribedCities] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cloud_alert_cities') || '[]');
    } catch {
      return [];
    }
  });

  const paths = useMemo(() => {
    if (loading || !weatherData) return [];
    return predictCloudPath(weatherData, 12);
  }, [weatherData, loading]);

  const shareText = useMemo(() => {
    return generateForecastShareText(paths, lastUpdated);
  }, [paths, lastUpdated]);

  const autoBulletin = useMemo(
    () =>
      buildAutoBulletin({
        paths,
        rainingNow,
        rainReports,
        manualAlerts,
        weatherData,
        lastUpdated,
      }),
    [paths, rainingNow, rainReports, manualAlerts, weatherData, lastUpdated]
  );

  const topPath = paths[0];
  const stormCount = paths.filter((p) => p.isStormy).length;
  const rainyCount = paths.filter((p) => p.isRainy && !p.isStormy).length;
  const averageWind =
    paths.length > 0
      ? Math.round(paths.reduce((acc, path) => acc + path.windSpeed, 0) / paths.length)
      : 0;

  const bulletinToneClasses = {
    danger:
      'border-red-200 bg-gradient-to-br from-red-50 via-rose-50 to-amber-50 text-red-950',
    rain:
      'border-sky-200 bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 text-sky-950',
    field:
      'border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 text-emerald-950',
    calm:
      'border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900',
  };

  const shareOnWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const shareOnFacebook = () => {
    // نص مبسّط للفيسبوك
    const fbText = shareText.replace(/\*/g, '').replace(/📡/g, '').substring(0, 500);
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}&quote=${encodeURIComponent(fbText)}`;
    window.open(url, '_blank');
  };

  const toggleCitySubscription = (cityName) => {
    const newList = subscribedCities.includes(cityName)
      ? subscribedCities.filter((c) => c !== cityName)
      : [...subscribedCities, cityName];
    setSubscribedCities(newList);
    try {
      localStorage.setItem('cloud_alert_cities', JSON.stringify(newList));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100 animate-pulse">
        <div className="h-24 bg-gradient-to-r from-slate-100 via-blue-50 to-cyan-50 rounded-[1.5rem] mb-5"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl"></div>
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
      <div
        className={`rounded-[1.75rem] border p-5 mb-6 ${
          bulletinToneClasses[autoBulletin.tone] || bulletinToneClasses.calm
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-white/85 border border-white text-[11px] font-bold text-slate-700">
                تتبع حركة السحب
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/85 border border-white text-[11px] font-bold text-slate-700">
                نشرة أوتوماتيكية
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/85 border border-white text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5">
                <SafeIcon icon={FiClock} className="text-[10px]" />
                {formatLastUpdated(lastUpdated)}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/85 border border-white text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5">
                <SafeIcon icon={FiMapPin} className="text-[10px]" />
                {paths.length} مناطق تحت المتابعة
              </span>
            </div>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-white/85 border border-white flex items-center justify-center text-slate-700 shrink-0">
                <SafeIcon icon={FiCloud} className="text-lg" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold mb-1">تتبع حركة السحب والنشرة الأوتوماتيكية 🛰️</h2>
                <p className="text-sm leading-7 opacity-85">
                  متابعة مختصرة لحركة السحب والبرق واحتمال التطور اعتمادًا على الرصد واتجاه
                  الحركة والرياح الحالية.
                </p>
              </div>
            </div>
            <h3 className="text-lg font-extrabold mb-2">{autoBulletin.title}</h3>
            <p className="text-sm font-bold leading-7 mb-2">{autoBulletin.summary}</p>
            <p className="text-sm leading-7 opacity-85">{autoBulletin.details}</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-[260px] lg:justify-end">
            {autoBulletin.chips.map((chip) => (
              <span
                key={chip}
                className="px-3 py-1.5 rounded-full bg-white/85 border border-white text-[11px] font-bold text-slate-700"
              >
                {chip}
              </span>
            ))}
            <button
              onClick={() => setShowSharePanel(!showSharePanel)}
              className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5"
              title="نشر التوقعات"
            >
              <SafeIcon icon={FiShare2} className="text-xs" />
              نشر التوقعات
            </button>
          </div>
        </div>
      </div>

      {/* Share Panel */}
      <AnimatePresence>
        {showSharePanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 rounded-[1.5rem] p-4 border border-sky-100"
          >
            <p className="text-xs font-bold text-sky-900 mb-2">📢 نشر التوقعات</p>
            <textarea
              readOnly
              value={shareText}
              className="w-full bg-white border border-sky-200 rounded-2xl p-3 text-xs text-gray-700 mb-3 resize-none"
              rows={6}
            />
            <div className="flex gap-2">
              <button
                onClick={shareOnWhatsApp}
                className="flex-1 bg-green-500 text-white py-2 rounded-xl text-xs font-bold hover:bg-green-600 transition-colors"
              >
                💬 واتساب
              </button>
              <button
                onClick={shareOnFacebook}
                className="flex-1 bg-[#1877F2] text-white py-2 rounded-xl text-xs font-bold hover:bg-[#166fe5] transition-colors"
              >
                📘 فيسبوك
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareText);
                }}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors"
              >
                📋 نسخ
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cloud Paths */}
      {paths.length === 0 ? (
        <div className="text-center py-10 rounded-[1.75rem] border border-slate-100 bg-gradient-to-br from-slate-50 to-blue-50">
          <span className="text-5xl block mb-3">☀️</span>
          <p className="text-base font-extrabold text-slate-800">الأجواء هادئة حالياً</p>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-7">
            لا تظهر بيانات الساعات القادمة مسارات سحب نشطة تستحق التنبيه في الوقت الحالي.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {topPath && (
            <div className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold text-sky-700 mb-2">أبرز مسار تحت المتابعة</p>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    {topPath.cityType} {topPath.city}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-6">
                    {topPath.severity} خلال نحو {topPath.hours} ساعات، مع اتجاه حركة {getWindDirectionText(topPath.windDir)}.
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full lg:w-auto">
                  <div className="rounded-2xl bg-white border border-slate-100 px-4 py-3 text-center min-w-[110px]">
                    <p className="text-[11px] text-slate-500 mb-1">المدينة الأبرز</p>
                    <p className="text-sm font-extrabold text-slate-800">{topPath.city}</p>
                  </div>
                  <div className="rounded-2xl bg-white border border-slate-100 px-4 py-3 text-center min-w-[110px]">
                    <p className="text-[11px] text-slate-500 mb-1">اتجاه الحركة</p>
                    <p className="text-sm font-extrabold text-slate-800">
                      {getWindDirectionArrow(topPath.windDir)} {getWindDirectionText(topPath.windDir)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white border border-slate-100 px-4 py-3 text-center min-w-[110px]">
                    <p className="text-[11px] text-slate-500 mb-1">احتمال المطر</p>
                    <p className="text-sm font-extrabold text-sky-700">{topPath.maxPrecipProb}%</p>
                  </div>
                  <div className="rounded-2xl bg-white border border-slate-100 px-4 py-3 text-center min-w-[110px]">
                    <p className="text-[11px] text-slate-500 mb-1">سرعة الرياح</p>
                    <p className="text-sm font-extrabold text-slate-800">{topPath.windSpeed} كم/س</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-1">
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-100 text-center">
              <p className="text-xl text-amber-700 font-extrabold">{stormCount}</p>
              <p className="text-[11px] text-amber-700 font-bold">مناطق ذات نشاط رعدي</p>
            </div>
            <div className="bg-gradient-to-br from-sky-50 to-cyan-50 p-4 rounded-2xl border border-sky-100 text-center">
              <p className="text-xl text-sky-700 font-extrabold">{rainyCount}</p>
              <p className="text-[11px] text-sky-700 font-bold">مناطق مرشحة للمطر</p>
            </div>
            <div className="bg-gradient-to-br from-slate-50 to-gray-50 p-4 rounded-2xl border border-slate-100 text-center">
              <p className="text-xl text-slate-700 font-extrabold">{paths.length}</p>
              <p className="text-[11px] text-slate-700 font-bold">إجمالي المناطق المتابعة</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-2xl border border-emerald-100 text-center">
              <p className="text-xl text-emerald-700 font-extrabold">{averageWind} كم/س</p>
              <p className="text-[11px] text-emerald-700 font-bold">متوسط سرعة الدفع</p>
            </div>
          </div>

          {/* Paths List */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {paths.slice(0, 8).map((path, idx) => {
              const theme = getPathTheme(path);

              return (
                <motion.div
                  key={path.city}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`border rounded-[1.75rem] overflow-hidden transition-all shadow-sm hover:shadow-md ${theme.card}`}
                >
                  <button
                    onClick={() => setSelectedPath(selectedPath === path.city ? null : path.city)}
                    className="w-full text-right p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-white/70 border border-white/80 flex items-center justify-center text-2xl shrink-0">
                          <span>{theme.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <p className={`font-extrabold text-base ${theme.title}`}>
                              {path.cityType} {path.city}
                            </p>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${theme.badge}`}>
                              {theme.label}
                            </span>
                          </div>
                          <p className={`text-sm leading-6 ${theme.sub}`}>
                            حركة سحب متوقعة نحو {getWindDirectionText(path.windDir)} خلال {path.hours} ساعات قادمة.
                          </p>
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-2xl bg-white/80 shadow-sm flex items-center justify-center shrink-0">
                        <SafeIcon
                          icon={selectedPath === path.city ? FiTrendingUp : FiTrendingDown}
                          className={`text-sm ${theme.accent}`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <div className="rounded-2xl bg-white/80 border border-white/90 px-3 py-2 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">احتمال المطر</p>
                        <p className="text-xs font-extrabold text-slate-800">{path.maxPrecipProb}%</p>
                      </div>
                      <div className="rounded-2xl bg-white/80 border border-white/90 px-3 py-2 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">سرعة الرياح</p>
                        <p className="text-xs font-extrabold text-slate-800">{path.windSpeed} كم/س</p>
                      </div>
                      <div className="rounded-2xl bg-white/80 border border-white/90 px-3 py-2 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">الاتجاه</p>
                        <p className="text-xs font-extrabold text-slate-800">
                          {getWindDirectionArrow(path.windDir)} {getWindDirectionText(path.windDir)}
                        </p>
                      </div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {selectedPath === path.city && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-4"
                      >
                        <div className={`rounded-[1.25rem] p-4 border space-y-3 ${theme.panel}`}>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-white border border-white/90 p-3">
                              <p className="text-[11px] text-slate-500 mb-1">ملخص الحالة</p>
                              <p className="text-sm font-extrabold text-slate-800">{path.severity}</p>
                            </div>
                            <div className="rounded-2xl bg-white border border-white/90 p-3">
                              <p className="text-[11px] text-slate-500 mb-1">مدة التأثير</p>
                              <p className="text-sm font-extrabold text-slate-800">{path.hours} ساعات</p>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-white border border-white/90 p-3">
                            <p className="text-[11px] text-slate-500 mb-2">قراءة سريعة</p>
                            <p className="text-sm leading-7 text-slate-700">
                              تشير البيانات إلى نشاط سحب فوق <span className="font-bold">{path.city}</span> مع
                              احتمال هطول يصل إلى <span className="font-bold">{path.maxPrecipProb}%</span>، ورياح
                              دافعة بسرعة <span className="font-bold">{path.windSpeed} كم/س</span>.
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCitySubscription(path.city);
                              }}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                                subscribedCities.includes(path.city)
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              <SafeIcon icon={FiBell} className="text-[11px]" />
                              {subscribedCities.includes(path.city)
                                ? 'مشترك في التنبيهات'
                                : 'اشترك في التنبيهات'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-100">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="text-[11px] text-amber-800 font-bold">نشاط رعدي</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-50 border border-sky-100">
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
              <span className="text-[11px] text-sky-800 font-bold">أمطار محتملة</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              <span className="text-[11px] text-slate-700 font-bold">سحب متفرقة</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudTracker;
