import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';

const { FiCloudRain, FiWind, FiThermometer } = FiIcons;

const TOP_LIMIT = 3;

// تدرج لوني حسب درجة الحرارة
function getTempTheme(temp, isHot) {
  if (isHot) {
    if (temp >= 44) return { grad: 'from-red-700 to-rose-600',     text: 'text-white', sub: 'text-red-100',    badge: 'bg-red-900/60',   glow: 'shadow-red-500/30' };
    if (temp >= 40) return { grad: 'from-orange-600 to-red-600',   text: 'text-white', sub: 'text-orange-100', badge: 'bg-orange-900/60', glow: 'shadow-orange-500/30' };
    if (temp >= 35) return { grad: 'from-amber-500 to-orange-600', text: 'text-white', sub: 'text-amber-100',  badge: 'bg-amber-900/60',  glow: 'shadow-amber-500/30' };
    return              { grad: 'from-yellow-500 to-amber-600',    text: 'text-white', sub: 'text-yellow-100', badge: 'bg-yellow-900/60', glow: 'shadow-yellow-500/20' };
  } else {
    if (temp <= 10) return { grad: 'from-blue-900 to-indigo-800',  text: 'text-white', sub: 'text-blue-100',   badge: 'bg-blue-950/60',   glow: 'shadow-blue-500/30' };
    if (temp <= 18) return { grad: 'from-blue-700 to-cyan-600',    text: 'text-white', sub: 'text-blue-100',   badge: 'bg-blue-900/60',   glow: 'shadow-blue-500/30' };
    if (temp <= 24) return { grad: 'from-teal-600 to-cyan-500',    text: 'text-white', sub: 'text-teal-100',   badge: 'bg-teal-900/60',   glow: 'shadow-teal-500/20' };
    return              { grad: 'from-sky-500 to-blue-500',        text: 'text-white', sub: 'text-sky-100',    badge: 'bg-sky-900/60',    glow: 'shadow-sky-500/20' };
  }
}

const CityGrid = () => {
  const { weatherData: cities, loading } = useWeatherContext();

  const sorted = useMemo(() => {
    if (!cities?.length) return { hot: [], cold: [] };
    const valid = cities
      .filter(c => c?.current?.temperature_2m != null && !c.isFallback && c.cityType !== 'قرية')
      .sort((a, b) => b.current.temperature_2m - a.current.temperature_2m);
    return { hot: valid, cold: [...valid].reverse() };
  }, [cities]);

  if (loading) {
    return (
      <div className="mt-12 space-y-10">
        {[0, 1].map(s => (
          <div key={s}>
            <div className="h-8 w-72 bg-gray-200 rounded-full animate-pulse mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-3xl animate-pulse h-40 bg-gradient-to-br from-gray-200 to-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!sorted.hot.length) return null;

  const MoughataaCard = ({ city, rank, isHot }) => {
    const temp   = Math.round(city.current.temperature_2m);
    const code   = city.current.weather_code ?? 0;
    const wind   = Math.round(city.current.wind_speed_10m ?? 0);
    const rain   = city.hourly?.precipitation_probability?.[0] ?? 0;
    const theme  = getTempTheme(temp, isHot);
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: Math.min(rank * 0.08, 0.4), type: 'spring', stiffness: 260, damping: 22 }}
        whileHover={{ y: -4, scale: 1.02 }}
        className={`relative overflow-hidden bg-gradient-to-br ${theme.grad} rounded-3xl p-5 shadow-xl ${theme.glow} cursor-default`}
      >
        {/* زخرفة خلفية */}
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-black/10 rounded-full blur-xl pointer-events-none" />

        {/* أيقونة الطقس */}
        <div className="flex items-center justify-end mb-3">
          <span className="text-3xl drop-shadow-md">{getWeatherIcon(code)}</span>
        </div>

        {/* اسم المدينة */}
        <p className={`text-lg font-black ${theme.text} leading-tight mb-0.5 drop-shadow`}>{city.city}</p>
        {city.wilaya && (
          <p className={`text-xs font-medium ${theme.sub} opacity-80 mb-3`}>{city.wilaya}</p>
        )}

        {/* درجة الحرارة */}
        <div className="flex items-end justify-between">
          <p className={`text-5xl font-black ${theme.text} leading-none drop-shadow-lg`}
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
            {temp}°
          </p>
          <div className={`flex flex-col items-end gap-1 text-xs font-medium ${theme.sub} opacity-90`}>
            <span className="flex items-center gap-1">
              <SafeIcon icon={FiWind} className="text-[10px]" />
              {wind} كم/س
            </span>
            {rain > 0 && (
              <span className="flex items-center gap-1 font-bold">
                <SafeIcon icon={FiCloudRain} className="text-[10px]" />
                {rain}%
              </span>
            )}
          </div>
        </div>

        {/* حالة الطقس */}
        <p className={`text-[11px] font-medium ${theme.sub} opacity-70 mt-2 truncate`}>
          {getWeatherDescription(code)}
        </p>
      </motion.div>
    );
  };

  const Section = ({ title, emoji, data, isHot }) => (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-1.5 h-9 rounded-full ${isHot ? 'bg-gradient-to-b from-orange-400 to-red-500' : 'bg-gradient-to-b from-blue-400 to-cyan-500'}`} />
          <div>
            <h3 className="text-xl font-black text-gray-800">{title} {emoji}</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">أعلى {Math.min(TOP_LIMIT, data.length)} مقاطعات · المصدر: ECMWF</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {data.slice(0, TOP_LIMIT).map((city, i) => (
          <MoughataaCard key={city.city} city={city} rank={i} isHot={isHot} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-12 space-y-14">
      <Section title="المقاطعات الأكثر حرارة" emoji="🔥" data={sorted.hot}  isHot={true}  />
      <Section title="المقاطعات الأكثر برودة" emoji="❄️" data={sorted.cold} isHot={false} />
    </div>
  );
};

export default CityGrid;
