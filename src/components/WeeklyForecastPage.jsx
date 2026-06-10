import React, { useState } from 'react';
import Navbar from './Navbar';
import RainForecastAlerts from './RainForecastAlerts';
import { useWeather } from '../useWeather';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiCalendar, FiArrowRight, FiDroplet, FiWind, FiThermometer } = FiIcons;

const WeeklyForecastPage = () => {
  const [selectedCity, setSelectedCity] = useState("نواكشوط");
  const cityName = typeof selectedCity === 'string' ? selectedCity : selectedCity.name;
  const { data: weatherData, loading, error } = useWeather(cityName, typeof selectedCity === 'object' ? selectedCity : null);

  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar onCitySelect={setSelectedCity} />

      <main className="max-w-4xl mx-auto px-4 mt-12">
        {/* قسم بشائر الخير - تم نقله إلى صفحة التوقعات */}
        <div className="mb-12">
          <RainForecastAlerts selectedCity={selectedCity} />
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
            <SafeIcon icon={FiCalendar} className="text-2xl" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900">التوقعات الأسبوعية</h1>
            <p className="text-gray-500">توقعات دقيقة لـ 7 أيام في ولاية {cityName}</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="bg-white h-24 rounded-3xl animate-pulse border border-gray-100"></div>
            ))}
          </div>
        ) : error || !weatherData || !weatherData.daily?.time ? (
          <div className="bg-red-50 p-8 rounded-3xl border border-red-100 text-center">
            <p className="text-red-600 font-bold">عذراً، لا تتوفر بيانات التوقعات لهذه المدينة حالياً. يرجى المحاولة لاحقاً.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {weatherData.daily?.time?.map((time, i) => {
              const date = new Date(time);
              const dayName = i === 0 ? 'اليوم' : days[date.getDay()];
              const isToday = i === 0;

              return (
                <div 
                  key={i} 
                  className={`bg-white p-6 rounded-[2rem] shadow-sm border ${isToday ? 'border-blue-500 ring-4 ring-blue-50' : 'border-gray-100'} hover:shadow-xl transition-all group`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <div className="text-center w-20">
                        <p className={`text-lg font-black ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{dayName}</p>
                        <p className="text-xs text-gray-400">{time}</p>
                      </div>
                      <div className="text-4xl">
                        {getWeatherIcon(weatherData.daily?.weather_code?.[i] ?? 0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{getWeatherDescription(weatherData.daily?.weather_code?.[i] ?? 0)}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1 text-blue-500 text-xs">
                            <SafeIcon icon={FiDroplet} />
                            <span>{Math.round(weatherData.daily?.precipitation_sum?.[i] ?? 0)} ملم</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-400 text-xs">
                            <SafeIcon icon={FiWind} />
                            <span>{Math.round(weatherData.daily?.wind_speed_10m_max?.[i] ?? 0)} كم/س</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-8 border-t md:border-t-0 pt-4 md:pt-0">
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">العظمى</p>
                        <p className="text-2xl font-black text-orange-600">{Math.round(weatherData.daily?.temperature_2m_max?.[i] ?? 0)}°</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">الصغرى</p>
                        <p className="text-2xl font-black text-blue-400">{Math.round(weatherData.daily?.temperature_2m_min?.[i] ?? 0)}°</p>
                      </div>
                      <div className="hidden md:block">
                         <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                           <SafeIcon icon={FiArrowRight} />
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 bg-blue-900 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl font-black mb-2">ملاحظة من جاتكم اسحاب</h3>
            <p className="text-sm opacity-80 leading-relaxed">
              يتم تحديث هذه التوقعات بناءً على آخر خرائط المركز الأوروبي (ECMWF). دقة التوقعات تكون أعلى في الأيام الثلاثة الأولى وتنخفض تدريجياً مع مرور الوقت.
            </p>
          </div>
          <div className="absolute -bottom-10 -left-10 opacity-10">
            <span className="text-[12rem]">☁️</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default WeeklyForecastPage;
