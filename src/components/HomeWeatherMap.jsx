import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MauritaniaMap, { mapWilayaName } from './MauritaniaMap';
import { useWeatherContext } from '../WeatherContext';

// خريطة اليوم في الرئيسية: كل ولاية ملوّنة بأعلى حرارة أو بأكبر كمية مطر متوقعة اليوم في مدنها،
// والضغط على ولاية يفتح صفحة توقعاتها
const SLUGS = {
  'الحوض الشرقي': 'hodh-chargui', 'الحوض الغربي': 'hodh-gharbi', 'لعصابه': 'assaba', 'البراكنة': 'brakna',
  'كوركول': 'gorgol', 'كيدماغا': 'guidimakha', 'تكانت': 'tagant', 'آدرار': 'adrar', 'انشيري': 'inchiri',
  'تيرس زمور': 'tiris-zemmour', 'داخلة نواذيبو': 'dakhlet-nouadhibou', 'الترارزة': 'trarza', 'نواكشوط': 'nouakchott-ouest',
};

const TEMP_STEPS = [
  [42, '#b91c1c', '42° فأكثر'], [38, '#ef4444', '38–41°'], [34, '#f97316', '34–37°'],
  [30, '#fbbf24', '30–33°'], [25, '#fde68a', '25–29°'], [-99, '#bfdbfe', 'أقل من 25°'],
];
const RAIN_STEPS = [
  [20, '#1d4ed8', '20 مم فأكثر'], [10, '#3b82f6', '10–19 مم'], [3, '#93c5fd', '3–9 مم'],
  [0.5, '#dbeafe', 'أقل من 3 مم'], [-1, '#f1f5f9', 'لا أمطار'],
];
const stepFor = (steps, v) => steps.find(([min]) => v >= min);

export default function HomeWeatherMap() {
  const { weatherData } = useWeatherContext();
  const [mode, setMode] = useState('temp');
  const navigate = useNavigate();

  // أعلى عظمى وأكبر مطر متوقع اليوم في كل ولاية، من مدنها المتابَعة
  const byWilaya = useMemo(() => {
    const out = {};
    for (const c of weatherData || []) {
      if (c.isFallback) continue;
      const w = mapWilayaName(c.wilaya);
      const tmax = c.daily?.temperature_2m_max?.[0];
      const rain = c.daily?.precipitation_sum?.[0];
      if (!w || tmax == null) continue;
      const e = (out[w] ||= { tmax: -99, rain: 0 });
      e.tmax = Math.max(e.tmax, tmax);
      e.rain = Math.max(e.rain, rain ?? 0);
    }
    return out;
  }, [weatherData]);

  const wilayas = Object.keys(byWilaya);
  if (wilayas.length < 5) return null;

  const steps = mode === 'temp' ? TEMP_STEPS : RAIN_STEPS;
  const valueOf = (e) => (mode === 'temp' ? e.tmax : e.rain);
  const fills = Object.fromEntries(wilayas.map((w) => [w, stepFor(steps, valueOf(byWilaya[w]))[1]]));
  const values = Object.fromEntries(wilayas.map((w) => {
    const e = byWilaya[w];
    return [w, mode === 'temp' ? `${Math.round(e.tmax)}°` : e.rain >= 0.5 ? `${Math.round(e.rain)} مم` : null];
  }));
  const used = new Set(wilayas.map((w) => stepFor(steps, valueOf(byWilaya[w]))[2]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" dir="rtl">
      <div className="p-4 md:p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-gray-800">🗺️ موريتانيا اليوم</h2>
          <p className="text-xs text-gray-500 mt-0.5">اضغط على ولايتك لترى توقعاتها.</p>
        </div>
        <div className="flex bg-gray-100 rounded-full p-1 text-xs font-bold" role="tablist">
          {[['temp', '🌡️ الحرارة'], ['rain', '🌧️ الأمطار']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
              className={`px-3 py-1.5 rounded-full transition-colors ${mode === k ? 'bg-white text-[#0b2c5e] shadow-sm' : 'text-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* على الشاشات العريضة لا تتجاوز الخريطة عرض 520 بكسل */}
      <div className="bg-sky-50">
        <div className="max-w-[520px] mx-auto">
          <MauritaniaMap fills={fills} values={values}
            onSelect={(w) => SLUGS[w] && navigate(`/forecast/${today}/${SLUGS[w]}`)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5 text-[11px] text-gray-600">
        <span className="text-gray-400">{mode === 'temp' ? 'أعلى حرارة متوقعة اليوم:' : 'أكبر كمية مطر متوقعة اليوم:'}</span>
        {steps.filter(([, , label]) => used.has(label)).map(([, color, label]) => (
          <span key={label} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block border border-black/10" style={{ background: color }} />{label}
          </span>
        ))}
      </div>
    </section>
  );
}
