import React, { useMemo } from 'react';
import { useWeatherContext } from '../WeatherContext';
import { toArabicCommune } from '../mauritaniaCommuneNamesAr';

export default function TodaySummaryStrip() {
  const { weatherData, loading, lastUpdated } = useWeatherContext();

  const today = useMemo(() => {
    if (!weatherData?.length) return null;
    let maxTemp = null, maxTempCity = '';
    let maxRain = 0, maxRainCity = '';

    weatherData.forEach((c) => {
      const tmax = c.daily?.temperature_2m_max?.[0];
      const rain = c.daily?.precipitation_sum?.[0];
      const name = toArabicCommune(c.city) || c.city;

      if (tmax != null && (maxTemp === null || tmax > maxTemp)) { maxTemp = tmax; maxTempCity = name; }
      if (rain != null && rain > maxRain) { maxRain = rain; maxRainCity = name; }
    });

    if (maxTemp === null) return null;
    return {
      maxTemp: Math.round(maxTemp),
      maxTempCity,
      maxRain: Math.round(maxRain * 10) / 10,
      maxRainCity,
    };
  }, [weatherData]);

  if (loading || !today) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mb-4" dir="rtl">
      <span className="text-xs font-black text-gray-400 shrink-0">نظرة سريعة اليوم</span>
      <span className="h-4 w-px bg-gray-200 shrink-0" />

      <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full">
        🌡️ أعلى حرارة: {today.maxTemp}° ({today.maxTempCity})
      </span>

      {today.maxRain > 0 && (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-sky-50 text-sky-700 px-2.5 py-1 rounded-full">
          🌧️ أكبر كمية أمطار: {today.maxRain} ملم ({today.maxRainCity})
        </span>
      )}

      {lastUpdated && (
        <span className="text-[11px] text-gray-400 mr-auto shrink-0">
          🕐 آخر تحديث {lastUpdated.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
