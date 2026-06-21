import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLivestockReports } from '../supabase';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiMapPin, FiArrowLeft } = FiIcons;

// معاينة آخر بلاغات الظالة المعتمدة في الصفحة الرئيسية (لجذب المستخدمين)
export default function LivestockHomePreview() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getLivestockReports()
      .then((data) => { if (active) setReports((data || []).slice(0, 4)); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="bg-white rounded-[2rem] h-44 animate-pulse border border-gray-100" />;
  }
  if (reports.length === 0) return null; // لا نعرض القسم إن لم توجد بلاغات معتمدة

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-amber-600 to-amber-800 text-white rounded-xl flex items-center justify-center shadow-lg text-2xl">
            🐫
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-800">الظالة — آخر البلاغات</h2>
            <p className="text-sm text-gray-500">ساعد في ردّ الماشية المفقودة لأصحابها</p>
          </div>
        </div>
        <Link to="/althala" className="text-xs font-bold text-amber-700 hover:underline flex items-center gap-1 shrink-0">
          عرض الكل <SafeIcon icon={FiArrowLeft} className="text-[10px]" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {reports.map((r) => (
          <Link
            key={r.id}
            to="/althala"
            className="rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-all group"
          >
            <div className="relative aspect-square bg-gray-100">
              {r.image_url ? (
                <img src={r.image_url} alt={r.animal_type} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-amber-100 p-4">
                  <img src="/logo.png" alt="جاتكم اسحاب" className="w-14 h-14 object-contain opacity-80" />
                </div>
              )}
              <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black shadow ${r.report_type === 'lost' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                {r.report_type === 'lost' ? 'مفقود' : 'موجود'}
              </span>
            </div>
            <div className="p-2.5">
              <p className="text-xs font-black text-gray-900 truncate">{r.animal_type}</p>
              {(r.region || r.village) && (
                <p className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                  <SafeIcon icon={FiMapPin} className="text-[9px]" />
                  {[r.region, r.village].filter(Boolean).join(' - ')}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>

      <Link
        to="/althala"
        className="mt-4 block w-full text-center bg-amber-600 text-white py-2.5 rounded-2xl text-sm font-black hover:bg-amber-700 transition-all"
      >
        🐫 تصفّح كل البلاغات أو أضف بلاغك
      </Link>
    </div>
  );
}
