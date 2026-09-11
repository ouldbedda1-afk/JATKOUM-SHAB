import React, { useEffect, useState } from 'react';
import { getVisitStats, getAgentCityStats } from '../supabase';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiUsers, FiRefreshCw } = FiIcons;

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${DAYS_AR[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export default function VisitorStats() {
  const [stats, setStats] = useState(null);
  const [agentStats, setAgentStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [visits, agent] = await Promise.all([getVisitStats(30), getAgentCityStats(30)]);
      setStats(visits);
      setAgentStats(agent);
    } catch (e) {
      setError(e.message || 'فشل تحميل الإحصاءات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const maxVisits = Math.max(1, ...(stats?.daily || []).map((d) => d.visits));
  const last30Total = (stats?.daily || []).reduce((sum, d) => sum + d.visits, 0);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-800">👥 إحصاءات الزوار</h2>
        <button onClick={load} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50" title="تحديث">
          <SafeIcon icon={FiRefreshCw} className={`text-gray-700 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p className="text-sm text-red-600 font-bold bg-red-50 p-3 rounded-xl">{error}</p>}

      {loading && !stats ? (
        <div className="bg-white h-40 rounded-2xl animate-pulse border border-gray-100" />
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-xl"><SafeIcon icon={FiUsers} className="text-xl" /></div>
              <div>
                <p className="text-2xl font-black text-gray-900">{stats.total.toLocaleString('en-US')}</p>
                <p className="text-xs font-bold text-gray-400">إجمالي الزيارات (منذ الإطلاق)</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className="bg-green-50 text-green-600 p-3 rounded-xl"><SafeIcon icon={FiUsers} className="text-xl" /></div>
              <div>
                <p className="text-2xl font-black text-gray-900">{last30Total.toLocaleString('en-US')}</p>
                <p className="text-xs font-bold text-gray-400">آخر 30 يوماً</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 mb-3">الزيارات اليومية (آخر 30 يوماً)</p>
            {stats.daily.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">لا زيارات مسجّلة بعد.</p>
            ) : (
              <div className="space-y-1.5">
                {stats.daily.map(({ day, visits }) => (
                  <div key={day} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-gray-500 w-20 shrink-0">{dayLabel(day)}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full"
                        style={{ width: `${Math.max(4, (visits / maxVisits) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-black text-gray-700 w-8 text-left">{visits}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-gray-400">
            "الزيارة" تُحتسب مرة واحدة لكل جلسة متصفّح (لا لكل صفحة)، فهي تقريب لعدد الجلسات وليس عدداً دقيقاً للزوار الفريدين.
          </p>

          <div className="pt-2">
            <p className="text-xs font-bold text-gray-400 mb-3">🤖 أسئلة البوّاه عن البلديات (آخر 30 يوماً)</p>
            {agentStats && agentStats.totalCityQuestions > 0 ? (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 mb-3">
                  <div className="bg-amber-50 text-amber-600 p-3 rounded-xl"><SafeIcon icon={FiUsers} className="text-xl" /></div>
                  <div>
                    <p className="text-2xl font-black text-gray-900">{agentStats.totalCityQuestions.toLocaleString('en-US')}</p>
                    <p className="text-xs font-bold text-gray-400">سؤال عن بلدية محدَّدة</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-xs font-bold text-gray-400 mb-3">الأكثر سؤالاً</p>
                  <div className="space-y-2">
                    {agentStats.topCities.map(({ city, count }, i) => (
                      <div key={city} className="flex items-center gap-3">
                        <span className={`text-xs font-black w-6 shrink-0 ${i === 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                          {i === 0 ? '🥇' : `#${i + 1}`}
                        </span>
                        <span className="flex-1 text-sm font-bold text-gray-700 truncate">{city}</span>
                        <span className="text-xs font-black text-gray-500">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4 bg-white rounded-2xl border border-gray-100">
                لا أسئلة عن بلديات مسجّلة بعد.
              </p>
            )}
            <p className="text-[11px] text-gray-400 mt-3">
              يُحتسب السؤال فقط عندما يتعرّف البوّاه على اسم بلدية في الرسالة (لا يُعدّ زواراً فريدين).
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
