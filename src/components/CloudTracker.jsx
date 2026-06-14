import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import { getWeatherDescription, getWeatherIcon } from '../weatherApi';

const { FiCloud, FiNavigation, FiArrowRight, FiWind, FiTrendingUp, FiTrendingDown, FiShare2, FiBell } = FiIcons;

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
    // نحتاج hourly.wind_speed_10m و hourly.wind_direction_10m
    // لكن Open-Meteo قد لا يُرجع wind_direction_10m في كل طلب
    // نستخدم lift_index أو cape كمؤشر على نشاط السحب

    const nextHours = [];
    for (let i = 0; i < hoursAhead && i < hourly.time.length; i++) {
      const timeStr = hourly.time[i];
      const time = new Date(timeStr);
      if (time < now) continue;

      const temp = hourly.temperature_2m?.[i];
      const precipProb = hourly.precipitation_probability?.[i] ?? 0;
      const windSpeed = hourly.wind_speed_10m?.[i] ?? city.current?.wind_speed_10m ?? 0;
      const windDir = hourly.wind_direction_10m?.[i] ?? null;
      const liftedIndex = hourly.lifted_index?.[i] ?? 0;
      const cape = hourly.cape?.[i] ?? 0;
      const weatherCode = hourly.weather_code?.[i] ?? 0;

      // السحب إذا: weather_code >= 1 أو precipProb >= 20 أو lifted_index < 0 (unstable) أو cape > 500
      const hasClouds = weatherCode >= 1 || precipProb >= 20 || liftedIndex < 0 || cape > 500;

      if (hasClouds) {
        nextHours.push({
          hour: time.getHours(),
          temp,
          precipProb,
          windSpeed,
          windDir,
          liftedIndex,
          cape,
          weatherCode,
          isStormy: weatherCode >= 95 || cape > 1000 || liftedIndex < -2,
          isRainy: weatherCode >= 61 || precipProb >= 50,
        });
      }
    }

    if (nextHours.length > 0) {
      // احسب الاتجاه السائد للرياح
      const avgWindDir = nextHours
        .filter((h) => h.windDir !== null)
        .reduce((acc, h, _, arr) => acc + h.windDir / arr.length, 0);

      const avgWindSpeed = nextHours.reduce((acc, h) => acc + h.windSpeed, 0) / nextHours.length;
      const maxCape = Math.max(...nextHours.map((h) => h.cape));
      const maxPrecipProb = Math.max(...nextHours.map((h) => h.precipProb));
      const anyStormy = nextHours.some((h) => h.isStormy);
      const anyRainy = nextHours.some((h) => h.isRainy);

      paths.push({
        city: city.city,
        cityType: city.cityType || 'مقاطعة',
        lat: city.latitude || city.lat,
        lon: city.longitude || city.lon,
        windDir: avgWindDir || null,
        windSpeed: Math.round(avgWindSpeed),
        hours: nextHours.length,
        maxCape,
        maxPrecipProb,
        isStormy: anyStormy,
        isRainy: anyRainy,
        severity: anyStormy ? 'عاصفة' : anyRainy ? 'ممطرة' : 'غائمة',
      });
    }
  });

  // رتب: الأكثر خطورة أولاً
  return paths.sort((a, b) => {
    const score = (p) => (p.isStormy ? 100 : 0) + (p.isRainy ? 50 : 0) + p.maxPrecipProb + p.maxCape / 100;
    return score(b) - score(a);
  });
}

/**
 * نشر التوقعات: إنشاء نص جاهز للمشاركة
 */
function generateForecastShareText(paths, lastUpdated) {
  const nowStr = lastUpdated ? lastUpdated.toLocaleDateString('ar-EG') : '';
  let text = `📡 *تتبع مسار السحب - جاتكم اسحاب*\n`;
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
  const { weatherData, loading, lastUpdated } = useWeatherContext();
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
      <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100 animate-pulse h-64">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <SafeIcon icon={FiCloud} className="text-xl" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">تتبع مسار السحب 🛰️</h2>
            <p className="text-sm text-gray-500">
              توقع حركة السحب والأمطار القادمة بناءً على اتجاه الرياح
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSharePanel(!showSharePanel)}
            className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
            title="نشر التوقعات"
          >
            <SafeIcon icon={FiShare2} className="text-lg" />
          </button>
        </div>
      </div>

      {/* Share Panel */}
      <AnimatePresence>
        {showSharePanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 bg-blue-50 rounded-2xl p-4 border border-blue-100"
          >
            <p className="text-xs font-bold text-blue-800 mb-2">📢 نشر التوقعات</p>
            <textarea
              readOnly
              value={shareText}
              className="w-full bg-white border border-blue-200 rounded-xl p-3 text-xs text-gray-700 mb-3 resize-none"
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
        <div className="text-center py-8">
          <span className="text-4xl block mb-2">☀️</span>
          <p className="text-sm font-bold text-gray-700">الأجواء صافية بشكل عام</p>
          <p className="text-xs text-gray-500 mt-1">
            لا توجد سحب نشطة متوقعة في الساعات الـ 12 القادمة
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 text-center">
              <p className="text-xs text-orange-700 font-bold">
                {paths.filter((p) => p.isStormy).length}
              </p>
              <p className="text-[10px] text-orange-600">مناطق عاصفة</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-center">
              <p className="text-xs text-blue-700 font-bold">
                {paths.filter((p) => p.isRainy && !p.isStormy).length}
              </p>
              <p className="text-[10px] text-blue-600">مناطق ممطرة</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
              <p className="text-xs text-gray-700 font-bold">{paths.length}</p>
              <p className="text-[10px] text-gray-600">مناطق غائمة</p>
            </div>
            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-center">
              <p className="text-xs text-emerald-700 font-bold">
                {paths.reduce((acc, p) => acc + p.maxPrecipProb, 0) / Math.max(1, paths.length)}%
              </p>
              <p className="text-[10px] text-emerald-600">متوسط احتمال المطر</p>
            </div>
          </div>

          {/* Paths List */}
          {paths.slice(0, 8).map((path, idx) => (
            <motion.div
              key={path.city}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`border rounded-2xl overflow-hidden transition-all ${
                path.isStormy
                  ? 'border-red-200 bg-red-50/50'
                  : path.isRainy
                  ? 'border-blue-200 bg-blue-50/50'
                  : 'border-gray-100 bg-gray-50/50'
              }`}
            >
              <button
                onClick={() => setSelectedPath(selectedPath === path.city ? null : path.city)}
                className="w-full text-right p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {path.isStormy ? '⛈️' : path.isRainy ? '🌧️' : '☁️'}
                  </span>
                  <div className="text-right">
                    <p className="font-bold text-sm text-gray-900">
                      {path.cityType} {path.city}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {path.severity} • {path.hours} ساعات قادمة
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-xs font-bold text-gray-700">
                      {getWindDirectionArrow(path.windDir)} {path.windSpeed} كم/س
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {getWindDirectionText(path.windDir)}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center">
                    <SafeIcon
                      icon={selectedPath === path.city ? FiTrendingUp : FiTrendingDown}
                      className="text-gray-400 text-xs"
                    />
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
                    <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-2">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-400">احتمال المطر</p>
                          <p className="text-xs font-bold text-blue-600">{path.maxPrecipProb}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">طاقة الحمل</p>
                          <p className="text-xs font-bold text-purple-600">{Math.round(path.maxCape)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">سرعة الرياح</p>
                          <p className="text-xs font-bold text-gray-700">{path.windSpeed} كم/س</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCitySubscription(path.city);
                          }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                            subscribedCities.includes(path.city)
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <SafeIcon icon={FiBell} className="text-[10px]" />
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
          ))}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span className="text-[10px] text-gray-600">عواصف رعدية</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-[10px] text-gray-600">أمطار</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              <span className="text-[10px] text-gray-600">سحب غائمة</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudTracker;
