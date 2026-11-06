import React from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeather } from '../useWeather';
import { getWeatherDescription, getWeatherIcon } from '../weatherApi';
import { useWeatherContext } from '../WeatherContext';

const { FiWind, FiDroplet, FiClock, FiRefreshCw, FiMapPin, FiCloudRain, FiActivity } = FiIcons;

// الأوقات بأرقام لاتينية؛ توقيت موريتانيا هو UTC
const hhmm = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
const HOURS_SHOWN = 12;

// onLocate: طلب الموقع الجغرافي (يحل محل شريط «فعّل موقعك» القديم)، locating: الطلب جارٍ
const WeatherHero = ({ city, favCity, onFavCity, onLocate, locating = false }) => {
  const { lastUpdated, weatherData: contextWeatherData, clearCache } = useWeatherContext();
  const cityName = typeof city === 'string' ? city : city?.name || 'نواكشوط';
  const coords   = typeof city === 'object' && city?.lat ? city : null;
  const { data: fetchedData, loading, error } = useWeather(cityName, coords);

  const weatherData = (() => {
    if (fetchedData && !fetchedData.isFallback) return fetchedData;
    if (contextWeatherData?.length > 0) {
      if (coords) {
        let best = null, bestDist = Infinity;
        contextWeatherData.forEach(c => {
          const lat = c.latitude ?? c.lat;
          const lon = c.longitude ?? c.lon;
          if (!lat || !lon) return;
          const d = Math.abs(lat - coords.lat) + Math.abs(lon - coords.lon);
          if (d < bestDist) { bestDist = d; best = c; }
        });
        if (best && bestDist < 3 && !best.isFallback) return best;
      }
      const match = contextWeatherData.find(c => c.city === cityName);
      if (match && !match.isFallback) return match;
      const nouakchott = contextWeatherData.find(c => c.city === 'نواكشوط');
      if (nouakchott && !nouakchott.isFallback) return nouakchott;
    }
    return fetchedData;
  })();

  if (loading) {
    return (
      <div className="rounded-3xl shadow-xl h-64 bg-gradient-to-br from-[#0b2c5e] via-[#103a78] to-[#1a5276] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !weatherData) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-red-900 to-orange-900 p-8 text-white shadow-xl text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="text-lg font-bold">خطأ في جلب بيانات الطقس</p>
        <p className="text-sm opacity-70 mt-1">{error || 'حاول لاحقاً'}</p>
      </div>
    );
  }

  const isFallback = !!weatherData?.isFallback;
  const temp = isFallback ? null : Math.round(weatherData.current?.temperature_2m ?? null);
  const weatherCode = weatherData.current?.weather_code ?? 0;
  const condition = isFallback ? '' : getWeatherDescription(weatherCode);
  const icon = isFallback ? '🌡️' : getWeatherIcon(weatherCode);
  const wind = isFallback ? null : Math.round(weatherData.current?.wind_speed_10m ?? 0);
  const humidity = isFallback ? null : (weatherData.current?.relative_humidity_2m ?? null);
  const pressure = isFallback || weatherData.current?.pressure_msl == null ? null : Math.round(weatherData.current.pressure_msl);

  // الساعة الجارية في التوقع الساعي: منها احتمال المطر الآن وشريط الساعات القادمة
  const hourly = weatherData.hourly;
  const nowKey = `${new Date().toISOString().slice(0, 13)}:00`;
  const hourIdx = !isFallback && hourly?.time ? Math.max(0, hourly.time.indexOf(nowKey)) : -1;
  const rainProb = hourIdx < 0 ? null : (hourly.precipitation_probability?.[hourIdx] ?? null);
  const nextHours = hourIdx < 0 ? [] : hourly.time.slice(hourIdx, hourIdx + HOURS_SHOWN).map((t, k) => ({
    hour: t.slice(11, 16),
    temp: hourly.temperature_2m?.[hourIdx + k],
    code: hourly.weather_code?.[hourIdx + k],
    rain: hourly.precipitation_probability?.[hourIdx + k],
  }));
  const tmax = isFallback ? null : weatherData.daily?.temperature_2m_max?.[0];
  const tmin = isFallback ? null : weatherData.daily?.temperature_2m_min?.[0];

  // لون الخلفية حسب درجة الحرارة
  const getBgGradient = () => {
    if (temp === null) return 'from-[#0b2c5e] via-[#103a78] to-[#1a5276]';
    if (temp >= 42) return 'from-red-900 via-orange-900 to-red-800';
    if (temp >= 36) return 'from-orange-900 via-amber-900 to-orange-800';
    if (temp >= 28) return 'from-[#0b3d2e] via-[#0b4d3a] to-[#0b5e40]';
    if (temp >= 20) return 'from-[#0b2c5e] via-[#103a78] to-[#1a5276]';
    return 'from-[#0b1f4e] via-[#0d2860] to-[#1a3a6e]';
  };

  const shareOnWhatsApp = () => {
    const text = `حالة الطقس في ${cityName} الآن:\n- الحرارة: ${temp}°م\n- الحالة: ${condition}\n- الرياح: ${wind} كم/س\nتابع عبر جاتكم اسحاب: ${window.location.origin}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const stats = [
    { icon: FiCloudRain, label: 'احتمال المطر', value: rainProb !== null ? `${rainProb}%` : '--' },
    { icon: FiWind,      label: 'الرياح',       value: wind !== null ? `${wind} كم/س` : '--' },
    { icon: FiDroplet,   label: 'الرطوبة',      value: humidity !== null ? `${humidity}%` : '--' },
    { icon: FiActivity,  label: 'الضغط',        value: pressure !== null ? `${pressure} hPa` : '--' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden rounded-3xl shadow-xl bg-gradient-to-br ${getBgGradient()} text-white`}
    >
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-5 md:p-7">
        {/* المدينة والأزرار */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-black truncate">{cityName}</h1>
              {onFavCity && (
                <button
                  onClick={() => onFavCity(cityName)}
                  title={favCity === cityName ? 'مدينتك المفضّلة' : 'احفظ كمدينة افتراضية'}
                  aria-label="المدينة المفضلة"
                  className="text-xl transition-transform hover:scale-110 active:scale-90"
                >
                  {favCity === cityName ? '⭐' : '☆'}
                </button>
              )}
            </div>
            {lastUpdated && (
              <p className="text-[11px] text-white/60 mt-1 flex items-center gap-1">
                <SafeIcon icon={FiClock} className="text-[10px]" /> تحديث {hhmm(lastUpdated)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {city?.isLocal ? (
              <span className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full text-xs">
                <SafeIcon icon={FiMapPin} className="text-xs" /> موقعك
              </span>
            ) : onLocate && (
              <button
                onClick={onLocate}
                disabled={locating}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-60"
              >
                <SafeIcon icon={FiMapPin} className="text-xs" />
                {locating ? 'جارٍ…' : 'موقعي'}
              </button>
            )}
            <button
              onClick={shareOnWhatsApp}
              className="bg-[#25d366] hover:bg-[#20bd5a] px-3 py-1.5 rounded-full text-xs font-bold transition-all"
            >
              شارك
            </button>
          </div>
        </div>

        {/* الحرارة الآن */}
        <div className="flex items-center gap-4 mt-4">
          <span className="text-6xl md:text-7xl drop-shadow-lg" aria-hidden="true">{icon}</span>
          <div>
            <div className="text-6xl md:text-7xl font-black leading-none tracking-tight">{temp !== null ? `${temp}°` : '--°'}</div>
            {isFallback ? (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-white/70 text-xs bg-white/10 px-3 py-1 rounded-full">⚠️ البيانات غير متاحة مؤقتاً</span>
                <button
                  onClick={() => clearCache()}
                  className="flex items-center gap-1 text-white/80 hover:text-white text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full"
                >
                  <SafeIcon icon={FiRefreshCw} className="text-xs" /> إعادة المحاولة
                </button>
              </div>
            ) : (
              <p className="text-white/85 text-sm md:text-base font-semibold mt-1">
                {condition}
                {tmax != null && tmin != null && (
                  <span className="block sm:inline text-white/60 font-normal text-xs sm:text-sm">
                    <span className="hidden sm:inline"> · </span>العظمى {Math.round(tmax)}° · الصغرى {Math.round(tmin)}°
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* المطر والرياح والرطوبة والضغط في سطر واحد */}
        <div className="grid grid-cols-4 gap-2 mt-5">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-white/10 border border-white/10 rounded-xl px-1.5 py-2.5 text-center">
              <SafeIcon icon={Icon} className="text-sm text-white/70 mx-auto" />
              <p className="text-[10px] text-white/60 mt-1">{label}</p>
              <p className="text-sm font-bold leading-tight mt-0.5" dir="ltr">{value}</p>
            </div>
          ))}
        </div>

        {/* الساعات القادمة */}
        {nextHours.length > 0 && (
          <div className="mt-4 -mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
            {nextHours.map((h, k) => (
              <div key={h.hour + k} className={`shrink-0 w-14 rounded-xl py-2 text-center ${k === 0 ? 'bg-white/20' : 'bg-white/5'}`}>
                <p className="text-[10px] text-white/70">{k === 0 ? 'الآن' : h.hour}</p>
                <p className="text-lg leading-tight" aria-hidden="true">{getWeatherIcon(h.code ?? 0)}</p>
                <p className="text-xs font-bold">{h.temp != null ? `${Math.round(h.temp)}°` : '--'}</p>
                {h.rain >= 20 && <p className="text-[10px] text-sky-200">{h.rain}%</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default WeatherHero;
