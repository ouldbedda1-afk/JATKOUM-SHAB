import React from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeather } from '../useWeather';
import { getWeatherDescription, getWeatherIcon } from '../weatherApi';
import { useWeatherContext } from '../WeatherContext';

const { FiWind, FiDroplet, FiThermometer, FiClock, FiRefreshCw } = FiIcons;

const WeatherHero = ({ city, favCity, onFavCity }) => {
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
      <div className="relative overflow-hidden rounded-[2rem] p-8 lg:p-12 shadow-2xl mb-8 h-72 bg-gradient-to-br from-[#0b2c5e] via-[#103a78] to-[#1a5276]">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl animate-pulse" style={{animationDelay:'0.5s'}} />
        </div>
        <div className="relative z-10 h-full flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white/80 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !weatherData) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-br from-red-900 to-orange-900 rounded-[2rem] p-8 lg:p-12 text-white shadow-2xl mb-8">
        <div className="relative z-10 text-center">
          <p className="text-5xl mb-4">⚠️</p>
          <p className="text-xl font-bold">خطأ في جلب بيانات الطقس</p>
          <p className="text-sm opacity-70 mt-2">{error || 'حاول لاحقاً'}</p>
        </div>
      </div>
    );
  }

  const isFallback = !!weatherData?.isFallback;
  const temp = isFallback ? null : Math.round(weatherData.current?.temperature_2m ?? null);
  const weatherCode = weatherData.current?.weather_code ?? 0;
  const condition = isFallback ? '' : getWeatherDescription(weatherCode);
  const icon = isFallback ? '🌡️' : getWeatherIcon(weatherCode);
  const wind = isFallback ? null : Math.round(weatherData.current?.wind_speed_10m ?? 0);
  const humidity = isFallback ? null : (weatherData.current?.relative_humidity_2m ?? 0);
  const rainProb = isFallback ? null : (weatherData.hourly?.precipitation_probability?.[0] ?? 0);
  const pressure = isFallback ? null : Math.round(weatherData.current?.pressure_msl ?? 0);

  // لون الخلفية حسب درجة الحرارة
  const getBgGradient = () => {
    if (isFallback) return 'from-[#0b2c5e] via-[#103a78] to-[#1a5276]';
    if (temp === null) return 'from-[#0b2c5e] via-[#103a78] to-[#1a5276]';
    if (temp >= 42) return 'from-red-900 via-orange-900 to-red-800';
    if (temp >= 36) return 'from-orange-900 via-amber-900 to-orange-800';
    if (temp >= 28) return 'from-[#0b3d2e] via-[#0b4d3a] to-[#0b5e40]';
    if (temp >= 20) return 'from-[#0b2c5e] via-[#103a78] to-[#1a5276]';
    return 'from-[#0b1f4e] via-[#0d2860] to-[#1a3a6e]';
  };

  const getTempColor = () => {
    if (temp === null) return 'text-white/60';
    if (temp >= 42) return 'text-orange-300';
    if (temp >= 36) return 'text-yellow-300';
    if (temp >= 28) return 'text-emerald-300';
    return 'text-blue-200';
  };

  const shareOnWhatsApp = () => {
    const text = `حالة الطقس في ${cityName} الآن:\n- الحرارة: ${temp}°م\n- الحالة: ${condition}\n- الرياح: ${wind} كم/س\nتابع عبر جاتكم اسحاب: ${window.location.origin}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-[2rem] shadow-2xl mb-8 bg-gradient-to-br ${getBgGradient()}`}
    >
      {/* خلفية ديناميكية */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/3 rounded-full blur-3xl" />
        {/* خطوط زخرفية */}
        <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage:'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)', backgroundSize:'20px 20px'}} />
      </div>

      <div className="relative z-10 p-6 md:p-10 lg:p-12">
        {/* الشريط العلوي */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-full text-xs text-white/90 font-medium backdrop-blur-sm transition-all"
          >
            <SafeIcon icon={FiIcons.FiMapPin || FiIcons.FiMap} className="text-xs" />
            {city?.isLocal ? 'موقعك الحالي' : 'تحديد موقعي'}
          </button>

          <div className="flex items-center gap-1.5 bg-red-500/80 border border-red-400/40 px-3 py-1.5 rounded-full text-xs text-white font-bold backdrop-blur-sm shadow">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
            بث مباشر
          </div>

          {lastUpdated && (
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 px-3 py-1.5 rounded-full text-[11px] text-white/80 backdrop-blur-sm">
              <SafeIcon icon={FiClock} className="text-[10px]" />
              {lastUpdated.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          <button
            onClick={shareOnWhatsApp}
            className="flex items-center gap-1.5 bg-[#25d366]/80 hover:bg-[#25d366] border border-[#25d366]/40 px-3 py-1.5 rounded-full text-xs text-white font-bold backdrop-blur-sm transition-all shadow ml-auto"
          >
            <span>💬</span> شارك
          </button>
        </div>

        {/* المحتوى الرئيسي */}
        <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-8">

          {/* يسار: اسم المدينة + الإحصائيات */}
          <div className="flex-1 w-full">
            {/* اسم المدينة */}
            <div className="flex items-center gap-3 mb-2">
              <motion.h1
                key={cityName}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-4xl md:text-6xl lg:text-7xl font-black text-white leading-none drop-shadow-lg"
              >
                {cityName}
              </motion.h1>
              {onFavCity && (
                <button
                  onClick={() => onFavCity(cityName)}
                  title={favCity === cityName ? 'مدينتك المفضّلة' : 'احفظ كمدينة افتراضية'}
                  className="text-3xl transition-transform hover:scale-110 active:scale-90 mt-1"
                >
                  {favCity === cityName ? '⭐' : '☆'}
                </button>
              )}
            </div>
            <p className="text-white/60 text-sm font-medium mb-8">توقعات دقيقة لهطول الأمطار والحرارة</p>

            {/* بطاقات الإحصائيات */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { icon: FiDroplet,     label: 'احتمال المطر', value: rainProb !== null ? `${rainProb}%` : '--',      color: 'text-blue-300',    bg: 'bg-blue-500/20',    border: 'border-blue-400/30' },
                { icon: FiWind,        label: 'الرياح',       value: wind !== null ? `${wind} كم/س` : '--',          color: 'text-cyan-300',    bg: 'bg-cyan-500/20',    border: 'border-cyan-400/30' },
                { icon: FiDroplet,     label: 'الرطوبة',      value: humidity !== null ? `${humidity}%` : '--',       color: 'text-indigo-300',  bg: 'bg-indigo-500/20',  border: 'border-indigo-400/30' },
                { icon: FiThermometer, label: 'الضغط',        value: pressure !== null ? `${pressure} hPa` : '--',   color: 'text-violet-300',  bg: 'bg-violet-500/20',  border: 'border-violet-400/30' },
              ].map(({ icon, label, value, color, bg, border }) => (
                <div key={label} className={`${bg} backdrop-blur-md border ${border} rounded-2xl p-4 flex flex-col gap-1.5`}>
                  <SafeIcon icon={icon} className={`text-xl ${color}`} />
                  <span className="text-white/50 text-[11px] font-medium">{label}</span>
                  <span className="text-white font-bold text-base leading-none">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* يمين: درجة الحرارة */}
          <motion.div
            key={cityName + temp}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex flex-col items-center shrink-0"
          >
            {/* الأيقونة */}
            <span className="text-7xl md:text-8xl mb-2 drop-shadow-xl">{icon}</span>

            {/* درجة الحرارة */}
            <div className={`text-[6rem] md:text-[8rem] lg:text-[9rem] font-black leading-none ${getTempColor()} drop-shadow-2xl`}
              style={{ textShadow: temp !== null ? `0 0 40px currentColor` : 'none', letterSpacing: '-4px' }}
            >
              {temp !== null ? `${temp}°` : '--°'}
            </div>

            {/* الحالة / رسالة الفشل */}
            {isFallback ? (
              <div className="flex flex-col items-center gap-2 mt-2">
                <p className="text-white/50 text-sm bg-white/10 border border-white/15 px-4 py-1.5 rounded-full">⚠️ البيانات غير متاحة مؤقتاً</p>
                <button
                  onClick={() => clearCache()}
                  className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1.5 rounded-full transition-all"
                >
                  <SafeIcon icon={FiRefreshCw} className="text-xs" />
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              <p className="text-white/80 text-lg font-semibold mt-2 tracking-wide">{condition}</p>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default WeatherHero;
