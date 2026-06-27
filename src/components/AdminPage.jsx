import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar';
import { adminListPending, adminModerate, adminDelete } from '../supabase';
import { useWeatherContext } from '../WeatherContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiLock, FiCheck, FiX, FiRefreshCw, FiInbox, FiShield, FiTrash2, FiCloudOff } = FiIcons;

const TABS = [
  { id: 'rain', label: 'تبشيرات المطر' },
  { id: 'livestock', label: 'الظالة' },
];

const TOKEN_KEY = 'jatkoum_admin_token';

export default function AdminPage() {
  const { clearStormAlerts, removeStormCell, trackedCells } = useWeatherContext();
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [authed, setAuthed] = useState(() => Boolean(sessionStorage.getItem(TOKEN_KEY)));
  const [tab, setTab] = useState('rain');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await adminListPending(token, tab);
      setItems(data);
      setAuthed(true);
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch (err) {
      setError(err.message || 'فشل التحميل');
      if (String(err.message).includes('مصرّح') || String(err.message).includes('401')) {
        setAuthed(false);
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

  useEffect(() => {
    if (authed) load();
  }, [authed, tab, load]);

  const moderate = async (id, approve) => {
    setBusyId(id);
    try {
      await adminModerate(token, tab, id, approve);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      setError(err.message || 'فشل الإجراء');
    } finally {
      setBusyId(null);
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm('حذف نهائي؟ لا يمكن التراجع.')) return;
    setBusyId(id);
    try {
      await adminDelete(token, tab, id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      setError(err.message || 'فشل الحذف');
    } finally {
      setBusyId(null);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    setAuthed(false);
    setItems([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
            <SafeIcon icon={FiShield} className="text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">لوحة المراجعة</h1>
            <p className="text-sm text-gray-500">اعتماد أو رفض ما يرسله المستخدمون قبل نشره</p>
          </div>
        </div>

        {!authed ? (
          <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8 max-w-md mx-auto mt-10">
            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <SafeIcon icon={FiLock} className="text-2xl" />
            </div>
            <h2 className="text-lg font-black text-gray-800 text-center mb-1">دخول الإدارة</h2>
            <p className="text-xs text-gray-500 text-center mb-5">أدخل كلمة سرّ الإدارة للمتابعة</p>
            <form onSubmit={(e) => { e.preventDefault(); load(); }}>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="كلمة سرّ الإدارة"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-center"
              />
              {error && <p className="text-xs font-bold text-red-600 text-center mb-3">{error}</p>}
              <button
                type="submit"
                disabled={!token || loading}
                className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black hover:bg-blue-700 transition-all disabled:opacity-50"
              >
                {loading ? 'جارٍ التحقق...' : 'دخول'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* إدارة خلايا العواصف */}
            <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-4 p-4 border-b border-red-100">
                <p className="font-black text-red-800 text-sm">
                  {trackedCells.length > 0 ? `⛈️ ${trackedCells.length} خلية عاصفة نشطة` : '✅ لا توجد خلايا عاصفة نشطة'}
                </p>
                {trackedCells.length > 0 && (
                  <button
                    onClick={() => { if (window.confirm('مسح جميع الخلايا؟')) clearStormAlerts(); }}
                    className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-black hover:bg-red-700 transition-all"
                  >
                    <SafeIcon icon={FiCloudOff} /> مسح الكل
                  </button>
                )}
              </div>
              {trackedCells.length > 0 && (
                <div className="divide-y divide-red-100">
                  {trackedCells.map((cell) => {
                    const city = cell.cities?.[0]?.city || '—';
                    const wilaya = cell.cities?.[0]?.wilaya || '';
                    return (
                      <div key={cell.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div>
                          <span className="font-bold text-sm text-red-900">⚡ {city}</span>
                          {wilaya && <span className="text-xs text-red-600 mr-2">{wilaya}</span>}
                          <span className="text-[10px] text-red-400 block">كثافة: {Math.round(cell.mmh || 0)} · lat {cell.lat?.toFixed(1)} lon {cell.lon?.toFixed(1)}</span>
                        </div>
                        <button
                          onClick={() => removeStormCell(cell.id)}
                          className="shrink-0 flex items-center gap-1 bg-white border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-all"
                        >
                          <SafeIcon icon={FiX} /> حذف
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.id ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={load} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50" title="تحديث">
                  <SafeIcon icon={FiRefreshCw} className={`text-gray-700 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={logout} className="text-xs font-bold text-gray-500 hover:text-red-600 px-3 py-2">خروج</button>
              </div>
            </div>

            {error && <p className="text-xs font-bold text-red-600 mb-3">{error}</p>}

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="bg-white h-28 rounded-2xl animate-pulse border border-gray-100" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="bg-white rounded-[2rem] border border-gray-100 p-12 text-center">
                <SafeIcon icon={FiInbox} className="text-4xl text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-bold">لا توجد عناصر معلّقة للمراجعة.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-4">
                    {it.image_url && (
                      <img src={it.image_url} alt="" className="w-full sm:w-28 h-28 object-cover rounded-xl shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {tab === 'rain' ? (
                        <>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-bold">مطر {it.rain_intensity}</span>
                            {it.nearest_district && <span className="text-[10px] text-gray-500">📍 {it.nearest_district}</span>}
                          </div>
                          <h3 className="font-black text-gray-900">{it.city || it.nearest_district || 'تبشيرة مطر'}</h3>
                          {it.description && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{it.description}</p>}
                          <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                            {it.facebook_picture && <img src={it.facebook_picture} alt="" className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" />}
                            {it.facebook_name || 'ناشر'} {it.distance_from_district_km != null ? `· ${it.distance_from_district_km} كلم` : ''}
                          </p>
                        </>
                      ) : tab === 'news' ? (
                        <>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{it.category || 'عام'}</span>
                            {it.city && <span className="text-[10px] text-gray-400">{it.city}</span>}
                          </div>
                          <h3 className="font-black text-gray-900">{it.title}</h3>
                          <p className="text-sm text-gray-600 mt-1 leading-relaxed">{it.body}</p>
                          <p className="text-[10px] text-gray-400 mt-2">
                            {it.author_name || 'مجهول'} {it.contact ? `· ${it.contact}` : ''}
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${it.report_type === 'lost' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {it.report_type === 'lost' ? 'مفقود' : 'موجود'}
                            </span>
                            {it.animal_type && <span className="text-[10px] text-gray-500">{it.animal_type}</span>}
                          </div>
                          <h3 className="font-black text-gray-900">{it.region || it.village || 'بلاغ ظالة'}</h3>
                          <p className="text-sm text-gray-600 mt-1 leading-relaxed">{it.description}</p>
                          <p className="text-[10px] text-gray-400 mt-2">{it.contact_phone || ''}</p>
                        </>
                      )}
                    </div>
                    <div className="flex sm:flex-col gap-2 shrink-0">
                      <button
                        onClick={() => moderate(it.id, true)}
                        disabled={busyId === it.id}
                        className="flex-1 inline-flex items-center justify-center gap-1 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        <SafeIcon icon={FiCheck} /> اعتماد
                      </button>
                      <button
                        onClick={() => moderate(it.id, false)}
                        disabled={busyId === it.id}
                        className="flex-1 inline-flex items-center justify-center gap-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-100 hover:text-red-700 transition-all disabled:opacity-50"
                      >
                        <SafeIcon icon={FiX} /> رفض
                      </button>
                      <button
                        onClick={() => deleteItem(it.id)}
                        disabled={busyId === it.id}
                        className="flex-1 inline-flex items-center justify-center gap-1 bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
                      >
                        <SafeIcon icon={FiTrash2} /> حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
