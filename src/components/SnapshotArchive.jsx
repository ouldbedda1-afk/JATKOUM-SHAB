import React, { useEffect, useState } from 'react';
import { getWeatherSnapshots, getSnapshotByDate } from '../supabase';

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAYS_AR   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

function fmtDate(d) {
  const dt = new Date(d);
  return `${DAYS_AR[dt.getDay()]} ${dt.getDate()} ${MONTHS_AR[dt.getMonth()]} ${dt.getFullYear()}`;
}

function IntensityBadge({ forecast }) {
  const hasStorm    = forecast.forecasts?.some(f => f.thunder?.length);
  const hasHeavy    = forecast.forecasts?.some(f => f.heavy?.length);
  const hasModerate = forecast.forecasts?.some(f => f.moderate?.length);
  if (hasStorm)    return <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">⛈️ عواصف</span>;
  if (hasHeavy)    return <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">🌧️ غزيرة</span>;
  if (hasModerate) return <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-bold">🌦️ متوسطة</span>;
  return <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">ضعيفة</span>;
}

function SnapshotDetail({ snapshot }) {
  if (!snapshot?.forecasts?.length) {
    return <p className="text-gray-400 text-sm py-4 text-center">☀️ لا توقعات أمطار مسجّلة في هذا اليوم.</p>;
  }

  // تجميع حسب الولاية
  const wilayaMap = new Map();
  snapshot.forecasts.forEach((day) => {
    (day.forecasts || []).forEach((f) => {
      if (!wilayaMap.has(f.wilaya)) wilayaMap.set(f.wilaya, []);
      wilayaMap.get(f.wilaya).push({ dateStr: day.dateStr, forecast: f });
    });
  });

  return (
    <div className="space-y-3 mt-3" dir="rtl">
      {[...wilayaMap.entries()].map(([wilaya, entries]) => (
        <div key={wilaya} className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="font-black text-gray-800 text-sm mb-2">🗺️ {wilaya}</p>
          {entries.map(({ dateStr, forecast }) => {
            const thunder  = [...new Set((forecast.thunder  || []).map(t => t.city || t))];
            const heavy    = [...new Set(forecast.heavy    || [])];
            const moderate = [...new Set(forecast.moderate || [])];
            const weak     = [...new Set(forecast.weak     || [])];
            return (
              <div key={dateStr} className="border-r-4 border-sky-200 pr-2 mb-2">
                <p className="text-xs font-bold text-sky-700 mb-1">📅 {fmtDate(dateStr)}</p>
                <div className="space-y-0.5 text-xs text-gray-700">
                  {thunder.length  > 0 && <p>⛈️ عواصف: {thunder.join('، ')}</p>}
                  {heavy.length    > 0 && <p>🌧️ غزيرة: {heavy.join('، ')}</p>}
                  {moderate.length > 0 && <p>🌦️ متوسطة: {moderate.join('، ')}</p>}
                  {weak.length     > 0 && <p>🌂 ضعيفة: {weak.join('، ')}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function SnapshotArchive() {
  const [snapshots, setSnapshots] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [detail,    setDetail]    = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    getWeatherSnapshots(60)
      .then(({ data }) => setSnapshots(data || []))
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (snap) => {
    if (selected?.id === snap.id) { setSelected(null); setDetail(null); return; }
    setSelected(snap);
    setDetail(snap); // البيانات موجودة مسبقاً في القائمة
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white h-14 rounded-xl animate-pulse border border-gray-100" />
        ))}
      </div>
    );
  }

  if (!snapshots.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <p className="text-4xl mb-3">📦</p>
        <p className="font-bold text-gray-600">لا يوجد أرشيف بعد.</p>
        <p className="text-sm text-gray-400 mt-1">عند الضغط على ⚡ نشر أوتوماتيك في تاب التوقعات، يُحفظ snapshot تلقائياً هنا.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📦</span>
        <div>
          <h3 className="font-black text-gray-800">أرشيف التوقعات اليومية</h3>
          <p className="text-xs text-gray-400">{snapshots.length} لقطة محفوظة — اضغط على أي يوم لرؤية التفاصيل</p>
        </div>
      </div>

      {snapshots.map((snap) => {
        const isOpen = selected?.id === snap.id;
        const wilayaCount = snap.forecasts?.reduce((n, d) => n + (d.forecasts?.length || 0), 0) || 0;
        const dayCount = snap.forecasts?.length || 0;
        const hasStorm = snap.forecasts?.some(d => d.forecasts?.some(f => f.thunder?.length));

        return (
          <div key={snap.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => openDetail(snap)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-right"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{hasStorm ? '⛈️' : '🌦️'}</span>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{fmtDate(snap.snapshot_date)}</p>
                  <p className="text-[11px] text-gray-400">
                    {dayCount} يوم توقع · {wilayaCount} ولاية · {snap.cities_count} مدينة رُصدت
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {snap.forecasts?.some(d => d.forecasts?.some(f => f.thunder?.length)) && (
                  <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">عواصف</span>
                )}
                {snap.forecasts?.some(d => d.forecasts?.some(f => f.heavy?.length)) && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">غزيرة</span>
                )}
                <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>←</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-4 pb-4">
                <SnapshotDetail snapshot={snap} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
