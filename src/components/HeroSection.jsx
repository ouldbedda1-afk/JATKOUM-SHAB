import React, { useMemo, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeather } from '../useWeather';
import { useWeatherContext } from '../WeatherContext';
import { getWeatherDescription, getWeatherIcon } from '../weatherApi';
import CitiesStrip from './CitiesStrip';

const { FiWind, FiDroplet, FiThermometer, FiChevronLeft, FiSend, FiMapPin } = FiIcons;

function WeatherCard({ city }) {
  const { weatherData: ctx } = useWeatherContext();
  const cityName = typeof city === 'string' ? city : city?.name || 'نواكشوط';
  const coords = typeof city === 'object' && city?.lat ? city : null;
  const { data: fetched, loading } = useWeather(cityName, coords);

  const weatherData = useMemo(() => {
    if (fetched && !fetched.isFallback) return fetched;
    if (ctx?.length > 0) {
      const match = ctx.find((c) => c.city === cityName);
      if (match && !match.isFallback) return match;
      const nkc = ctx.find((c) => c.city === 'نواكشوط');
      if (nkc && !nkc.isFallback) return nkc;
    }
    return fetched;
  }, [fetched, ctx, cityName]);

  if (loading || !weatherData) {
    return <div className="bg-white rounded-3xl shadow-xl border border-gray-100 min-h-[400px] animate-pulse" />;
  }

  const temp   = Math.round(weatherData.current?.temperature_2m ?? 0);
  const code   = weatherData.current?.weather_code ?? 0;
  const feels  = Math.round(weatherData.current?.apparent_temperature ?? temp);
  const wind   = Math.round(weatherData.current?.wind_speed_10m ?? 0);
  const humidity = weatherData.current?.relative_humidity_2m ?? 0;

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 flex flex-col h-full">
      {/* رأس البطاقة */}
      <div className="flex items-center justify-between">
        <h3 className="font-black text-gray-800 text-xl inline-flex items-center gap-1.5">
          <SafeIcon icon={FiMapPin} className="text-blue-600 text-base" />
          {cityName}
        </h3>
        <span className="text-6xl leading-none">{getWeatherIcon(code)}</span>
      </div>

      {/* الحرارة */}
      <div className="mt-5 flex items-end gap-3">
        <span className="text-8xl font-black text-gray-900 leading-none">{temp}°</span>
        <div className="mb-2 flex flex-col">
          <span className="text-base font-bold text-gray-600">{getWeatherDescription(code)}</span>
        </div>
      </div>

      {/* إحصائيات */}
      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-50 rounded-2xl py-3.5 border border-gray-100">
          <SafeIcon icon={FiThermometer} className="mx-auto text-orange-400 mb-1.5 text-base" />
          <p className="text-[10px] text-gray-500 font-medium">محسوسة</p>
          <p className="font-black text-gray-800 text-sm mt-0.5">{feels}°</p>
        </div>
        <div className="bg-gray-50 rounded-2xl py-3.5 border border-gray-100">
          <SafeIcon icon={FiWind} className="mx-auto text-blue-400 mb-1.5 text-base" />
          <p className="text-[10px] text-gray-500 font-medium">الرياح</p>
          <p className="font-black text-gray-800 text-sm mt-0.5">{wind} كم/س</p>
        </div>
        <div className="bg-gray-50 rounded-2xl py-3.5 border border-gray-100">
          <SafeIcon icon={FiDroplet} className="mx-auto text-sky-400 mb-1.5 text-base" />
          <p className="text-[10px] text-gray-500 font-medium">الرطوبة</p>
          <p className="font-black text-gray-800 text-sm mt-0.5">{humidity}%</p>
        </div>
      </div>

      <a
        href="#today-observation"
        className="mt-auto pt-5 text-center text-sm font-bold text-blue-600 hover:text-blue-800 inline-flex items-center justify-center gap-1"
      >
        عرض حالة الطقس بالتفصيل
        <SafeIcon icon={FiChevronLeft} className="text-sm" />
      </a>
    </div>
  );
}

function AIAgentCard() {
  const [q, setQ] = useState('');
  return (
    <div className="bg-gradient-to-br from-[#0b2c5e] to-[#103a78] text-white rounded-3xl shadow-xl border border-blue-900/30 p-5 flex flex-col h-full">
      {/* رأس البطاقة */}
      <div className="flex items-center gap-2.5">
        <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center text-2xl shrink-0">🤖</div>
        <div>
          <h3 className="font-black text-lg leading-none">المراقب الجوي</h3>
          <p className="text-[11px] text-blue-200/80 mt-0.5">وكيل الذكاء الاصطناعي</p>
        </div>
      </div>

      <p className="mt-4 text-[13px] text-blue-100/90 leading-relaxed">
        مرحباً! 👋 اسألني عن حالة الطقس، توقعات الأمطار، أو أي ظاهرة جوية في موريتانيا.
      </p>

      {/* الأسئلة الجاهزة */}
      <div className="mt-3 space-y-2">
        {AI_QUESTIONS.map(({ icon, bg, text }) => (
          <button
            key={text}
            onClick={() => setQ(text)}
            className="w-full text-right text-[12px] bg-white/10 hover:bg-white/20 transition-colors rounded-xl px-3 py-2 border border-white/10 inline-flex items-center gap-2.5"
          >
            <span className={`w-7 h-7 rounded-xl ${bg} flex items-center justify-center text-base shrink-0`}>
              {icon}
            </span>
            <span className="flex-1 leading-snug">{text}</span>
            <span className="text-blue-300 text-xs shrink-0">↩</span>
          </button>
        ))}
      </div>

      {/* حقل الإدخال */}
      <div className="mt-4 relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اكتب سؤالك هنا..."
          className="w-full bg-white/15 placeholder-blue-200/60 text-white rounded-full py-2.5 pr-4 pl-11 text-sm border border-white/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
        />
        <button
          className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-emerald-500 hover:bg-emerald-600 transition-colors p-2 rounded-full"
          title="إرسال"
          aria-label="إرسال"
        >
          <SafeIcon icon={FiSend} className="text-xs" />
        </button>
      </div>

      {/* زر الاشتراك */}
      <button
        className="mt-4 w-full bg-white text-[#0b2c5e] font-black text-sm py-3 rounded-full hover:bg-blue-50 transition-colors"
        title="قريباً"
      >
        اشترك الآن للوصول غير المحدود 👑
      </button>
      <p className="mt-2 text-center text-[10px] text-blue-200/50">
        3 أسئلة مجانية يومياً · المشتركون يحصلون على تفاصيل أكثر
      </p>
    </div>
  );
}

export default function HeroSection({ city, onCitySelect }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-8">
        <CitiesStrip onCitySelect={onCitySelect} />
      </div>
      <div className="lg:col-span-4">
        <WeatherCard city={city} />
      </div>
    </div>
  );
}
