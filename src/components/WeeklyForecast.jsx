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
        <div className="h-6 bg-gray-200 rounded w-1/2 mb-6"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl mb-4">
            <div className="h-4 bg-gray-200 rounded w-16"></div>
            <div className="h-4 bg-gray-200 rounded w-24"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !weatherData || weatherData.isFallback) return null;

  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  
  // Get next 7 days (skipping today if needed, but we'll show from index 1)
  const forecast = weatherData.daily?.time?.slice(1, 7).map((time, i) => {
    const date = new Date(time);
    const dayName = days[date.getDay()];
    const idx = i + 1; // index in daily data
    return {
      day: dayName,
      max: Math.round(weatherData.daily?.temperature_2m_max?.[idx] ?? 0),
      min: Math.round(weatherData.daily?.temperature_2m_min?.[idx] ?? 0),
      code: weatherData.daily?.weather_code?.[idx] ?? 0,
      rainProb: (weatherData.daily?.precipitation_sum?.[idx] || 0) > 0 ? 'مطر' : 'صافي'
    };
  }) || [];

  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">توقعات 6 أيام</h3>
        <Link to="/forecast" className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1">
          عرض الكل
          <span className="text-[10px]">←</span>
        </Link>
      </div>
      <div className="space-y-3">
        {forecast.map((item, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-blue-50 transition-colors rounded-xl border border-transparent hover:border-blue-100">
            <span className="font-bold text-gray-700 w-20">{item.day}</span>
            <div className="flex items-center gap-4 flex-1 justify-center">
              <span className="text-xl">{getWeatherIcon(item.code)}</span>
              <span className="text-xs text-gray-500 hidden sm:inline">{getWeatherDescription(item.code)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-600 font-bold">{item.max}°</span>
              <span className="text-gray-400 text-xs">/ {item.min}°</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 bg-blue-50 rounded-xl text-center">
        <p className="text-[10px] text-blue-600 font-bold">توقعات دقيقة لولاية {cityName}</p>
      </div>
    </div>
  );
};

export default WeeklyForecast;
