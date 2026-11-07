import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import WeeklyForecast from '../components/WeeklyForecast';
import StationObservationsCard from '../components/StationObservationsCard';
import LandmarkCredit from '../components/LandmarkCredit';
import MauritaniaMap, { mapWilayaName } from '../components/MauritaniaMap';
import { useWeatherContext } from '../WeatherContext';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';
import { toArabicCommune } from '../mauritaniaCommuneNamesAr';
import { getWilayaLandmark } from '../wilayaLandmarks';
import { getPastureNdvi, getFireHotspots, getRecentForecastPosts, getLocustObservations } from '../supabase';
import { loadRiverForecast, floodRisks, RIVER_WILAYAS, LEVELS, fmtDay as fmtRiverDay, fmtQ } from '../riverFlood';
import { locustAlert, LOCUST_LEVEL_TEXT, sitesText } from '../locustAlert';
import { WILAYA_PAGES, wilayaPageBySlug, wilayaPageTitle, wilayaPageDescription } from '../wilayaPages';

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const fmtDay = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

// مقارنة متسامحة لأسماء الولايات (لبراكنه/البراكنة، داخلت/داخلة…)
const looseKey = (w) => String(w || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ت(?=\s)/g, 'ه')
  .replace(/ى/g, 'ي').replace(/^ال|^ل/, '').replace(/[اي]/g, '').replace(/\s+/g, '');

// هل الاسم من هذه الولاية؟ ولايات نواكشوط الثلاث تُميَّز بأسمائها الكاملة
const belongsTo = (page, wilaya) => (page.mapName === 'نواكشوط'
  ? looseKey(wilaya) === looseKey(page.name)
  : mapWilayaName(wilaya) === page.mapName);

function setMeta(name, content) {
  const el = document.querySelector(`meta[name="${name}"]`);
  if (el) el.setAttribute('content', content);
}

const COMMUNES_SHOWN = 8;

function CommunesNow({ page }) {
  const { weatherData, loading } = useWeatherContext();
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => (weatherData || [])
    .filter((c) => !c.isFallback && c.current && belongsTo(page, c.wilaya))
    .map((c) => ({
      name: toArabicCommune(c.city) || c.city,
      temp: c.current.temperature_2m, code: c.current.weather_code ?? 0,
      max: c.daily?.temperature_2m_max?.[0], min: c.daily?.temperature_2m_min?.[0], rain: c.daily?.precipitation_sum?.[0] ?? 0,
    }))
    .filter((c, i, all) => all.findIndex((x) => x.name === c.name) === i)
    .sort((a, b) => a.name.localeCompare(b.name, 'ar')), [weatherData, page]);

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 h-56 animate-pulse" />;
  if (!list.length) return null;
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
      <h2 className="text-lg font-black text-gray-800">🌡️ الطقس الآن في بلديات الولاية</h2>
      <ul className="mt-3 divide-y divide-gray-100">
        {(showAll ? list : list.slice(0, COMMUNES_SHOWN)).map((c) => (
          <li key={c.name} className="flex items-center gap-3 py-2">
            <span className="text-lg shrink-0" title={getWeatherDescription(c.code)} aria-hidden="true">{getWeatherIcon(c.code)}</span>
            <span className="flex-1 min-w-0 font-bold text-sm text-gray-800 truncate">{c.name}</span>
            {c.rain > 0 && <span className="text-[11px] font-bold text-blue-600 shrink-0">🌧️ {Math.round(c.rain * 10) / 10} مم</span>}
            {c.max != null && <span className="text-[11px] text-gray-400 shrink-0 tabular-nums"><bdi dir="ltr">{Math.round(c.min)}°–{Math.round(c.max)}°</bdi></span>}
            <span className="text-sm font-black text-gray-800 w-9 text-left shrink-0 tabular-nums"><bdi dir="ltr">{Math.round(c.temp)}°</bdi></span>
          </li>
        ))}
      </ul>
      {list.length > COMMUNES_SHOWN && (
        <button onClick={() => setShowAll((v) => !v)}
          className="w-full mt-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl py-2">
          {showAll ? 'عرض أقل' : `عرض كل البلديات (${list.length})`}
        </button>
      )}
      <p className="text-[11px] text-gray-400 mt-2">الحرارة الآن، ومدى الصغرى والعظمى اليوم، والمطر المتوقع اليوم.</p>
    </section>
  );
}

function ForecastPosts({ page }) {
  const [posts, setPosts] = useState(null);
  useEffect(() => {
    getRecentForecastPosts().then((all) => setPosts(all.filter((p) => p.wilaya && belongsTo(page, p.wilaya)).slice(0, 4)));
  }, [page]);
  if (!posts?.length) return null;
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
      <h2 className="text-lg font-black text-gray-800">🌧️ آخر توقعات الأمطار للولاية</h2>
      <ul className="mt-3 space-y-2">
        {posts.map((p) => (
          <li key={p.slug}>
            <Link to={`/news/${p.slug}`} className="block text-sm font-bold text-blue-700 hover:underline leading-snug">{p.title}</Link>
            <span className="text-[11px] text-gray-400">{fmtDay(p.published_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// نهر السنغال في ولايات الضفة الأربع: تنبيه بارز حين يُتوقع «خطر فيضان»، وإلا سطر بحال النهر
function RiverCard({ page }) {
  const [rows, setRows] = useState(null);
  const onBank = RIVER_WILAYAS.includes(page.mapName);
  useEffect(() => {
    if (!onBank) return;
    loadRiverForecast().then((all) => setRows(all.filter((r) => r.st.wilaya === page.mapName))).catch(() => setRows([]));
  }, [page, onBank]);
  if (!onBank || !rows?.length) return null;

  const risks = floodRisks(rows);
  if (risks.length) {
    const worst = Math.max(...risks.map((r) => r.level));
    return (
      <section className={`rounded-2xl border-2 p-4 md:p-5 ${worst === 3 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
        <h2 className="text-lg font-black text-gray-900">{LEVELS[worst].icon} نهر السنغال: {LEVELS[worst].label}</h2>
        <ul className="mt-2 space-y-2 text-sm text-gray-800">
          {risks.map((r) => (
            <li key={r.st.name}>
              يتوقع بإذن الله أن يبلغ النهر مستوى {r.level === 3 ? 'الفيضان الكبير' : 'الفيضان'} قرب <strong>{r.st.name}</strong> ابتداءً
              من {fmtRiverDay(r.from)}، وذروته نحو <bdi dir="ltr">{fmtQ(r.peak)}</bdi> م³/ث في {fmtRiverDay(r.peakDay)}.
              {r.places.length > 0 && <span className="block text-xs text-gray-600 mt-0.5">المناطق القريبة: {r.places.join('، ')}</span>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-600 mt-2">يُنصح سكان الضفة والمزارعون بالحذر ومتابعة تعليمات السلطات.</p>
        <Link to="/river" className="inline-block mt-2 text-xs font-bold text-blue-700 hover:underline">تفاصيل النهر وصور الأقمار الصناعية ←</Link>
      </section>
    );
  }
  const up = rows.some((r) => r.trend === 'up');
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
      <h2 className="text-lg font-black text-gray-800">🌊 نهر السنغال</h2>
      <p className="text-sm text-gray-700 mt-1">
        {rows.map((r) => `${r.st.name} ${fmtQ(r.now)} م³/ث`).join('، ')}: النهر {up ? 'في ارتفاع' : 'في انحسار أو مستقر'}،
        ولا خطر فيضان متوقعاً خلال الثلاثين يوماً القادمة.
      </p>
      <Link to="/river" className="inline-block mt-1 text-xs font-bold text-blue-700 hover:underline">صفحة فيضان النهر ←</Link>
    </section>
  );
}

function PastureAndFires({ page }) {
  const [ndvi, setNdvi] = useState(null);
  const [fires, setFires] = useState(null);
  const [locust, setLocust] = useState(null);
  useEffect(() => {
    if (page.mapName === 'نواكشوط') return;
    getPastureNdvi().then((rows) => setNdvi(rows.find((r) => r.wilaya === page.mapName) || null));
    getFireHotspots(7).then((rows) => setFires(rows.filter((f) => f.wilaya === page.mapName)));
    getLocustObservations(30).then((obs) => setLocust(obs.filter((o) => o.wilaya === page.mapName)));
  }, [page]);
  const locustWarn = locustAlert(locust);
  const locustSeen = (locust || []).filter((o) => o.severity > 0);
  if (page.mapName === 'نواكشوط' || (!ndvi && !fires?.length && !locustSeen.length)) return null;

  const diff = ndvi ? ndvi.ndvi - ndvi.mean_ndvi : 0;
  const z = ndvi?.std_ndvi > 0 ? diff / ndvi.std_ndvi : 0;
  const pasture = !ndvi ? null
    : Math.abs(diff) < 0.01 || Math.abs(z) < 0.5 ? 'قريبة من المعتاد'
      : diff > 0 ? 'أفضل من المعتاد في هذه الفترة' : 'أضعف من المعتاد في هذه الفترة';
  const recent = (fires || []).filter((f) => Date.now() - new Date(f.detected_at).getTime() <= 24 * 3600000).length;
  const near = [...new Set((fires || []).map((f) => f.place).filter(Boolean))].slice(0, 3).join('، ');

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 space-y-2">
      <h2 className="text-lg font-black text-gray-800">🌿 المراعي والحرائق</h2>
      {pasture && <p className="text-sm text-gray-700">حالة المراعي من صور القمر الصناعي: <strong>{pasture}</strong>.</p>}
      {fires?.length > 0 && (
        <p className="text-sm text-gray-700">
          🔥 {fires.length} بؤرة حريق في آخر 7 أيام{recent ? `، منها ${recent} في آخر 24 ساعة` : ''}{near ? `، أغلبها قرب ${near}` : ''}.
        </p>
      )}
      {locustSeen.length > 0 && (
        <p className={`text-sm ${locustWarn ? 'font-bold text-orange-800' : 'text-gray-700'}`}>
          🦗 {locustWarn ? 'تنبيه: ' : ''}وُجد الجراد في {sitesText(locustSeen.length)} خلال 30 يوماً
          ({LOCUST_LEVEL_TEXT[Math.max(...locustSeen.map((o) => o.severity))]}){locustWarn?.spreading ? '، وهو في انتشار' : ''}.
        </p>
      )}
      <Link to="/pastures" className="inline-block text-xs font-bold text-blue-700 hover:underline">صفحة المراعي والجراد ←</Link>
    </section>
  );
}

export default function WilayaPage() {
  const { slug } = useParams();
  const page = wilayaPageBySlug(slug);

  useEffect(() => {
    if (!page) return undefined;
    document.title = wilayaPageTitle(page);
    setMeta('description', wilayaPageDescription(page));
    return () => { document.title = 'جاتكم اسحاب | الطقس في موريتانيا'; };
  }, [page]);

  if (!page) return <Navigate to="/" replace />;
  const landmark = getWilayaLandmark(page.name);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 mt-6 space-y-5">
        <nav className="text-sm text-gray-500 flex items-center gap-2">
          <Link to="/" className="hover:text-blue-600">الرئيسية</Link><span>/</span><span className="text-gray-800">ولاية {page.name}</span>
        </nav>

        <header className="relative rounded-2xl overflow-hidden shadow-sm">
          {landmark && <img src={landmark.src} alt={landmark.label} className="w-full h-52 md:h-64 object-cover" />}
          <div className={`${landmark ? 'absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent' : 'bg-[#0b2c5e]'} flex flex-col justify-end p-5`}>
            <h1 className="text-2xl md:text-3xl font-black text-white">طقس ولاية {page.name}</h1>
            <p className="text-sm text-white/85 mt-1">الطقس الآن والتوقعات، عاصمتها {page.capital.name}.</p>
          </div>
        </header>
        {landmark && <LandmarkCredit landmark={landmark} className="-mt-3" />}

        <div className="flex flex-wrap gap-2">
          <Link to={`/forecast/${today}/${page.slug}`}
            className="text-xs font-bold bg-white border border-gray-200 hover:border-blue-300 text-blue-700 px-3 py-2 rounded-xl">
            📅 توقعات الأمطار اليوم بالتفصيل ←
          </Link>
        </div>

        <RiverCard page={page} />
        <CommunesNow page={page} />
        <WeeklyForecast city={{ name: page.capital.name, lat: page.capital.lat, lon: page.capital.lon }} />
        <ForecastPosts page={page} />
        <StationObservationsCard wilaya={page.name} />
        <PastureAndFires page={page} />

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="text-lg font-black text-gray-800 p-4 md:p-5 pb-2">🗺️ موقع الولاية</h2>
          <div className="bg-sky-50"><div className="max-w-[420px] mx-auto">
            <MauritaniaMap fills={{ [page.mapName]: '#f59e0b' }} fill="#f8fafc" />
          </div></div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
          <h2 className="text-base font-black text-gray-800">ولايات أخرى</h2>
          <div className="flex flex-wrap gap-2 mt-3">
            {WILAYA_PAGES.filter((w) => w.slug !== page.slug).map((w) => (
              <Link key={w.slug} to={`/wilaya/${w.slug}`}
                className="text-xs font-bold bg-gray-50 border border-gray-200 hover:border-blue-300 hover:text-blue-700 text-gray-700 px-3 py-1.5 rounded-full">
                {w.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
