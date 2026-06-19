import React from 'react';
import { Link } from 'react-router-dom';
import { useWeather } from '../useWeather';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';

const WeeklyForecast = ({ city }) => {
  const cityName = typeof city === 'string' ? city : city.name;
  const { data: weatherData, loading, error } = useWeather(cityName, typeof city === 'object' ? city : null);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 bg-gray-200 rounded-xl w-36"></div>
          <div className="h-5 bg-gray-100 rounded-full w-20"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-[1.75rem] border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-3 bg-gray-100 rounded w-16"></div>
                </div>
                <div className="h-14 w-14 rounded-2xl bg-gray-100"></div>
              </div>
              <div className="h-5 bg-gray-200 rounded w-24 mb-4"></div>
              <div className="flex items-end justify-between">
                <div className="h-10 bg-gray-200 rounded w-16"></div>
                <div className="h-8 bg-gray-100 rounded w-12"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !weatherData || weatherData.isFallback) return null;

  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  
  const forecast = weatherData.daily?.time?.slice(1, 4).map((time, i) => {
    const date = new Date(time);
    const dayName = days[date.getDay()];
    const idx = i + 1; // index in daily data
    const precipitation = weatherData.daily?.precipitation_sum?.[idx] ?? 0;
    return {
      day: dayName,
      date: `${date.getDate()}/${date.getMonth() + 1}`,
      max: Math.round(weatherData.daily?.temperature_2m_max?.[idx] ?? 0),
      min: Math.round(weatherData.daily?.temperature_2m_min?.[idx] ?? 0),
      code: weatherData.daily?.weather_code?.[idx] ?? 0,
      precipitation: Math.round(precipitation * 10) / 10,
      rainProb: precipitation > 0 ? 'مطر' : 'صافي'
    };
  }) || [];

  const getCardTone = (code) => {
    if (code >= 95) {
      return {
        wrap: 'from-violet-100 via-fuchsia-100 to-rose-100 border-violet-200 hover:border-violet-300',
        icon: 'from-violet-600 to-fuchsia-600 text-white',
        badge: 'bg-violet-100 text-violet-700',
        temp: 'text-violet-700',
      };
    }
    if (code >= 61) {
      return {
        wrap: 'from-sky-100 via-cyan-100 to-blue-100 border-sky-200 hover:border-sky-300',
        icon: 'from-sky-500 to-cyan-500 text-white',
        badge: 'bg-sky-100 text-sky-700',
        temp: 'text-sky-700',
      };
    }
    if (code >= 3) {
      return {
        wrap: 'from-slate-100 via-gray-100 to-zinc-100 border-slate-200 hover:border-slate-300',
        icon: 'from-slate-500 to-gray-500 text-white',
        badge: 'bg-slate-100 text-slate-700',
        temp: 'text-slate-700',
      };
    }
    return {
      wrap: 'from-amber-100 via-orange-100 to-yellow-100 border-amber-200 hover:border-amber-300',
      icon: 'from-amber-400 to-orange-500 text-white',
      badge: 'bg-amber-100 text-amber-700',
      temp: 'text-orange-700',
    };
  };

  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-2xl font-extrabold text-gray-800">توقعات {cityName} 🇲🇷</h3>
          <p className="text-xs text-gray-500 mt-1">توقعات الثلاثة أيام القادمة للمدينة المختارة</p>
        </div>
        <Link to="/forecast" className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1">
          عرض الكل
          <span className="text-[10px]">←</span>
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {forecast.map((item, i) => {
          const tone = getCardTone(item.code);
          return (
            <div
              key={i}
              className={`rounded-[1.75rem] border bg-gradient-to-br ${tone.wrap} p-5 transition-all duration-200 hover:shadow-lg`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-base font-extrabold text-gray-800">{item.day}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{item.date}</p>
                </div>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${tone.icon} text-3xl shadow-sm`}>
                  {getWeatherIcon(item.code)}
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <p className="truncate text-sm font-bold text-gray-800">{getWeatherDescription(item.code)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.badge}`}>
                    {item.rainProb}
                  </span>
                </div>
                <div className="rounded-2xl bg-white/60 border border-white/70 p-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">العظمى</p>
                      <p className={`text-3xl font-extrabold ${tone.temp}`}>{item.max}°</p>
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] text-gray-500">الصغرى</p>
                      <p className="text-lg font-bold text-gray-500">{item.min}°</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/70 flex items-center justify-between text-[11px] text-gray-600">
                    <span>الهطول</span>
                    <span className="font-bold text-gray-800">{item.precipitation} ملم</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-5 rounded-2xl bg-gradient-to-r from-blue-50 via-cyan-50 to-teal-50 border border-blue-100 p-4 text-center">
        <p className="text-xs text-blue-700 font-bold">توقعات دقيقة لولاية {cityName}</p>
      </div>
    </div>
  );
};

export default WeeklyForecast;
