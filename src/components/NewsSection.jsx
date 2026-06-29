import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublishedNews, getLivestockReports } from '../supabase';
import { getImageForAlert } from '../weatherImages';

const BREAKING_CATEGORIES = ['عواصف', 'أمطار', 'فيضانات'];
const BREAKING_MS = 2 * 60 * 60 * 1000; // 2 hours

function isBreaking(article) {
  if (!article.published_at) return false;
  const age = Date.now() - new Date(article.published_at).getTime();
  return age < BREAKING_MS && BREAKING_CATEGORIES.includes(article.category);
}

function fmtDate(d) {
  if (!d) return '';
  const now = Date.now();
  const diff = now - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  return new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'long' });
}

function BreakingBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
      <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
      عاجل
    </span>
  );
}

function WeatherImg({ src, alt, className, fallbackIcon, breaking }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center text-7xl ${breaking ? 'bg-gradient-to-br from-red-700 to-rose-900' : 'bg-gradient-to-br from-blue-700 to-sky-900'}`}>
        {fallbackIcon || (breaking ? '⚡' : '🌦️')}
      </div>
    );
  }
  return <img src={src} alt={alt || ''} className={className} onError={() => setFailed(true)} />;
}

function FeaturedCard({ article }) {
  const breaking = isBreaking(article);
  const imgSrc = article.featured_image || getImageForAlert(article.category, article.title);
  return (
    <Link to={`/news/${article.slug}`}
      className="group relative rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all block h-72 md:h-full">
      <WeatherImg
        src={imgSrc}
        alt={article.title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        breaking={breaking}
      />
      {/* gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* content */}
      <div className="absolute bottom-0 right-0 left-0 p-5" dir="rtl">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {breaking && <BreakingBadge />}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${breaking ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white'}`}>
            {article.category}
          </span>
          {article.wilaya && <span className="text-[11px] text-white/70">📍 {article.wilaya}</span>}
        </div>
        <h3 className="text-white font-black text-lg leading-snug line-clamp-2 group-hover:text-yellow-300 transition-colors">
          {article.title}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="text-white/60 text-xs">{fmtDate(article.published_at)}</span>
          <span className="text-yellow-300 text-xs font-bold group-hover:underline">اقرأ المزيد ←</span>
        </div>
      </div>
    </Link>
  );
}

function SmallCard({ article }) {
  const breaking = isBreaking(article);
  const imgSrc = article.featured_image || getImageForAlert(article.category, article.title);
  return (
    <Link to={`/news/${article.slug}`}
      className="group flex gap-3 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all overflow-hidden p-3">
      <WeatherImg
        src={imgSrc}
        alt=""
        className="w-20 h-16 object-cover rounded-lg shrink-0 group-hover:scale-105 transition-transform"
        breaking={breaking}
        fallbackIcon={breaking ? '⚡' : '🌦️'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {breaking && <BreakingBadge />}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${breaking ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
            {article.category}
          </span>
        </div>
        <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors">
          {article.title}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">{fmtDate(article.published_at)}</p>
      </div>
    </Link>
  );
}

function LivestockCard({ report }) {
  const isLost = report.report_type === 'lost';
  const location = [report.village, report.region].filter(Boolean).join(' · ');
  return (
    <Link to={`/althala/${report.id}`} className="flex gap-3 bg-white rounded-xl border border-gray-100 hover:border-amber-200 hover:shadow-md transition-all overflow-hidden p-3">
      {report.image_url ? (
        <img src={report.image_url} alt="" loading="lazy"
          className="w-20 h-16 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-20 h-16 rounded-lg shrink-0 flex items-center justify-center text-2xl bg-amber-50">
          🐄
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isLost ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {isLost ? '🔴 ضالة' : '🟢 وُجدت'}
          </span>
          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
            {report.animal_type}
          </span>
        </div>
        <p className="text-sm font-bold text-gray-900 line-clamp-1">
          {isLost ? 'ضالة' : 'وُجدت'} {report.animal_type} في {location || 'موريتانيا'}
        </p>
        {report.description ? (
          <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">{report.description}</p>
        ) : null}
        <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
          📞 {report.contact_phone} · {fmtDate(report.created_at)}
        </p>
      </div>
    </Link>
  );
}

export default function NewsSection() {
  const [articles,  setArticles]  = useState([]);
  const [livestock, setLivestock] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      getPublishedNews({ limit: 7 }).then(({ data }) => data || []),
      getLivestockReports().then(d => (Array.isArray(d) ? d : []).slice(0, 3)).catch(() => []),
    ]).then(([news, live]) => {
      setArticles(news);
      setLivestock(live);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="max-w-6xl mx-auto px-4 py-8" dir="rtl">
        <div className="flex items-center justify-between mb-5">
          <div className="h-7 bg-gray-200 rounded-lg w-48 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-gray-200 rounded-2xl h-72 animate-pulse" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-200 rounded-xl h-20 animate-pulse" />)}
          </div>
        </div>
      </section>
    );
  }

  if (articles.length === 0 && livestock.length === 0) return null;

  const [featured, ...rest] = articles.length ? articles : [null];
  const sidebar = (rest || []).slice(0, 4);

  return (
    <section className="max-w-6xl mx-auto px-4 py-8 space-y-8" dir="rtl">

      {/* ── أخبار الطقس ── */}
      {articles.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-red-600 rounded-full" />
              <h2 className="text-xl font-black text-gray-900">نشرة الأخبار الجوية</h2>
              {articles.some(isBreaking) && (
                <span className="flex items-center gap-1 text-[11px] bg-red-600 text-white px-2.5 py-1 rounded-full font-black">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse inline-block" />
                  عاجل
                </span>
              )}
            </div>
            <Link to="/news" className="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1">
              كل الأخبار <span>←</span>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <FeaturedCard article={featured} />
            </div>
            <div className="space-y-3 flex flex-col">
              {sidebar.map((a) => <SmallCard key={a.id} article={a} />)}
              <Link to="/news"
                className="mt-auto text-center py-2.5 bg-gray-900 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-colors">
                عرض جميع الأخبار
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── آخر بلاغات الظالة ── */}
      {livestock.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-amber-500 rounded-full" />
              <h2 className="text-xl font-black text-gray-900">آخر بلاغات الظالة</h2>
            </div>
            <Link to="/livestock" className="text-sm font-bold text-amber-600 hover:underline flex items-center gap-1">
              كل البلاغات <span>←</span>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {livestock.map((r, i) => <LivestockCard key={i} report={r} />)}
          </div>
        </div>
      )}

    </section>
  );
}
