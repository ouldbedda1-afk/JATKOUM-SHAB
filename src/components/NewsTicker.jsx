import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWeatherContext } from '../WeatherContext';

const NewsTicker = () => {
  const { weatherData, fires, loading } = useWeatherContext();

  const newsItems = useMemo(() => {
    if (loading || !weatherData) return ["جاري تحميل آخر الأخبار..."];

    const alerts = [];
    
    // 1. التحقق من وجود سحب
    const hasClouds = weatherData.some(city => city.current.weather_code >= 1);

    // 2. معالجة أخبار الطقس (انخفاض الحرارة)
    weatherData.forEach(cityData => {
      const todayMax = cityData.daily.temperature_2m_max[0];
      const tomorrowMax = cityData.daily.temperature_2m_max[1];
      const dayAfterMax = cityData.daily.temperature_2m_max[2];

      if (tomorrowMax <= todayMax - 5) {
        alerts.push(`بشرى: يتوقع انخفاض ملموس في درجات الحرارة غداً في مقاطعة ${cityData.city} لتصل إلى ${tomorrowMax}°م.`);
      } else if (dayAfterMax <= todayMax - 5) {
        alerts.push(`توقع: انخفاض في درجات الحرارة يوم بعد غد في مقاطعة ${cityData.city} لتصل إلى ${dayAfterMax}°م.`);
      }
    });

    // 3. أخبار الحرائق
    const fireNews = fires.length > 0 
      ? fires.map(f => `عاجل: رصد حريق نشط على بعد ${f.distanceKm} كلم ${f.direction} مقاطعة ${f.nearestCity}.`)
      : ["لا توجد بلاغات عن حرائق نشطة حالياً."];

    // 4. أخبار ثابتة
    const staticNews = [
      "تنبيه: استمرار موجة الحر الشديدة في معظم المقاطعات الجنوبية والشرقية.",
      "جديد: تم تفعيل قسم 'الظالة' لمساعدة المنمين في العثور على مواشيهم المفقودة.",
    ];

    const cloudNews = hasClouds 
      ? ["جاتكم اسحاب: نراقب معكم حركة السحب والحرائق لحظة بلحظة لضمان سلامة المراعي."]
      : ["جاتكم اسحاب: نراقب معكم حالة الطقس والحرائق لضمان سلامة المراعي."];

    return [...fireNews, ...alerts.slice(0, 3), ...cloudNews, ...staticNews];
  }, [loading, weatherData, fires]);

  return (
    <div className="bg-yellow-400 py-2 overflow-hidden border-y border-yellow-500 shadow-sm relative z-40" dir="rtl">
      <div className="flex items-center">
        <div className="bg-red-600 text-white px-6 py-2 text-sm md:text-lg font-black rounded-l-2xl z-50 whitespace-nowrap shadow-xl flex items-center gap-2">
          <span className="animate-pulse w-2 h-2 bg-white rounded-full"></span>
          أخبار عاجلة
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          <motion.div 
            animate={{ x: ["-100%", "100%"] }}
            transition={{ 
              duration: 30, 
              repeat: Infinity, 
              ease: "linear" 
            }}
            className="flex gap-12 whitespace-nowrap"
          >
            {newsItems.map((item, index) => (
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
