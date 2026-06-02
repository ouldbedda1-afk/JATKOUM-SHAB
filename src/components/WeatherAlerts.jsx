import React from 'react';
import { useAllCitiesWeather } from '../useWeather';

const WeatherAlerts = () => {
  const { data: citiesWeather, loading } = useAllCitiesWeather();

  if (loading || !citiesWeather || citiesWeather.length === 0) return null;

  const alerts = [];

  // 1. Check for Current Rain/Thunderstorms
  const rainyCities = citiesWeather.filter(c => c.current.weather_code >= 80 || c.daily.precipitation_sum[0] > 5);
  if (rainyCities.length > 0) {
    const cityNames = rainyCities.map(c => `${c.cityType} ${c.city}`).join('، ');
    alerts.push({
      id: 'rain-now',
      type: 'danger',
      title: 'تنبيه عاجل: أمطار وعواصف رعدية الآن',
      message: `يُرصد حالياً نشاط للسحب الرعدية الممطرة في مناطق: ${cityNames}. يرجى توخي الحذر من الصواعق والسيول.`,
      icon: '⛈️',
      color: 'bg-red-600',
      tags: ['أمطار غزيرة', 'عواصف رعدية']
    });
  }

  // 1b. Check for Future Rain (Next 7 days)
  const futureRainyCities = citiesWeather.map(city => {
    const rainDays = city.daily.time.filter((t, i) => i > 0 && city.daily.precipitation_sum[i] > 1);
    if (rainDays.length > 0) {
      const dates = rainDays.map(t => {
        const d = new Date(t);
        return `${d.getDate()}/${d.getMonth() + 1}`;
      }).join('، ');
      return { name: city.city, type: city.cityType, dates };
    }
    return null;
  }).filter(Boolean);

  if (futureRainyCities.length > 0) {
    // Group by dates to make alerts cleaner
    const alertMsg = futureRainyCities.map(c => `${c.type} ${c.name} (أيام: ${c.dates})`).join(' - ');
    alerts.push({
      id: 'rain-future',
      type: 'success',
      title: 'توقعات أمطار قادمة',
      message: `بشائر الخير! تتشير التوقعات إلى هطول أمطار خلال الأيام القادمة في: ${alertMsg}.`,
      icon: '🌧️',
      color: 'bg-emerald-600',
      tags: ['توقعات الأمطار', 'بشائر الخير']
    });
  }

  // 2. Check for High Temperature
  const hotCities = citiesWeather.filter(c => c.daily.temperature_2m_max[0] >= 42);
  if (hotCities.length > 0) {
    const cityNames = hotCities.map(c => `${c.cityType} ${c.city}`).join('، ');
    alerts.push({
      id: 'heat',
      type: 'warning',
      title: 'تحذير: موجة حر شديدة',
      message: `تشهد مناطق ${cityNames} ارتفاعاً كبيراً في درجات الحرارة تتجاوز 42°م. ينصح بتجنب الشمس وشرب السوائل.`,
      icon: '🔥',
      color: 'bg-orange-600',
      tags: ['موجة حر', 'تنبيه صحي']
    });
  }

  // 3. Check for Strong Winds
  const windyCities = citiesWeather.filter(c => c.current.wind_speed_10m >= 35);
  if (windyCities.length > 0) {
    const cityNames = windyCities.map(c => `${c.cityType} ${c.city}`).join('، ');
    alerts.push({
      id: 'wind',
      type: 'info',
      title: 'تنبيه: رياح قوية وأتربة',
      message: `نشاط للرياح القوية بسرعة تتجاوز 35 كم/س في مناطق ${cityNames}، مما قد يؤدي لتدني الرؤية بسبب الأتربة.`,
      icon: '🌬️',
      color: 'bg-blue-800',
      tags: ['رياح نشطة', 'رؤية متدنية']
    });
  }

  // If no specific alerts, show a general update
  if (alerts.length === 0) {
    return (
      <div className="bg-emerald-700 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-lg font-black mb-2">حالة الطقس مستقرة</h3>
          <p className="text-sm opacity-90 leading-relaxed">
            لا توجد تنبيهات جوية خطيرة حالياً في عموم ولايات موريتانيا. الأجواء مستقرة بشكل عام مع متابعة مستمرة لأي مستجدات.
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
      {alerts.map((alert) => (
        <div key={alert.id} className={`${alert.color} text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden border-4 border-white/10`}>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="animate-ping w-2 h-2 bg-white rounded-full"></span>
              <h3 className="text-xl font-black">{alert.title}</h3>
            </div>
            <p className="text-sm font-bold leading-relaxed">
              {alert.message}
            </p>
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
