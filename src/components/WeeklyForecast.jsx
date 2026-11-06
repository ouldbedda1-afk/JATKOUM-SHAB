import React, { useState } from 'react';
import { useWeather } from '../useWeather';
import { getWeatherDescription } from '../weatherApi';

const DAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const FORECAST_DAYS = 16;

// أبعاد الرسم: عمود لكل يوم، والمنحنى بين PAD_TOP وأسفل منطقة الرسم
const COL = 46, PLOT_H = 130, PAD_TOP = 26, AXIS_H = 44;
const LINE = '#7cb342', FILL_TOP = 'rgba(124,179,66,0.28)', FILL_BOTTOM = 'rgba(124,179,66,0.02)';

// منحنى ناعم يمر بالنقاط (Catmull-Rom محوّل إلى Bézier)
function smoothPath(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// منحنى العظمى المتوقعة للأيام القادمة، اليوم أقصى اليمين
const WeeklyForecast = ({ city }) => {
  const cityName = typeof city === 'string' ? city : city.name;
  const { data: weatherData, loading, error } = useWeather(cityName, typeof city === 'object' ? city : null, { forecastDays: FORECAST_DAYS });
  const [active, setActive] = useState(null);

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse" />;
  if (error || !weatherData || weatherData.isFallback) return null;

  const d = weatherData.daily || {};
  const days = (d.time || []).map((time, i) => {
    const date = new Date(time);
    return {
      num: String(date.getUTCDate()).padStart(2, '0'),
      day: i === 0 ? 'اليوم' : DAYS[date.getUTCDay()],
      max: d.temperature_2m_max?.[i],
      min: d.temperature_2m_min?.[i],
      rain: Math.round((d.precipitation_sum?.[i] ?? 0) * 10) / 10,
      code: d.weather_code?.[i] ?? 0,
    };
  }).filter((x) => x.max != null);
  if (days.length < 2) return null;

  const n = days.length;
  const width = n * COL;
  const lo = Math.min(...days.map((x) => x.max)) - 2;
  const hi = Math.max(...days.map((x) => x.max)) + 1;
  // اليوم الأول في أقصى اليمين، والأيام تتقدم نحو اليسار
  const xOf = (i) => width - COL / 2 - i * COL;
  const yOf = (t) => PAD_TOP + (1 - (t - lo) / (hi - lo)) * PLOT_H;
  const pts = days.map((x, i) => [xOf(i), yOf(x.max)]);
  const line = smoothPath(pts);
  const bottom = PAD_TOP + PLOT_H + 8;
  const area = `${line} L${pts[n - 1][0] - COL / 2},${pts[n - 1][1]} L${pts[n - 1][0] - COL / 2},${bottom} L${pts[0][0] + COL / 2},${bottom} L${pts[0][0] + COL / 2},${pts[0][1]} Z`;
  const height = bottom + AXIS_H;
  const a = active != null ? days[active] : null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5" dir="rtl">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-black text-gray-800">📅 الأيام القادمة: {cityName}</h3>
        <span className="text-[11px] text-gray-400">العظمى المتوقعة</span>
      </div>

      {/* على الهاتف يُسحب الرسم أفقياً؛ اليوم في البداية (اليمين) */}
      <div className="relative mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img"
          aria-label={`العظمى المتوقعة في ${cityName} للأيام ${n} القادمة`}>
          <defs>
            <linearGradient id="wf-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={FILL_TOP} />
              <stop offset="100%" stopColor={FILL_BOTTOM} />
            </linearGradient>
          </defs>
          <line x1="0" x2={width} y1={bottom} y2={bottom} stroke="#e5e7eb" />
          <path d={area} fill="url(#wf-fill)" />
          <path d={line} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
          {days.map((x, i) => (
            <g key={i}>
              <line x1={xOf(i)} x2={xOf(i)} y1={pts[i][1]} y2={bottom} stroke={LINE} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <circle cx={xOf(i)} cy={pts[i][1]} r={active === i ? 6 : 4.5} fill={LINE} stroke="#fff" strokeWidth="2" />
              <text x={xOf(i)} y={pts[i][1] - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill="#374151">
                {Math.round(x.max)}°
              </text>
              <text x={xOf(i)} y={bottom + 16} textAnchor="middle" fontSize="12" fontWeight="700" fill="#374151">{x.num}</text>
              <text x={xOf(i)} y={bottom + 31} textAnchor="middle" fontSize="11" fill="#6b7280">{x.day}</text>
              {x.rain > 0 && <text x={xOf(i)} y={bottom + 43} textAnchor="middle" fontSize="9" fill="#2563eb">💧{x.rain}</text>}
              {/* منطقة لمس بعرض العمود كاملاً */}
              <rect x={xOf(i) - COL / 2} y="0" width={COL} height={height} fill="transparent"
                onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                onClick={() => setActive(active === i ? null : i)} style={{ cursor: 'pointer' }} />
            </g>
          ))}
        </svg>

        {a && (
          <div className="absolute top-0 pointer-events-none bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
            style={{ left: Math.min(Math.max(xOf(active) - 60, 0), width - 120) }}>
            <p className="font-bold">{a.day === 'اليوم' ? 'اليوم' : `${a.day} ${a.num}`} · {getWeatherDescription(a.code)}</p>
            <p>العظمى {Math.round(a.max)}° · الصغرى {Math.round(a.min)}°{a.rain > 0 ? ` · مطر ${a.rain} مم` : ''}</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default WeeklyForecast;
