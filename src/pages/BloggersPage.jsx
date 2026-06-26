import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBloggers } from '../supabase';
import Navbar from '../components/Navbar';

function fbPic(fbId) {
  return fbId
    ? `https://graph.facebook.com/${fbId}/picture?type=large`
    : null;
}

export default function BloggersPage() {
  const [bloggers, setBloggers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBloggers().then((data) => { setBloggers(data); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900">المدوّنون</h1>
          <p className="text-gray-500 mt-1 text-sm">أقلام تتابع الطقس والسحب في موريتانيا</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-3xl p-6 shadow border border-gray-100 animate-pulse h-48" />
            ))}
          </div>
        ) : bloggers.length === 0 ? (
          <p className="text-gray-400 text-center py-20">لا يوجد مدوّنون بعد.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {bloggers.map((b) => (
              <Link
                key={b.id}
                to={`/blogger/${b.slug}`}
                className="bg-white rounded-3xl p-6 shadow border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col items-center text-center gap-3"
              >
                <div className="w-20 h-20 rounded-full overflow-hidden bg-blue-100 ring-4 ring-blue-50 shrink-0">
                  {fbPic(b.facebook_id) ? (
                    <img
                      src={fbPic(b.facebook_id)}
                      alt={b.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center text-3xl">👤</span>
                  )}
                </div>
                <div>
                  <p className="font-black text-gray-900 text-lg">{b.name}</p>
                  {b.specialty && (
                    <span className="inline-block mt-1 bg-blue-50 text-blue-700 text-xs font-bold px-3 py-0.5 rounded-full">
                      {b.specialty}
                    </span>
                  )}
                  {b.wilaya && (
                    <p className="text-xs text-gray-400 mt-1">📍 {b.wilaya}</p>
                  )}
                  {b.bio && (
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">{b.bio}</p>
                  )}
                </div>
                <span className="mt-auto text-xs text-blue-600 font-bold">عرض الصفحة ←</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
