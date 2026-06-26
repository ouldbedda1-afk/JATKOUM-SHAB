import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBloggerBySlug, getPostsByBlogger } from '../supabase';
import Navbar from '../components/Navbar';

function fbPic(fbId) {
  return fbId ? `https://graph.facebook.com/${fbId}/picture?type=large` : null;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BloggerPage() {
  const { slug } = useParams();
  const [blogger, setBlogger] = useState(null);
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getBloggerBySlug(slug).then(async (b) => {
      setBlogger(b);
      if (b) {
        const p = await getPostsByBlogger(b.id);
        setPosts(p);
      }
      setLoading(false);
    });
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  if (!blogger) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4" dir="rtl">
      <p className="text-gray-500 text-lg">المدوّن غير موجود.</p>
      <Link to="/bloggers" className="text-blue-600 font-bold hover:underline">← قائمة المدوّنين</Link>
    </div>
  );

  const pic = fbPic(blogger.facebook_id);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Navbar />

      {/* رأس الملف الشخصي */}
      <div className="bg-gradient-to-b from-[#0b2c5e] to-[#103a78] text-white">
        <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col sm:flex-row items-center sm:items-end gap-6">
          <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-white/30 bg-blue-800 shrink-0">
            {pic ? (
              <img src={pic} alt={blogger.name} className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }} />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-4xl">👤</span>
            )}
          </div>
          <div className="text-center sm:text-right">
            <h1 className="text-3xl font-black">{blogger.name}</h1>
            {blogger.specialty && (
              <span className="inline-block mt-2 bg-white/15 text-white text-sm font-bold px-3 py-1 rounded-full">
                {blogger.specialty}
              </span>
            )}
            {blogger.wilaya && <p className="text-blue-200 text-sm mt-1">📍 {blogger.wilaya}</p>}
            {blogger.bio && <p className="text-blue-100/80 text-sm mt-2 max-w-lg">{blogger.bio}</p>}
            <div className="flex items-center justify-center sm:justify-start gap-3 mt-4">
              {blogger.facebook_url && (
                <a href={blogger.facebook_url} target="_blank" rel="noopener noreferrer"
                  className="bg-[#1877F2] hover:bg-[#166fe5] text-white text-sm font-black px-5 py-2 rounded-xl transition-colors shadow-lg flex items-center gap-2">
                  <span>f</span> فيسبوك
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* آخر منشور على فيسبوك */}
      {blogger.latest_post_url && (
        <div className="bg-gray-100 border-t border-gray-200 py-8">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-lg font-black text-gray-700 mb-4">📌 آخر منشور على فيسبوك</h2>
            <div className="overflow-hidden rounded-3xl shadow bg-white border border-gray-100 flex justify-center p-4">
              <iframe
                src={`https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(blogger.latest_post_url)}&show_text=true&width=500`}
                width="500"
                height="420"
                style={{ border: 'none', overflow: 'hidden', maxWidth: '100%' }}
                scrolling="no"
                frameBorder="0"
                allowFullScreen
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                title="آخر منشور فيسبوك"
              />
            </div>
            <a href={blogger.latest_post_url} target="_blank" rel="noopener noreferrer"
              className="inline-block mt-3 text-sm text-blue-600 font-bold hover:underline">
              عرض المنشور على فيسبوك ↗
            </a>
          </div>
        </div>
      )}

      {/* المقالات */}
      <main className="max-w-4xl mx-auto px-4 py-10">
        <h2 className="text-xl font-black text-gray-800 mb-6">
          مقالات {blogger.name}
          <span className="mr-2 text-sm font-bold text-gray-400">({posts.length})</span>
        </h2>

        {posts.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow p-12 text-center text-gray-400">
            لم يُنشر أي مقال بعد.
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <Link
                key={post.id}
                to={`/post/${post.id}`}
                className="block bg-white rounded-3xl border border-gray-100 shadow hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                <div className="flex gap-4 p-5">
                  {post.cover_url && (
                    <img src={post.cover_url} alt={post.title}
                      className="w-24 h-20 rounded-2xl object-cover shrink-0 bg-gray-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-gray-900 text-lg leading-snug line-clamp-2">{post.title}</h3>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {post.content.slice(0, 120)}{post.content.length > 120 ? '...' : ''}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-400">{fmtDate(post.created_at)}</span>
                      {post.wilaya && (
                        <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-full">
                          📍 {post.wilaya}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
