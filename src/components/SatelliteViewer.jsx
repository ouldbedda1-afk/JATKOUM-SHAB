import React, { useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiLayers, FiMaximize, FiPlayCircle, FiDownload } = FiIcons;

const SatelliteViewer = () => {
  const [activeLayer, setActiveLayer] = useState('rain');

  const layers = {
    rain: 'rain',
    clouds: 'clouds',
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
            <h2 className="text-xl font-bold text-gray-800">خريطة الأمطار والسحب المباشرة</h2>
            <p className="text-sm text-gray-500">رصد حي وحصري لكافة مناطق موريتانيا</p>
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
        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
          <h4 className="font-bold text-blue-900 text-xs mb-1 flex items-center gap-1">
            <span className="w-1 h-1 bg-blue-600 rounded-full"></span>
            تطور الرياح
          </h4>
          <p className="text-[10px] text-blue-700 leading-tight">هبوب رياح شمالية شرقية جافة على آدرار وتيرس زمور.</p>
        </div>
        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
          <h4 className="font-bold text-blue-900 text-xs mb-1 flex items-center gap-1">
            <span className="w-1 h-1 bg-blue-600 rounded-full"></span>
            الرؤية الأفقية
          </h4>
          <p className="text-[10px] text-blue-700 leading-tight">تأثر الرؤية في الحوضين بسبب الغبار العالق الناتج عن نشاط الرياح.</p>
        </div>
        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
          <h4 className="font-bold text-blue-900 text-xs mb-1 flex items-center gap-1">
            <span className="w-1 h-1 bg-blue-600 rounded-full"></span>
            حالة البحر
          </h4>
          <p className="text-[10px] text-blue-700 leading-tight">بحر قليل الاضطراب إلى مضطرب في سواحل نواذيبو ونواكشوط.</p>
        </div>
      </div>
    </div>
  );
};

export default SatelliteViewer;