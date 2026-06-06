import React, { useState, useEffect } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { getActiveFires, getAllCitiesWeather } from '../weatherApi';
import { getRecentRainReports } from '../supabase';

const { FiLayers, FiMaximize, FiPlayCircle, FiDownload, FiShield } = FiIcons;

const SatelliteViewer = () => {
  const [activeLayer, setActiveLayer] = useState('rain');
  const [fires, setFires] = useState([]);
  const [rainReports, setRainReports] = useState([]);
  const [hasClouds, setHasClouds] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // جلب الحرائق
      const activeFires = await getActiveFires();
      setFires(activeFires);

      // جلب بلاغات المطر الميدانية
      const reports = await getRecentRainReports();
      setRainReports(reports);

      // جلب حالة الطقس للتأكد من وجود سحب أو أمطار
      try {
        const weatherData = await getAllCitiesWeather();
        const detectedClouds = weatherData.some(city => city.current.weather_code >= 1);
        setHasClouds(detectedClouds);
      } catch (err) {
        console.error("Error checking clouds:", err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 15 * 60 * 1000); // كل 15 دقيقة
    return () => clearInterval(interval);
  }, []);

  const layers = {
    rain: 'rain',
    clouds: 'clouds',
    fires: 'fires',
    temp: 'temp',
    wind: 'wind'
  };

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <SafeIcon icon={FiLayers} className="text-xl" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">خريطة الرصد المباشر</h2>
            <p className="text-sm text-gray-500">رصد حي للأمطار، السحب، والحرائق في موريتانيا</p>
          </div>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto max-w-full">
          <button 
            onClick={() => setActiveLayer('rain')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeLayer === 'rain' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
          >
            الأمطار
          </button>
          <button 
            onClick={() => setActiveLayer('clouds')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeLayer === 'clouds' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
          >
            السحب
          </button>
          <button 
            onClick={() => setActiveLayer('fires')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeLayer === 'fires' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500'}`}
          >
            🔥 الحرائق
          </button>
          <button 
            onClick={() => setActiveLayer('temp')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeLayer === 'temp' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
          >
            الحرارة
          </button>
          <button 
            onClick={() => setActiveLayer('wind')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeLayer === 'wind' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
          >
            الرياح
          </button>
        </div>
      </div>

      <div className="relative aspect-[3/4] md:aspect-video rounded-2xl overflow-hidden bg-gray-900 group border border-gray-100">
        <iframe 
          src={`https://embed.windy.com/embed2.html?lat=18.0735&lon=-15.9582&zoom=5&level=surface&overlay=${activeLayer}&menu=&message=&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`} 
          width="100%" 
          height="100%" 
          frameBorder="0"
          className="brightness-[95%]"
          title="Windy Map Mauritania"
        ></iframe>
        
        <div className="absolute bottom-4 right-4 flex gap-2">
          <button className="bg-white/90 backdrop-blur p-2 rounded-lg shadow-lg hover:bg-white transition-colors">
            <SafeIcon icon={FiMaximize} className="text-gray-800" />
          </button>
          <button className="bg-white/90 backdrop-blur p-2 rounded-lg shadow-lg hover:bg-white transition-colors">
            <SafeIcon icon={FiPlayCircle} className="text-gray-800" />
          </button>
          <button className="bg-white/90 backdrop-blur p-2 rounded-lg shadow-lg hover:bg-white transition-colors">
            <SafeIcon icon={FiDownload} className="text-gray-800" />
          </button>
        </div>

        <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] md:text-xs font-mono z-10">
          رصد حي: ECMWF 0.1°
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
              ? `تم رصد ${fires.length} بؤر حرائق نشطة بالقرب من: ${[...new Set(fires.map(f => f.nearestCity))].join('، ')}.`
              : "لا توجد بؤر حرائق كبيرة مرصودة حالياً عبر الأقمار الصناعية."}
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
          <p className="text-[10px] text-amber-700 leading-tight font-bold">الحرارة تتجاوز 42° في الحوضين ولعصابة، مما يزيد من سرعة انتشار الحرائق.</p>
        </div>
      </div>

      {/* Field Rain Reports (New) */}
      {rainReports.length > 0 && (
        <div className="mt-6 border-t pt-6">
          <h3 className="text-sm font-black text-gray-800 mb-4 flex items-center gap-2">
            <SafeIcon icon={FiShield} className="text-blue-600" />
            تبشيرات المطر الميدانية (آخر 24 ساعة)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rainReports.map((report) => (
              <div key={report.id} className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${report.is_verified ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                  <SafeIcon icon={report.is_verified ? FiCheck : FiCloudRain} />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-xs text-gray-900">{report.city}</span>
                    {report.is_verified && (
                      <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded-sm font-bold flex items-center gap-0.5">
                        <SafeIcon icon={FiShield} className="text-[7px]" />
                        مؤكد
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500">مطر {report.rain_intensity}</p>
                  <p className="text-[9px] text-gray-400 mt-1">{new Date(report.created_at).toLocaleTimeString('ar-SA')}</p>
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