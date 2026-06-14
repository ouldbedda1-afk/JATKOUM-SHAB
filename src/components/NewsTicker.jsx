import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWeatherContext } from '../WeatherContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const NewsTicker = () => {
  const { weatherData, fires, rainReports, loading, refreshAllData, lastUpdated } = useWeatherContext();

  const newsItems = useMemo(() => {
    if (loading || !weatherData) return ["جاري تحميل آخر الأخبار..."];

    // ✅ نعرض تنبيهات "الآن" فقط إذا كانت البيانات حديثة (أقل من ساعة)
    const dataAgeMs = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
    const dataIsFresh = dataAgeMs < 60 * 60 * 1000;

    const alerts = [];
    const urgentAlerts = [];

    const hasClouds = weatherData.some(city => city.current?.weather_code >= 1);

    weatherData.forEach(cityData => {
      const code = cityData.current?.weather_code ?? 0;
      const temp = cityData.current?.temperature_2m ?? 0;
      const wind = cityData.current?.wind_speed_10m ?? 0;

      // ✅ أمطار وعواصف — فقط إذا كانت البيانات حديثة
      if (dataIsFresh) {
        if (code >= 95) {
          urgentAlerts.push(`تنبيه عاجل: عواصف رعدية قوية ترصد الآن في مقاطعة ${cityData.city}. يرجى الحذر!`);
        } else if (code >= 80 && code <= 82) {
          urgentAlerts.push(`تنبيه: زخات مطرية تشهدها مقاطعة ${cityData.city} حالياً.`);
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
      }

      // انخفاض الحرارة (توقعات مستقبلية — دائماً صحيحة)
      const todayMax = cityData.daily?.temperature_2m_max?.[0];
      const tomorrowMax = cityData.daily?.temperature_2m_max?.[1];
      if (todayMax && tomorrowMax && tomorrowMax <= todayMax - 5) {
        alerts.push(`بشرى: يتوقع انخفاض ملموس في درجات الحرارة غداً في مقاطعة ${cityData.city} لتصل إلى ${tomorrowMax}°م.`);
      }
    });

    // 2. بلاغات المواطنين — تُعرض فقط إذا كانت من آخر 3 ساعات
    if (rainReports && rainReports.length > 0) {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      rainReports
        .filter(r => r.created_at && new Date(r.created_at).getTime() > threeHoursAgo)
        .slice(0, 3)
        .forEach(report => {
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
        <div className="bg-red-600 text-white px-4 md:px-6 py-2 text-sm md:text-lg font-black rounded-l-2xl z-50 whitespace-nowrap shadow-xl flex items-center gap-2">
          <span className="animate-pulse w-2 h-2 bg-white rounded-full"></span>
          أخبار عاجلة
          <button 
            onClick={() => refreshAllData(true)} 
            className="mr-2 p-1 hover:bg-white/20 rounded-full transition-colors"
            title="تحديث البيانات الآن"
          >
            <SafeIcon icon={FiIcons.FiRefreshCw} className={`text-xs md:text-sm ${loading ? 'animate-spin' : ''}`} />
          </button>
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
