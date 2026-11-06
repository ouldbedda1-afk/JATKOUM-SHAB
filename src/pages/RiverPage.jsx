import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { WILAYA_SHAPES } from '../mauritaniaWilayaShapes';
import { RIVER_STATIONS, RIVER_PLACES, RIVER_LINE, normalDischarge, riverLevel } from '../riverStations';

// فيضان نهر السنغال على الضفة الموريتانية: تصريف النهر في سبع محطات من ݣوري إلى انجاݣو، آخر 30 يوماً
// وتوقعات 30 يوماً من نموذج Copernicus GloFAS (عبر Open-Meteo)، ومستوى كل محطة مقارنةً بعتبات
// الفيضان المحسوبة من ذروات 1984–2025، والبلديات والقرى المتوقع تأثرها على الضفة.

const DAYS_PAST = 30, DAYS_AHEAD = 30;
const CACHE_KEY = 'river_flood_v1', CACHE_MS = 3 * 3600 * 1000;
const RIVER_WILAYAS = ['الترارزة', 'البراكنة', 'كوركول', 'كيدماغا'];

const LEVELS = [
  { label: 'عادي', icon: '✅', color: '#16a34a', badge: 'bg-green-50 text-green-700 border-green-200' },
  { label: 'أعلى من المعتاد', icon: '🔼', color: '#ca8a04', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  { label: 'خطر فيضان', icon: '⚠️', color: '#ea580c', badge: 'bg-orange-50 text-orange-800 border-orange-200' },
  { label: 'فيضان كبير', icon: '🚨', color: '#dc2626', badge: 'bg-red-50 text-red-700 border-red-200' },
];

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const fmtDay = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const fmtQ = (q) => Math.round(q).toLocaleString('en-US');

async function fetchRiver() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (c && Date.now() - c.at < CACHE_MS) return c.data;
  } catch { /* تخزين المتصفح غير متاح */ }
  const params = new URLSearchParams({
    latitude: RIVER_STATIONS.map((s) => s.lat).join(','),
    longitude: RIVER_STATIONS.map((s) => s.lon).join(','),
    daily: 'river_discharge,river_discharge_p25,river_discharge_p75',
    past_days: String(DAYS_PAST), forecast_days: String(DAYS_AHEAD),
  });
  const res = await fetch(`https://flood-api.open-meteo.com/v1/flood?${params}`);
  if (!res.ok) throw new Error(`خطأ ${res.status}`);
  const raw = await res.json();
  const data = (Array.isArray(raw) ? raw : [raw]).map((s) => s.daily);
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* */ }
  return data;
}

// ملخص كل محطة: الآن، الاتجاه، مقارنةً بالمعتاد، وذروة التوقعات ومستواها
function summarize(st, i, daily) {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Math.max(0, daily.time.indexOf(today));
  const q = daily.river_discharge.map((v) => v ?? 0);
  const now = q[t0], before = q[Math.max(0, t0 - 3)];
  const ahead = q.slice(t0);
  const peakK = ahead.indexOf(Math.max(...ahead));
  const peak = ahead[peakK], peakDay = daily.time[t0 + peakK];
  const level = riverLevel(st, peak);
  // أول يوم يبلغ فيه النهر مستوى الذروة المتوقعة
  const firstK = ahead.findIndex((v) => riverLevel(st, v) >= level);
  const normal = normalDischarge(i, today);
  return {
    st, i, daily, t0, now, peak, peakDay, level, nowLevel: riverLevel(st, now),
    from: daily.time[t0 + Math.max(0, firstK)],
    trend: now > before * 1.05 ? 'up' : now < before * 0.95 ? 'down' : 'flat',
    vsNormal: normal > 0 ? now / normal : 1,
  };
}

// المحطة على خط النهر المرسوم: أقرب نقطة منه إلى خلية النموذج
const onLine = (s) => RIVER_LINE.reduce((a, b) => (Math.hypot(b[0] - s.lon, b[1] - s.lat) < Math.hypot(a[0] - s.lon, a[1] - s.lat) ? b : a));
const project = ([lon, lat]) => `${lon.toFixed(3)},${(-lat).toFixed(3)}`;
const ringPath = (r) => `M${r.map(project).join('L')}Z`;

function RiverMap({ rows }) {
  const byStation = rows ? Object.fromEntries(rows.map((r) => [r.i, r.level])) : {};
  return (
    <svg viewBox="-16.62 -17.05 4.72 2.45" className="w-full h-auto block bg-sky-50" style={{ direction: 'ltr' }} role="img" aria-label="خريطة نهر السنغال على الضفة الموريتانية">
      {WILAYA_SHAPES.filter((s) => RIVER_WILAYAS.includes(s.wilaya)).map((s) => s.rings.map((r, k) => (
        <path key={`${s.wilaya}${k}`} d={ringPath(r)} fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )))}
      <text x="-16.0" y="-14.75" fontSize="0.11" fill="#94a3b8" textAnchor="middle">السنغال</text>
      <text x="-15.9" y="-16.95" fontSize="0.1" fill="#64748b" textAnchor="middle" fontWeight="700">الترارزة</text>
      <text x="-14.2" y="-16.95" fontSize="0.1" fill="#64748b" textAnchor="middle" fontWeight="700">البراكنة</text>
      <text x="-13.0" y="-16.3" fontSize="0.1" fill="#64748b" textAnchor="middle" fontWeight="700">كوركول</text>
      <text x="-12.25" y="-15.45" fontSize="0.1" fill="#64748b" textAnchor="middle" fontWeight="700">كيدماغا</text>
      <path d={`M${RIVER_LINE.map(project).join('L')}`} fill="none" stroke="#0284c7" strokeWidth="4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {RIVER_PLACES.map((p) => {
        const lv = byStation[p.station] ?? 0;
        return (
          <circle key={`${p.name}${p.lat}`} cx={p.lon} cy={-p.lat} r={lv >= 2 ? 0.035 : 0.022} fill={lv >= 2 ? LEVELS[lv].color : '#64748b'}>
            <title>{p.name}</title>
          </circle>
        );
      })}
      {RIVER_STATIONS.map((s, i) => {
        const lv = byStation[i];
        const [lon, lat] = onLine(s);
        return (
          <g key={s.name}>
            <circle cx={lon} cy={-lat} r="0.06" fill={lv == null ? '#cbd5e1' : LEVELS[lv].color}
              stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{s.name}</title></circle>
            <text x={lon} y={-lat + 0.16} fontSize="0.095" textAnchor="middle" fontWeight="800" fill="#0f172a"
              stroke="#fff" strokeWidth="3" paintOrder="stroke" vectorEffect="non-scaling-stroke">{s.name}</text>
          </g>
        );
      })}
      <text x="-11.95" y="-16.96" fontSize="0.075" fill="#64748b" textAnchor="end">جاتكم اسحاب · jatkoumshab.com</text>
    </svg>
  );
}

// منحنى التصريف: آخر 30 يوماً خط متصل، والتوقعات متقطع مع نطاق التوقعات المحتمل (الربعين)،
// والمعتاد خط رمادي، وعتبة الفيضان حين يقترب منها المنحنى
function StationChart({ row }) {
  const { st, i, daily, t0 } = row;
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const W = 480, H = 170, P = { l: 8, r: 50, t: 10, b: 24 };
  const n = daily.time.length;
  const q = daily.river_discharge.map((v) => v ?? 0);
  const lo = daily.river_discharge_p25.map((v, k) => v ?? q[k]);
  const hi = daily.river_discharge_p75.map((v, k) => v ?? q[k]);
  const normal = daily.time.map((d) => normalDischarge(i, d));
  const dataMax = Math.max(...hi, ...q, ...normal);
  const showFlood = dataMax >= st.flood * 0.6;
  const yMax = (showFlood ? Math.max(dataMax, st.flood) : dataMax) * 1.12 || 1;
  const x = (k) => P.l + (k / (n - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - v / yMax) * (H - P.t - P.b);
  const line = (arr, a, b) => arr.slice(a, b + 1).map((v, k) => `${k ? 'L' : 'M'}${x(a + k).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const band = `${line(hi, t0, n - 1)}L${lo.slice(t0).map((v, k) => `${x(t0 + k).toFixed(1)},${y(v).toFixed(1)}`).reverse().join('L')}Z`;

  const onMove = (e) => {
    const b = ref.current.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (n - 1)))));
  };

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block touch-none" style={{ direction: 'ltr' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        role="img" aria-label={`تصريف النهر عند ${st.name}`}>
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y(yMax * f / 1.12)} y2={y(yMax * f / 1.12)} stroke="#f1f5f9" />
            <text x={W - P.r + 4} y={y(yMax * f / 1.12) + 4} fontSize="12" fill="#94a3b8">{fmtQ(yMax * f / 1.12)}</text>
          </g>
        ))}
        {showFlood && (
          <g>
            <line x1={P.l} x2={W - P.r} y1={y(st.flood)} y2={y(st.flood)} stroke={LEVELS[2].color} strokeDasharray="6 4" strokeWidth="1.5" />
            <text x={W - P.r + 4} y={y(st.flood) + 4} fontSize="12" fill={LEVELS[2].color} fontWeight="700">فيضان</text>
          </g>
        )}
        <path d={band} fill="#0284c7" opacity="0.12" />
        <path d={line(normal, 0, n - 1)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2 3" />
        <path d={line(q, 0, t0)} fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinejoin="round" />
        <path d={line(q, t0, n - 1)} fill="none" stroke="#0284c7" strokeWidth="2.2" strokeDasharray="5 4" strokeLinejoin="round" />
        <line x1={x(t0)} x2={x(t0)} y1={P.t} y2={H - P.b} stroke="#cbd5e1" />
        <text x={x(t0)} y={H - 6} fontSize="12" fill="#475569" textAnchor="middle" fontWeight="700">اليوم</text>
        <text x={x(0)} y={H - 6} fontSize="12" fill="#94a3b8" textAnchor="start">{fmtDay(daily.time[0])}</text>
        <text x={x(n - 1)} y={H - 6} fontSize="12" fill="#94a3b8" textAnchor="end">{fmtDay(daily.time[n - 1])}</text>
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="#475569" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(q[hover])} r="4" fill="#0284c7" stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="absolute top-1 bg-white/95 border border-gray-200 rounded-lg shadow-sm px-2 py-1 text-[11px] text-gray-700 pointer-events-none"
          style={{ [x(hover) > W / 2 ? 'left' : 'right']: 8 }}>
          <div className="font-bold">{fmtDay(daily.time[hover])}{hover > t0 ? ' (توقع)' : ''}</div>
          <div><bdi dir="ltr">{fmtQ(q[hover])}</bdi> م³/ث</div>
          {hover > t0 && <div className="text-gray-500">المحتمل: <bdi dir="ltr">{fmtQ(lo[hover])}–{fmtQ(hi[hover])}</bdi></div>}
          <div className="text-gray-500">المعتاد: <bdi dir="ltr">{fmtQ(normal[hover])}</bdi></div>
        </div>
      )}
    </div>
  );
}

function StationCard({ row }) {
  const { st, now, peak, peakDay, level, trend, vsNormal } = row;
  const L = LEVELS[level];
  const pct = Math.round((vsNormal - 1) * 100);
  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-black text-gray-900">{st.name} <span className="text-xs font-bold text-gray-400">· {st.wilaya}</span></h3>
          <p className="text-sm text-gray-700 mt-0.5">
            التصريف الآن <strong><bdi dir="ltr">{fmtQ(now)}</bdi> م³/ث</strong>{' '}
            {trend === 'up' ? '↗ في ارتفاع' : trend === 'down' ? '↘ في انحسار' : '→ مستقر'}
            <span className="text-gray-500"> · {Math.abs(pct) < 15 ? 'قريب من المعتاد' : pct > 0 ? `أعلى من المعتاد بـ ${pct}%` : `أقل من المعتاد بـ ${-pct}%`}</span>
          </p>
        </div>
        <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${L.badge}`}>{L.icon} {L.label}</span>
      </div>
      <StationChart row={row} />
      <p className="text-[11px] text-gray-500 mt-1">
        أعلى تصريف متوقع خلال 30 يوماً: <bdi dir="ltr">{fmtQ(peak)}</bdi> م³/ث ({fmtDay(peakDay)}) ·
        مستوى الفيضان هنا <bdi dir="ltr">{fmtQ(st.flood)}</bdi> م³/ث
      </p>
    </article>
  );
}

export default function RiverPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'فيضان نهر السنغال: الضفة الموريتانية | جاتكم اسحاب';
    fetchRiver()
      .then((data) => setRows(RIVER_STATIONS.map((st, i) => summarize(st, i, data[i]))))
      .catch((e) => setError(e.message || 'تعذّر جلب بيانات النهر'));
    return () => { document.title = 'جاتكم اسحاب | الطقس في موريتانيا'; };
  }, []);

  const worst = rows ? Math.max(...rows.map((r) => r.level)) : 0;
  const atRisk = useMemo(() => (rows || []).filter((r) => r.level >= 2), [rows]);
  const affected = useMemo(() => {
    const groups = {};
    for (const p of RIVER_PLACES) {
      const r = atRisk.find((x) => x.i === p.station);
      if (r) (groups[p.wilaya] ||= []).push({ ...p, row: r });
    }
    return groups;
  }, [atRisk]);
  const allFalling = rows && rows.every((r) => r.trend !== 'up');

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 mt-6 space-y-5">
        <header>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900">🌊 فيضان نهر السنغال</h1>
          <p className="text-sm text-gray-600 mt-1">
            تصريف النهر على الضفة الموريتانية من ݣوري إلى انجاݣو: آخر 30 يوماً وتوقعات 30 يوماً، والبلديات والقرى المتوقع أن يبلغها الفيضان.
          </p>
        </header>

        {error && <p className="text-sm font-bold text-red-600 bg-white rounded-2xl border border-red-100 p-4">{error}</p>}

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {rows ? (
            <div className="p-4 md:p-5" style={{ borderInlineStart: `6px solid ${LEVELS[worst].color}` }}>
              <h2 className="text-lg font-black text-gray-900">{LEVELS[worst].icon} {worst >= 2
                ? `يتوقع بإذن الله أن يبلغ النهر مستوى ${LEVELS[worst].label === 'فيضان كبير' ? 'الفيضان الكبير' : 'الفيضان'} خلال الأيام القادمة`
                : worst === 1 ? 'منسوب النهر أعلى من المعتاد، دون مستوى الفيضان'
                  : 'لا خطر فيضان متوقعاً خلال الثلاثين يوماً القادمة'}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {worst >= 2
                  ? `قرب ${atRisk.map((r) => `${r.st.name} (ابتداءً من ${fmtDay(r.from)})`).join('، ')}. يُنصح سكان الضفة والمزارعون بالحذر ومتابعة تعليمات السلطات.`
                  : allFalling ? 'النهر في انحسار على طول الضفة الموريتانية.' : 'سنحدّث التوقعات يومياً.'}
              </p>
            </div>
          ) : !error && <div className="h-24 animate-pulse bg-gray-50" />}
          <RiverMap rows={rows} />
          <div className="flex flex-wrap gap-3 px-4 py-2 text-[11px] text-gray-600 border-t border-gray-100">
            {LEVELS.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{l.label}
              </span>
            ))}
            <span className="text-gray-400">لون المحطة: أعلى مستوى متوقع خلال 30 يوماً</span>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
          <h2 className="text-lg font-black text-gray-800">📍 المناطق المتوقع أن يبلغها الفيضان</h2>
          {!rows ? <div className="h-16 animate-pulse bg-gray-50 rounded-xl mt-3" /> : atRisk.length === 0 ? (
            <p className="text-sm text-gray-600 mt-2">لا مناطق متوقع تأثرها حالياً. هذه بلديات الضفة وقراها التي تتابعها الصفحة، وتظهر هنا حين يتوقع أن يبلغ النهر مستوى الفيضان قربها:</p>
          ) : (
            <div className="mt-3 space-y-3">
              {Object.entries(affected).map(([w, list]) => (
                <div key={w}>
                  <h3 className="text-sm font-black text-gray-800">ولاية {w}</h3>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {list.map((p) => (
                      <li key={p.name} className={`text-xs font-bold px-2.5 py-1 rounded-full border ${LEVELS[p.row.level].badge}`}>
                        {p.name} · من {fmtDay(p.row.from)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {rows && atRisk.length === 0 && (
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              {RIVER_WILAYAS.map((w) => `${w}: ${RIVER_PLACES.filter((p) => p.wilaya === w).map((p) => p.name).join('، ')}`).join(' · ')}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black text-gray-800">📈 النهر محطةً محطة، من المنبع إلى المصب</h2>
          <p className="text-xs text-gray-500 -mt-2">الخط المتصل آخر 30 يوماً، والمتقطع التوقعات ونطاقها المحتمل مظلل، والرمادي المنقّط التصريف المعتاد في مثل هذه الأيام (1991–2020).</p>
          {rows ? rows.map((r) => <StationCard key={r.st.name} row={r} />)
            : !error && [...Array(3)].map((_, k) => <div key={k} className="bg-white h-56 rounded-2xl animate-pulse border border-gray-100" />)}
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
          <h2 className="text-lg font-black text-gray-800">📜 أكبر فيضانات النهر منذ 1984</h2>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead><tr className="text-gray-500 text-xs"><th className="text-right py-1">المحطة</th><th className="text-right">مستوى الفيضان</th><th className="text-right">أعلى الذروات (م³/ث)</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {RIVER_STATIONS.map((s) => (
                  <tr key={s.name}>
                    <td className="py-1.5 font-bold text-gray-800">{s.name}</td>
                    <td className="tabular-nums"><bdi dir="ltr">{fmtQ(s.flood)}</bdi></td>
                    <td className="text-gray-600">{s.floods.map(([yr, v]) => `${yr}: ${fmtQ(v)}`).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-[11px] text-gray-400 leading-relaxed">
          المصدر: نظام Copernicus العالمي للإنذار بالفيضانات (GloFAS) عبر Open-Meteo، بدقة نحو 5 كم. الأرقام تقديرات نموذج للتصريف لا قراءات مقاييس المنسوب،
          وقد تختلف عن نشرات منظمة استثمار نهر السنغال (OMVS). مستوى الفيضان لكل محطة ذروة يتجاوزها النهر سنة من كل خمس في النموذج نفسه. ‏
          <Link to="/pastures" className="text-blue-700 hover:underline">المراعي والحرائق ←</Link>
        </p>
      </main>
    </div>
  );
}
