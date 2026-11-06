import React, { useMemo } from 'react';
import { useWeatherContext } from '../WeatherContext';
import { getWeatherIcon } from '../weatherApi';
import { toArabicCommune } from '../mauritaniaCommuneNamesAr';

const TOP_LIMIT = 5;

// لون رقم الحرارة: من الأزرق للأبرد إلى الأحمر للأحر
function tempColor(t) {
  if (t >= 42) return 'bg-red-600 text-white';
  if (t >= 38) return 'bg-orange-500 text-white';
  if (t >= 34) return 'bg-amber-400 text-amber-950';
  if (t >= 28) return 'bg-yellow-200 text-yellow-900';
  if (t >= 22) return 'bg-sky-100 text-sky-800';
  return 'bg-blue-600 text-white';
}

function RankList({ title, list }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-black text-gray-700 mb-2">{title}</h3>
      <ol className="space-y-1.5">
        {list.map((c, i) => {
          const temp = Math.round(c.current.temperature_2m);
          return (
            <li key={c.city} className="flex items-center gap-2 text-sm">
              <span className="w-4 text-[11px] font-bold text-gray-400 shrink-0">{i + 1}</span>
              <span className="text-base shrink-0" aria-hidden="true">{getWeatherIcon(c.current.weather_code ?? 0)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-bold text-gray-800 truncate block leading-tight">{toArabicCommune(c.city) || c.city}</span>
                {c.wilaya && <span className="text-[10px] text-gray-400 block leading-tight truncate">{c.wilaya}</span>}
              </span>
              <span className={`shrink-0 text-xs font-black rounded-lg px-2 py-1 tabular-nums ${tempColor(temp)}`}>{temp}°</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// المقاطعات الأكثر حرارة والأكثر برودة الآن: بطاقة واحدة بقائمتين مختصرتين
const CityGrid = () => {
  const { weatherData: cities, loading } = useWeatherContext();

  const sorted = useMemo(() => {
    if (!cities?.length) return { hot: [], cold: [] };
    const valid = cities
      .filter(c => c?.current?.temperature_2m != null && !c.isFallback && c.cityType !== 'قرية')
      .sort((a, b) => b.current.temperature_2m - a.current.temperature_2m);
    return { hot: valid.slice(0, TOP_LIMIT), cold: valid.slice(-TOP_LIMIT).reverse() };
  }, [cities]);

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 h-56 animate-pulse" />;
  if (!sorted.hot.length) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5" dir="rtl">
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-black text-gray-800">🌡️ الحرارة الآن</h2>
        <span className="text-[11px] text-gray-400">المصدر: ECMWF</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8">
        <RankList title="🔥 الأكثر حرارة" list={sorted.hot} />
        <RankList title="❄️ الأكثر برودة" list={sorted.cold} />
      </div>
    </section>
  );
};

export default CityGrid;
