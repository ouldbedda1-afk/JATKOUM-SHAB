import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getPastureNdvi, getLocustObservations, getLocustHabitat, getLatestSeasonalBulletin, getFireHotspots } from '../supabase';
import MauritaniaMap, { LON0, LAT1 } from '../components/MauritaniaMap';

// الترتيب الرسمي للولايات (نواكشوط بلا مراعٍ)
const ORDER = ['الحوض الشرقي', 'الحوض الغربي', 'لعصابه', 'كوركول', 'البراكنة', 'الترارزة', 'آدرار',
  'داخلة نواذيبو', 'تكانت', 'كيدماغا', 'تيرس زمور', 'انشيري', 'نواكشوط'];

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

// ── الحرائق ──────────────────────────────────────────────────────────────
const FIRE_DAYS = 7;
const FIRE_AGES = [
  { maxH: 24, color: '#dc2626', text: 'آخر 24 ساعة' },
  { maxH: 72, color: '#f97316', text: 'من يوم إلى 3 أيام' },
  { maxH: Infinity, color: '#facc15', text: `حتى ${FIRE_DAYS} أيام` },
];
const fireAge = (iso) => FIRE_AGES.find((a) => (Date.now() - new Date(iso).getTime()) / 3600000 <= a.maxH);

// صور Sentinel-2 للحرائق الكبيرة (دقة 10 أمتار): أول صورة صافية بعد الرصد، والحريق في مركزها
const DIR_PHRASE = {
  'شمال شرق': 'الشمال الشرقي', 'شمال غرب': 'الشمال الغربي', 'جنوب شرق': 'الجنوب الشرقي', 'جنوب غرب': 'الجنوب الغربي',
};
const fireWhere = (f) => (f.distance_km <= 2 ? `قرب ${f.place}`
  : `على بعد ${f.distance_km} كم ${DIR_PHRASE[f.direction] ? `في ${DIR_PHRASE[f.direction]} من ${f.place}` : `${f.direction} ${f.place}`}`);

function FireImages({ fires }) {
  const big = fires.filter((f) => f.big);
  if (!big.length) return null;
  const withImage = big.filter((f) => f.image_url || f.before_image_url);
  const waiting = big.filter((f) => !f.image_url).length;
  return (
    <div className="px-5 py-4 border-t border-gray-100">
      <h3 className="font-black text-gray-800">🛰️ صور الحرائق الكبيرة</h3>
      <p className="text-xs text-gray-500 mt-1">
        من القمر الأوروبي Sentinel-2 بدقة 10 أمتار، الذي يمر كل يومين إلى ثلاثة. الحريق في مركز الصورة، واللهب النشط بالأحمر إن كان مشتعلاً لحظة مرور القمر.
      </p>
      {withImage.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-3">
          {withImage.map((f) => {
            // قبل الحريق وبعده جنباً إلى جنب حين تتوفر الصورتان
            const shots = [
              f.before_image_url && { url: f.before_image_url, label: `قبل الحريق · ${fmtDay(f.before_image_date)}` },
              f.image_url && { url: f.image_url, label: `بعد الرصد · ${fmtDay(f.image_date)}` },
            ].filter(Boolean);
            return (
              <figure key={f.id} className={`rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm ${shots.length > 1 ? 'sm:col-span-2' : ''}`}>
                {/* العنوان فوق الصورة، كي لا يُقرأ عنواناً للصورة التي تليه */}
                <figcaption className="px-3 py-2.5 text-xs text-gray-700 bg-gray-50 border-b border-gray-100">
                  <p className="font-black text-sm text-gray-800">🔥 {f.wilaya}: {fireWhere(f)}</p>
                  <p className="text-gray-500 mt-0.5">
                    رُصد الحريق {fmtDay(f.detected_at)}{f.cluster_size > 1 ? ` · ${f.cluster_size} بؤر` : ''}
                    {!f.image_url && ' · صورة ما بعد الحريق تصل بعد أول مرور صافٍ للقمر'}
                  </p>
                </figcaption>
                {/* الحلقة على موضع الحريق واسم الموقع مدمجان في الصورة نفسها (دالة fire-hotspots) */}
                <div className={`grid ${shots.length > 1 ? 'grid-cols-2 gap-0.5' : 'grid-cols-1'}`}>
                  {shots.map((shot) => (
                    <div key={shot.url} className="relative aspect-square">
                      <img src={shot.url} alt={`صورة قمر صناعي ${shot.label}: ${fireWhere(f)}`} loading="lazy" className="w-full h-full object-cover" />
                      <span className="absolute top-1.5 right-1.5 text-[10px] font-bold text-white bg-black/55 px-1.5 py-0.5 rounded">{shot.label}</span>
                    </div>
                  ))}
                </div>
              </figure>
            );
          })}
        </div>
      )}
      {waiting > 0 && (
        <p className="text-xs text-gray-500 mt-2">⏳ {waiting === 1 ? 'حريق كبير ينتظر' : `${waiting} حرائق كبيرة تنتظر`} أول مرور صافٍ للقمر بعد رصده.</p>
      )}
    </div>
  );
}

function FireSection({ fires }) {
  if (fires === null) return <div className="bg-white rounded-2xl h-96 animate-pulse border border-gray-100" />;
  const last24 = fires.filter((f) => Date.now() - new Date(f.detected_at).getTime() <= 24 * 3600000);
  const byWilaya = new Map();
  for (const f of fires) {
    const e = byWilaya.get(f.wilaya) || { wilaya: f.wilaya, total: 0, recent: 0, places: new Map() };
    e.total++;
    if (last24.includes(f)) e.recent++;
    if (f.place) e.places.set(f.place, (e.places.get(f.place) || 0) + 1);
    byWilaya.set(f.wilaya, e);
  }
  const rows = [...byWilaya.values()].sort((a, b) => b.recent - a.recent || b.total - a.total);
  // الأحدث يُرسم أخيراً ليظهر فوق غيره
  const dots = [...fires].sort((a, b) => new Date(a.detected_at) - new Date(b.detected_at));

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-black text-gray-800">🔥 حرائق المراعي</h2>
        <p className="text-sm text-gray-500 mt-1">
          بؤر الحرائق النشطة التي رصدتها الأقمار الصناعية في آخر {FIRE_DAYS} أيام (NASA FIRMS، دقة نحو 375 متراً، عدة مرات يومياً).
        </p>
      </div>
      {fires.length ? (
        <>
          <div className="mx-5 mb-3 border rounded-xl p-3 bg-red-50 border-red-200 text-red-900 text-sm">
            <strong>{last24.length} بؤرة حريق في آخر 24 ساعة</strong>، و{fires.length} في آخر {FIRE_DAYS} أيام.
          </div>
          <MauritaniaMap fill="#f8fafc">
            {dots.map((f) => (
              <circle key={f.id} cx={f.lon} cy={-f.lat} r="0.07" fill={fireAge(f.detected_at).color} fillOpacity="0.9" stroke="#fff" strokeWidth="0.012" />
            ))}
          </MauritaniaMap>
          <div className="flex flex-wrap gap-3 px-5 py-2 text-[11px] text-gray-600">
            {FIRE_AGES.map((a) => (
              <span key={a.text} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: a.color }} />{a.text}
              </span>
            ))}
          </div>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {rows.map((w) => {
              const near = [...w.places.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p).join('، ');
              return (
                <div key={w.wilaya} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800">{w.wilaya}</span>
                    {w.recent > 0 && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800">{w.recent} في آخر 24 ساعة</span>}
                    <span className="text-xs text-gray-400 mr-auto">{w.total} في {FIRE_DAYS} أيام</span>
                  </div>
                  {near && <p className="text-sm text-gray-600 mt-1">أغلبها قرب: {near}.</p>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mx-5 mb-4 text-sm text-gray-500">لم تُرصد حرائق في آخر {FIRE_DAYS} أيام.</p>
      )}
      <FireImages fires={fires} />
      <p className="text-[11px] text-gray-400 px-5 py-3 border-t border-gray-100 leading-relaxed">
        كل نقطة رصد حراري من قمر صناعي، وقد يرصد الحريقَ الواحد أكثر من قمر أو يرصد حرق الحقول المعتاد قرب النهر. السحب الكثيفة تحجب الرصد.
      </p>
    </section>
  );
}

export default function PasturesPage() {
  const [ndvi, setNdvi] = useState(null);
  const [obs, setObs] = useState(null);
  const [habitat, setHabitat] = useState(null);
  const [fires, setFires] = useState(null);
  const [bulletin, setBulletin] = useState(undefined);

  useEffect(() => {
    document.title = 'المراعي والجراد | جاتكم اسحاب';
    getPastureNdvi().then(setNdvi);
    getLocustObservations(LOCUST_DAYS).then(setObs);
    getLocustHabitat().then(setHabitat);
    getFireHotspots(FIRE_DAYS).then(setFires);
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
        <FireSection fires={fires} />
        <LocustSection obs={obs} />
        <HabitatSection cells={habitat} obs={obs} />

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-lg font-black text-gray-800">📅 النشرة الموسمية</h2>
          <p className="text-sm text-gray-600 mt-1">
            {bulletin ? <>آخرها: {bulletin.title}. </> : 'تصدر كل شهرين، وتتناول توقعات الأمطار والحرارة للأشهر القادمة وتراكم الأمطار في كل ولاية. '}
            <Link to="/seasonal" className="text-blue-600 font-bold hover:underline">صفحة النشرة الموسمية ←</Link>
          </p>
        </section>

        <footer className="text-[11px] text-gray-400 leading-relaxed px-1">
          المصادر: صور MODIS من ناسا (NASA GIBS)؛ الحرائق من NASA FIRMS وصورها من Copernicus Sentinel-2؛ الأمطار من Open-Meteo؛ مسوحات الجراد من خدمة الإنذار بالجراد في الفاو (FAO DLIS)
          والمركز الوطني لمكافحة الجراد الصحراوي؛ حدود الولايات من geoBoundaries (CC BY-SA 3.0).
        </footer>
      </main>
    </div>
  );
}
