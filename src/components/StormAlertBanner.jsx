import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeatherContext } from '../WeatherContext';
import { getThunderstormAlerts } from '../weatherApi';

const SEVERITY_STYLE = {
  'شديدة جداً': { bg: 'bg-red-700', border: 'border-red-800', badge: 'bg-red-900 text-white', text: 'text-red-50' },
  'خطيرة جداً': { bg: 'bg-red-700', border: 'border-red-800', badge: 'bg-red-900 text-white', text: 'text-red-50' },
  'خطيرة':      { bg: 'bg-orange-600', border: 'border-orange-700', badge: 'bg-orange-800 text-white', text: 'text-orange-50' },
  'شديدة':      { bg: 'bg-yellow-600', border: 'border-yellow-700', badge: 'bg-yellow-800 text-white', text: 'text-yellow-50' },
  'عالية':      { bg: 'bg-amber-500', border: 'border-amber-600', badge: 'bg-amber-700 text-white', text: 'text-amber-50' },
  'متوسطة':     { bg: 'bg-blue-600', border: 'border-blue-700', badge: 'bg-blue-800 text-white', text: 'text-blue-50' },
};

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('ar-SA', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function StormAlertBanner() {
  const { weatherData, rainingNow, loading } = useWeatherContext();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const alerts = useMemo(() => getThunderstormAlerts(weatherData), [weatherData]);

  // التوقعات المستقبلية فقط — تنبيهات "الآن" من النموذج الرياضي غير موثوقة
  const forecastAlerts = useMemo(() => alerts.filter(a => !a.isNow), [alerts]);

  // العواصف المؤكدة الآن: الأقمار الصناعية + كود >= 95
  const satelliteSet = useMemo(
    () => new Set((rainingNow || []).map(r => r.city)),
    [rainingNow]
  );
  const confirmedNow = useMemo(
    () => alerts.filter(a => a.isNow && satelliteSet.has(a.city)),
    [alerts, satelliteSet]
  );

  // تجميع التوقعات حسب اليوم
  const forecastByDate = useMemo(() => {
    const map = {};
    forecastAlerts.forEach(a => {
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    return map;
  }, [forecastAlerts]);

  // لا نعرض البانر إذا لا توجد توقعات ولا عواصف مؤكدة
  if (loading || (forecastAlerts.length === 0 && confirmedNow.length === 0) || dismissed) return null;

  const topAlert = confirmedNow[0] || forecastAlerts[0];
  const style = SEVERITY_STYLE[topAlert.severity] || SEVERITY_STYLE['متوسطة'];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`w-full rounded-2xl border-2 ${style.border} overflow-hidden shadow-lg mb-4`}
    >
      {/* الشريط العلوي */}
      <div className={`${style.bg} px-4 py-3 flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-2xl flex-shrink-0 animate-pulse">{topAlert.icon}</span>
          <div className="min-w-0">
            <span className={`text-xs font-black uppercase tracking-wide ${style.text} opacity-80`}>
              تحذير رسمي · المركز الأوروبي ECMWF
            </span>
            <p className={`text-sm font-bold ${style.text} truncate`}>
              {topAlert.isNow
                ? `${topAlert.message} الآن في ${topAlert.city}`
                : `${topAlert.message} · ${topAlert.city} وأخرى`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`text-xs font-bold px-3 py-1 rounded-full bg-white/20 ${style.text} hover:bg-white/30 transition`}
          >
            {expanded ? 'إخفاء' : `${forecastAlerts.length + confirmedNow.length} تحذير`}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className={`${style.text} opacity-70 hover:opacity-100 transition text-lg leading-none`}
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>
      </div>

      {/* التفاصيل الموسعة */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white divide-y divide-gray-100"
          >
            {/* عواصف مؤكدة الآن بالأقمار الصناعية فقط */}
            {confirmedNow.length > 0 && (
              <div className="p-4">
                <p className="text-xs font-black text-red-700 mb-3 flex items-center gap-1">
                  🔴 🛰️ عواصف مؤكدة الآن بالأقمار الصناعية
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {confirmedNow.map(alert => {
                    const s = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE['متوسطة'];
                    return (
                      <div key={alert.id} className={`rounded-xl p-3 border ${s.border} bg-gradient-to-r ${s.bg.replace('bg-', 'from-').replace('-600', '-50').replace('-700', '-50')} to-white`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span>{alert.icon}</span>
                          <span className="font-bold text-sm text-gray-800">{alert.city}</span>
                          {alert.wilaya && (
                            <span className="text-[10px] text-gray-500">({alert.wilaya})</span>
                          )}
                          <span className={`mr-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700">{alert.message}</p>
                        {alert.windSpeed > 0 && (
                          <p className="text-[10px] text-gray-500 mt-1">
                            💨 رياح {Math.round(alert.windSpeed)} كم/س
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* توقعات خلال 72 ساعة */}
            {Object.keys(forecastByDate).length > 0 && (
              <div className="p-4">
                <p className="text-xs font-black text-orange-700 mb-3 flex items-center gap-1">
                  🔶 توقعات خلال 72 ساعة — المصدر: ECMWF
                </p>
                {Object.entries(forecastByDate).map(([date, dayAlerts]) => (
                  <div key={date} className="mb-4">
                    <p className="text-xs font-bold text-gray-600 mb-2">📅 {formatDate(date)}</p>
                    <div className="flex flex-wrap gap-2">
                      {dayAlerts.map(alert => {
                        const s = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE['متوسطة'];
                        return (
                          <div key={alert.id} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm">
                            <span>{alert.icon}</span>{' '}
                            <span className="font-bold text-gray-800">{alert.city}</span>
                            {alert.wilaya && (
                              <span className="text-[10px] text-gray-400 mr-1">({alert.wilaya})</span>
                            )}
                            <span className={`mr-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
                              {alert.severity}
                            </span>
                            <p className="text-[11px] text-gray-600 mt-0.5">{alert.message}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* نصائح السلامة */}
            <div className="p-4 bg-yellow-50">
              <p className="text-xs font-bold text-yellow-800 mb-2">⚠️ إرشادات السلامة:</p>
              <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                <li>ابتعد عن الأشجار والمباني غير الآمنة أثناء العواصف الرعدية</li>
                <li>تجنب السفر في المناطق المنخفضة عند هطول الأمطار الغزيرة</li>
                <li>أحكم تثبيت الخيام والأغنام والمواشي</li>
                <li>تابع التحديثات المباشرة على هذا الموقع</li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
