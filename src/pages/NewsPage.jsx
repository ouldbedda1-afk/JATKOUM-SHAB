import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getPublishedNews, getTopEngagedNews } from '../supabase';
import Navbar from '../components/Navbar';

const CATEGORIES = ['الكل', 'أمطار', 'عواصف', 'حرارة', 'رياح', 'فيضانات', 'جفاف', 'بيئة', 'زراعة', 'عام'];
const WILAYAS = [
  'الكل',
  'نواكشوط الشمالية','نواكشوط الغربية','نواكشوط الجنوبية',
  'الحوض الشرقي','الحوض الغربي','آسابه','كوركول','لبراكنه',
  'الترارزة','البراكنه','كيدي ماغا','لعصابه','تكانت','آدرار',
  'إينشيري','تيرس زمور','داخلت نواذيبو',
];
const PER_PAGE = 12;

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
}

function NewsCard({ article }) {
  return (
    <Link to={`/news/${article.slug}`}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
      {article.featured_image ? (
        <img src={article.featured_image} alt={article.title} loading="lazy"
          className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300" />
      ) : (
        <div className="w-full h-40 bg-gradient-to-br from-blue-50 to-sky-100 flex items-center justify-center text-5xl">🌦️</div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{article.category}</span>
          {article.wilaya && <span className="text-[11px] text-gray-500">📍 {article.wilaya}</span>}
        </div>
        <h3 className="font-black text-gray-900 text-sm leading-snug line-clamp-2 flex-1 group-hover:text-blue-700 transition-colors">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">{article.excerpt}</p>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <span className="text-[11px] text-gray-400">{fmtDate(article.published_at)}</span>
          <span className="text-xs font-bold text-blue-600 group-hover:underline">اقرأ المزيد ←</span>
        </div>
      </div>
    </Link>
  );
}

export default function NewsPage() {
  const [articles, setArticles] = useState([]);
  const [count,    setCount]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('الكل');
  const [wilaya,   setWilaya]   = useState('الكل');
  const [loading,  setLoading]  = useState(true);
  const [topEngaged, setTopEngaged] = useState([]);

  useEffect(() => { getTopEngagedNews(5).then(setTopEngaged); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, count: c } = await getPublishedNews({
      limit: PER_PAGE,
      offset: page * PER_PAGE,
      search: search || null,
      category: category === 'الكل' ? null : category,
      wilaya:   wilaya   === 'الكل' ? null : wilaya,
    });
    setArticles(data); setCount(c);
    setLoading(false);
  }, [page, search, category, wilaya]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, category, wilaya]);

  const totalPages = Math.ceil(count / PER_PAGE);

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 mt-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">📰 الأخبار الجوية</h1>
          <p className="text-sm text-gray-500 mt-1">آخر أخبار الطقس والمناخ في موريتانيا</p>
        </div>

        {/* الأكثر تفاعلاً على فيسبوك */}
        {topEngaged.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <h2 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
              📘 الأكثر تفاعلاً على فيسبوك
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {topEngaged.map((a, i) => (
                <Link key={a.id} to={`/news/${a.slug}`}
                  className="group flex flex-col gap-1.5 border border-gray-100 rounded-xl p-3 hover:border-blue-200 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black text-blue-600">#{i + 1}</span>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">{a.category}</span>
                  </div>
                  <p className="text-xs font-bold text-gray-800 line-clamp-2 leading-snug group-hover:text-blue-700">
                    {a.title}
                  </p>
                  <span className="text-[11px] text-gray-400 mt-auto">👍 {a.engagement} تفاعل</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 space-y-3">
          {/* Search */}
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 ابحث في الأخبار..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />

          <div className="flex gap-3 flex-wrap">
            {/* Category filter */}
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            {/* Wilaya filter */}
            <select value={wilaya} onChange={(e) => setWilaya(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {WILAYAS.map((w) => <option key={w}>{w}</option>)}
            </select>
            <span className="text-sm text-gray-500 self-center">{count} نتيجة</span>
          </div>
        </div>

        {/* Articles grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-72 animate-pulse border border-gray-100" />)}
          </div>
        ) : articles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-gray-500 font-bold">لا توجد نتائج مطابقة.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((a) => <NewsCard key={a.id} article={a} />)}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-gray-50">
              ← السابق
            </button>
            <span className="text-sm text-gray-600 font-bold">
              الصفحة {page + 1} من {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-gray-50">
              التالي →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
