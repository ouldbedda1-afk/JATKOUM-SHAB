import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRainMeasurementReports, getRainMeasurementStats, getWilayaReadings } from '../supabase';
import Navbar from '../components/Navbar';

const WILAYAS = [
  'الكل',
  'نواكشوط الشمالية', 'نواكشوط الغربية', 'نواكشوط الجنوبية',
  'الحوض الشرقي', 'الحوض الغربي', 'آسابه', 'كوركول', 'لبراكنه',
  'الترارزة', 'البراكنه', 'كيدي ماغا', 'لعصابه', 'تكانت', 'آدرار',
  'إينشيري', 'تيرس زمور', 'داخلت نواذيبو',
];
const PER_PAGE = 5;

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', calendar: 'gregory' });
}

// تجميع قراءات تقرير واحد حسب الولاية ثم المقاطعة، وترتيب القرى تنازلياً حسب الكمية
function groupReadings(readings) {
  const byWilaya = new Map();
  readings.forEach((r) => {
    if (!byWilaya.has(r.wilaya)) byWilaya.set(r.wilaya, new Map());
    const byMoughataa = byWilaya.get(r.wilaya);
    const key = r.moughataa || '—';
    if (!byMoughataa.has(key)) byMoughataa.set(key, []);
    byMoughataa.get(key).push(r);
  });
  return [...byWilaya.entries()].map(([wilaya, moughataaMap]) => ({
    wilaya,
    moughataas: [...moughataaMap.entries()].map(([moughataa, villages]) => ({
      moughataa,
      villages: [...villages].sort((a, b) => b.mm - a.mm),
    })),
  }));
}

function fmtShortDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', calendar: 'gregory' });
}

// قائمة قرى/تواريخ ولاية واحدة — تُحمَّل عند أول توسيع فقط وتُخزَّن مؤقتاً
function WilayaDetailList({ readings, loading }) {
  if (loading) {
    return <p className="text-xs text-gray-400 text-center py-4">جارٍ التحميل...</p>;
  }
  if (!readings || readings.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">لا قراءات.</p>;
  }
  return (
    <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
      {readings.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
          <span className="text-gray-400 w-16 shrink-0">{fmtShortDate(r.report_published_at)}</span>
          <span className="font-bold text-gray-700 flex-1 truncate">
            {r.village}{r.moughataa ? <span className="text-gray-400"> ({r.moughataa})</span> : null}
          </span>
          <span className="font-black text-blue-600 shrink-0">{r.mm} مم</span>
        </div>
      ))}
    </div>
  );
}

function StatsSection() {
  const [stats, setStats] = useState(null);
  const [showAllMoughataa, setShowAllMoughataa] = useState(false);
  const [expandedWilaya, setExpandedWilaya] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);

  useEffect(() => {
    getRainMeasurementStats().then(setStats);
  }, []);

  async function toggleWilaya(wilaya) {
    if (expandedWilaya === wilaya) { setExpandedWilaya(null); return; }
    setExpandedWilaya(wilaya);
    if (detailCache[wilaya]) return;
    setDetailLoading(wilaya);
    const readings = await getWilayaReadings(wilaya);
    setDetailCache((c) => ({ ...c, [wilaya]: readings }));
    setDetailLoading(null);
  }

  if (!stats || stats.total === 0) return null;

  const topWilaya = stats.wilayaRanking[0];
  const visibleMoughataa = showAllMoughataa ? stats.topByMoughataa : stats.topByMoughataa.slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-2xl font-black text-gray-900">{stats.total.toLocaleString('en-US')}</p>
          <p className="text-xs font-bold text-gray-400 mt-1">مقياس مسجَّل لحد الآن</p>
        </div>
        {topWilaya && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-lg font-black text-blue-700 leading-tight">{topWilaya.wilaya}</p>
            <p className="text-xs font-bold text-gray-400 mt-1">
              الولاية الأكثر هطولاً (تراكمياً {topWilaya.total.toFixed(0)} مم)
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-bold text-gray-400 mb-3">📊 ترتيب الولايات حسب تراكم الهطول — اضغط على أي ولاية لعرض القرى والتواريخ</p>
        <div className="space-y-1">
          {stats.wilayaRanking.map((w, i) => (
            <div key={w.wilaya}>
              <button onClick={() => toggleWilaya(w.wilaya)}
                className="w-full flex items-center gap-3 text-right py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                <span className="text-xs font-black text-gray-400 w-5 shrink-0">{i + 1}</span>
                <span className="text-sm font-bold text-gray-700 flex-1 truncate">{w.wilaya}</span>
                <span className="text-[11px] text-gray-400">{w.count} قراءة</span>
                <span className="text-xs font-black text-blue-600 w-20 text-left">{w.total.toFixed(0)} مم</span>
                <span className="text-gray-300 text-xs shrink-0">{expandedWilaya === w.wilaya ? '▲' : '▼'}</span>
              </button>
              {expandedWilaya === w.wilaya && (
                <div className="mt-1 mb-2 pr-8">
                  <WilayaDetailList readings={detailCache[w.wilaya]} loading={detailLoading === w.wilaya} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-bold text-gray-400 mb-3">🏆 أعلى قراءة مسجَّلة في كل مقاطعة</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleMoughataa.map((m, i) => (
            <div key={`${m.wilaya}-${m.moughataa}`} className="bg-gray-50 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-700 truncate">{m.moughataa} <span className="text-gray-400">({m.wilaya})</span></p>
                <p className="text-[11px] text-gray-400 truncate">{m.village}</p>
              </div>
              <span className="text-xs font-black text-blue-600 shrink-0">{m.mm} مم</span>
            </div>
          ))}
        </div>
        {stats.topByMoughataa.length > 12 && (
          <button onClick={() => setShowAllMoughataa((v) => !v)}
            className="text-xs font-bold text-blue-600 hover:underline mt-3">
            {showAllMoughataa ? '← عرض أقل' : `عرض كل المقاطعات (${stats.topByMoughataa.length}) →`}
          </button>
        )}
      </div>
    </div>
  );
}

function ReportCard({ report }) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => groupReadings(report.readings), [report.readings]);
  const maxMm = Math.max(0, ...report.readings.map((r) => r.mm));
  const topVillage = report.readings.find((r) => r.mm === maxMm);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-right p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-gray-400 font-bold mb-1">📅 {fmtDate(report.report_published_at)}</p>
          <h3 className="font-black text-gray-900 leading-snug">{report.report_title}</h3>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-[11px] bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full font-bold">💧 {report.readings.length} قرية</span>
            {topVillage && (
              <span className="text-[11px] bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-bold">
                📈 أعلى كمية: {topVillage.village} ({topVillage.mm} مم)
              </span>
            )}
          </div>
        </div>
        <span className="text-2xl text-gray-300 shrink-0">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          {grouped.map(({ wilaya, moughataas }) => (
            <div key={wilaya}>
              <h4 className="font-black text-blue-700 text-sm mb-2">📍 {wilaya}</h4>
              <div className="space-y-3">
                {moughataas.map(({ moughataa, villages }) => (
                  <div key={moughataa} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-bold text-gray-500 mb-2">{moughataa}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {villages.map((v, i) => (
                        <div key={i} className="bg-white rounded-lg px-2.5 py-1.5 border border-gray-100 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-gray-700 truncate">{v.village}</span>
                          <span className="text-xs font-black text-blue-600 shrink-0">{v.mm} مم</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MeasurementsPage() {
  const [reports, setReports] = useState([]);
  const [count,   setCount]   = useState(0);
  const [page,    setPage]    = useState(0);
  const [wilaya,  setWilaya]  = useState('الكل');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { reports: r, count: c } = await getRainMeasurementReports({
      limit: PER_PAGE,
      offset: page * PER_PAGE,
      wilaya: wilaya === 'الكل' ? null : wilaya,
    });
    setReports(r); setCount(c);
    setLoading(false);
  }, [page, wilaya]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [wilaya]);

  const totalPages = Math.ceil(count / PER_PAGE);

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />

      <div className="text-white" style={{ background: 'linear-gradient(135deg, #071e40 0%, #0b2c5e 50%, #0d3468 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-3xl shrink-0">🌧️</div>
            <div>
              <h1 className="text-2xl font-black">مقاييس الأمطار</h1>
              <p className="text-sm text-blue-200/80 mt-1">
                التقارير الرسمية لكميات الأمطار حسب القرية، كما تنشرها الوكالة الموريتانية للأنباء
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 mt-6 space-y-5">
        <StatsSection />

        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap shadow-sm">
          <select value={wilaya} onChange={(e) => setWilaya(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            {WILAYAS.map((w) => <option key={w}>{w}</option>)}
          </select>
          <span className="text-sm text-gray-500">{count} تقرير</span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-white h-28 rounded-2xl animate-pulse border border-gray-100" />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <p className="text-5xl mb-4">🌤️</p>
            <p className="text-gray-500 font-bold">لا توجد تقارير مقاييس بعد.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((r) => <ReportCard key={r.report_url} report={r} />)}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-gray-50">
              ← السابق
            </button>
            <span className="text-sm text-gray-600 font-bold">الصفحة {page + 1} من {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-gray-50">
              التالي →
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center pt-2">
          المصدر: الوكالة الموريتانية للأنباء (AMI) — وزارة الداخلية وترقية اللامركزية والتنمية المحلية
        </p>
      </main>
    </div>
  );
}
