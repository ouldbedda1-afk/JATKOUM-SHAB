import React, { useState } from 'react';
import Navbar from './Navbar';
import RainForecastAlerts from './RainForecastAlerts';
import { useWeather } from '../useWeather';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiCalendar, FiDroplet, FiWind, FiThermometer, FiAlertCircle } = FiIcons;

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// نطاقات الثقة بحسب بُعد اليوم
function getConfidenceBand(i) {
  if (i <= 2) return { label: 'دقيقة', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-400', pct: 90 };
  if (i <= 5) return { label: 'جيدة', color: 'bg-sky-100 text-sky-700 border-sky-200', bar: 'bg-sky-400', pct: 70 };
  if (i <= 9) return { label: 'متوسطة', color: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-400', pct: 50 };
  return { label: 'توجيهية', color: 'bg-orange-100 text-orange-700 border-orange-200', bar: 'bg-orange-400', pct: 30 };
}

function DayCard({ time, i, weatherData }) {
  const date = new Date(time);
  const dayName = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : DAYS[date.getDay()];
  const isToday = i === 0;
  const code = weatherData.daily?.weather_code?.[i] ?? 0;
  const precip = Math.round((weatherData.daily?.precipitation_sum?.[i] ?? 0) * 10) / 10;
  const wind = Math.round(weatherData.daily?.wind_speed_10m_max?.[i] ?? 0);
  const tMax = Math.round(weatherData.daily?.temperature_2m_max?.[i] ?? 0);
  const tMin = Math.round(weatherData.daily?.temperature_2m_min?.[i] ?? 0);
  const conf = getConfidenceBand(i);

  // لون البطاقة حسب الطقس
  let cardClass = 'border-gray-100 bg-white';
  if (code >= 95) cardClass = 'border-violet-200 bg-gradient-to-l from-violet-50 to-white';
  else if (code >= 61) cardClass = 'border-sky-200 bg-gradient-to-l from-sky-50 to-white';
  else if (code >= 3) cardClass = 'border-slate-200 bg-gradient-to-l from-slate-50 to-white';
  if (isToday) cardClass = 'border-blue-400 bg-gradient-to-l from-blue-50 to-white ring-4 ring-blue-50';

  // فاصل بين نطاقات التوقعات
  const showGroupHeader =
    i === 0 ? 'قريبة المدى — دقة عالية (1-3 أيام)' :
    i === 3 ? 'متوسطة المدى (4-6 أيام)' :
    i === 6 ? 'أسبوع ثانٍ (7-10 أيام)' :
    i === 10 ? 'طويلة المدى — توجيهية (11-14 يوم)' :
    null;

  return (
    <>
      {showGroupHeader && (
        <div className="flex items-center gap-3 mt-6 mb-2">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-bold text-gray-400 whitespace-nowrap">{showGroupHeader}</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
      )}
      <div className={`p-5 rounded-[1.75rem] shadow-sm border transition-all hover:shadow-lg ${cardClass}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* يوم + أيقونة */}
          <div className="flex items-center gap-4 flex-1">
            <div className="text-center w-24 shrink-0">
              <p className={`text-base font-black ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>{dayName}</p>
              <p className="text-[11px] text-gray-400">{date.getDate()}/{date.getMonth() + 1}</p>
            </div>
            <div className="text-3xl shrink-0">{getWeatherIcon(code)}</div>
            <div className="min-w-0">
              <p className="font-bold text-gray-800 text-sm leading-tight">{getWeatherDescription(code)}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {precip > 0 && (
                  <span className="inline-flex items-center gap-1 text-blue-500 text-xs bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    <SafeIcon icon={FiDroplet} className="text-[10px]" />
                    {precip} ملم
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                  <SafeIcon icon={FiWind} className="text-[10px]" />
                  {wind} كم/س
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${conf.color}`}>
                  دقة {conf.label}
                </span>
              </div>
            </div>
          </div>

          {/* درجات الحرارة */}
          <div className="flex items-center gap-6 md:gap-8 border-t md:border-t-0 pt-3 md:pt-0">
            <div className="text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">العظمى</p>
              <p className="text-xl font-black text-orange-500">{tMax}°</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">الصغرى</p>
              <p className="text-xl font-black text-sky-400">{tMin}°</p>
            </div>
            {/* شريط الثقة */}
            <div className="hidden sm:block w-20">
              <p className="text-[9px] text-gray-400 mb-1 text-center">ثقة التوقع</p>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full ${conf.bar}`} style={{ width: `${conf.pct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const WeeklyForecastPage = () => {
  const [selectedCity, setSelectedCity] = useState('نواكشوط');
  const [forecastRange, setForecastRange] = useState(14);

  const cityName = typeof selectedCity === 'string' ? selectedCity : selectedCity.name;
  const { data: weatherData, loading, error } = useWeather(
    cityName,
    typeof selectedCity === 'object' ? selectedCity : null,
    { forecastDays: 16 }
  );

  const days = weatherData?.daily?.time?.slice(0, forecastRange) ?? [];

  return (
    <div className="min-h-screen bg-gray-50 pb-24" dir="rtl">
      <Navbar onCitySelect={setSelectedCity} />

      <main className="max-w-4xl mx-auto px-4 mt-10">
        {/* بشائر الخير */}
        <div className="mb-10">
          <RainForecastAlerts selectedCity={selectedCity} />
        </div>

        {/* العنوان */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
              <SafeIcon icon={FiCalendar} className="text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">التوقعات الجوية</h1>
              <p className="text-gray-500 text-sm">{cityName} — موريتانيا 🇲🇷</p>
            </div>
          </div>

          {/* اختيار المدى الزمني */}
          <div className="flex gap-2">
            {[7, 10, 14].map((n) => (
              <button
                key={n}
                onClick={() => setForecastRange(n)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                  forecastRange === n
                    ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                }`}
              >
                {n} أيام
              </button>
            ))}
          </div>
        </div>

        {/* تحميل */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="bg-white h-20 rounded-3xl animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : error || !weatherData?.daily?.time ? (
          <div className="bg-red-50 p-8 rounded-3xl border border-red-100 text-center flex items-center justify-center gap-3">
            <SafeIcon icon={FiAlertCircle} className="text-red-400 text-2xl" />
            <p className="text-red-600 font-bold">لا تتوفر بيانات التوقعات لهذه المدينة حالياً.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {days.map((time, i) => (
              <DayCard key={time} time={time} i={i} weatherData={weatherData} />
            ))}
          </div>
        )}

        {/* ملاحظة الدقة */}
        <div className="mt-10 bg-gradient-to-br from-blue-900 to-slate-800 text-white p-7 rounded-[2rem] shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <p className="font-black text-lg mb-2">📡 ملاحظة حول دقة التوقعات</p>
            <p className="text-sm opacity-75 leading-relaxed">
              التوقعات مستمدة من المركز الأوروبي للتنبؤات الجوية (ECMWF).
              دقة الأيام الثلاثة الأولى عالية جداً، وتتراجع تدريجياً حتى اليوم 14 الذي يُعدّ توجيهياً.
              توقعات الأمطار في موريتانيا خلال موسم الخريف (يوليو–سبتمبر) دقيقتها المتوسطة.
            </p>
          </div>
          <div className="absolute -bottom-6 -left-6 opacity-10 text-[8rem] select-none">☁️</div>
        </div>
      </main>
    </div>
  );
};

export default WeeklyForecastPage;
