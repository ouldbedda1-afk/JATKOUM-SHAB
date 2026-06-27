import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getNewsBySlug, getSimilarNews } from '../supabase';
import Navbar from '../components/Navbar';

const SITE_URL = 'https://www.jatkoumshab.com';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function ShareButtons({ url, title }) {
  const enc  = encodeURIComponent;
  const text = enc(title);
  const href = enc(url);
  return (
    <div className="flex items-center gap-2 flex-wrap" dir="rtl">
      <span className="text-xs font-bold text-gray-500">مشاركة:</span>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${href}`} target="_blank" rel="noreferrer"
        className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">
        📘 Facebook
      </a>
      <a href={`https://wa.me/?text=${text}%20${href}`} target="_blank" rel="noreferrer"
        className="flex items-center gap-1 bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600 transition-colors">
        💬 WhatsApp
      </a>
      <a href={`https://t.me/share/url?url=${href}&text=${text}`} target="_blank" rel="noreferrer"
        className="flex items-center gap-1 bg-sky-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-sky-600 transition-colors">
        ✈️ Telegram
      </a>
      <a href={`https://twitter.com/intent/tweet?text=${text}&url=${href}`} target="_blank" rel="noreferrer"
        className="flex items-center gap-1 bg-black text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-800 transition-colors">
        𝕏 X
      </a>
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
              <ShareButtons url={articleUrl} title={article.title} />
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
