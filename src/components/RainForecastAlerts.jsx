import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import { getRainForecastForCity, getValidRainForecasts } from '../rainForecasts';

const { FiAlertCircle, FiX, FiBell } = FiIcons;

const RainForecastAlerts = ({ selectedCity }) => {
  const { rainForecasts, loading, lastUpdated } = useWeatherContext();
  const [expandedDate, setExpandedDate] = useState(null);
  const [showNotification, setShowNotification] = useState(true);

  // استخدام البيانات من السياق أو بيانات افتراضية محدثة
  const forecasts = useMemo(() => {
    let filteredForecasts = [];
    
    // إذا تم اختيار مدينة، عرض توقعاتها فقط
    if (selectedCity && typeof selectedCity === 'object' && selectedCity.name) {
      // استخراج اسم المقاطعة من البحث
      const cityName = selectedCity.name;
      
      if (rainForecasts && rainForecasts.length > 0) {
        // تصفية التنبؤات حسب المدينة والتاريخ
        filteredForecasts = rainForecasts
          .filter(f => {
            const cities = Array.isArray(f.cities) ? f.cities : JSON.parse(f.cities || '[]');
            return cities.some(c => c.toLowerCase() === cityName.toLowerCase());
          })
          .filter(f => {
            // التحقق من أن التاريخ لم يمضِ بعد
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const forecastDate = new Date(f.date);
            forecastDate.setHours(0, 0, 0, 0);
            return forecastDate >= today;
          });
      }
    } else {
      // إذا لم تتم اختيار مدينة، عرض جميع التنبؤات الصالحة (المستقبلية)
      if (rainForecasts && rainForecasts.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        filteredForecasts = rainForecasts.filter(f => {
          const forecastDate = new Date(f.date);
          forecastDate.setHours(0, 0, 0, 0);
          return forecastDate >= today;
        });
      } else {
        // بيانات افتراضية إذا لم تتوفر بيانات من الخادم
        filteredForecasts = getValidRainForecasts().map(f => ({
          ...f,
          dateAr: f.date_ar || f.date,
          cities: Array.isArray(f.cities) ? f.cities : JSON.parse(f.cities || '[]')
        }));
      }
    }
    
    return filteredForecasts.map(f => ({
      date: f.date,
      dateAr: f.date_ar || f.dateAr || f.date,
      cities: Array.isArray(f.cities) ? f.cities : JSON.parse(f.cities || '[]'),
      probability: f.probability,
      intensity: f.intensity,
      riskLevel: f.risk_level || f.riskLevel,
      icon: f.icon || '🌧️'
    }));
  }, [rainForecasts, selectedCity]);

  const topCities = [
    { name: 'النعمة', days: 2 },
    { name: 'فصاله', days: 2 },
    { name: 'كيفة', days: 1 },
    { name: 'لعيون', days: 1 },
    { name: 'باسكنو', days: 1 }
  ];

  if (loading && (!rainForecasts || rainForecasts.length === 0)) {
    return (
      <div className="w-full h-32 bg-gray-100 animate-pulse rounded-2xl"></div>
    );
  }

  if (forecasts.length === 0) return null;

  // تحديد الفئة اللونية حسب مستوى الخطر
  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case 'حرجة': return 'from-red-600 to-red-500';
      case 'عالية جداً': return 'from-orange-600 to-orange-500';
      case 'عالية': return 'from-yellow-600 to-yellow-500';
      case 'متوسطة': return 'from-blue-600 to-blue-500';
      case 'منخفضة': return 'from-green-600 to-green-500';
      default: return 'from-gray-600 to-gray-500';
    }
  };

  const getRiskBadgeColor = (riskLevel) => {
    switch (riskLevel) {
      case 'حرجة': return 'bg-red-100 text-red-800';
      case 'عالية جداً': return 'bg-orange-100 text-orange-800';
      case 'عالية': return 'bg-yellow-100 text-yellow-800';
      case 'متوسطة': return 'bg-blue-100 text-blue-800';
      case 'منخفضة': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* تنبيه التحديثات */}
      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3"
          >
            <SafeIcon icon={FiBell} className="text-blue-600 text-xl mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">تنبيهات بشائر الخير</p>
              <p className="text-xs text-blue-700 mt-1">تم تحديث البيانات {lastUpdated ? `الساعة ${lastUpdated.toLocaleTimeString('ar-SA')}` : 'حالياً'}</p>
            </div>
            <button
              onClick={() => setShowNotification(false)}
              className="text-blue-400 hover:text-blue-600 transition"
            >
              <SafeIcon icon={FiX} className="text-lg" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* عنوان القسم */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
            <span className="w-2 h-8 bg-green-500 rounded-full"></span>
            <h3 className="text-2xl font-bold text-gray-800">بشائر الخير 🌦️</h3>
            <div className="mr-auto flex flex-col items-end text-left">
              <span className="text-[10px] md:text-xs font-semibold bg-green-100 text-green-800 px-3 py-1 rounded-full">
                آخر التحديثات الجوية
              </span>
              <span className="text-[9px] md:text-[10px] text-gray-400 mt-1 font-mono">
                {lastUpdated ? `نشر في: اليوم ${lastUpdated.toLocaleDateString('en-GB')} ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'جاري التحديث...'}
              </span>
            </div>
          </div>

        <div className="mt-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
          <p className="text-sm text-blue-900 leading-relaxed font-bold">
            {selectedCity && typeof selectedCity === 'object' && selectedCity.name 
              ? `توقعات الأمطار لمقاطعة ${selectedCity.name}:`
              : 'يشير التوقعات إلى بشائر الخير خلال الأيام القادمة في:'
            }
          </p>
          {forecasts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs md:text-sm font-medium text-gray-700">
              {forecasts.map((forecast, idx) => (
                <div key={idx} className="flex items-center gap-2 hover:translate-x-1 transition-transform">
                  📍 {forecast.dateAr}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-3">لا توجد توقعات متاحة للمقاطعة المحددة</p>
          )}
          <p className="text-[10px] text-gray-500 mt-4 italic border-t border-blue-100 pt-2">
            وتبقى هذه التوقعات قابلة للتحديث مع صدور النماذج الجوية الجديدة. تابع الموقع للحصول على آخر التحديثات.
          </p>
        </div>

        {!selectedCity || !selectedCity.name ? (
        forecasts.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm text-slate-700 space-y-3">
            <p className="font-semibold text-slate-800">يتشير التوقعات إلى بشائر الخير خلال الأيام القادمة في:</p>
            <ul className="list-disc list-inside space-y-2">
              {forecasts.map((forecast, idx) => (
                <li key={idx} className="flex flex-col">
                  <strong>{forecast.dateAr}:</strong>
                  <span className="text-xs text-slate-600 mr-4">
                    {forecast.cities.map(city => city).join('، ')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">وتبقى هذه التوقعات قابلة للتحديث مع صدور النماذج الجوية الجديدة. تابع الموقع للحصول على آخر التحديثات.</p>
          </div>
        )) : null}
      </div>

      {/* بطاقات التوقعات */}
      <div className="space-y-4">
        {forecasts.map((forecast, idx) => (
          <motion.div
            key={forecast.date}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            onClick={() => setExpandedDate(expandedDate === forecast.date ? null : forecast.date)}
            className="cursor-pointer group"
          >
            {/* الرأس القابل للتوسيع */}
            <div className={`bg-gradient-to-r ${getRiskColor(forecast.riskLevel)} text-white p-4 rounded-t-2xl transition-all group-hover:shadow-lg`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <span className="text-4xl">{forecast.icon}</span>
                  <div>
                    <h4 className="font-bold text-lg">{forecast.dateAr}</h4>
                    <p className="text-xs text-white/80">{forecast.intensity}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-2xl">{forecast.probability}%</p>
                  <p className="text-xs text-white/80">احتمال هطول</p>
                </div>
              </div>

              {/* شريط المخاطر */}
              <div className="mt-3 w-full bg-white/20 rounded-full h-2">
                <div
                  className="bg-white h-full rounded-full transition-all"
                  style={{ width: `${forecast.probability}%` }}
                />
              </div>
            </div>

            {/* التفاصيل المتوسعة */}
            <AnimatePresence>
              {expandedDate === forecast.date && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white border-l-4 border-r-4 border-b-4 border-gray-200 p-4 rounded-b-2xl space-y-4"
                >
                  {/* المدن المتأثرة */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <SafeIcon icon={FiAlertCircle} className="text-orange-500" />
                      <p className="font-bold text-gray-800">المقاطعات والبلديات المتأثرة:</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {forecast.cities.map((city, i) => (
                        <motion.span
                          key={i}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="bg-gradient-to-r from-gray-100 to-gray-50 border border-gray-300 text-gray-800 px-3 py-1 rounded-full text-sm font-medium hover:shadow-md transition"
                        >
                          {city}
                        </motion.span>
                      ))}
                    </div>
                  </div>

                  {/* معلومات الشدة */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-xl border border-blue-100">
                    <p className="text-xs text-gray-600 mb-2">مستوى الشدة المتوقعة:</p>
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${getRiskBadgeColor(forecast.riskLevel)}`}>
                        {forecast.riskLevel}
                      </span>
                      <span className="text-xs text-gray-600">الشدة: {forecast.intensity}</span>
                    </div>
                  </div>

                  {/* نصائح الأمان */}
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                    <p className="text-xs font-bold text-yellow-800 mb-2">⚠️ نصائح أمان:</p>
                    <ul className="text-xs text-yellow-700 space-y-1">
                      <li>• تجنب التنقل في الطرق غير الآمنة</li>
                      <li>• احم أغنامك وثروتك من الفيضانات</li>
                      <li>• تابع التحديثات المستمرة</li>
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* ملخص المدن الأكثر تضررا */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-2xl border border-green-200">
        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="text-green-600">🎯</span>
          المناطق الأقدر على استقبال الخير
        </h4>
        <div className="space-y-2">
          {(() => {
            const cityCount = {};
            forecasts.forEach(f => f.cities.forEach(c => cityCount[c] = (cityCount[c] || 0) + 1));
            return Object.entries(cityCount)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([city, count]) => (
                <div key={city} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 font-medium">{city}</span>
                  <div className="flex items-center gap-2">
                    <div className="bg-red-200 rounded-full h-2 flex-1" style={{ width: `${count * 40}px` }} />
                    <span className="text-red-700 font-bold">{count} أيام</span>
                  </div>
                </div>
              ))
          })()}
        </div>
      </div>

      {/* المناطق الأقدر على استقبال الخير */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4 px-2">
          <span className="text-xl">🎯</span>
          <h4 className="font-bold text-gray-800">المناطق الأقدر على استقبال الخير</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {topCities.map((city, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center group hover:border-emerald-200 transition-colors"
            >
              <p className="text-sm font-bold text-gray-800 mb-1">{city.name}</p>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                  {city.days} أيام
                </span>
                <div className="flex gap-0.5 mt-1">
                  {[...Array(city.days)].map((_, i) => (
                    <span key={i} className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* آخر تحديث */}
      <p className="text-xs text-gray-500 text-center mt-6">
        آخر تحديث للبيانات: {lastUpdated ? lastUpdated.toLocaleString('ar-SA') : 'جاري التحديث...'}
      </p>
    </div>
  );
};

export default RainForecastAlerts;
