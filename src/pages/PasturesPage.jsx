import React, { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getPastureNdvi, getLocustObservations, getLocustHabitat, getLatestSeasonalBulletin } from '../supabase';
import { WILAYA_SHAPES } from '../mauritaniaWilayaShapes';

// الترتيب الرسمي للولايات (نواكشوط بلا مراعٍ)
const ORDER = ['الحوض الشرقي', 'الحوض الغربي', 'لعصابه', 'كوركول', 'البراكنة', 'الترارزة', 'آدرار',
  'داخلة نواذيبو', 'تكانت', 'كيدماغا', 'تيرس زمور', 'انشيري', 'نواكشوط'];

// إطار الخريطة بالدرجات، كإطار صورة GIBS التي تحسب منها دالة pasture-ndvi
const LON0 = -17.2, LAT1 = 27.4, SPAN_LON = 12.5, SPAN_LAT = 12.8;
// شريط اسم الموقع داخل الخريطة في أسفلها، فوق مالي: من خط الطول 11.4 غرباً شرقاً لا تنزل موريتانيا
// تحت 15.24 شمالاً، فالشريط بين 14.65 و15.15 لا يغطي شيئاً من الغطاء النباتي في موريتانيا
const BADGE = { x: -11.3, y: 14.65, w: 6.5, h: 0.5 };
// العلامتان الباهتتان [خط الطول، خط العرض، حجم الخط]: وسط الخريطة، وأصغر منها فوق صحراء تكانت والحوض الشرقي
const WATERMARKS = [[LON0 + SPAN_LON / 2, LAT1 - SPAN_LAT / 2, 0.62], [-9.0, 17.6, 0.45]];
const LOCUST_DAYS = 30;

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const fmtDay = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

// فترة MODIS: 16 يوماً تبدأ من period
function periodLabel(period) {
  const start = new Date(period);
  const end = new Date(start.getTime() + 15 * 86400000);
  return `${fmtDay(start.toISOString())} – ${fmtDay(end.toISOString())} ${end.getUTCFullYear()}`;
}

function ndviImage(period) {
  return 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    `&LAYERS=MODIS_Terra_L3_NDVI_16Day&CRS=EPSG:4326&BBOX=14.6,${LON0},${LAT1},-4.7&WIDTH=1000&HEIGHT=1024&FORMAT=image/png&TIME=${period}`;
}

// ── تقييم المرعى ─────────────────────────────────────────────────────────
function coverClass(ndvi) {
  if (ndvi < 0.11) return 'غطاء نباتي ضئيل';
  if (ndvi < 0.16) return 'غطاء نباتي خفيف';
  if (ndvi < 0.23) return 'غطاء نباتي متوسط';
  return 'غطاء نباتي جيد';
}

// مقارنة بمعدل الفترة نفسها في السنوات السابقة. في الولايات الصحراوية يتغير المؤشر قليلاً
// من سنة لأخرى، فلا نعدّ الفرق ذا معنى إلا إذا تجاوز 0.01 ونصف الانحراف المعياري.
function comparison(r) {
  const diff = r.ndvi - r.mean_ndvi;
  const z = r.std_ndvi > 0 ? diff / r.std_ndvi : 0;
  if (Math.abs(diff) < 0.01 || Math.abs(z) < 0.5) return { text: 'قريب من المعتاد', tone: 'gray' };
  if (z >= 1) return { text: 'أفضل من المعتاد', tone: 'green' };
  if (z > 0) return { text: 'أفضل قليلاً من المعتاد', tone: 'lime' };
  if (z <= -1) return { text: 'أضعف من المعتاد', tone: 'red' };
  return { text: 'أضعف قليلاً من المعتاد', tone: 'amber' };
}

function trend(r) {
  if (r.prev_ndvi == null) return null;
  const d = r.ndvi - r.prev_ndvi;
  if (Math.abs(d) < 0.005) return { text: 'مستقر', arrow: '→' };
  return d > 0 ? { text: 'يخضرّ', arrow: '↑' } : { text: 'يجفّ', arrow: '↓' };
}

const TONES = {
  green: 'bg-green-100 text-green-800', lime: 'bg-lime-100 text-lime-800', gray: 'bg-gray-100 text-gray-700',
  amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800',
};

// ── الجراد ───────────────────────────────────────────────────────────────
const LOCUST_TYPES = {
  'ADULT': 'جراد بالغ', 'HOPPER': 'يرقات (نطّاط)', 'ADULT GROUPS': 'تجمعات جراد بالغ',
  'HOPPER GROUPS': 'تجمعات يرقات', 'SWARM': 'أسراب', 'BAND': 'حشود يرقات',
};
const SEVERITY = [
  { text: 'لم يُرصد جراد', dot: '#9ca3af', badge: 'bg-gray-100 text-gray-700' },
  { text: 'أفراد متفرقة', dot: '#eab308', badge: 'bg-yellow-100 text-yellow-800' },
  { text: 'تجمعات أو تكاثر', dot: '#f97316', badge: 'bg-orange-100 text-orange-800' },
  { text: 'أسراب أو حشود يرقات', dot: '#dc2626', badge: 'bg-red-100 text-red-800' },
];
const STATUS = [
  { title: 'لم يُرصد جراد في مواقع المسح', box: 'bg-green-50 border-green-200 text-green-900', icon: '✅' },
  { title: 'هادئ: أفراد متفرقة منخفضة الكثافة', box: 'bg-yellow-50 border-yellow-200 text-yellow-900', icon: '🟡' },
  { title: 'حذر: رُصدت تجمعات أو تكاثر محلي', box: 'bg-orange-50 border-orange-200 text-orange-900', icon: '🟠' },
  { title: 'خطر: رُصدت أسراب أو حشود يرقات', box: 'bg-red-50 border-red-200 text-red-900', icon: '🔴' },
];

// ── الخريطة: حدود الولايات بالدرجات (x = الطول، y = -العرض) ─────────────────
const ringPath = (ring) => 'M' + ring.map(([x, y]) => `${x},${-y}`).join('L') + 'Z';

function centroid(rings) {
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a));
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}
// الولايات الصغيرة المتجاورة تتداخل أسماؤها عند مراكزها، فنضعها يدوياً
const LABEL_AT = {
  'لعصابه': [-11.75, 17.05], 'الحوض الغربي': [-9.45, 17.4], 'كوركول': [-13.05, 16.3], 'كيدماغا': [-11.95, 15.05],
};
const LABELS = WILAYA_SHAPES.map((s) => ({ wilaya: s.wilaya, at: LABEL_AT[s.wilaya] || centroid(s.rings) }));

function MauritaniaMap({ image, under, children, labels = true, fill = 'none' }) {
  const clipId = useId();
  return (
    <svg viewBox={`${LON0} ${-LAT1} ${SPAN_LON} ${SPAN_LAT}`} className="w-full h-auto block bg-sky-50" role="img"
      aria-label="خريطة ولايات موريتانيا">
      {image && <image href={image} x={LON0} y={-LAT1} width={SPAN_LON} height={SPAN_LAT} preserveAspectRatio="none" />}
      {fill !== 'none' && WILAYA_SHAPES.map((s) => s.rings.map((r, i) => <path key={`${s.wilaya}${i}`} d={ringPath(r)} fill={fill} />))}
      {/* ما تحت الحدود (مربعات الموائل) يُقص على شكل موريتانيا فلا يتجاوز الساحل والحدود */}
      <clipPath id={clipId}>
        {WILAYA_SHAPES.map((s) => s.rings.map((r, i) => <path key={`${s.wilaya}${i}`} d={ringPath(r)} />))}
      </clipPath>
      {under && <g clipPath={`url(#${clipId})`}>{under}</g>}
      {WILAYA_SHAPES.map((s) => (
        <g key={s.wilaya}>
          {s.rings.map((r, i) => (
            <path key={i} d={ringPath(r)} fill="none" stroke="#334155" strokeWidth="1.2"
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          ))}
        </g>
      ))}
      {children}
      {labels && LABELS.filter((l) => l.wilaya !== 'نواكشوط').map((l) => (
        <text key={l.wilaya} x={l.at[0]} y={-l.at[1]} fontSize="0.32" textAnchor="middle" fontWeight="700"
          fill="#1e293b" stroke="#fff" strokeWidth="0.08" paintOrder="stroke">{l.wilaya}</text>
      ))}
      {/* اسم الموقع على الخريطة: علامتان باهتتان مائلتان وشريط في الأسفل، تبقى في أي لقطة شاشة.
          السفلى فوق صحراء تكانت والحوض الشرقي، بعيداً عن الغطاء النباتي في الجنوب */}
      {WATERMARKS.map(([lon, lat, size]) => (
        <text key={lon} x={lon} y={-lat} fontSize={size} textAnchor="middle" fontWeight="900"
          fill="#0f172a" fillOpacity="0.12" transform={`rotate(-25 ${lon} ${-lat})`}
          style={{ pointerEvents: 'none' }}>جاتكم اسحاب · jatkoumshab.com</text>
      ))}
      <rect x={BADGE.x} y={-(BADGE.y + BADGE.h)} width={BADGE.w} height={BADGE.h} rx="0.08" fill="#0b2c5e" fillOpacity="0.9" />
      <text x={BADGE.x + BADGE.w / 2} y={-(BADGE.y + BADGE.h * 0.3)} fontSize="0.32" textAnchor="middle" fontWeight="700" fill="#fff"
        textLength={BADGE.w - 1.2} lengthAdjust="spacingAndGlyphs">
        جاتكم اسحاب · www.jatkoumshab.com
      </text>
    </svg>
  );
}

// ── الأقسام ──────────────────────────────────────────────────────────────
function PastureSection({ rows }) {
  if (rows === null) return <div className="bg-white rounded-2xl h-96 animate-pulse border border-gray-100" />;
  if (!rows.length) return <p className="text-sm text-gray-500 bg-white rounded-2xl p-5 border border-gray-100">لم تُحسب حالة المراعي بعد.</p>;
  const period = rows[0].period;
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.wilaya) - ORDER.indexOf(b.wilaya));
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-black text-gray-800">🌿 حالة المراعي</h2>
        <p className="text-sm text-gray-500 mt-1">
          الغطاء النباتي من صور القمر الصناعي للفترة <strong className="text-gray-700">{periodLabel(period)}</strong>،
          مقارنةً بالفترة نفسها في السنوات العشر الماضية.
        </p>
      </div>
      <MauritaniaMap image={ndviImage(period)} />
      <div className="flex items-center gap-2 px-5 py-2 text-[11px] text-gray-500">
        <span>صحراء</span>
        <span className="h-2 flex-1 max-w-48 rounded-full" style={{ background: 'linear-gradient(to left, #0b6623, #7cbf3a, #d9d2a6, #ebe4e0)' }} />
        <span>غطاء كثيف</span>
      </div>
      <div className="divide-y divide-gray-100 border-t border-gray-100">
        {sorted.map((r) => {
          const c = comparison(r);
          const t = trend(r);
          const pct = r.mean_ndvi >= 0.12 ? Math.round((r.ndvi / r.mean_ndvi - 1) * 100) : null;
          return (
            <div key={r.wilaya} className="px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="font-bold text-gray-800 w-28 shrink-0">{r.wilaya}</span>
              <span className="text-sm text-gray-600 flex-1 min-w-32">{coverClass(r.ndvi)}</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${TONES[c.tone]}`}>
                {c.text}{pct !== null && c.tone !== 'gray' ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}
              </span>
              {t && <span className="text-xs text-gray-500 w-16 text-left">{t.arrow} {t.text}</span>}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 px-5 py-3 border-t border-gray-100 leading-relaxed">
        «يخضرّ» و«يجفّ» مقارنةً بالفترة السابقة (قبل 16 يوماً). متوسط الولاية كلها، وقد تختلف الحال من مكان لآخر داخلها.
      </p>
    </section>
  );
}

function LocustSection({ obs }) {
  const byWilaya = useMemo(() => {
    const m = new Map();
    for (const o of obs || []) {
      const w = o.wilaya || o.region || 'غير محدد';
      const e = m.get(w) || { wilaya: w, sites: 0, positive: 0, max: 0, types: new Set(), last: o.obs_date, treated: 0 };
      e.sites++; e.treated += o.area_treated_ha || 0;
      if (o.severity > 0) { e.positive++; if (LOCUST_TYPES[o.locust_type]) e.types.add(LOCUST_TYPES[o.locust_type]); }
      e.max = Math.max(e.max, o.severity);
      if (o.obs_date > e.last) e.last = o.obs_date;
      m.set(w, e);
    }
    return [...m.values()].sort((a, b) => b.max - a.max || b.positive - a.positive);
  }, [obs]);

  if (obs === null) return <div className="bg-white rounded-2xl h-96 animate-pulse border border-gray-100" />;
  const max = obs.reduce((n, o) => Math.max(n, o.severity), 0);
  const positive = obs.filter((o) => o.severity > 0).length;
  const treated = obs.reduce((n, o) => n + (o.area_treated_ha || 0), 0);
  const last = obs[0]?.obs_date;
  const status = STATUS[max];
  // الأشد يُرسم أخيراً ليظهر فوق غيره
  const dots = [...obs].sort((a, b) => a.severity - b.severity);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-black text-gray-800">🦗 الجراد الصحراوي</h2>
        <p className="text-sm text-gray-500 mt-1">نتائج مسوحات المركز الوطني لمكافحة الجراد الصحراوي خلال آخر {LOCUST_DAYS} يوماً، كما تنشرها منظمة الفاو.</p>
      </div>
      {obs.length ? (
        <>
          <div className={`mx-5 mb-3 border rounded-xl p-3 ${status.box}`}>
            <p className="font-black">{status.icon} {status.title}</p>
            <p className="text-sm mt-1">
              {obs.length} موقع مسح، وُجد الجراد في {positive} منها
              {treated > 0 ? `، وعولج ${Math.round(treated).toLocaleString('en')} هكتار` : ''}. آخر مسح منشور: {fmtDay(last)}.
            </p>
          </div>
          <MauritaniaMap fill="#f8fafc">
            {dots.map((o) => (
              <circle key={o.id} cx={o.lon} cy={-o.lat} r={o.severity ? 0.09 : 0.05}
                fill={SEVERITY[o.severity].dot} fillOpacity={o.severity ? 0.9 : 0.5} stroke="#fff" strokeWidth="0.015" />
            ))}
          </MauritaniaMap>
          <div className="flex flex-wrap gap-3 px-5 py-2 text-[11px] text-gray-600">
            {SEVERITY.map((s) => (
              <span key={s.text} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.dot }} />{s.text}
              </span>
            ))}
          </div>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {byWilaya.map((w) => (
              <div key={w.wilaya} className="px-5 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-800">{w.wilaya}</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${SEVERITY[w.max].badge}`}>{SEVERITY[w.max].text}</span>
                  <span className="text-xs text-gray-400 mr-auto">آخر مسح {fmtDay(w.last)}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {w.sites} موقع مسح، وُجد الجراد في {w.positive}
                  {w.types.size ? `: ${[...w.types].join('، ')}` : ''}
                  {w.treated > 0 ? `. عولج ${Math.round(w.treated).toLocaleString('en')} هكتار` : ''}.
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mx-5 mb-4 text-sm text-gray-500">لا مسوحات منشورة في آخر {LOCUST_DAYS} يوماً.</p>
      )}
      <p className="text-[11px] text-gray-400 px-5 py-3 border-t border-gray-100 leading-relaxed">
        التصنيف أعلاه قراءة الموقع لنتائج المسوحات. للتقييم الرسمي وتوقعات الأشهر القادمة راجع{' '}
        <a href="https://www.fao.org/locust-watch/" target="_blank" rel="noopener noreferrer" className="underline">نشرة الفاو للجراد</a>.
        للإبلاغ عن جراد اتصل بالمركز الوطني لمكافحة الجراد الصحراوي.
      </p>
    </section>
  );
}

// ── المناطق المهيأة لتكاثر الجراد ───────────────────────────────────────
const HABITAT_CELL = 0.5;
const HABITAT_STATUS = [
  null,
  { text: 'مطر حديث، لم يخضرّ بعد', color: '#38bdf8' },
  { text: 'نبات أخضر', color: '#84cc16' },
  { text: 'مطر ونبات أخضر: مهيأة للتكاثر', color: '#ea580c' },
];

function HabitatSection({ cells, obs }) {
  if (cells === null) return <div className="bg-white rounded-2xl h-96 animate-pulse border border-gray-100" />;
  if (!cells.length) return null;
  const favourable = new Map();
  for (const c of cells) if (c.status === 3) favourable.set(c.wilaya, (favourable.get(c.wilaya) || 0) + 1);
  const wilayas = [...favourable.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const positives = (obs || []).filter((o) => o.severity > 0);
  const half = HABITAT_CELL / 2;
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-black text-gray-800">🛰️ مناطق مهيأة لتكاثر الجراد</h2>
        <p className="text-sm text-gray-500 mt-1">
          القمر الصناعي لا يرى الجراد، لكنه يرى ما يحتاجه ليتكاثر: مطر يرطّب التربة فيضع فيها البيض، ثم نبات أخضر
          تتغذى عليه اليرقات. نفحص ذلك يومياً في المناطق التي يعيش فيها الجراد عادة.
        </p>
      </div>
      {wilayas.length > 0 && (
        <div className="mx-5 mb-3 border rounded-xl p-3 bg-orange-50 border-orange-200 text-orange-900 text-sm">
          <strong>الظروف مهيأة للتكاثر في أجزاء من:</strong> {wilayas.join('، ')}.
        </div>
      )}
      <MauritaniaMap fill="#f8fafc" under={cells.filter((c) => c.status > 0).map((c) => (
        <rect key={`${c.lat},${c.lon}`} x={c.lon - half} y={-(c.lat + half)} width={HABITAT_CELL} height={HABITAT_CELL}
          fill={HABITAT_STATUS[c.status].color} fillOpacity="0.55" />
      ))}>
        {positives.map((o) => (
          <circle key={o.id} cx={o.lon} cy={-o.lat} r="0.06" fill="#1e293b" stroke="#fff" strokeWidth="0.015" />
        ))}
      </MauritaniaMap>
      <div className="flex flex-wrap gap-3 px-5 py-2 text-[11px] text-gray-600">
        {HABITAT_STATUS.filter(Boolean).reverse().map((s) => (
          <span key={s.text} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: s.color, opacity: 0.7 }} />{s.text}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full inline-block bg-slate-800" />وُجد فيه جراد (آخر {LOCUST_DAYS} يوماً)
        </span>
      </div>
      <p className="text-[11px] text-gray-400 px-5 py-3 border-t border-gray-100 leading-relaxed">
        صورة الغطاء النباتي ليوم {fmtDay(cells[0].ndvi_date)} (MODIS، ناسا)، مقارنةً بموسم الجفاف في مايو؛ والمطر مجموع آخر 30 يوماً
        (Open-Meteo). المربعات موائل الجراد كما تظهر في مسوحات الفاو منذ 2023. هذه أماكن قد يتكاثر فيها الجراد، لا أماكن رُصد فيها:
        والرصد الفعلي هو النقاط الداكنة. في اختبارنا على مسوحات أكتوبر 2026 وقعت 83% من المواقع التي وُجد فيها جراد داخل مربعات خضراء.
      </p>
    </section>
  );
}

export default function PasturesPage() {
  const [ndvi, setNdvi] = useState(null);
  const [obs, setObs] = useState(null);
  const [habitat, setHabitat] = useState(null);
  const [bulletin, setBulletin] = useState(undefined);

  useEffect(() => {
    document.title = 'المراعي والجراد | جاتكم اسحاب';
    getPastureNdvi().then(setNdvi);
    getLocustObservations(LOCUST_DAYS).then(setObs);
    getLocustHabitat().then(setHabitat);
    getLatestSeasonalBulletin().then(setBulletin);
    return () => { document.title = 'جاتكم اسحاب | الطقس في موريتانيا'; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 mt-6 space-y-5">
        <header>
          <h1 className="text-2xl font-black text-gray-900">المراعي والجراد</h1>
          <p className="text-sm text-gray-500 mt-1">للمنمّين والمزارعين: حالة الغطاء النباتي في كل ولاية، ومسوحات الجراد الصحراوي، والنشرة الموسمية.</p>
        </header>

        <PastureSection rows={ndvi} />
        <LocustSection obs={obs} />
        <HabitatSection cells={habitat} obs={obs} />

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-lg font-black text-gray-800">📅 النشرة الموسمية</h2>
          {bulletin ? (
            <p className="text-sm text-gray-600 mt-1">
              توقعات الأمطار والحرارة للأشهر القادمة وتراكم الأمطار في كل ولاية:{' '}
              <Link to={`/news/${bulletin.slug}`} className="text-blue-600 font-bold hover:underline">{bulletin.title}</Link>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">تصدر كل شهرين، وتتناول توقعات الأمطار والحرارة للأشهر القادمة وتراكم الأمطار في كل ولاية.</p>
          )}
        </section>

        <footer className="text-[11px] text-gray-400 leading-relaxed px-1">
          المصادر: صور MODIS من ناسا (NASA GIBS)؛ الأمطار من Open-Meteo؛ مسوحات الجراد من خدمة الإنذار بالجراد في الفاو (FAO DLIS)
          والمركز الوطني لمكافحة الجراد الصحراوي؛ حدود الولايات من geoBoundaries (CC BY-SA 3.0).
        </footer>
      </main>
    </div>
  );
}
