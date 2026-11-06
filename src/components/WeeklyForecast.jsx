import React from 'react';
import { useWeather } from '../useWeather';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MAX_DAYS = 6;

// توقعات الأيام القادمة للمدينة المختارة: سطر لكل يوم
const WeeklyForecast = ({ city }) => {
  const cityName = typeof city === 'string' ? city : city.name;
  const { data: weatherData, loading, error } = useWeather(cityName, typeof city === 'object' ? city : null);

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 h-56 animate-pulse" />;
  if (error || !weatherData || weatherData.isFallback) return null;

  const d = weatherData.daily || {};
  const days = (d.time || []).slice(1, 1 + MAX_DAYS).map((time, i) => {
    const idx = i + 1; // اليوم 0 هو اليوم الجاري
    const date = new Date(time);
    return {
      day: DAYS[date.getUTCDay()],
      date: `${date.getUTCDate()}/${date.getUTCMonth() + 1}`,
      max: Math.round(d.temperature_2m_max?.[idx] ?? 0),
      min: Math.round(d.temperature_2m_min?.[idx] ?? 0),
      code: d.weather_code?.[idx] ?? 0,
      rain: Math.round((d.precipitation_sum?.[idx] ?? 0) * 10) / 10,
    };
  });
  if (!days.length) return null;

  // مدى الحرارة في الأيام المعروضة، لرسم شريط العظمى والصغرى
  const lo = Math.min(...days.map((x) => x.min));
  const hi = Math.max(...days.map((x) => x.max));
  const span = Math.max(1, hi - lo);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5" dir="rtl">
      <h3 className="text-lg font-black text-gray-800">📅 الأيام القادمة: {cityName}</h3>
      <ul className="mt-3 divide-y divide-gray-100">
        {days.map((x) => (
          <li key={x.date} className="flex items-center gap-3 py-2.5">
            <div className="w-16 shrink-0">
              <p className="text-sm font-bold text-gray-800 leading-tight">{x.day}</p>
              <p className="text-[10px] text-gray-400">{x.date}</p>
            </div>
            <span className="text-xl shrink-0" title={getWeatherDescription(x.code)} aria-hidden="true">{getWeatherIcon(x.code)}</span>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-xs text-gray-400 w-7 text-left tabular-nums">{x.min}°</span>
              <div className="relative h-1.5 flex-1 bg-gray-100 rounded-full">
                {/* الصغرى يميناً والعظمى يساراً، ضمن مدى الأيام المعروضة كلها */}
                <div className="absolute inset-y-0 rounded-full bg-gradient-to-l from-sky-300 to-orange-400"
                  style={{ right: `${((x.min - lo) / span) * 100}%`, left: `${((hi - x.max) / span) * 100}%` }} />
              </div>
              <span className="text-sm font-black text-gray-800 w-8 tabular-nums">{x.max}°</span>
            </div>
            {x.rain > 0 && <span className="text-[11px] font-bold text-blue-600 shrink-0">🌧️ {x.rain} مم</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default WeeklyForecast;
