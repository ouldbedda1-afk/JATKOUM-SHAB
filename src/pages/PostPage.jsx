import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPostById } from '../supabase';
import Navbar from '../components/Navbar';

function fbPic(fbId) {
  return fbId ? `https://graph.facebook.com/${fbId}/picture?type=large` : null;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function PostPage() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPostById(id).then((p) => { setPost(p); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  if (!post) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4" dir="rtl">
      <p className="text-gray-500 text-lg">المقال غير موجود.</p>
      <Link to="/bloggers" className="text-blue-600 font-bold hover:underline">← المدوّنون</Link>
    </div>
  );

  const blogger = post.bloggers;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* رابط الرجوع */}
        {blogger && (
          <Link to={`/blogger/${blogger.slug}`}
            className="inline-flex items-center gap-2 text-sm text-blue-600 font-bold hover:underline mb-6">
            ← صفحة {blogger.name}
          </Link>
        )}

        {/* صورة الغلاف */}
        {post.cover_url && (
          <img src={post.cover_url} alt={post.title}
            className="w-full h-64 object-cover rounded-3xl mb-6 shadow-lg" />
        )}

        {/* رأس المقال */}
        <h1 className="text-3xl font-black text-gray-900 leading-snug mb-4">{post.title}</h1>

        <div className="flex items-center gap-3 mb-8 flex-wrap">
          {blogger && (
            <Link to={`/blogger/${blogger.slug}`}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-blue-100 shrink-0">
                {fbPic(blogger.facebook_id)
                  ? <img src={fbPic(blogger.facebook_id)} alt={blogger.name} className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-lg">👤</span>}
              </div>
              <span className="text-sm font-black text-gray-700">{blogger.name}</span>
            </Link>
          )}
          <span className="text-xs text-gray-400">{fmtDate(post.created_at)}</span>
          {post.wilaya && (
            <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-full">
              📍 {post.wilaya}
            </span>
          )}
        </div>

        {/* المحتوى */}
        <article className="prose prose-lg max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap">
          {post.content}
        </article>

        {/* مشاركة */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex gap-3 flex-wrap">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(post.title + '\n' + window.location.href)}`}
            target="_blank" rel="noopener noreferrer"
            className="bg-green-500 hover:bg-green-600 text-white text-sm font-black px-5 py-2 rounded-xl transition-colors flex items-center gap-2"
          >
            ✆ مشاركة على واتساب
          </a>
          {blogger?.facebook_url && (
            <a href={blogger.facebook_url} target="_blank" rel="noopener noreferrer"
              className="bg-[#1877F2] hover:bg-[#166fe5] text-white text-sm font-black px-5 py-2 rounded-xl transition-colors flex items-center gap-2">
              f صفحة {blogger.name} على فيسبوك
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
