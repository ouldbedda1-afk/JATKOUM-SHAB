import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import { sendLocalNotification } from '../pwa';

const { FiAlertTriangle, FiInfo, FiWind, FiDroplet, FiZap, FiNavigation } = FiIcons;

const WeatherAlerts = () => {
  const { weatherData: citiesWeather, manualAlerts, loading, lastUpdated } = useWeatherContext();

  // 1. تعريف كافة الـ Hooks في البداية (قاعدة React الأساسية)
  const weatherAlerts = useMemo(() => {
    if (loading) return [];

    // ✅ التحقق من عمر البيانات — إذا مرّ أكثر من ساعة لا نعرض "الآن"
    const dataAgeMs = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
    const dataIsFresh = dataAgeMs < 60 * 60 * 1000; // أقل من ساعة

    const result = [];

    // --- 0. التنبيهات اليدوية من الإدارة ---
    if (manualAlerts && manualAlerts.length > 0) {
      manualAlerts.forEach(alert => {
        result.push({
          id: `manual-${alert.id}`,
          type: alert.type || 'danger',
          title: alert.title,
          message: alert.message,
          icon: alert.icon || '⚠️',
          color: alert.color || 'bg-red-700',
          tags: Array.isArray(alert.tags) ? alert.tags : JSON.parse(alert.tags || '[]'),
          isUrgent: true
        });
      });
    }

    const cities = citiesWeather || [];

    // 1. تحديد المدن التي يهطل فيها المطر حالياً
    // ✅ نعتمد فقط على weather_code الحالي — لا نرجع للساعة الماضية أبداً
    // ✅ نشترط أن تكون البيانات حديثة (أقل من ساعة) حتى لا تظهر أحداث الأمس
    const currentlyRainy = dataIsFresh ? cities.filter(city => {
      if (!city.current) return false;
      const code = city.current.weather_code ?? 0;
      // رموز الأمطار الفعلية: رذاذ 51-55، مطر 61-67، زخات 80-82، عواصف 95-99
      return code >= 51;
    }) : [];
    const currentlyRainyNames = currentlyRainy.map(c => c.city);

    // 2. التنبؤ بالمسار القادم — الساعات الثلاث القادمة فقط (بيانات ECMWF)
    // ✅ نعتمد على precipitation_probability و thunderstorm_probability فقط (لا precipitation الماضي)
    const nextPathCities = dataIsFresh ? cities.filter(city => {
      if (!city.hourly || !city.hourly.time || currentlyRainyNames.includes(city.city)) return false;

      const now = new Date();
      const nextHourIndex = city.hourly.time.findIndex(t => new Date(t) > now);
      if (nextHourIndex === -1) return false;

      for (let i = nextHourIndex; i < nextHourIndex + 3 && i < city.hourly.time.length; i++) {
        const prob = city.hourly.precipitation_probability?.[i] || 0;
        const thunderProb = city.hourly.thunderstorm_probability?.[i] || 0;
        if (prob > 60 || thunderProb > 40) return true;
      }
      return false;
    }) : [];

    if (nextPathCities.length > 0) {
      const cityNames = nextPathCities.map(c => `${c.cityType} ${c.city}`).join('، ');
      result.push({
        id: 'urgent-path-alert',
        type: 'danger',
        title: 'تنبيه عاجل: مسار السحب الرعدية',
        message: `يتوقع أن تصل الأمطار أو النشاط الرعدي خلال (30 إلى 60 دقيقة) القادمة إلى: ${cityNames}. يرجى توخي الحذر.`,
        icon: '🧭',
        color: 'bg-red-700',
        tags: ['توقعات اللحظة', 'المسار القادم', 'ECMWF'],
        isUrgent: true
      });
    }

    // 3. عرض المدن التي تشهد أمطاراً الآن
    // ✅ يُعرض فقط إذا كانت البيانات حديثة (dataIsFresh) — لا يظهر حدث الأمس أبداً
    if (currentlyRainy.length > 0) {
      const cityNames = currentlyRainy.map(c => `${c.cityType} ${c.city}`).join('، ');
      const updatedAt = lastUpdated
        ? `· تحديث ${lastUpdated.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`
        : '';
      result.push({
        id: 'rain-now-info',
        type: 'success',
        title: 'بشائر الخير الآن',
        message: `تشهد مناطق ${cityNames} هطول أمطار الآن. جعلها الله أمطار خير وبركة.`,
        icon: '🌦️',
        color: 'bg-emerald-700',
        tags: ['أمطار حالية', 'رصد حي ECMWF', updatedAt].filter(Boolean)
      });
    }

    // 1b. Check for Future Rain (Next 7 days)
    // تم نقل التوقعات التفصيلية إلى مكون RainForecastAlerts بناءً على طلب المستخدم
    
    // 2. Check for High Temperature
    const hotCitiesToday = cities.filter(c => c && c.daily && (c.daily.temperature_2m_max?.[0] || 0) >= 42);
    if (hotCitiesToday.length > 0) {
      const todayNames = hotCitiesToday.map(c => `${c.cityType} ${c.city}`).join('، ');
      result.push({
        id: 'heat-alert',
        type: 'warning',
        title: "تحذير: موجة حر شديدة",
        message: `تشهد مناطق ${todayNames} ارتفاعاً كبيراً في درجات الحرارة تتجاوز 42°م. يرجى شرب السوائل وتجنب الشمس.`,
        icon: '🔥',
        color: 'bg-orange-600',
        tags: ["موجة حر"]
      });
    }

    // 3. Check for Strong Winds
    const windyCities = cities.filter(c => c && c.current && (c.current.wind_speed_10m || 0) >= 35);
    if (windyCities.length > 0) {
      const cityNames = windyCities.map(c => `${c.cityType} ${c.city}`).join('، ');
      result.push({
        id: 'wind',
        type: 'info',
        title: 'تحذير: رياح قوية وأتربة',
        message: `تنبيه من نشاط رياح قوية تتجاوز سرعتها 35 كم/س في مناطق ${cityNames}، مما قد يؤدي لتدني الرؤية وتصاعد الأتربة.`,
        icon: '🌬️',
        color: 'bg-blue-800',
        tags: ['رياح نشطة', 'رؤية متدنية']
      });
    }

    // 4. عواصف رعدية — نعتمد على weather_code الحالي و thunderstorm_probability القادم (ECMWF)
    // ✅ نستثني المدن الممطرة بالفعل لتجنب التكرار
    const thunderstormCities = dataIsFresh ? cities.filter(city => {
      if (currentlyRainyNames.includes(city.city)) return false;
      const code = city.current?.weather_code ?? 0;
      if (code >= 95) return true;

      if (!city.hourly?.time) return false;
      const now = new Date();
      const nextIdx = city.hourly.time.findIndex(t => new Date(t) > now);
      if (nextIdx === -1) return false;

      // نفحص الساعات الثلاث القادمة فقط
      for (let i = nextIdx; i < nextIdx + 3 && i < city.hourly.time.length; i++) {
        const tProb = city.hourly.thunderstorm_probability?.[i] ?? 0;
        if (tProb >= 50) return true;
      }
      return false;
    }) : [];

    if (thunderstormCities.length > 0) {
      const cityNames = thunderstormCities.map(c => `${c.cityType} ${c.city}`).join('، ');
      result.push({
        id: 'thunderstorm-warning',
        type: 'danger',
        title: 'تحذير: عواصف رعدية قوية',
        message: `يتوقع بإذن الله تشكل عواصف رعدية قوية في مناطق ${cityNames}. يرجى الحذر من الصواعق والابتعاد عن مجاري السيول والأودية.`,
        icon: '⚡',
        color: 'bg-purple-900',
        tags: ['عواصف رعدية', 'صواعق', 'ECMWF']
      });
    }

    return result;
  }, [loading, citiesWeather]);

  useEffect(() => {
    if (!loading && weatherAlerts.length > 0) {
      const lastAlertId = localStorage.getItem('last_alert_id');
      const currentAlertId = weatherAlerts[0].id + weatherAlerts[0].title;

      if (lastAlertId !== currentAlertId) {
        sendLocalNotification(`تنبيه جوي: ${weatherAlerts[0].title}`, {
          body: weatherAlerts[0].message.substring(0, 100) + '...',
          tag: 'weather-alert'
        });
        localStorage.setItem('last_alert_id', currentAlertId);
      }
    }
  }, [loading, weatherAlerts]);

  // 2. شروط العرض (Rendering Logic) تأتي بعد الـ Hooks
  if (loading || !citiesWeather || citiesWeather.length === 0) return null;

  if (weatherAlerts.length === 0) {
    return (
      <div className="bg-emerald-700 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-lg font-black mb-2">حالة الطقس مستقرة</h3>
          <p className="text-sm opacity-90 leading-relaxed">
            لا توجد تنبيهات جوية خطيرة حالياً في عموم مقاطعات موريتانيا. الأجواء مستقرة بشكل عام مع متابعة مستمرة لأي مستجدات.
          </p>
        </div>
        <div className="absolute -bottom-2 -left-2 opacity-20">
          <span className="text-6xl">✅</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {weatherAlerts.map((alert) => (
        <div key={alert.id} className={`${alert.color} text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden border-4 border-white/10`}>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="animate-ping w-2 h-2 bg-white rounded-full"></span>
              <h3 className="text-xl font-black">{alert.title}</h3>
            </div>
            <div className="text-sm font-bold leading-relaxed whitespace-pre-wrap">
              {alert.message}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {alert.tags.map((tag, idx) => (
                <span key={idx} className="px-3 py-1 bg-white/20 text-white text-[10px] font-black rounded-full backdrop-blur-sm">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="absolute -bottom-4 -left-4 opacity-20">
            <span className="text-8xl">{alert.icon}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WeatherAlerts;
