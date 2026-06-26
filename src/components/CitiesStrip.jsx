import React, { useRef } from 'react';
import { useAllCitiesWeather } from '../useWeather';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';

// أبرز مدن موريتانيا للعرض في الشريط
const FEATURED = [
  'نواكشوط', 'نواذيبو', 'كيفة', 'كيهيدي', 'سيليبابي',
  'النعمة', 'تيجيكجة', 'أطار', 'روصو', 'أكجوجت',
  'ألاك', 'تيشيت', 'ودان', 'شنقيط', 'بوتلميت',
];

function CityCard({ city, data, onClick }) {
  const temp    = Math.round(data?.current?.temperature_2m ?? '--');
  const code    = data?.current?.weather_code ?? 0;
  const wind    = Math.round(data?.current?.wind_speed_10m ?? 0);
  const isRain  = [51,53,55,61,63,65,71,73,75,80,81,82,95,96,99].includes(code);

  return (
    <button
      onClick={() => onClick && onClick(city)}
      className={`shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer
        ${isRain
          ? 'bg-blue-50 border-blue-200 hover:border-blue-400'
          : 'bg-white border-gray-100 hover:border-blue-200'
        }`}
    >
      <span className="text-2xl leading-none">{getWeatherIcon(code)}</span>
      <span className="font-black text-gray-800 text-sm whitespace-nowrap">{city}</span>
      <div className="flex items-baseline gap-0.5">
        <span className={`text-xl font-black leading-none ${isRain ? 'text-blue-600' : 'text-gray-900'}`}>
          {temp}
        </span>
        <span className="text-xs font-bold text-gray-400">°م</span>
      </div>
      <span className="text-[10px] text-gray-400 font-medium">{wind} كم/س</span>
    </button>
  );
}

export default function CitiesStrip({ onCitySelect }) {
  const { data: allData, loading } = useAllCitiesWeather();
  const scrollRef = useRef(null);

  const cities = FEATURED.filter((c) => allData?.find((d) => d.city === c));

  if (loading || cities.length === 0) {
    return (
      <div className="flex gap-3 overflow-hidden py-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="shrink-0 w-20 h-24 rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-gray-800 text-base flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
          أحوال الطقس في المدن
        </h2>
        <span className="text-[11px] text-gray-400 font-medium">اضغط على مدينة لعرض تفاصيلها</span>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-1 scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {cities.map((city) => {
          const cityData = allData.find((d) => d.city === city);
          return (
            <CityCard
              key={city}
              city={city}
              data={cityData}
              onClick={onCitySelect}
            />
          );
        })}
      </div>
    </div>
  );
}
