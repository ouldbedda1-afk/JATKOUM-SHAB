import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getActiveFires } from '../weatherApi';

const NewsTicker = () => {
  const [fires, setFires] = useState([]);

  useEffect(() => {
    const fetchFires = async () => {
      const activeFires = await getActiveFires();
      setFires(activeFires);
    };
    fetchFires();
    // تحديث البيانات كل 30 دقيقة
    const interval = setInterval(fetchFires, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const staticNews = [
    "تنبيه: استمرار موجة الحر الشديدة (أكثر من 42 درجة) في معظم المقاطعات الجنوبية والشرقية.",
    "جديد: تم تفعيل قسم 'الظالة' لمساعدة المنمين في العثور على مواشيهم المفقودة.",
    "جاتكم اسحاب: نراقب معكم حركة السحب والحرائق لحظة بلحظة لضمان سلامة المراعي."
  ];

  const fireNews = fires.length > 0 
     ? fires.map(f => `عاجل: رصد حريق نشط على بعد ${f.distanceKm} كلم ${f.direction} مقاطعة ${f.nearestCity} (داخل الأراضي الموريتانية).`)
     : ["لا توجد بلاغات عن حرائق داخل الأراضي الموريتانية حالياً."];

  const allNews = [...fireNews, ...staticNews];

  return (
    <div className="bg-yellow-400 py-2 overflow-hidden border-y border-yellow-500 shadow-sm relative z-40" dir="rtl">
      <div className="flex items-center">
        {/* كلمة أخبار عاجلة في اليمين وبحجم أكبر */}
        <div className="bg-red-600 text-white px-6 py-2 text-sm md:text-lg font-black rounded-l-2xl z-50 whitespace-nowrap shadow-xl flex items-center gap-2">
          <span className="animate-pulse w-2 h-2 bg-white rounded-full"></span>
          أخبار عاجلة
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          <motion.div 
            animate={{ x: ["-100%", "100%"] }}
            transition={{ 
              duration: 25, 
              repeat: Infinity, 
              ease: "linear" 
            }}
            className="flex gap-12 whitespace-nowrap"
          >
            {allNews.map((item, index) => (
              <span key={index} className="text-sm md:text-base font-black text-gray-900 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-600 rounded-full"></span>
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default NewsTicker;
