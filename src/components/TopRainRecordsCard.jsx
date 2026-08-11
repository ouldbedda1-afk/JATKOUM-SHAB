import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTopRainRecords10Years } from '../supabase';

const MEDALS = ['🥇', '🥈', '🥉'];

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-SA', {
    day: 'numeric', month: 'long', year: 'numeric', calendar: 'gregory',
  });
}

export default function TopRainRecordsCard() {
  const [records, setRecords] = useState(null);

  useEffect(() => {
    getTopRainRecords10Years(3).then(setRecords);
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" dir="rtl">
      {/* رأس البطاقة */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #071e40 0%, #0b2c5e 100%)' }}
      >
        <span className="text-2xl">🏆</span>
        <div>
          <p className="text-sm font-black text-white leading-tight">أعلى مقاييس الأمطار</p>
          <p className="text-[11px] text-blue-200/70 mt-0.5">آخر 10 سنوات · من قاعدة بيانات AMI</p>
        </div>
      </div>

      {/* المحتوى */}
      <div className="divide-y divide-gray-50">
        {!records ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
              <div className="w-7 h-7 bg-gray-100 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
              <div className="h-8 w-14 bg-gray-100 rounded-xl shrink-0" />
            </div>
          ))
        ) : records.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-gray-400 text-sm font-bold">لا توجد بيانات بعد</p>
          </div>
        ) : (
          records.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
              <span className="text-xl shrink-0 w-7 text-center">{MEDALS[i]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900 truncate">
                  {r.village}
                </p>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  {r.moughataa && <span>{r.moughataa} · </span>}
                  {r.wilaya}
                </p>
                <p className="text-[10px] text-gray-300 mt-0.5">{fmtDate(r.report_published_at)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-black text-blue-700 leading-none">{r.mm}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">مم</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* رابط المزيد */}
      <div className="px-5 py-3 border-t border-gray-50 bg-gray-50">
        <Link
          to="/measurements"
          className="text-xs font-bold text-blue-600 hover:underline"
        >
          عرض كامل الأرشيف ←
        </Link>
      </div>
    </div>
  );
}
