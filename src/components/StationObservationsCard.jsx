import React, { useEffect, useState } from 'react';
import { getStationLatest } from '../supabase';

// قراءة أقدم من 3 ساعات تُعرض باهتة: المحطة لم ترسل بعدها
const STALE_MS = 3 * 60 * 60 * 1000;

function fmtTime(iso) {
  // توقيت موريتانيا هو UTC
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const today = new Date().toISOString().slice(0, 10) === iso.slice(0, 10);
  return today
    ? `${hh}:${mm}`
    : `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${hh}:${mm}`;
}

// مفتاح مقارنة متسامح مع تهجئات الولاية: "تاكانت" = "تكانت"، "لبراكنه" = "البراكنة"
const wilayaKey = (w) => String(w || '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/^ال|^ل/, '').replace(/ا/g, '').replace(/\s+/g, '');

const fmt = (v, digits = 0) => (v == null ? '—' : Number(v).toFixed(digits));

// قراءات محطات الأرصاد الجوية الموريتانية: كل المحطات، أو محطات ولاية واحدة
export default function StationObservationsCard({ wilaya = null }) {
  const [stations, setStations] = useState(null);

  useEffect(() => {
    getStationLatest().then(setStations);
  }, []);

  const list = (stations || [])
    .filter((s) => !wilaya || (s.wilaya && wilayaKey(s.wilaya) === wilayaKey(wilaya)))
    .sort((a, b) => (a.wilaya ? 0 : 1) - (b.wilaya ? 0 : 1) || a.name_ar.localeCompare(b.name_ar, 'ar'));

  // صفحة ولاية بلا محطة: لا شيء يُعرض
  if (wilaya && stations && list.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" dir="rtl">
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #071e40 0%, #0b2c5e 100%)' }}
      >
        <span className="text-2xl">📡</span>
        <div>
          <p className="text-sm font-black text-white leading-tight">
            {wilaya ? `مرصود الآن — ولاية ${wilaya}` : 'مرصود الآن في محطات الأرصاد'}
          </p>
          <p className="text-[11px] text-blue-200/70 mt-0.5">قراءات فعلية كل ساعة، لا توقعات</p>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {!stations ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="px-5 py-4 animate-pulse">
              <div className="h-3.5 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          ))
        ) : list.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-gray-400 text-sm font-bold">لا توجد قراءات بعد</p>
          </div>
        ) : (
          list.map((s) => {
            const stale = Date.now() - new Date(s.observed_at).getTime() > STALE_MS;
            return (
              <div key={s.station_id} className={`px-5 py-3 ${stale ? 'opacity-50' : ''}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-black text-gray-900 truncate">
                    {s.name_ar}
                    {!wilaya && s.wilaya && <span className="text-[11px] font-bold text-gray-400"> · {s.wilaya}</span>}
                  </p>
                  <p className="text-[10px] text-gray-400 shrink-0">
                    {stale && 'آخر قراءة '}<bdi>{fmtTime(s.observed_at)}</bdi>
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap mt-1 text-xs font-bold text-gray-600">
                  {s.temperature != null && <span className="text-orange-600 text-base font-black">{fmt(s.temperature, 1)}°</span>}
                  {s.humidity != null && <span>💧 {fmt(s.humidity)}%</span>}
                  {s.wind_speed != null && <span>💨 {fmt(s.wind_speed * 3.6)} كم/س</span>}
                  {/* المطر يُذكر فقط إن هطل، كي لا يتكرر «لا أمطار» في كل سطر */}
                  {s.rain_24h > 0 && (
                    <span className="text-blue-700">
                      🌧️ {fmt(s.rain_24h, 1)} مم
                      <span className="text-[10px] font-normal text-gray-400"> / 24 س</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-5 py-2.5 border-t border-gray-50 bg-gray-50">
        <a
          href="https://wis2.meteomauritanie.mr"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-bold text-gray-500 hover:text-blue-600"
        >
          المصدر: الأرصاد الجوية الموريتانية (WIS2) · الوقت بتوقيت موريتانيا
        </a>
      </div>
    </div>
  );
}
