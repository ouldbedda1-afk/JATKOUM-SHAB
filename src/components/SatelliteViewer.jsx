import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';

const { FiLayers, FiRefreshCw, FiShield, FiCheck, FiCloudRain, FiMapPin } = FiIcons;

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
  const { weatherData, fires, rainReports, loading } = useWeatherContext();

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
