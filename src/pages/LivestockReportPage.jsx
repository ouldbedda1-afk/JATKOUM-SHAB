import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getLivestockById } from '../supabase';
import Navbar from '../components/Navbar';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-MA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function ShareButtons({ report }) {
  const url = window.location.href;
  const isLost = report.report_type === 'lost';
  const loc = [report.village, report.region].filter(Boolean).join(' ، ');
  const text = isLost
    ? `🔴 ضالة: ${report.animal_type} في ${loc || 'موريتانيا'}\nللتواصل: ${report.contact_phone || 'انظر الرابط'}\n${url}`
    : `🟢 وُجد: ${report.animal_type} في ${loc || 'موريتانيا'}\nللتواصل: ${report.contact_phone || 'انظر الرابط'}\n${url}`;

  return (
    <div className="flex flex-wrap gap-2 mt-4" dir="rtl">
      <p className="w-full text-xs font-bold text-gray-500 mb-1">📤 شارك البلاغ:</p>
      <a
        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`}
        target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-600 transition-colors"
      >
        💬 واتساب
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 bg-[#1877F2] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
      >
        📘 فيسبوك
      </a>
      <button
        onClick={() => { navigator.clipboard?.writeText(url); alert('تم نسخ الرابط!'); }}
        className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors"
      >
        🔗 نسخ الرابط
      </button>
    </div>
  );
}

export default function LivestockReportPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLivestockById(id)
      .then(setReport)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (report) {
      const isLost = report.report_type === 'lost';
      const loc = [report.village, report.region].filter(Boolean).join('، ');
      document.title = `${isLost ? 'ضالة' : 'وُجد'}: ${report.animal_type} في ${loc || 'موريتانيا'} — جاتكم اسحاب`;
    }
  }, [report]);

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50" dir="rtl">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-12 flex justify-center">
          <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-amber-50" dir="rtl">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <p className="text-4xl mb-4">🔍</p>
          <p className="font-bold text-gray-700">البلاغ غير موجود أو تم حذفه.</p>
          <Link to="/althala" className="mt-4 inline-block text-amber-600 font-bold hover:underline">← العودة للظالة</Link>
        </div>
      </div>
    );
  }

  const isLost = report.report_type === 'lost';
  const location = [report.village, report.region].filter(Boolean).join(' ، ');

  return (
    <div className="min-h-screen bg-amber-50 pb-20" dir="rtl">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="text-xs text-gray-400 mb-5 flex items-center gap-1">
          <Link to="/" className="hover:text-amber-600">الرئيسية</Link>
          <span>/</span>
          <Link to="/althala" className="hover:text-amber-600">الظالة</Link>
          <span>/</span>
          <span className="text-gray-600 font-bold">{report.animal_type}</span>
        </div>

        <div className="bg-white rounded-[2rem] shadow-lg border border-amber-100 overflow-hidden">
          {/* Badge */}
          <div className={`px-6 py-3 flex items-center gap-2 ${isLost ? 'bg-red-600' : 'bg-green-600'}`}>
            <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
            <span className="text-white font-black text-lg">
              {isLost ? '🔴 بلاغ ضالة' : '🟢 تم العثور على حيوان'}
            </span>
          </div>

          {/* Image */}
          {report.image_url && (
            <div className="aspect-video w-full overflow-hidden bg-gray-100">
              <img
                src={report.image_url}
                alt={report.animal_type}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-6 space-y-5">
            {/* Title */}
            <div>
              <h1 className="text-2xl font-black text-gray-900 mb-1">{report.animal_type}</h1>
              <p className="text-sm text-gray-400">{fmtDate(report.created_at)}</p>
            </div>

            {/* Details */}
            <div className="space-y-3 bg-amber-50 rounded-2xl p-4">
              {location && (
                <div className="flex items-start gap-3">
                  <span className="text-xl">📍</span>
                  <div>
                    <p className="text-xs text-gray-400 font-bold">الموقع</p>
                    <p className="font-bold text-gray-800">{location}</p>
                  </div>
                </div>
              )}
              {report.contact_phone && (
                <div className="flex items-start gap-3">
                  <span className="text-xl">📞</span>
                  <div>
                    <p className="text-xs text-gray-400 font-bold">للتواصل</p>
                    <a href={`tel:${report.contact_phone}`}
                      className="font-black text-amber-700 text-lg hover:underline">
                      {report.contact_phone}
                    </a>
                  </div>
                </div>
              )}
              {report.description && (
                <div className="flex items-start gap-3">
                  <span className="text-xl">📝</span>
                  <div>
                    <p className="text-xs text-gray-400 font-bold">الوصف</p>
                    <p className="text-gray-700 leading-relaxed">{report.description}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Voice */}
            {report.voice_url && (
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <p className="text-xs font-bold text-amber-700 mb-2">🎵 رسالة صوتية</p>
                <audio src={report.voice_url} controls className="w-full" />
              </div>
            )}

            {/* Call CTA */}
            {report.contact_phone && (
              <a
                href={`tel:${report.contact_phone}`}
                className="block w-full bg-amber-600 text-white py-4 rounded-2xl font-black text-center text-lg hover:bg-amber-700 transition-colors shadow-lg"
              >
                📞 اتصال مباشر — {report.contact_phone}
              </a>
            )}

            {/* Share */}
            <ShareButtons report={report} />

            <Link to="/althala"
              className="block text-center text-sm font-bold text-gray-400 hover:text-amber-600 mt-4">
              ← العودة لكل بلاغات الظالة
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
