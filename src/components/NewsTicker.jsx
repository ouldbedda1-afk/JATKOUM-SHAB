import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWeatherContext } from '../WeatherContext';

const NewsTicker = () => {
  const { weatherData, fires, rainReports, loading } = useWeatherContext();

  const newsItems = useMemo(() => {
    if (loading || !weatherData) return ["جاري تحميل آخر الأخبار..."];

    const alerts = [];
    const urgentAlerts = [];
    
    // 1. التحقق من وجود سحب وأمطار وعواصف
    const hasClouds = weatherData.some(city => city.current.weather_code >= 1);
    
    weatherData.forEach(cityData => {
      const code = cityData.current.weather_code;
      const temp = cityData.current.temperature_2m;
      const wind = cityData.current.wind_speed_10m;

      // أمطار وعواصف رعدية
      if (code >= 95) {
        urgentAlerts.push(`تنبيه عاجل: عواصف رعدية قوية ترصد الآن في مقاطعة ${cityData.city}. يرجى الحذر!`);
      } else if (code >= 61 && code <= 67) {
        urgentAlerts.push(`تنبيه: أمطار متوسطة إلى غزيرة تتساقط الآن في مقاطعة ${cityData.city}.`);
      } else if (code >= 51 && code <= 55) {
        urgentAlerts.push(`بشارة: رذاذ وأمطار خفيفة تشهدها مقاطعة ${cityData.city} الآن.`);
      }

      // رياح قوية
      if (wind > 45) {
        urgentAlerts.push(`عاجل: رياح قوية جداً ترصد في ${cityData.city} تصل سرعتها إلى ${Math.round(wind)} كم/س.`);
      }

      // حرارة مفرطة
      if (temp > 45) {
        urgentAlerts.push(`تنبيه: موجة حر شديدة في ${cityData.city}، الحرارة تلامس ${Math.round(temp)}°م.`);
      }

      // انخفاض الحرارة (توقعات)
      const todayMax = cityData.daily?.temperature_2m_max?.[0];
      const tomorrowMax = cityData.daily?.temperature_2m_max?.[1];
      if (todayMax && tomorrowMax && tomorrowMax <= todayMax - 5) {
        alerts.push(`بشرى: يتوقع انخفاض ملموس في درجات الحرارة غداً في مقاطعة ${cityData.city} لتصل إلى ${tomorrowMax}°م.`);
      }
    });

    // 2. بلاغات المواطنين (تبشيرة مطر)
    if (rainReports && rainReports.length > 0) {
      rainReports.slice(0, 3).forEach(report => {
        urgentAlerts.push(`تبشيرة: بلاغ عن هطول أمطار في ${report.location} (${report.intensity}).`);
      });
    }

    // 3. أخبار الحرائق
    const fireNews = fires.length > 0 
      ? fires.map(f => `عاجل: رصد حريق نشط على بعد ${f.distanceKm} كلم ${f.direction} مقاطعة ${f.nearestCity}.`)
      : [];

    // 4. أخبار ثابتة
    const staticNews = [
      "جديد: تم تفعيل قسم 'الظالة' لمساعدة المنمين في العثور على مواشيهم المفقودة.",
      "تنبيه: يرجى متابعة تحديثات 'بشائر الخير' يومياً لضمان سلامة القطعان والمراعي."
    ];

    const cloudNews = hasClouds 
      ? ["جاتكم اسحاب: نراقب معكم حركة السحب والحرائق لحظة بلحظة لضمان سلامة المراعي."]
      : ["جاتكم اسحاب: نراقب معكم حالة الطقس والحرائق لضمان سلامة المراعي."];

    // ترتيب الأولوية: تنبيهات عاجلة (أمطار/عواصف/رياح) -> حرائق -> سحب -> أخبار عامة
    const finalNews = [...urgentAlerts, ...fireNews, ...cloudNews, ...alerts.slice(0, 3), ...staticNews];
    
    return finalNews.length > 0 ? finalNews : ["لا توجد تنبيهات جوية خاصة حالياً. طقس مستقر."];
  }, [loading, weatherData, fires, rainReports]);

  return (
    <div className="bg-yellow-400 py-2 overflow-hidden border-y border-yellow-500 shadow-sm relative z-40" dir="rtl">
      <div className="flex items-center">
        <div className="bg-red-600 text-white px-6 py-2 text-sm md:text-lg font-black rounded-l-2xl z-50 whitespace-nowrap shadow-xl flex items-center gap-2">
          <span className="animate-pulse w-2 h-2 bg-white rounded-full"></span>
          أخبار عاجلة
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          <motion.div 
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
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
