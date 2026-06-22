import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import { sendLocalNotification, requestNotificationPermission } from '../pwa';
import { broadcastPush } from '../supabase';
import { toArabicCommune } from '../mauritaniaCommuneNamesAr';

const { FiLayers, FiMaximize, FiRefreshCw, FiExternalLink, FiShield, FiCheck, FiCloudRain, FiShare2, FiMapPin } = FiIcons;

// بناء نص الخبر العاجل القابل للنشر
function buildBreakingText({ thunderCities, rainCities, modelThunder, modelRain, hasRadar }) {
  const stamp = new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  let text = hasRadar
    ? `🔴 *عاجل الآن — جاتكم اسحاب*\n📅 ${stamp}\n\n`
    : `🔭 *متابعة الطقس — جاتكم اسحاب*\n📅 ${stamp}\n\n`;
  if (thunderCities.length > 0) {
    text += `⚡ *عواصف رعدية وبرق مرصودة بالأقمار* في: ${thunderCities.join('، ')}.\nيُرجى الحذر والابتعاد عن الأودية والمناطق المكشوفة.\n\n`;
  }
  if (rainCities.length > 0) {
    text += `🌧️ *غيوم ماطرة مرصودة بالأقمار* في: ${rainCities.join('، ')}.\nجعلها الله أمطار خير وبركة.\n\n`;
  }
  if ((modelThunder?.length || 0) > 0) {
    text += `🔭 *عواصف رعدية محتملة (توقّع نموذجي غير مؤكد)* في: ${modelThunder.join('، ')}.\n\n`;
  }
  if ((modelRain?.length || 0) > 0) {
    text += `🔭 *أمطار محتملة (توقّع نموذجي غير مؤكد)* في: ${modelRain.join('، ')}.\n\n`;
  }
  text += `تابع الرصد المباشر: ${window.location.origin}`;
  return text;
}

// إعداد طبقات الخريطة — مع أسماء Windy الصحيحة ووصف لكل طبقة
const LAYERS = [
  { id: 'rain',      label: 'الأمطار',          overlay: 'rain',      icon: '🌧️', desc: 'كميات الهطول المتوقعة فوق موريتانيا.' },
  { id: 'radar',     label: 'الرادار المباشر',  overlay: 'radar',     icon: '📡', desc: 'رصد لحظي لخلايا المطر عبر الرادار.' },
  { id: 'clouds',    label: 'السحب',            overlay: 'clouds',    icon: '☁️', desc: 'كثافة الغطاء السحابي وحركته.' },
  { id: 'satellite', label: 'الأقمار',          overlay: 'satellite', icon: '🛰️', desc: 'صور الأقمار الصناعية الحية للسحب.' },
  { id: 'temp',      label: 'الحرارة',          overlay: 'temp',      icon: '🌡️', desc: 'توزّع درجات الحرارة على السطح.' },
  { id: 'wind',      label: 'الرياح',           overlay: 'wind',      icon: '💨', desc: 'سرعة واتجاه الرياح قرب السطح.' },
];

// مركز وتقريب يُظهران عموم موريتانيا
const MAP_CENTER = { lat: 19.5, lon: -10.5, zoom: 5 };

const SatelliteViewer = () => {
  const [activeLayer, setActiveLayer] = useState('rain');
  const [mapKey, setMapKey] = useState(0);
  const containerRef = useRef(null);
  const { weatherData, fires, rainReports, rainingNow, modelRainingNow, loading } = useWeatherContext();

  // ⚡ رصد البرق والغيوم الماطرة الآن — مصدران: رادار الأقمار + نموذج Open-Meteo
  const breaking = useMemo(() => {
    if (loading || !weatherData) {
      return { thunderCities: [], rainCities: [], modelThunder: [], modelRain: [], active: false };
    }

    // 1) الرصد الراداري المؤكد
    const satelliteSet = new Set((rainingNow || []).map((r) => r.city));
    const thunderCities = weatherData
      .filter((c) => satelliteSet.has(c.city) && (c.current?.weather_code ?? 0) >= 95)
      .map((c) => c.city);
    const rainCities = (rainingNow || [])
      .map((r) => r.city)
      .filter((city) => !thunderCities.includes(city));

    // 2) الرصد النموذجي (داعم) — نستبعد ما رصده الرادار فعلاً
    const radarSet = new Set([...thunderCities, ...rainCities]);
    const modelThunder = (modelRainingNow || [])
      .filter((m) => m.isThunder && !radarSet.has(m.city))
      .map((m) => m.city);
    const modelRain = (modelRainingNow || [])
      .filter((m) => !m.isThunder && !radarSet.has(m.city) && !modelThunder.includes(m.city))
      .map((m) => m.city);

    // تعريب أسماء البلديات للعرض
    const ar = (list) => list.map(toArabicCommune);

    return {
      thunderCities: ar(thunderCities),
      rainCities: ar(rainCities),
      modelThunder: ar(modelThunder),
      modelRain: ar(modelRain),
      hasRadar: thunderCities.length > 0 || rainCities.length > 0,
      active:
        thunderCities.length > 0 || rainCities.length > 0 ||
        modelThunder.length > 0 || modelRain.length > 0,
    };
  }, [loading, weatherData, rainingNow, modelRainingNow]);

  const breakingText = useMemo(() => buildBreakingText(breaking), [breaking]);

  // 🔔 إشعار فوري عند رصد برق/أمطار جديدة (مع منع تكرار نفس الإشعار)
  const lastNotifiedRef = useRef('');
  useEffect(() => {
    // إشعار/بثّ للمؤكّد بالرادار فقط — لا نرسل إشعارات لتوقعات النموذج (تفادي الإنذار الكاذب)
    if (!breaking.hasRadar) return;
    const allThunder = breaking.thunderCities;
    const allRain = breaking.rainCities;
    const signature =
      `T:${[...allThunder].sort().join(',')}|R:${[...allRain].sort().join(',')}`;
    if (signature === lastNotifiedRef.current) return;
    lastNotifiedRef.current = signature;

    (async () => {
      const granted = await requestNotificationPermission();
      if (!granted) return;
      const title = allThunder.length > 0
        ? '⚡ عاجل: عواصف رعدية الآن'
        : '🌧️ عاجل: أمطار مرصودة الآن';
      const body = allThunder.length > 0
        ? `برق وعواصف رعدية في: ${allThunder.join('، ')}. يرجى الحذر.`
        : `غيوم ماطرة في: ${allRain.join('، ')}. جعلها الله خيراً.`;

      // إشعار محلي فوري لهذا الزائر
      sendLocalNotification(title, { body, tag: 'breaking-weather', renotify: true });

      // بثّ لكل المشتركين عبر الخادم (مع منع التكرار عبر signature)
      broadcastPush({
        title,
        body,
        url: '/',
        tag: 'breaking-weather',
        dedupeKey: 'breaking-weather',
        signature,
        windowMinutes: 30,
      });
    })();
  }, [breaking]);

  const shareBreaking = (platform) => {
    if (platform === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(breakingText)}`, '_blank');
    } else if (platform === 'facebook') {
      const fbText = breakingText.replace(/\*/g, '').substring(0, 500);
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}&quote=${encodeURIComponent(fbText)}`,
        '_blank'
      );
    } else {
      navigator.clipboard?.writeText(breakingText);
    }
  };

  const current = LAYERS.find((l) => l.id === activeLayer) || LAYERS[0];

  const windyUrl = useMemo(() => {
    const { lat, lon, zoom } = MAP_CENTER;
    return `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=${zoom}&level=surface&overlay=${current.overlay}&menu=&message=&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`;
  }, [current.overlay]);

  const openInWindy = useMemo(() => {
    const { lat, lon, zoom } = MAP_CENTER;
    return `https://www.windy.com/?${current.overlay},${lat},${lon},${zoom}`;
  }, [current.overlay]);

  const refreshMap = () => setMapKey((p) => p + 1);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const hasClouds = useMemo(() => {
    if (loading || !weatherData) return false;
    return weatherData.some((city) => city.current.weather_code >= 1);
  }, [loading, weatherData]);

  const uniqueFireCities = useMemo(() => {
    return [...new Set(fires.map((f) => f.nearestCity))];
  }, [fires]);

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-cyan-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
            <SafeIcon icon={FiLayers} className="text-xl" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-800">خريطة الرصد المباشر 🇲🇷</h2>
            <p className="text-sm text-gray-500">رصد حي للأمطار والسحب والرياح فوق موريتانيا</p>
          </div>
        </div>

        <a
          href={openInWindy}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl border border-blue-100 transition-colors whitespace-nowrap"
        >
          <SafeIcon icon={FiExternalLink} className="text-xs" />
          فتح بملء الإمكانات
        </a>
      </div>

      {/* 🔴 خبر عاجل: برق أو غيوم ماطرة مرصودة الآن */}
      {breaking.active && (
        <div className={`mb-4 rounded-2xl border-2 overflow-hidden shadow-sm ${breaking.hasRadar ? 'border-red-200 bg-gradient-to-l from-red-50 via-rose-50 to-white' : 'border-amber-200 bg-gradient-to-l from-amber-50 via-orange-50 to-white'}`}>
          <div className={`px-4 py-2 flex items-center gap-2 ${breaking.hasRadar ? 'bg-red-600' : 'bg-amber-500'}`}>
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            <span className="text-white font-black text-sm tracking-wide">
              {breaking.hasRadar ? 'عاجل الآن · رصد مباشر' : 'متابعة · توقّعات النموذج (غير مؤكدة)'}
            </span>
            <span className="mr-auto text-white/90 text-[10px] font-mono">
              {breaking.hasRadar ? '🛰️ رادار' : '🔭 نموذج'}
            </span>
          </div>
          <div className="p-4">
            {/* مصدر مؤكَّد: رادار الأقمار */}
            {breaking.thunderCities.length > 0 && (
              <p className="text-sm font-bold text-red-900 mb-1.5 leading-7">
                ⚡ عواصف رعدية وبرق <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">🛰️ رادار</span> في:{' '}
                <span className="font-black">{breaking.thunderCities.join('، ')}</span>
              </p>
            )}
            {breaking.rainCities.length > 0 && (
              <p className="text-sm font-bold text-sky-900 mb-1.5 leading-7">
                🌧️ غيوم ماطرة <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">🛰️ رادار</span> في:{' '}
                <span className="font-black">{breaking.rainCities.join('، ')}</span>
              </p>
            )}
            {/* مصدر داعم: نموذج Open-Meteo */}
            {breaking.modelThunder.length > 0 && (
              <p className="text-sm font-bold text-amber-900 mb-1.5 leading-7">
                🔭 عواصف رعدية محتملة <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">توقّع نموذجي غير مؤكد</span> في:{' '}
                <span className="font-black">{breaking.modelThunder.join('، ')}</span>
              </p>
            )}
            {breaking.modelRain.length > 0 && (
              <p className="text-sm font-bold text-teal-900 mb-1.5 leading-7">
                🔭 أمطار محتملة <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">توقّع نموذجي غير مؤكد</span> في:{' '}
                <span className="font-black">{breaking.modelRain.join('، ')}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-[11px] text-gray-500 font-bold self-center ml-1">نشر كخبر عاجل:</span>
              <button
                onClick={() => shareBreaking('whatsapp')}
                className="inline-flex items-center gap-1 bg-green-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-green-600 transition-colors"
              >
                💬 واتساب
              </button>
              <button
                onClick={() => shareBreaking('facebook')}
                className="inline-flex items-center gap-1 bg-[#1877F2] text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-[#166fe5] transition-colors"
              >
                📘 فيسبوك
              </button>
              <button
                onClick={() => shareBreaking('copy')}
                className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors"
              >
                <SafeIcon icon={FiShare2} className="text-[11px]" /> نسخ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* أزرار الطبقات */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {LAYERS.map((layer) => (
          <button
            key={layer.id}
            onClick={() => setActiveLayer(layer.id)}
            className={`px-3.5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border inline-flex items-center gap-1.5 ${
              activeLayer === layer.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            <span>{layer.icon}</span>
            {layer.label}
          </button>
        ))}
      </div>

      {/* وصف الطبقة النشطة */}
      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
        <span className="text-base">{current.icon}</span>
        <span className="font-bold text-gray-700">{current.label}:</span>
        <span>{current.desc}</span>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-[3/4] md:aspect-video rounded-2xl overflow-hidden bg-gray-900 group border border-gray-100"
      >
        <iframe
          key={`${current.overlay}-${mapKey}`}
          src={windyUrl}
          width="100%"
          height="100%"
          frameBorder="0"
          className="brightness-[97%]"
          title="خريطة Windy لموريتانيا"
        ></iframe>

        <div className="absolute bottom-4 right-4 flex gap-2">
          <button
            onClick={refreshMap}
            className="bg-white/90 backdrop-blur p-2.5 rounded-xl shadow-lg hover:bg-white transition-colors"
            title="تحديث الخريطة"
          >
            <SafeIcon icon={FiRefreshCw} className={`text-gray-800 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="bg-white/90 backdrop-blur p-2.5 rounded-xl shadow-lg hover:bg-white transition-colors"
            title="ملء الشاشة"
          >
            <SafeIcon icon={FiMaximize} className="text-gray-800" />
          </button>
        </div>

        <div className="absolute top-4 left-4 bg-black/55 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] md:text-xs font-mono z-10 inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
          رصد حي · ECMWF / Windy
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-red-50/50 p-3 rounded-xl border border-red-100/50">
          <h4 className="font-bold text-red-900 text-xs mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></span>
            رصد الحرائق النشطة
          </h4>
          <p className="text-[10px] text-red-700 leading-tight font-bold">
            {fires.length > 0
              ? `تم رصد ${fires.length} بؤر حرائق نشطة بالقرب من: ${uniqueFireCities.join('، ')}.`
              : 'لا توجد بؤر حرائق كبيرة مرصودة حالياً عبر الأقمار الصناعية.'}
          </p>
        </div>
        {hasClouds && (
          <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
            <h4 className="font-bold text-blue-900 text-xs mb-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
              حركة السحب
            </h4>
            <p className="text-[10px] text-blue-700 leading-tight font-bold">سحب ممطرة مرصودة في المنطقة، يرجى متابعة اتجاه حركتها عبر الخريطة.</p>
          </div>
        )}
        <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100/50">
          <h4 className="font-bold text-amber-900 text-xs mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
            إنذار موجة الحر
          </h4>
          <p className="text-[10px] text-amber-700 leading-tight font-bold">الحرارة تتجاوز 42° في المناطق الشرقية، مما يزيد من سرعة انتشار الحرائق.</p>
        </div>
      </div>

      {rainReports.length > 0 && (
        <div className="mt-6 border-t pt-6">
          <h3 className="text-sm font-black text-gray-800 mb-4 flex items-center gap-2">
            <SafeIcon icon={FiShield} className="text-blue-600" />
            تبشيرات المطر الميدانية (آخر 24 ساعة)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rainReports.map((report) => (
              <div key={report.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                {report.image_url ? (
                  <div className="relative aspect-video bg-gray-100">
                    <img src={report.image_url} alt={`صورة مطر في ${report.city}`} className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute top-2 right-2 bg-black/55 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <SafeIcon icon={FiMapPin} className="text-[9px]" /> {report.city}
                    </span>
                    {report.is_verified && (
                      <span className="absolute top-2 left-2 bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <SafeIcon icon={FiShield} className="text-[8px]" /> موثّق
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center">
                    <SafeIcon icon={FiCloudRain} className="text-4xl text-sky-400" />
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-gray-900 inline-flex items-center gap-1">
                      <SafeIcon icon={FiCloudRain} className="text-sky-500 text-xs" /> مطر {report.rain_intensity}
                    </span>
                    <span className="text-[9px] text-gray-400">{new Date(report.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {(report.facebook_name || report.facebook_url) && (
                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5">
                      {report.facebook_picture ? (
                        <img src={report.facebook_picture} alt={report.facebook_name} className="w-5 h-5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="w-5 h-5 bg-[#1877F2] text-white rounded-full flex items-center justify-center text-[9px] font-black shrink-0">
                          {report.facebook_name?.[0] || 'f'}
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-gray-600 truncate">
                        {report.facebook_name || 'ناشر موثّق'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SatelliteViewer;
