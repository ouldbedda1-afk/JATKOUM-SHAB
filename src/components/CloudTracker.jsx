import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';

const { FiCloud, FiShare2, FiClock } =
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

const SOUTH_WILAYAS = new Set(['الحوض الغربي', 'الحوض الشرقي', 'لعصابه', 'كيدماغا', 'كوركول']);

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
    title: 'نشرة أوتوماتيكية: لا مؤشرات مؤكدة حالياً',
    summary: 'لا تظهر حالياً في النظام الآلي مؤشرات مؤكدة على خلايا ممطرة أو رعدية مؤثرة في الجنوب.',
    details:
      'تستمر المتابعة الآلية للرادار ومسارات السحب والبلاغات الميدانية، وقد تظهر حالات محلية أو تطورات سريعة مع أي تحديث جديد خلال الساعات القادمة.',
    chips: ['متابعة آلية', 'لا تأكيد حالي', lastUpdatedLabel],
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
  const [showSharePanel, setShowSharePanel] = useState(false);

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

  // لا نعرض النشرة في حالة الاستقرار النسبي (لا مؤشرات بارزة)
  if (autoBulletin.tone === 'calm') {
    return null;
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
    </div>
  );
};

export default CloudTracker;
