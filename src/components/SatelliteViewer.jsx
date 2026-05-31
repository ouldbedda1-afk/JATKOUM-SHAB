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

      <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-900 group border border-gray-100">
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

        <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-mono">
          REAL-TIME: ECMWF 0.1° High-Res
        </div>
      </div>
      
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
          <h4 className="font-bold text-gray-700 text-sm mb-1">تطور الرياح</h4>
          <p className="text-xs text-gray-500">هبوب رياح شمالية شرقية جافة على آدرار وتيرس زمور.</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
          <h4 className="font-bold text-gray-700 text-sm mb-1">الرؤية الأفقية</h4>
          <p className="text-xs text-gray-500">تأثر الرؤية في الحوضين بسبب الغبار العالق.</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
          <h4 className="font-bold text-gray-700 text-sm mb-1">حالة البحر</h4>
          <p className="text-xs text-gray-500">بحر قليل الاضطراب إلى مضطرب في سواحل نواذيبو.</p>
        </div>
      </div>
    </div>
  );
};

export default SatelliteViewer;