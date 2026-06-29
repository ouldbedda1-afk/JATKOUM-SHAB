import React from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeather } from '../useWeather';
import { getWeatherDescription, getWeatherIcon } from '../weatherApi';
import { useWeatherContext } from '../WeatherContext';

const { FiWind, FiDroplet, FiSun, FiThermometer, FiClock } = FiIcons;

const WeatherHero = ({ city, favCity, onFavCity }) => {
  const { lastUpdated, weatherData: contextWeatherData, clearCache } = useWeatherContext();
  const cityName = typeof city === 'string' ? city : city?.name || 'نواكشوط';
  const coords   = typeof city === 'object' && city?.lat ? city : null;
  const { data: fetchedData, loading, error } = useWeather(cityName, coords);

  // إذا كانت البيانات المجلوبة صفرية (isFallback)، ابحث في Context عن أقرب مدينة
  const weatherData = (() => {
    if (fetchedData && !fetchedData.isFallback) return fetchedData;
    // حاول إيجاد نواكشوط أو أي مدينة في Context كبديل
    if (contextWeatherData?.length > 0) {
      if (coords) {
        // ابحث عن أقرب مدينة بالإحداثيات
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
      // آخر ملاذ: نواكشوط
      const nouakchott = contextWeatherData.find(c => c.city === 'نواكشوط');
      if (nouakchott && !nouakchott.isFallback) return nouakchott;
    }
    return fetchedData;
  })();

  if (loading) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-emerald-600 rounded-[2rem] p-8 lg:p-12 text-white shadow-2xl mb-8 animate-pulse">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-400/20 rounded-full -ml-20 -mb-20 blur-3xl"></div>
        <div className="relative z-10 h-40 bg-white/10 rounded-lg"></div>
      </div>
    );
  }

  if (error || !weatherData) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-br from-red-600 to-orange-600 rounded-[2rem] p-8 lg:p-12 text-white shadow-2xl mb-8">
        <div className="relative z-10 text-center">
          <p className="text-xl font-bold">خطأ في جلب بيانات الطقس</p>
          <p className="text-sm opacity-80 mt-2">{error || 'حاول لاحقاً'}</p>
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

  const shareOnWhatsApp = () => {
    const text = `حالة الطقس في ${cityName} الآن:
- الحرارة: ${temp}°م
- الحالة: ${condition}
- احتمال المطر: ${rainProb}%
- الرياح: ${wind} كم/س
تابع التوقعات المباشرة عبر موقع جاتكم اسحاب: ${window.location.origin}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleUpdateLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ar`);
            const data = await response.json();
            const cityName = data.address?.city || data.address?.town || data.address?.village || data.address?.state;
            if (cityName) {
              // Note: This won't update the parent state directly unless we pass a setter
              // But we can at least show we are trying.
              // Actually, it's better to pass onCitySelect from App.jsx
              window.location.reload(); // Quick fix to re-trigger App.jsx geolocation
            }
          } catch (error) {
            console.error('Error fetching city name:', error);
          }
        }
      );
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[2rem] p-8 lg:p-12 text-white shadow-2xl mb-8 group">
      {/* Background Image from FB */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-blue-900/40 z-10"></div>
        <img 
          src="https://images.unsplash.com/photo-1536431311719-398b6704d4cc?auto=format&fit=crop&q=80&w=1200"
          alt="خلفية جاتكم اسحاب"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-blue-800/60 to-transparent z-20"></div>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="text-center md:text-right">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2"
          >
            <button 
              onClick={() => window.location.reload()}
              className="bg-white/20 hover:bg-white/30 px-4 py-1 rounded-full text-xs md:text-sm font-medium backdrop-blur-sm transition-colors flex items-center gap-1"
            >
              <SafeIcon icon={FiIcons.FiMapPin || FiIcons.FiMap} className="text-xs" />
              {city.isLocal ? 'موقعك الحالي' : 'تحديد موقعي'}
            </button>
            <div className="bg-red-500/80 px-4 py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-2 backdrop-blur-sm shadow-lg border border-red-400/30">
              <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
              بث مباشر
            </div>
            {lastUpdated && (
              <div className="bg-blue-600/40 px-3 py-1 rounded-full text-[9px] md:text-[10px] font-medium flex items-center gap-1 backdrop-blur-sm border border-white/10">
                <SafeIcon icon={FiClock} className="text-[10px]" />
                {lastUpdated.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            <button 
              onClick={shareOnWhatsApp}
              className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors shadow-lg"
            >
              <span className="text-sm">💬</span>
              شارك عبر واتساب
            </button>
          </motion.div>
          <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
            <h1 className="text-4xl md:text-7xl font-black break-words">{cityName}</h1>
            {onFavCity && (
              <button
                onClick={() => onFavCity(cityName)}
                title={favCity === cityName ? 'مدينتك المفضّلة' : 'احفظ كمدينة افتراضية'}
                className="shrink-0 text-3xl md:text-4xl transition-transform hover:scale-110 active:scale-95"
              >
                {favCity === cityName ? '⭐' : '☆'}
              </button>
            )}
          </div>
          <p className="text-lg md:text-xl opacity-90 mb-6 font-light">توقعات دقيقة لهطول الأمطار والحرارة</p>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex flex-col items-center border border-white/10">
              <SafeIcon icon={FiDroplet} className="text-2xl mb-2 text-blue-300" />
              <span className="text-sm opacity-80">احتمال المطر</span>
              <span className="font-bold">{rainProb !== null ? `${rainProb}%` : '--'}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex flex-col items-center border border-white/10">
              <SafeIcon icon={FiWind} className="text-2xl mb-2 text-blue-300" />
              <span className="text-sm opacity-80">الرياح</span>
              <span className="font-bold">{wind !== null ? `${wind} كم/س` : '--'}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex flex-col items-center border border-white/10">
              <SafeIcon icon={FiDroplet} className="text-2xl mb-2 text-blue-300" />
              <span className="text-sm opacity-80">الرطوبة</span>
              <span className="font-bold">{humidity !== null ? `${humidity}%` : '--'}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex flex-col items-center border border-white/10">
              <SafeIcon icon={FiThermometer} className="text-2xl mb-2 text-blue-300" />
              <span className="text-sm opacity-80">الضغط</span>
              <span className="font-bold">{pressure !== null ? `${pressure} hPa` : '--'}</span>
            </div>
          </div>
        </div>

        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="text-[8rem] md:text-[10rem] font-bold leading-tight relative">
            {temp !== null ? `${temp}°` : '--°'}
            <div className="absolute -top-4 -right-12">
               <span className="text-6xl">{icon}</span>
            </div>
          </div>
          {isFallback ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium opacity-70 bg-white/10 px-3 py-1 rounded-full">⚠️ البيانات غير متاحة مؤقتاً</p>
              <button
                onClick={() => clearCache()}
                className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : (
            <p className="text-2xl font-medium tracking-wide uppercase">{condition}</p>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default WeatherHero;