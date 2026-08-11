import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getRainMeasurementReports,
  getRainMeasurementStats,
  getWilayaReadings,
  searchRainMeasurements,
  getTopRainRecords,
} from '../supabase';
import Navbar from '../components/Navbar';

// الترتيب الرسمي للولايات الموريتانية (حسب الرموز الإدارية 01–15)
const WILAYAS = [
  'الكل',
  'الحوض الشرقي',      // 01
  'الحوض الغربي',      // 02
  'لعصابه',            // 03
  'كوركول',            // 04
  'لبراكنه',           // 05
  'الترارزة',          // 06
  'آدرار',             // 07
  'نواكشوط الشمالية',  // 08
  'نواكشوط الغربية',   // 09
  'نواكشوط الجنوبية',  // 10
  'داخلت نواذيبو',     // 11
  'تكانت',             // 12
  'كيدي ماغا',         // 13
  'تيرس زمور',         // 14
  'إينشيري',           // 15
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = ['الكل', ...Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => String(CURRENT_YEAR - i))];
const PER_PAGE = 8;

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric', calendar: 'gregory' });
}

function fmtShortDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric', calendar: 'gregory' });
}

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// بطاقة تقرير — قابلة للتوسيع مع شريط كمية بصري
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ReportCard({ report }) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => groupReadings(report.readings), [report.readings]);
  const maxMm = Math.max(0, ...report.readings.map((r) => r.mm));
  const topVillage = report.readings.find((r) => r.mm === maxMm);
  const wilayaSet = [...new Set(report.readings.map((r) => r.wilaya))];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-right p-5 flex items-start justify-between gap-4 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] bg-sky-50 text-sky-600 px-2.5 py-1 rounded-full font-bold border border-sky-100">
              📅 {fmtDate(report.report_published_at)}
            </span>
            <span className="text-[11px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-bold border border-blue-100">
              💧 {report.readings.length} موقع
            </span>
          </div>
          <h3 className="font-black text-gray-900 leading-snug text-[15px]">{report.report_title}</h3>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {topVillage && (
              <span className="text-[11px] text-gray-500 font-bold">
                🏆 أعلى: {topVillage.village} —{' '}
                <span className="text-blue-700">{topVillage.mm} مم</span>
              </span>
            )}
            <span className="text-[11px] text-gray-400">
              {wilayaSet.slice(0, 3).join(' · ')}
              {wilayaSet.length > 3 ? ` +${wilayaSet.length - 3}` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-black text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
            {maxMm} مم
          </span>
          <span className="text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          <div className="p-4 space-y-4">
            {grouped.map(({ wilaya, moughataas }) => (
              <div key={wilaya}>
                <div className="mb-2">
                  <span className="text-[11px] font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                    📍 {wilaya}
                  </span>
                </div>
                <div className="space-y-2">
                  {moughataas.map(({ moughataa, villages }) => (
                    <div key={moughataa} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-[11px] font-bold text-gray-400 mb-2">{moughataa}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                        {villages.map((v, i) => {
                          const pct = maxMm > 0 ? Math.round((v.mm / maxMm) * 100) : 0;
                          return (
                            <div key={i} className="bg-white rounded-lg px-2.5 py-2 border border-gray-100 relative overflow-hidden">
                              <div
                                className="absolute inset-y-0 left-0 bg-blue-50 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                              <div className="relative flex items-center justify-between gap-1">
                                <span className="text-[11px] font-bold text-gray-700 truncate">{v.village}</span>
                                <span className="text-[11px] font-black text-blue-700 shrink-0">{v.mm}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-4 border-t border-gray-50 pt-3">
            <a
              href={report.report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-500 hover:underline font-bold"
            >
              📰 عرض التقرير الأصلي على موقع الوكالة ←
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// نتائج البحث — قائمة مسطّحة مرتبة تنازلياً حسب الكمية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SearchResults({ results, loading, query }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center shadow-sm">
        <div className="text-3xl mb-2">🔍</div>
        <p className="text-gray-400 font-bold text-sm">جارٍ البحث...</p>
      </div>
    );
  }
  if (!results || results.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
        <div className="text-4xl mb-3">🌤️</div>
        <p className="font-bold text-gray-500">لا نتائج لـ &ldquo;{query}&rdquo;</p>
        <p className="text-xs text-gray-400 mt-1">جرّب اسماً آخر للقرية أو المقاطعة أو الولاية</p>
      </div>
    );
  }
  const maxMm = results[0]?.mm || 1;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <span className="text-xs font-black text-gray-500">{results.length} نتيجة لـ</span>
        <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
          &ldquo;{query}&rdquo;
        </span>
      </div>
      <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
        {results.map((r, i) => {
          const pct = Math.round((r.mm / maxMm) * 100);
          return (
            <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors relative overflow-hidden">
              <div
                className="absolute inset-y-0 right-0 bg-blue-50/60 pointer-events-none"
                style={{ width: `${pct}%` }}
              />
              <span className="text-xs font-black text-gray-300 w-6 shrink-0 relative">{i + 1}</span>
              <div className="flex-1 min-w-0 relative">
                <p className="text-sm font-black text-gray-800">{r.village}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {r.moughataa && <span>{r.moughataa} · </span>}
                  {r.wilaya}
                </p>
              </div>
              <div className="text-right shrink-0 relative">
                <p className="text-sm font-black text-blue-700">{r.mm} مم</p>
                <p className="text-[10px] text-gray-400">{fmtShortDate(r.report_published_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// تبويب الإحصاءات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StatsTab({ stats, statsYear, setStatsYear, onWilayaClick }) {
  const [expandedWilaya, setExpandedWilaya] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);
  const [showAllMoughataa, setShowAllMoughataa] = useState(false);

  async function toggleWilaya(wilaya) {
    if (expandedWilaya === wilaya) { setExpandedWilaya(null); return; }
    setExpandedWilaya(wilaya);
    if (detailCache[wilaya]) return;
    setDetailLoading(wilaya);
    const readings = await getWilayaReadings(wilaya);
    setDetailCache((c) => ({ ...c, [wilaya]: readings }));
    setDetailLoading(null);
  }

  if (!stats) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white h-24 rounded-2xl animate-pulse border border-gray-100" />
        ))}
      </div>
    );
  }

  const maxTotal = stats.wilayaRanking[0]?.total || 1;
  const visibleMoughataa = showAllMoughataa ? stats.topByMoughataa : stats.topByMoughataa.slice(0, 12);

  return (
    <div className="space-y-5">
      {/* منتقي السنة */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-black text-gray-500 ml-1">📅 السنة:</span>
        {YEARS.map((y) => (
          <button
            key={y}
            onClick={() => setStatsYear(y)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statsYear === y ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* ترتيب الولايات */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-black text-gray-500">
            📊 ترتيب الولايات حسب إجمالي الأمطار المسجَّلة
            {statsYear !== 'الكل' ? ` — ${statsYear}` : ' — كل الأعوام'}
            {' '}— اضغط لعرض التفاصيل
          </p>
        </div>
        <div className="p-4 space-y-1">
          {stats.wilayaRanking.map((w, i) => {
            const pct = Math.round((w.total / maxTotal) * 100);
            return (
              <div key={w.wilaya}>
                <button
                  onClick={() => toggleWilaya(w.wilaya)}
                  className="w-full flex items-center gap-3 text-right py-2.5 px-2 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <span className="text-[11px] font-black text-gray-300 w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-black text-gray-800">{w.wilaya}</span>
                      <span className="text-xs font-black text-blue-600">{w.total.toFixed(0)} مم</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-l from-blue-600 to-sky-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {w.count} قراءة · أعلى قراءة: {w.max} مم
                    </p>
                  </div>
                  <span className="text-gray-300 text-xs shrink-0">{expandedWilaya === w.wilaya ? '▲' : '▼'}</span>
                </button>

                {expandedWilaya === w.wilaya && (
                  <div className="mx-2 mb-2 mt-1 bg-gray-50 rounded-xl p-3">
                    {detailLoading === w.wilaya ? (
                      <p className="text-xs text-gray-400 text-center py-3">جارٍ التحميل...</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1">
                        {(detailCache[w.wilaya] || []).map((r, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                            <span className="text-gray-400 w-24 shrink-0">{fmtShortDate(r.report_published_at)}</span>
                            <span className="font-bold text-gray-700 flex-1 truncate">
                              {r.village}
                              {r.moughataa && <span className="text-gray-400"> · {r.moughataa}</span>}
                            </span>
                            <span className="font-black text-blue-600 shrink-0">{r.mm} مم</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => onWilayaClick(w.wilaya)}
                      className="mt-2 text-[11px] font-bold text-blue-600 hover:underline w-full text-right"
                    >
                      عرض تقارير {w.wilaya} في الأرشيف ←
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* أعلى قراءة لكل مقاطعة */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-black text-gray-500">🏆 أعلى قراءة مسجَّلة في كل مقاطعة</p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleMoughataa.map((m) => (
            <div
              key={`${m.wilaya}-${m.moughataa}`}
              className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 border border-gray-100"
            >
              <div className="min-w-0">
                <p className="text-xs font-black text-gray-800 truncate">{m.moughataa}</p>
                <p className="text-[11px] text-gray-400 truncate">{m.village} · {m.wilaya}</p>
              </div>
              <span className="text-sm font-black text-blue-700 shrink-0">{m.mm} مم</span>
            </div>
          ))}
        </div>
        {stats.topByMoughataa.length > 12 && (
          <div className="px-5 pb-4">
            <button
              onClick={() => setShowAllMoughataa((v) => !v)}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              {showAllMoughataa ? '← عرض أقل' : `عرض كل المقاطعات (${stats.topByMoughataa.length}) →`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// تبويب أعلى القياسات في التاريخ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TopRecordsTab({ records }) {
  if (!records) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white h-16 rounded-2xl animate-pulse border border-gray-100" />
        ))}
      </div>
    );
  }
  const maxMm = records[0]?.mm || 1;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-black text-gray-500">🥇 أعلى 20 قراءة مطر مسجَّلة في تاريخ الأرشيف</p>
      </div>
      <div className="divide-y divide-gray-50">
        {records.map((r, i) => {
          const pct = Math.round((r.mm / maxMm) * 100);
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
          return (
            <div key={i} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
              <span className="text-sm font-black text-gray-300 w-6 shrink-0">
                {medal || i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-black text-gray-800">{r.village}</p>
                  <p className="text-base font-black text-blue-700">{r.mm} مم</p>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-gradient-to-l from-blue-600 to-sky-400 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400">
                  {r.moughataa && <span>{r.moughataa} · </span>}
                  {r.wilaya} · {fmtShortDate(r.report_published_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// تبويب الأرشيف
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ArchiveTab({ wilaya, setWilaya, year, setYear, reports, count, loading, page, setPage }) {
  const totalPages = Math.ceil(count / PER_PAGE);
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <select
          value={wilaya}
          onChange={(e) => { setWilaya(e.target.value); setPage(0); }}
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
        >
          {WILAYAS.map((w) => <option key={w}>{w}</option>)}
        </select>

        <div className="flex items-center gap-1 flex-wrap">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => { setYear(y); setPage(0); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                year === y ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-400 font-bold mr-auto">{count} تقرير</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white h-24 rounded-2xl animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-14 text-center shadow-sm">
          <p className="text-4xl mb-3">🌤️</p>
          <p className="text-gray-500 font-bold">لا توجد تقارير لهذه الفلاتر.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {reports.map((r) => <ReportCard key={r.report_url} report={r} />)}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                ← السابق
              </button>
              <span className="text-sm text-gray-500 font-bold">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                التالي →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// الصفحة الرئيسية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function MeasurementsPage() {
  const [tab, setTab] = useState('archive');
  const [stats, setStats] = useState(null);
  const [statsYear, setStatsYear] = useState(String(CURRENT_YEAR));
  const [topRecords, setTopRecords] = useState(null);

  // Archive state
  const [wilaya, setWilaya] = useState('الكل');
  const [year, setYear] = useState('الكل');
  const [page, setPage] = useState(0);
  const [reports, setReports] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);

  useEffect(() => {
    setStats(null);
    getRainMeasurementStats(statsYear === 'الكل' ? null : parseInt(statsYear)).then(setStats);
  }, [statsYear]);

  useEffect(() => {
    if (tab === 'records' && topRecords === null) {
      getTopRainRecords(20).then(setTopRecords);
    }
  }, [tab, topRecords]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { reports: r, count: c } = await getRainMeasurementReports({
      limit: PER_PAGE,
      offset: page * PER_PAGE,
      wilaya: wilaya === 'الكل' ? null : wilaya,
      year: year === 'الكل' ? null : parseInt(year),
    });
    setReports(r);
    setCount(c);
    setLoading(false);
  }, [page, wilaya, year]);

  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => { setPage(0); }, [wilaya, year]);

  function handleSearch(q) {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await searchRainMeasurements(q);
      setSearchResults(results);
      setSearchLoading(false);
    }, 350);
  }

  function goToWilaya(w) {
    setWilaya(w);
    setTab('archive');
    setPage(0);
  }

  const isSearching = searchQuery.trim().length > 0;

  const TABS = [
    { id: 'archive', label: '🗂️ الأرشيف' },
    { id: 'stats',   label: '📊 الإحصاءات' },
    { id: 'records', label: '🥇 أعلى القياسات' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />

      {/* رأس الصفحة + شريط البحث */}
      <div
        className="text-white"
        style={{ background: 'linear-gradient(135deg, #071e40 0%, #0b2c5e 50%, #0d3468 100%)' }}
      >
        <div className="max-w-4xl mx-auto px-4 pt-8 pb-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-3xl shrink-0">
              🌧️
            </div>
            <div>
              <h1 className="text-2xl font-black">مقاييس الأمطار · موريتانيا</h1>
              <p className="text-sm text-blue-200/70 mt-1">
                أرشيف رسمي لكميات الأمطار المقيسة — المصدر: وزارة الداخلية عبر الوكالة الموريتانية للأنباء
              </p>
            </div>
          </div>

          {/* شريط البحث — داخل الرأس ليكون أول ما يراه الزائر */}
          <div className="relative mb-6">
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl pointer-events-none select-none">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="ابحث عن قرية أو مقاطعة أو ولاية..."
              className="w-full bg-white text-gray-900 placeholder-gray-400 rounded-2xl pr-12 pl-12 py-4 text-base font-bold shadow-lg focus:ring-4 focus:ring-blue-300 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch('')}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            )}
          </div>

          {stats && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-2xl px-4 py-3 text-center border border-white/10">
                <p className="text-2xl font-black">{stats.total.toLocaleString('en-US')}</p>
                <p className="text-[11px] text-blue-200/60 mt-0.5">موقع مُرصَد</p>
              </div>
              <div className="bg-white/10 rounded-2xl px-4 py-3 text-center border border-white/10">
                <p className="text-2xl font-black">{count || '—'}</p>
                <p className="text-[11px] text-blue-200/60 mt-0.5">تقرير رسمي</p>
              </div>
              <div className="bg-white/10 rounded-2xl px-4 py-3 text-center border border-white/10">
                <p className="text-base font-black leading-tight">{stats.wilayaRanking[0]?.wilaya || '—'}</p>
                <p className="text-[11px] text-blue-200/60 mt-0.5">الأعلى هطولاً</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 mt-5 space-y-4">

        {/* نتائج البحث أو المحتوى المبوّب */}
        {isSearching ? (
          <SearchResults results={searchResults} loading={searchLoading} query={searchQuery} />
        ) : (
          <>
            {/* أزرار التبويب */}
            <div className="flex gap-2 flex-wrap">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${
                    tab === t.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'archive' && (
              <ArchiveTab
                wilaya={wilaya} setWilaya={setWilaya}
                year={year} setYear={setYear}
                reports={reports} count={count} loading={loading}
                page={page} setPage={setPage}
              />
            )}
            {tab === 'stats' && <StatsTab stats={stats} statsYear={statsYear} setStatsYear={setStatsYear} onWilayaClick={goToWilaya} />}
            {tab === 'records' && <TopRecordsTab records={topRecords} />}
          </>
        )}

        <p className="text-[11px] text-gray-400 text-center pt-2">
          المصدر: الوكالة الموريتانية للأنباء — وزارة الداخلية وترقية اللامركزية والتنمية المحلية
        </p>
      </main>
    </div>
  );
}
