import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getNewsBySlug, getSimilarNews } from '../supabase';
import Navbar from '../components/Navbar';

const SITE_URL   = 'https://www.jatkoumshab.com';
// Worker يخدم OG tags لبوتات فيسبوك — بعد النشر استبدل بالدومين الفعلي للـ Worker
const WORKER_URL = 'https://share.jatkoumshab.com';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function ShareButtons({ url, title, slug }) {
  const enc = encodeURIComponent;
  // رابط الـ Worker لفيسبوك — يُظهر العنوان والصورة فقط بلا وصف
  const fbUrl   = enc(`${WORKER_URL}/news/${slug}`);
  const fullUrl = enc(url);
  const text    = enc(title);
  return (
    <div className="flex items-center gap-2 flex-wrap" dir="rtl">
      <span className="text-xs font-bold text-gray-500">مشاركة:</span>
      {/* فيسبوك: رابط Worker يُظهر العنوان فقط لإجبار الزوار على الدخول */}
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${fbUrl}`}
        target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-[#1877F2] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#166FE5] transition-colors">
        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07z"/></svg>
        Facebook
      </a>
      <a href={`https://wa.me/?text=${text}%20${fullUrl}`} target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#1ebe5d] transition-colors">
        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97s-.47-.15-.67.15-.77.97-.94 1.17-.35.22-.64.07a8.08 8.08 0 0 1-2.38-1.47 8.96 8.96 0 0 1-1.65-2.05c-.17-.3 0-.46.13-.6s.3-.35.44-.52a2 2 0 0 0 .3-.5.55.55 0 0 0 0-.52c-.07-.15-.67-1.62-.92-2.22s-.49-.5-.67-.5h-.57a1.1 1.1 0 0 0-.8.37 3.37 3.37 0 0 0-1.04 2.5 5.84 5.84 0 0 0 1.22 3.1c.15.2 2.1 3.2 5.08 4.49a17.2 17.2 0 0 0 1.7.63 4.1 4.1 0 0 0 1.87.12 3.1 3.1 0 0 0 2.03-1.43 2.5 2.5 0 0 0 .17-1.43c-.07-.13-.27-.2-.57-.35zM12 0A12 12 0 0 0 1.05 17.6L0 24l6.57-1.72A12 12 0 1 0 12 0zm0 21.82a9.82 9.82 0 0 1-5-1.37l-.36-.21-3.7.97.99-3.6-.23-.37A9.84 9.84 0 1 1 12 21.82z"/></svg>
        WhatsApp
      </a>
      <a href={`https://t.me/share/url?url=${fullUrl}&text=${text}`} target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-[#229ED9] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#1a8bbf] transition-colors">
        ✈️ Telegram
      </a>
      <button onClick={() => navigator.clipboard?.writeText(url)}
        className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors">
        🔗 نسخ الرابط
      </button>
    </div>
  );
}

function SimilarCard({ article }) {
  return (
    <Link to={`/news/${article.slug}`}
      className="group flex gap-3 bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm transition-all">
      {article.featured_image ? (
        <img src={article.featured_image} alt="" loading="lazy"
          className="w-16 h-14 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-16 h-14 bg-blue-50 rounded-lg shrink-0 flex items-center justify-center text-2xl">🌦️</div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-800 line-clamp-2 group-hover:text-blue-600 leading-snug">
          {article.title}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">{fmtDate(article.published_at)}</p>
      </div>
    </Link>
  );
}

// Render content with basic formatting (newlines → paragraphs)
function ArticleContent({ content }) {
  if (!content) return null;
  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  return (
    <div className="prose prose-sm max-w-none text-gray-800 leading-loose" dir="rtl">
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-4 text-base leading-8">
          {p.split('\n').map((line, j) => (
            <React.Fragment key={j}>{line}{j < p.split('\n').length - 1 && <br />}</React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

export default function NewsArticlePage() {
  const { slug }  = useParams();
  const [article,  setArticle]  = useState(null);
  const [similar,  setSimilar]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    getNewsBySlug(slug).then((a) => {
      if (!a) { setNotFound(true); setLoading(false); return; }
      setArticle(a);
      getSimilarNews(a.id, a.category, a.wilaya, 3).then(setSimilar);
      setLoading(false);
      // Dynamic meta tags
      document.title = `${a.title} | جاتكم اسحاب`;
      document.querySelector('meta[name="description"]')?.setAttribute('content', a.excerpt || a.title);
    });
    return () => { document.title = 'جاتكم اسحاب | الطقس في موريتانيا'; };
  }, [slug]);

  const articleUrl = `${SITE_URL}/#/news/${slug}`;

  if (loading) return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 mt-8 space-y-4">
        <div className="bg-white rounded-2xl h-64 animate-pulse border border-gray-100" />
        <div className="bg-white rounded-2xl h-8 animate-pulse border border-gray-100 w-3/4" />
        <div className="bg-white rounded-2xl h-48 animate-pulse border border-gray-100" />
      </main>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-6xl mb-4">🔍</p>
          <h1 className="text-2xl font-black text-gray-800 mb-2">الخبر غير موجود</h1>
          <Link to="/news" className="text-blue-600 font-bold hover:underline">← العودة إلى الأخبار</Link>
        </div>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />

      {/* Schema.org NewsArticle */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description: article.excerpt || '',
        image: article.featured_image ? [article.featured_image] : [],
        datePublished: article.published_at,
        dateModified: article.updated_at,
        author: { '@type': 'Person', name: article.author || 'جاتكم اسحاب' },
        publisher: {
          '@type': 'Organization',
          name: 'جاتكم اسحاب',
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
      })}} />

      <main className="max-w-3xl mx-auto px-4 mt-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-2">
          <Link to="/" className="hover:text-blue-600">الرئيسية</Link>
          <span>/</span>
          <Link to="/news" className="hover:text-blue-600">الأخبار</Link>
          <span>/</span>
          <span className="text-gray-800 truncate max-w-[200px]">{article.title}</span>
        </nav>

        <article className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {/* Featured image */}
          {article.featured_image && (
            <img src={article.featured_image} alt={article.title}
              className="w-full max-h-80 object-cover" />
          )}

          <div className="p-6 md:p-8">
            {/* Category + wilaya */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-bold">
                {article.category}
              </span>
              {article.wilaya && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  📍 {article.wilaya}{article.moughataa ? ` · ${article.moughataa}` : ''}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight mb-4">
              {article.title}
            </h1>

            {/* Meta */}
            <div className="flex items-center gap-3 flex-wrap text-sm text-gray-500 pb-4 border-b border-gray-100 mb-6">
              <span>✍️ {article.author || 'جاتكم اسحاب'}</span>
              <span>·</span>
              <span>📅 {fmtDate(article.published_at)}</span>
              <span>·</span>
              <span>👁️ {article.views} مشاهدة</span>
            </div>

            {/* Excerpt */}
            {article.excerpt && (
              <p className="text-base font-bold text-gray-700 border-r-4 border-blue-500 pr-4 mb-6 leading-relaxed">
                {article.excerpt}
              </p>
            )}

            {/* Content */}
            <ArticleContent content={article.content} />

            {/* Tags */}
            {article.tags?.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-6 pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-500 font-bold">الوسوم:</span>
                {article.tags.map((t) => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{t}</span>
                ))}
              </div>
            )}

            {/* Share */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <ShareButtons url={articleUrl} title={article.title} slug={slug} />
            </div>
          </div>
        </article>

        {/* Similar news */}
        {similar.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-black text-gray-800 mb-4">📰 أخبار مشابهة</h2>
            <div className="space-y-3">
              {similar.map((a) => <SimilarCard key={a.id} article={a} />)}
            </div>
          </section>
        )}

        <div className="mt-6 text-center">
          <Link to="/news" className="text-sm font-bold text-blue-600 hover:underline">← العودة إلى جميع الأخبار</Link>
        </div>
      </main>
    </div>
  );
}
