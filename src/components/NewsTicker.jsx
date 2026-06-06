import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getActiveFires, getAllCitiesWeather } from '../weatherApi';

const NewsTicker = () => {
  const [fires, setFires] = useState([]);
  const [weatherAlerts, setWeatherAlerts] = useState([]);
  const [hasClouds, setHasClouds] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // جلب الحرائق
      const activeFires = await getActiveFires();
      setFires(activeFires);

      // جلب بيانات الطقس
      try {
        const allCities = await getAllCitiesWeather();
        
        // التحقق من وجود سحب
        const detectedClouds = allCities.some(city => city.current.weather_code >= 1);
        setHasClouds(detectedClouds);

        const alerts = [];
        allCities.forEach(cityData => {
          const todayMax = cityData.daily.temperature_2m_max[0];
          const tomorrowMax = cityData.daily.temperature_2m_max[1];
          const dayAfterMax = cityData.daily.temperature_2m_max[2];

          // رصد انخفاض ملموس (أكثر من 5 درجات) غداً
          if (tomorrowMax <= todayMax - 5) {
            alerts.push(`بشرى: يتوقع انخفاض ملموس في درجات الحرارة غداً في مقاطعة ${cityData.city} لتصل إلى ${tomorrowMax}°م.`);
          }
          // رصد انخفاض ملموس بعد غد
          else if (dayAfterMax <= todayMax - 5) {
            alerts.push(`توقع: انخفاض في درجات الحرارة يوم بعد غد في مقاطعة ${cityData.city} لتصل إلى ${dayAfterMax}°م.`);
          }
        });

        // نأخذ أول 3 تنبيهات فقط لتجنب ازدحام الشريط
        setWeatherAlerts(alerts.slice(0, 3));
      } catch (err) {
        console.error("Error fetching weather for ticker:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const staticNews = [
    "تنبيه: استمرار موجة الحر الشديدة (أكثر من 42 درجة) في معظم المقاطعات الجنوبية والشرقية.",
    "جديد: تم تفعيل قسم 'الظالة' لمساعدة المنمين في العثور على مواشيهم المفقودة.",
  ];

  const cloudNews = hasClouds 
    ? ["جاتكم اسحاب: نراقب معكم حركة السحب والحرائق لحظة بلحظة لضمان سلامة المراعي."]
    : ["جاتكم اسحاب: نراقب معكم حالة الطقس والحرائق لضمان سلامة المراعي."];

  const fireNews = fires.length > 0 
    ? fires.map(f => `عاجل: رصد حريق نشط على بعد ${f.distanceKm} كلم ${f.direction} مقاطعة ${f.nearestCity} (داخل الأراضي الموريتانية).`)
    : ["لا توجد بلاغات عن حرائق داخل الأراضي الموريتانية حالياً."];

  const allNews = [...fireNews, ...weatherAlerts, ...cloudNews, ...staticNews];

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
