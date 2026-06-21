import React, { useMemo, useState } from 'react';
import { useWeatherContext } from '../WeatherContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiMapPin, FiDroplet } = FiIcons;

// ===== إسقاط جغرافي خطّي (lon/lat → SVG) =====
const VIEW_W = 620;
const VIEW_H = 700;
const PAD = 28;
const LON_MIN = -17.4;
const LON_MAX = -4.5;
const LAT_MIN = 14.4;
const LAT_MAX = 27.6;

function project(lon, lat) {
  const x = PAD + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (VIEW_W - 2 * PAD);
  const y = PAD + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (VIEW_H - 2 * PAD);
  return [x, y];
}

const BORDER_LONLAT = [
  [-17.05, 20.94], [-16.96, 21.34], [-13.0, 21.34], [-13.0, 22.7], [-11.9, 26.1],
  [-8.68, 27.4], [-4.83, 25.0], [-5.6, 22.7], [-6.2, 19.5], [-5.5, 16.6],
  [-9.32, 15.49], [-11.4, 15.62], [-12.85, 14.77], [-15.0, 16.5], [-16.5, 16.06],
  [-16.05, 18.0], [-16.5, 19.4], [-16.2, 20.2], [-17.05, 20.94],
];
const BORDER_PATH =
  BORDER_LONLAT.map(([lon, lat], i) => {
    const [x, y] = project(lon, lat);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';

function intensityStyle(intensity) {
  if (intensity === 'قوي' || intensity === 'غزير') return { fill: '#1d4ed8', r: 9, label: 'غزير' };
  if (intensity === 'متوسط') return { fill: '#0ea5e9', r: 7, label: 'متوسط' };
  return { fill: '#7dd3fc', r: 6, label: 'خفيف' };
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.round(diff / 60000);
  if (min < 60) return `قبل ${min} د`;
  const h = Math.round(min / 60);
  return `قبل ${h} س`;
}

export default function RainMap() {
  const { rainReports, loading } = useWeatherContext();
  const [hovered, setHovered] = useState(null);

  const points = useMemo(() => {
    return (rainReports || [])
      .filter((r) => (r.latitude != null && r.longitude != null))
      .map((r) => {
        const [x, y] = project(r.longitude, r.latitude);
        return { ...r, x, y, style: intensityStyle(r.rain_intensity) };
      });
  }, [rainReports]);

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 bg-gradient-to-br from-sky-500 to-blue-700 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
          <SafeIcon icon={FiDroplet} className="text-xl" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-gray-800">خريطة الأمطار الحية 🌧️</h2>
          <p className="text-sm text-gray-500">بلاغات السكان المعتمدة خلال آخر 24 ساعة</p>
        </div>
        <span className="mr-auto text-xs font-bold text-sky-700 bg-sky-50 border border-sky-100 px-3 py-1.5 rounded-full">
          {points.length} بلاغ
        </span>
      </div>

      {points.length === 0 ? (
        <div className="aspect-[4/3] sm:aspect-[16/10] rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 border border-gray-100 flex flex-col items-center justify-center text-center px-6">
          <SafeIcon icon={FiMapPin} className="text-4xl text-sky-300 mb-3" />
          <p className="text-gray-500 font-bold">لا توجد بلاغات أمطار معتمدة حالياً.</p>
          <p className="text-xs text-gray-400 mt-1">كن أول من يبلّغ عن المطر في منطقتك عبر "تبشيرة مطر".</p>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto" style={{ maxHeight: 460 }}>
            <defs>
              <radialGradient id="rmBg" cx="50%" cy="45%" r="70%">
                <stop offset="0%" stopColor="#fffaf2" /><stop offset="100%" stopColor="#fdf2e0" />
              </radialGradient>
              <linearGradient id="rmLand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fde9b8" /><stop offset="100%" stopColor="#fcd98a" />
              </linearGradient>
            </defs>
            <rect width={VIEW_W} height={VIEW_H} fill="url(#rmBg)" rx="20" />
            <path d={BORDER_PATH} fill="url(#rmLand)" stroke="#d97706" strokeWidth="2.5" strokeLinejoin="round" />

            {points.map((p, i) => (
              <g key={p.id || i} onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)} className="cursor-pointer">
                <circle cx={p.x} cy={p.y} r={p.style.r + 5} fill={p.style.fill} fillOpacity="0.2">
                  <animate attributeName="r" values={`${p.style.r + 3};${p.style.r + 9};${p.style.r + 3}`} dur="2.5s" repeatCount="indefinite" />
                </circle>
                <circle cx={p.x} cy={p.y} r={p.style.r} fill={p.style.fill} stroke="white" strokeWidth="1.5" />
              </g>
            ))}

            {hovered && (
              <g pointerEvents="none">
                <rect x={Math.min(hovered.x + 8, VIEW_W - 150)} y={hovered.y - 40} width="142" height="46" rx="8" fill="#0f172a" fillOpacity="0.92" />
                <text x={Math.min(hovered.x + 79, VIEW_W - 79)} y={hovered.y - 24} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">
                  {hovered.city || hovered.nearest_district}
                </text>
                <text x={Math.min(hovered.x + 79, VIEW_W - 79)} y={hovered.y - 10} textAnchor="middle" fontSize="9.5" fill="#7dd3fc">
                  مطر {hovered.style.label} · {timeAgo(hovered.created_at)}
                </text>
              </g>
            )}

            {/* مفتاح الشدة */}
            <g transform={`translate(${VIEW_W - 150}, ${VIEW_H - 96})`}>
              <rect width="140" height="84" rx="10" fill="white" fillOpacity="0.9" stroke="#e2e8f0" />
              <text x="70" y="16" textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#475569">شدة المطر</text>
              {[
                { c: '#7dd3fc', t: 'خفيف' },
                { c: '#0ea5e9', t: 'متوسط' },
                { c: '#1d4ed8', t: 'غزير' },
              ].map((it, i) => (
                <g key={it.t} transform={`translate(14, ${30 + i * 16})`}>
                  <circle cx="6" cy="5" r="6" fill={it.c} />
                  <text x="18" y="9" fontSize="9.5" fill="#374151">{it.t}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
