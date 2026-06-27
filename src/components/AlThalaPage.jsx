import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from './Navbar';
import { getLivestockReports } from '../supabase';
import LivestockReportForm from './LivestockReportForm';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import {
  OFFICIAL_MAURITANIA_WILAYA_ORDER,
  normalizeMauritaniaWilayaName,
  getCanonicalMauritaniaPlaceKey,
} from '../mauritaniaPlaceNames';
import { mauritaniaCommunesList } from '../mauritaniaCommunes';
import { COMMUNE_NAMES_AR } from '../mauritaniaCommuneNamesAr';

const { FiPlus, FiSearch, FiCamera, FiMapPin, FiPhone, FiCalendar, FiRefreshCw } = FiIcons;

// خريطة: مكان (بلدية/مدينة) → ولايته — لتحديد ولاية البلاغ من حقل region
const PLACE_TO_WILAYA = (() => {
  const m = new Map();
  (mauritaniaCommunesList || []).forEach((c) => {
    const w = normalizeMauritaniaWilayaName(c.wilaya);
    if (!w) return;
    [c.city, c.name, COMMUNE_NAMES_AR[c.city]].filter(Boolean).forEach((n) => {
      const k = getCanonicalMauritaniaPlaceKey(n);
      if (k && !m.has(k)) m.set(k, w);
    });
  });
  return m;
})();

// يحدّد ولاية البلاغ من نص المنطقة (اسم ولاية مباشرة أو بلدية تابعة لها)
function resolveReportWilaya(region) {
  if (!region) return '';
  const asWilaya = normalizeMauritaniaWilayaName(region);
  if (OFFICIAL_MAURITANIA_WILAYA_ORDER.includes(asWilaya)) return asWilaya;
  return PLACE_TO_WILAYA.get(getCanonicalMauritaniaPlaceKey(region)) || '';
}

const AlThalaPage = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, lost, found
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [userWilaya, setUserWilaya] = useState(''); // ولاية المستخدم (لإظهار بلاغاتها أولاً)

  useEffect(() => {
    async function fetchReports() {
      try {
        setLoading(true);
        const data = await getLivestockReports(filter === 'all' ? null : filter);
        setReports(data || []);
      } catch (error) {
        console.error('Error fetching reports:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, [filter, refreshKey]);

  // كشف ولاية المستخدم تلقائياً من موقعه (مرة واحدة)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=ar`);
          if (!res.ok) return;
          const data = await res.json();
          const state = data.address?.state || data.address?.region || '';
          const w = normalizeMauritaniaWilayaName(state);
          if (OFFICIAL_MAURITANIA_WILAYA_ORDER.includes(w)) setUserWilaya(w);
        } catch { /* تجاهل */ }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
    );
  }, []);

  // ترتيب: بلاغات ولاية المستخدم أولاً، ثم الباقي (مع الحفاظ على ترتيب التاريخ داخل كل مجموعة)
  const sortedReports = useMemo(() => {
    if (!userWilaya) return reports;
    const inWilaya = [];
    const others = [];
    reports.forEach((r) => {
      (resolveReportWilaya(r.region) === userWilaya ? inWilaya : others).push(r);
    });
    return [...inWilaya, ...others];
  }, [reports, userWilaya]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />

      {showForm && (
        <LivestockReportForm 
          onClose={() => setShowForm(false)} 
          onSuccess={() => setRefreshKey(prev => prev + 1)}
        />
      )}

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-amber-700 to-amber-900 text-white py-12 px-4 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">الظالة - ردّ الأمانات</h1>
          <p className="text-lg opacity-90 mb-8 font-light max-w-2xl mx-auto">دليل موريتانيا الشامل للبحث عن الماشية المفقودة والإبلاغ عن التي تم العثور عليها. نساهم معاً في مساعدة المنمين وأصحاب الحلال.</p>
          
          <div className="flex flex-wrap justify-center gap-4">
            <button 
              onClick={() => setShowForm(true)}
              className="bg-white text-amber-900 px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-amber-50 transition-all flex items-center gap-2 transform hover:-translate-y-1"
            >
              <SafeIcon icon={FiPlus} />
              نشر مفقود
            </button>
            <button 
              onClick={() => setShowForm(true)}
              className="bg-amber-600/50 backdrop-blur-md text-white border-2 border-white/20 px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-amber-600 transition-all flex items-center gap-2 transform hover:-translate-y-1"
            >
              <SafeIcon icon={FiCamera} />
              بلغتُ عن حيوان موجود
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4">
        {/* Filters */}
        <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-gray-100 mb-8 max-w-md mx-auto overflow-x-auto">
          <button 
            onClick={() => setFilter('all')}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all ${filter === 'all' ? 'bg-amber-100 text-amber-900 shadow-sm' : 'text-gray-500'}`}
          >
            الكل
          </button>
          <button 
            onClick={() => setFilter('lost')}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all ${filter === 'lost' ? 'bg-red-100 text-red-900 shadow-sm' : 'text-gray-500'}`}
          >
            مفقود
          </button>
          <button
            onClick={() => setFilter('found')}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all ${filter === 'found' ? 'bg-green-100 text-green-900 shadow-sm' : 'text-gray-500'}`}
          >
            موجود
          </button>
        </div>

        {/* اختيار الولاية — تُعرض بلاغاتها أولاً */}
        <div className="flex items-center justify-center gap-2 mb-8 -mt-4 flex-wrap">
          <span className="text-sm font-bold text-gray-500 flex items-center gap-1">
            <SafeIcon icon={FiMapPin} className="text-amber-600" /> ولايتك أولاً:
          </span>
          <select
            value={userWilaya}
            onChange={(e) => setUserWilaya(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
          >
            <option value="">كل الولايات (بلا ترتيب)</option>
            {OFFICIAL_MAURITANIA_WILAYA_ORDER.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-3xl h-96 animate-pulse border border-gray-100"></div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-gray-200">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <SafeIcon icon={FiSearch} className="text-4xl text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-gray-800">لا توجد بلاغات حالياً</h3>
            <p className="text-gray-500 mt-2">كن أول من يساهم في رد الضالة</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedReports.map((report) => (
              <div key={report.id} className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all group">
                {/* Image Container */}
                <div className="relative aspect-square overflow-hidden bg-gray-100">
                  {report.image_url ? (
                    <img
                      src={report.image_url}
                      alt={report.animal_type}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-amber-100 p-6">
                      <img src="/logo.png" alt="جاتكم اسحاب" className="w-24 h-24 object-contain opacity-80" />
                      <span className="text-xs font-bold text-amber-800/70 mt-2">بدون صورة</span>
                    </div>
                  )}
                  <div className={`absolute top-4 right-4 px-4 py-1 rounded-full text-xs font-black shadow-lg ${report.report_type === 'lost' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                    {report.report_type === 'lost' ? 'مفقود' : 'موجود'}
                  </div>
                </div>

                {/* Details */}
                <div className="p-6">
                  {(() => {
                    const locationParts = [report.region, report.village].filter(Boolean);
                    const locationLabel = locationParts.length > 0 ? locationParts.join(' - ') : 'لم يُحدد المكان بعد';
                    const hasPhone = Boolean(report.contact_phone);

                    return (
                      <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black text-gray-900">{report.animal_type}</h3>
                    <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                      <SafeIcon icon={FiCalendar} />
                      {new Date(report.created_at).toLocaleDateString('ar-MA')}
                    </span>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <SafeIcon icon={FiMapPin} className="text-amber-600" />
                      <span>{locationLabel}</span>
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed line-clamp-2">
                      {report.description}
                    </p>
                    {report.voice_url && (
                      <div className="mt-4 bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-600 text-white rounded-full flex items-center justify-center shadow-sm">
                          <span className="text-xs">🎵</span>
                        </div>
                        <audio src={report.voice_url} controls className="flex-1 h-6 scale-90" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 border-t pt-4">
                    {hasPhone ? (
                      <a
                        href={`tel:${report.contact_phone}`}
                        className="flex-1 bg-amber-50 text-amber-900 py-3 rounded-xl font-bold text-center flex items-center justify-center gap-2 hover:bg-amber-100 transition-all"
                      >
                        <SafeIcon icon={FiPhone} />
                        اتصال
                      </a>
                    ) : (
                      <div className="flex-1 bg-gray-50 text-gray-400 py-3 rounded-xl font-bold text-center flex items-center justify-center gap-2">
                        <SafeIcon icon={FiPhone} />
                        لا يوجد رقم
                      </div>
                    )}
                    <Link
                      to={`/althala/${report.id}`}
                      className="w-12 h-12 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center hover:bg-amber-100 transition-all"
                      title="عرض التفاصيل ومشاركة الرابط"
                    >
                      <span className="text-xl">🔗</span>
                    </Link>
                    <button
                      onClick={() => {
                        const proxyUrl = `https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/og-proxy?id=${report.id}&type=livestock`;
                        const loc = [report.village, report.region].filter(Boolean).join('، ');
                        const text = report.report_type === 'lost'
                          ? `🔴 ضالة: ${report.animal_type} في ${loc || 'موريتانيا'}\nللتواصل: ${report.contact_phone || ''}\n${proxyUrl}`
                          : `🟢 وُجد: ${report.animal_type} في ${loc || 'موريتانيا'}\nللتواصل: ${report.contact_phone || ''}\n${proxyUrl}`;
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
                      }}
                      className="w-12 h-12 bg-green-50 text-green-700 rounded-xl flex items-center justify-center hover:bg-green-100 transition-all"
                      title="مشاركة واتساب"
                    >
                      <span className="text-xl">💬</span>
                    </button>
                  </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Floating Action Button (Mobile) */}
      <div className="fixed bottom-8 left-8 flex flex-col gap-3 md:hidden">
        <button className="w-14 h-14 bg-amber-600 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl font-black">
          <SafeIcon icon={FiPlus} />
        </button>
      </div>
    </div>
  );
};

export default AlThalaPage;
