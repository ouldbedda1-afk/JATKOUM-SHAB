import React, { useEffect, useMemo } from 'react';
import { useWeatherContext } from '../WeatherContext';
import { sendLocalNotification } from '../pwa';

const WeatherAlerts = () => {
  const { weatherData: citiesWeather, manualAlerts, loading } = useWeatherContext();

  // 1. تعريف كافة الـ Hooks في البداية (قاعدة React الأساسية)
  const weatherAlerts = useMemo(() => {
    if (loading) return [];

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

    // 1. Check for Current Rain/Thunderstorms
    const rainyCities = cities.filter(c => c && c.current && (c.current.weather_code >= 80 || (c.daily?.precipitation_sum?.[0] || 0) > 5));
    if (rainyCities.length > 0) {
      const cityNames = rainyCities.map(c => `${c.cityType} ${c.city}`).join('، ');
      
      // نتحقق مما إذا كان هناك تنبيه يدوي بنفس العنوان لمنع التكرار
      const isAlreadyManual = result.some(r => r.title === 'تنبيه عاجل: أمطار وعواصف رعدية الآن');
      
      if (!isAlreadyManual) {
        result.push({
          id: 'rain-now',
          type: 'danger',
          title: 'تنبيه عاجل: أمطار وعواصف رعدية الآن',
          message: `يُرصد حالياً نشاط للسحب الرعدية الممطرة في مناطق: ${cityNames}. يرجى توخي الحذر من الصواعق والسيول.`,
          icon: '⛈️',
          color: 'bg-red-600',
          tags: ['أمطار غزيرة', 'عواصف رعدية']
        });
      }
    }

    // 1b. Check for Future Rain (Next 7 days)
    const rainForecastMessage = `يتوقع بإذن الله هطول أمطار خلال الأيام القادمة على عدد من المقاطعات والبلديات، وذلك وفق الآتي:

🔹 **8 يونيو:** سيلبابي، جيكني، تمبدغة، عدل بكرو.

🔹 **9 يونيو:** لعيون، النعمة، باسكنو، جيكني، أمرج، فصاله، عدل بكرو، تمبدغة.

🔹 **10 يونيو:** كيفة، لعيون، النعمة، تجكجة، سيلبابي، جيكني، أمرج، فصاله، عدل بكرو، تمبدغة.

🔹 **11 يونيو:** كيهيدي، سيلبابي، جيكني.

🔹 **12 يونيو:** سيلبابي.`;

    result.push({
      id: 'rain-future',
      type: 'success',
      title: 'التوقعات',
      message: rainForecastMessage,
      icon: '🌧️',
      color: 'bg-emerald-600',
      tags: ['توقعات الأمطار', 'بشائر الخير']
    });

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

    // 4. Check for Thunderstorms
    const thunderstormCities = cities.filter(c => c && ( (c.current?.weather_code || 0) >= 95 || (c.daily?.weather_code?.[0] || 0) >= 95));
    if (thunderstormCities.length > 0) {
      const cityNames = thunderstormCities.map(c => `${c.cityType} ${c.city}`).join('، ');
      result.push({
        id: 'thunderstorm-warning',
        type: 'danger',
        title: 'تحذير: عواصف رعدية قوية',
        message: `يتوقع بإذن الله تشكل عواصف رعدية قوية في مناطق ${cityNames}. يرجى الحذر من الصواعق والابتعاد عن مجاري السيول والأودية.`,
        icon: '⚡',
        color: 'bg-purple-900',
        tags: ['عواصف رعدية', 'صواعق']
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
