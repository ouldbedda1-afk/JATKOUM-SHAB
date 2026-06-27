import React from 'react';
import { useWeatherContext } from '../WeatherContext';
import { normalizeMauritaniaWilayaName } from '../mauritaniaPlaceNames';

/**
 * شريط مثبّت أعلى الصفحة يظهر ما دامت هناك عواصف/سحب نشطة (Meteosat)،
 * ويختفي تلقائياً حين تتلاشى. يأخذ الزائر لبطاقة "رصد اليوم" لمتابعة المسار.
 * يتحدّث تلقائياً مع كل دورة رصد (قوة/ضعف/حركة).
 */
function minutesAgo(date) {
  if (!date) return null;
  const m = Math.round((Date.now() - new Date(date)) / 60000);
  return m <= 0 ? 'الآن' : `منذ ${m} د`;
}

export default function StormStickyBar() {
  const { stormClouds, lightningStrikes, stormCloudsUpdatedAt } = useWeatherContext();

  const veryDeepClouds = (stormClouds || []).filter((c) => c.level === 'very_deep');
  const strikes = (lightningStrikes || []).length;
  // يظهر الشريط فقط إذا تزامن سحب Meteosat مع برق، أو وجدت سحب شديدة وحدها
  const hasActiveClouds = veryDeepClouds.length > 0;
  const hasRecentLightning = strikes > 0;
  if (!hasActiveClouds && !hasRecentLightning) return null;
  // برق وحده بدون سحب → لا نعرضه (غالباً عاصفة انتهت)
  if (hasRecentLightning && !hasActiveClouds) return null;

  const wilayas = new Set(
    veryDeepClouds
      .map((c) => normalizeMauritaniaWilayaName(c.wilaya) || c.wilaya)
      .filter(Boolean)
  );
  const veryDeep = veryDeepClouds.length;

  const goToCard = () => {
    document.getElementById('today-observation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="sticky top-1 z-40 px-2 mt-2" dir="rtl">
      <button
        onClick={goToCard}
        className="w-full max-w-[1600px] mx-auto flex items-center justify-between gap-3 rounded-2xl border-2 border-white/20 bg-gradient-to-l from-red-700 via-rose-700 to-orange-700 text-white px-4 py-2.5 shadow-2xl backdrop-blur"
      >
        <span className="flex items-center gap-2 font-black text-sm md:text-base">
          <span className="h-2.5 w-2.5 rounded-full bg-white animate-ping" />
          {strikes > 0 ? `⚡ برق + ` : ''}🌩️ عواصف نشطة الآن
          {wilayas.size > 0 ? ` على ${wilayas.size} ${wilayas.size === 1 ? 'ولاية' : 'ولايات'}` : ''}
          {veryDeep > 0 ? ` (${veryDeep} شديدة)` : ''}
        </span>
        <span className="shrink-0 flex flex-col items-end gap-0.5">
          <span className="text-[11px] md:text-sm font-bold bg-white/20 px-3 py-1 rounded-full">اضغط لمتابعة المسار ←</span>
          {stormCloudsUpdatedAt && (
            <span className="text-[10px] text-white/60 px-1">🛰️ رصد Meteosat · {minutesAgo(stormCloudsUpdatedAt)}</span>
          )}
        </span>
      </button>
    </div>
  );
}
