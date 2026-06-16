import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';

const { FiCloudRain, FiWind } = FiIcons;

const TOP_LIMIT = 3;

const CityGrid = () => {
  const { weatherData: cities, loading } = useWeatherContext();

  const sorted = useMemo(() => {
    if (!cities?.length) return { hot: [], cold: [] };
    const valid = cities
      .filter(c => c?.current?.temperature_2m != null && !c.isFallback)
      .sort((a, b) => b.current.temperature_2m - a.current.temperature_2m);
    return { hot: valid, cold: [...valid].reverse() };
  }, [cities]);

  if (loading) {
    return (
      <div className="mt-12 space-y-10">
        {[0, 1].map(s => (
          <div key={s}>
            <div className="h-8 w-72 bg-gray-200 rounded-full animate-pulse mb-6" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl shadow-sm animate-pulse h-28" />
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
    const isTop3 = rank < 3;

    const accent = isHot
      ? { border: isTop3 ? 'border-orange-400' : 'border-orange-100', temp: 'text-orange-600', bg: isTop3 ? 'bg-orange-50' : 'bg-white', badge: 'bg-orange-500' }
      : { border: isTop3 ? 'border-blue-400'   : 'border-blue-100',   temp: 'text-blue-600',   bg: isTop3 ? 'bg-blue-50'   : 'bg-white', badge: 'bg-blue-500' };

    const medal = ['🥇', '🥈', '🥉'][rank] ?? null;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(rank * 0.03, 0.3) }}
        className={`${accent.bg} border-2 ${accent.border} rounded-2xl p-3 shadow-sm hover:shadow-md transition-all`}
      >
        {/* اسم المقاطعة */}
        <div className="flex items-center justify-between mb-2 gap-1">
          <div className="flex items-center gap-1 min-w-0">
            {medal && <span className="text-base flex-shrink-0">{medal}</span>}
            {!medal && (
              <span className={`text-[9px] font-black text-white ${accent.badge} w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0`}>
                {rank + 1}
              </span>
            )}
            <p className="text-xs font-bold text-gray-800 truncate">{city.city}</p>
          </div>
          <span className="text-lg flex-shrink-0">{getWeatherIcon(code)}</span>
        </div>

        {/* الولاية */}
        {city.wilaya && (
          <p className="text-[9px] text-gray-400 truncate mb-2 mr-5">{city.wilaya}</p>
        )}

        {/* درجة الحرارة */}
        <p className={`text-3xl font-black ${accent.temp} text-center my-1`}>{temp}°</p>

        {/* حالة الطقس */}
        <p className="text-[9px] text-gray-500 text-center truncate mb-2">
          {getWeatherDescription(code)}
        </p>

        {/* رياح ومطر */}
        <div className="flex items-center justify-between text-[9px] text-gray-400 border-t border-gray-100 pt-1 mt-1">
          <span className="flex items-center gap-0.5">
            <SafeIcon icon={FiWind} className="text-[10px]" />
            {wind} كم/س
          </span>
          {rain > 0 && (
            <span className="flex items-center gap-0.5 text-blue-500 font-bold">
              <SafeIcon icon={FiCloudRain} className="text-[10px]" />
              {rain}%
            </span>
          )}
        </div>
      </motion.div>
    );
  };

  const Section = ({ title, emoji, data, isHot }) => (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className={`w-2 h-8 rounded-full ${isHot ? 'bg-orange-500' : 'bg-blue-500'}`}></span>
          {title} {emoji}
          <span className="text-sm font-normal text-gray-400">({Math.min(TOP_LIMIT, data.length)} مقاطعات)</span>
        </h3>
        <span className="text-[10px] text-gray-400 font-medium">المصدر: ECMWF</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {data.slice(0, TOP_LIMIT).map((city, i) => (
          <MoughataaCard key={city.city} city={city} rank={i} isHot={isHot} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-12 space-y-12">
      <Section
        title="المقاطعات الأكثر حرارة"
        emoji="🔥"
        data={sorted.hot}
        isHot={true}
      />
      <Section
        title="المقاطعات الأكثر برودة"
        emoji="❄️"
        data={sorted.cold}
        isHot={false}
      />
    </div>
  );
};

export default CityGrid;
