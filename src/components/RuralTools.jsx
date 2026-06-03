import React from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiRadio, FiAnchor, FiActivity } = FiIcons;

const RuralTools = () => {
  return (
    <div className="space-y-6">
      {/* Radio Mauritanie Section */}
      <div className="bg-gradient-to-r from-emerald-700 to-green-600 p-6 rounded-[2rem] shadow-xl text-white overflow-hidden relative group">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white/20 rounded-2xl">
              <SafeIcon icon={FiRadio} className="text-2xl" />
            </div>
            <div>
              <h3 className="text-xl font-black italic">إذاعة موريتانيا</h3>
              <p className="text-xs opacity-80 font-bold">بث مباشر - الخدمة العامة</p>
            </div>
          </div>
          
          <div className="bg-black/20 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <audio 
              controls 
              className="w-full h-10 custom-audio"
              src="https://stream.radio-mauritanie.mr:8000/live"
            >
              متصفحك لا يدعم مشغل الصوت.
            </audio>
            <p className="text-[10px] mt-2 text-center opacity-70">تابع أخبار الطقس والمراعي عبر الإذاعة الوطنية</p>
          </div>
        </div>
        <div className="absolute -bottom-4 -left-4 opacity-10 group-hover:scale-110 transition-transform">
          <SafeIcon icon={FiRadio} className="text-9xl" />
        </div>
      </div>

      {/* Sea & Pasture Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-blue-50">
          <div className="flex items-center gap-2 mb-3">
            <SafeIcon icon={FiAnchor} className="text-blue-600 text-xl" />
            <h4 className="font-black text-gray-800">حالة البحر (الصيادين)</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-bold">نواذيبو:</span>
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">هادئ - 1.2م</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-bold">نواكشوط:</span>
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">متوسط - 1.5م</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-emerald-50">
          <div className="flex items-center gap-2 mb-3">
            <SafeIcon icon={FiActivity} className="text-emerald-600 text-xl" />
            <h4 className="font-black text-gray-800">مؤشر المراعي</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-bold">الحوض الشرقي:</span>
              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">جيد جداً</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-bold">لعصابة:</span>
              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">متوسط</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RuralTools;
