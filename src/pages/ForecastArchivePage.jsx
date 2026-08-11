import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getForecastArchive, FORECAST_CATEGORIES } from '../supabase';
import Navbar from '../components/Navbar';

const CATEGORY_META = {
  'عواصف':   { icon: '⛈️', chip: 'bg-red-100 text-red-700',    accent: 'from-red-700 to-rose-900' },
  'أمطار':   { icon: '🌧️', chip: 'bg-sky-100 text-sky-700',    accent: 'from-sky-700 to-blue-900' },
  'طقس':     { icon: '💨', chip: 'bg-orange-100 text-orange-700', accent: 'from-orange-700 to-amber-900' },
  'طقس حار': { icon: '🔥', chip: 'bg-amber-100 text-amber-700', accent: 'from-orange-600 to-red-800' },
};
const DEFAULT_META = { icon: '🌦️', chip: 'bg-blue-100 text-blue-700', accent: 'from-blue-700 to-sky-900' };
const metaFor = (cat) => CATEGORY_META[cat] || DEFAULT_META;

const CATEGORIES = ['الكل', ...FORECAST_CATEGORIES];
const WILAYAS = [
  'الكل',
  'الحوض الشرقي','الحوض الغربي','لعصابه','كوركول','لبراكنه',
  'الترارزة','آدرار','نواكشوط الشمالية','نواكشوط الغربية','نواكشوط الجنوبية',
  'داخلت نواذيبو','تكانت','كيدي ماغا','تيرس زمور','إينشيري',
];

const MONTH_NAMES = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
];

const NOW = new Date();
const CURRENT_YEAR  = NOW.getFullYear();
const CURRENT_MONTH = NOW.getMonth() + 1;
const YEARS = Array.from({ length: CURRENT_YEAR - 2022 }, (_, i) => CURRENT_YEAR - i);

function fmtDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-u-nu-latn', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('ar-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
}
function dayKey(d) { return d ? new Date(d).toISOString().slice(0, 10) : 'unknown'; }

function ArchiveImg({ src, alt, icon, accent }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`w-full h-36 flex items-center justify-center text-4xl bg-gradient-to-br ${accent}`}>
        {icon}
      </div>
    );
  }
  return (
    <img src={src} alt={alt || ''} loading="lazy" onError={() => setFailed(true)}
      className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300" />
  );
}

function ArchiveCard({ article }) {
  const meta = metaFor(article.category);
  return (
    <Link to={`/news/${article.slug}`}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
      <div className="relative">
        <ArchiveImg src={article.featured_image} alt={article.title} icon={meta.icon} accent={meta.accent} />
        <span className={`absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full font-bold backdrop-blur-sm ${meta.chip}`}>
          {meta.icon} {article.category}
        </span>
      </div>
      <div className="p-4 flex flex-col flex-1">
        {article.wilaya && (
          <span className="text-[11px] text-gray-500 mb-1.5">📍 {article.wilaya}</span>
        )}
        <h3 className="font-black text-gray-900 text-sm leading-snug line-clamp-2 flex-1 group-hover:text-blue-700 transition-colors">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">{article.excerpt}</p>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <span className="text-[11px] text-gray-400">⏱ {fmtTime(article.published_at)}</span>
          <span className="text-xs font-bold text-blue-600 group-hover:underline">اقرأ المزيد ←</span>
        </div>
      </div>
    </Link>
  );
}

export default function ForecastArchivePage() {
  const [year,     setYear]     = useState(CURRENT_YEAR);
  const [month,    setMonth]    = useState(CURRENT_MONTH);
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('الكل');
  const [wilaya,   setWilaya]   = useState('الكل');
  const [articles, setArticles] = useState([]);
  const [count,    setCount]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [totalAll, setTotalAll] = useState(null);

  // إجمالي كل الأرشيف مرة واحدة فقط
  useEffect(() => {
    getForecastArchive({ limit: 1 }).then(({ count: c }) => setTotalAll(c));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, count: c } = await getForecastArchive({
      year,
      month,
      category: category === 'الكل' ? null : category,
      wilaya:   wilaya   === 'الكل' ? null : wilaya,
      search:   search   || null,
    });
    setArticles(data); setCount(c);
    setLoading(false);
  }, [year, month, category, wilaya, search]);

  useEffect(() => { load(); }, [load]);

  // تجميع حسب اليوم
  const groups = useMemo(() => {
    const map = new Map();
    articles.forEach((a) => {
      const k = dayKey(a.published_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(a);
    });
    return [...map.entries()];
  }, [articles]);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />

      {/* Hero */}
      <div className="text-white" style={{ background: 'linear-gradient(135deg, #071e40 0%, #0b2c5e 50%, #0d3468 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-3xl shrink-0">📦</div>
            <div>
              <h1 className="text-2xl font-black">أرشيف التوقعات الجوية</h1>
              <p className="text-sm text-blue-200/80 mt-1">كل توقّع أو تحذير جوي نُشر محفوظ هنا — مرتّب شهرياً</p>
            </div>
          </div>
          {totalAll != null && (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <span className="bg-white/10 ring-1 ring-white/15 rounded-full px-3 py-1 text-xs font-bold">
                📊 {totalAll} توقّع مؤرشف
              </span>
              {FORECAST_CATEGORIES.map((c) => (
                <span key={c} className="bg-white/10 ring-1 ring-white/15 rounded-full px-3 py-1 text-xs font-bold">
                  {metaFor(c).icon} {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 mt-6 space-y-5">

        {/* فلاتر */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm -mt-5 relative z-10 space-y-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 ابحث في أرشيف التوقعات..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />

          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((c) => {
              const active = category === c;
              const meta = c === 'الكل' ? null : metaFor(c);
              return (
                <button key={c} onClick={() => setCategory(c)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                    active ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}>
                  {meta ? `${meta.icon} ${c}` : '🗂 الكل'}
                </button>
              );
            })}
          </div>

          <select value={wilaya} onChange={(e) => setWilaya(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            {WILAYAS.map((w) => <option key={w}>{w}</option>)}
          </select>
        </div>

        {/* اختيار السنة */}
        <div className="flex gap-2 flex-wrap">
          {YEARS.map((y) => (
            <button key={y} onClick={() => { setYear(y); setMonth(y === CURRENT_YEAR ? CURRENT_MONTH : 8); }}
              className={`px-4 py-2 rounded-xl text-sm font-black border transition-all ${
                year === y
                  ? 'bg-[#0b2c5e] text-white border-[#0b2c5e] shadow'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
              }`}>
              {y}
            </button>
          ))}
        </div>

        {/* اختيار الشهر */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {MONTH_NAMES.map((name, i) => {
            const m = i + 1;
            const isFuture = year === CURRENT_YEAR && m > CURRENT_MONTH;
            const active = month === m;
            return (
              <button key={m} onClick={() => !isFuture && setMonth(m)} disabled={isFuture}
                className={`py-2.5 rounded-xl text-xs font-black border transition-all text-center ${
                  isFuture
                    ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                    : active
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-700'
                }`}>
                {name}
              </button>
            );
          })}
        </div>

        {/* رأس الشهر المختار */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-gray-800">
            📅 {monthLabel}
          </h2>
          {!loading && (
            <span className="text-sm text-gray-500 font-bold">{count} توقّع</span>
          )}
        </div>

        {/* المحتوى */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-64 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <p className="text-5xl mb-4">📭</p>
            <p className="text-gray-500 font-bold">لا توجد توقعات مؤرشفة لهذا الشهر.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(([day, items]) => (
              <div key={day}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                  <h3 className="text-sm font-black text-gray-700">{fmtDay(items[0].published_at)}</h3>
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[11px] text-gray-400 font-bold">{items.length} عنصر</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((a) => <ArchiveCard key={a.id} article={a} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
