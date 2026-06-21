import React, { useMemo, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import RainReportForm from './RainReportForm';

const {
  FiActivity,
  FiAnchor,
  FiCloudRain,
  FiMap,
  FiPlus,
  FiShield,
  FiTrendingDown,
  FiTrendingUp,
  FiCheck
} = FiIcons;

const bawahRegions = [
  {
    name: 'الحوض الشرقي',
    cities: ['النعمة', 'تمبدغة', 'باسكنو', 'امرج', 'ولاته', 'انبيكت لحواش'],
    mapClass: 'top-[42%] right-[18%] w-24 h-20',
  },
  {
    name: 'لعصابه',
    cities: ['كيفة', 'كرو', 'كنكوصة'],
    mapClass: 'top-[54%] right-[43%] w-20 h-16',
  },
  {
    name: 'اترارزة',
    cities: ['روصو', 'بوتلميت', 'اركيز', 'المذرذرة', 'كرمسين', 'واد الناقة'],
    mapClass: 'top-[60%] right-[65%] w-24 h-14',
  },
  {
    name: 'كوركول',
    cities: ['كيهيدي', 'امبود', 'مونغل'],
    mapClass: 'top-[68%] right-[48%] w-20 h-12',
  },
];

function getRegionWeatherScore(region, weatherData) {
  const regionWeather = weatherData.filter((item) => region.cities.includes(item.city));
  const rainChance = Math.max(0, ...regionWeather.map((item) => item.hourly?.precipitation_probability?.[0] || 0));
  const rainSum = regionWeather.reduce((sum, item) => sum + (item.daily?.precipitation_sum?.[0] || 0), 0);
  const maxTemp = Math.max(
    0,
    ...regionWeather.map((item) => item.daily?.temperature_2m_max?.[0] || item.current?.temperature_2m || 0)
  );
  const hasClouds = regionWeather.some((item) => {
    const code = item.current?.weather_code ?? 0;
    return code >= 1 || (item.hourly?.precipitation_probability?.[0] || 0) >= 20;
  });

  return { rainChance, rainSum, maxTemp, hasClouds };
}

function getMapColor(status) {
  if (status.level === 'جيد') return 'bg-emerald-500 border-emerald-700';
  if (status.level === 'متوسط') return 'bg-amber-400 border-amber-600';
  return 'bg-red-500 border-red-700';
}

function buildBawahStatus(region, weatherData, rainReports, fires) {
  const weather = getRegionWeatherScore(region, weatherData);
  const satellite = region.satellite || null;
  const verifiedRainReports = rainReports.filter((report) => {
    const reportCity = report.nearest_district || report.city;
    return report.is_verified && region.cities.includes(reportCity);
  });
  const nearbyFires = fires.filter((fire) => region.cities.includes(fire.nearestCity));
  const hasGoodVegetation = satellite?.score >= 3;
  const hasMediumVegetation = satellite?.score >= 2;
  const hasRain = weather.rainChance >= 30 || weather.rainSum > 0 || verifiedRainReports.length > 0;
  const hasHeatRisk = weather.maxTemp >= 42;
  const hasFireRisk = nearbyFires.length > 0;

  const base = { weather, satellite, verifiedRainReports, nearbyFires };

  if (hasFireRisk) {
    return {
      ...base,
      level: 'خطر',
      badgeClass: 'bg-red-100 text-red-700',
      borderClass: 'border-red-100',
      advice: 'غطاء نباتي غير آمن حالياً بسبب قرب الحرائق؛ تجنب الرعي في هذه الجهة.',
    };
  }

  if ((hasGoodVegetation || hasRain) && !hasHeatRisk) {
    return {
      ...base,
      level: 'جيد',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      borderClass: 'border-emerald-100',
      advice: 'من أفضل أماكن الرعي حالياً؛ الغطاء النباتي مرشح للتحسن بعد المطر.',
    };
  }

  if (hasMediumVegetation || hasRain) {
    return {
      ...base,
      level: 'متوسط',
      badgeClass: 'bg-amber-100 text-amber-700',
      borderClass: 'border-amber-100',
      advice: 'مكان رعي مقبول؛ تابع الحرارة واتجاه السحب قبل التحرك.',
    };
  }

  if (hasHeatRisk) {
    return {
      ...base,
      level: 'ضعيف',
      badgeClass: 'bg-red-100 text-red-700',
      borderClass: 'border-red-100',
      advice: 'الغطاء النباتي تحت ضغط الحرارة؛ الأفضل الرعي صباحاً وقرب نقاط الماء.',
    };
  }

  return {
    ...base,
    level: 'متوسط',
    badgeClass: 'bg-amber-100 text-amber-700',
    borderClass: 'border-amber-100',
    advice: 'غطاء نباتي متوسط؛ تابع المطر والتبشيرات قبل اختيار مكان الرعي.',
  };
}

function getPlaceScore(region) {
  const satelliteScore = region.status.satellite?.score ?? 1;
  const rainScore = Math.min(30, region.status.weather.rainChance);
  const heatPenalty = Math.max(0, (region.status.weather.maxTemp - 38) * 4);
  const firePenalty = region.status.nearbyFires.length * 50;
  return satelliteScore * 30 + rainScore - heatPenalty - firePenalty;
}

const RuralTools = () => {
  const {
    weatherData,
    fires,
    marineData,
    rainReports,
    vegetationData,
    loading
  } = useWeatherContext();

  const [showRainForm, setShowRainForm] = useState(false);

  const bawahStatus = useMemo(
    () => bawahRegions.map((region) => {
      const satellite = vegetationData?.regions?.[region.name] || null;
      return {
        ...region,
        satellite,
        status: buildBawahStatus({ ...region, satellite }, weatherData, rainReports, fires),
      };
    }),
    [weatherData, rainReports, fires, vegetationData]
  );

  const bestPlaces = useMemo(() => (
    bawahStatus
      .flatMap((region) => region.cities.slice(0, 2).map((city) => ({
        city,
        region: region.name,
        status: region.status,
        score: getPlaceScore(region),
      })))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  ), [bawahStatus]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-[2rem] shadow-xl text-white relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white/20 rounded-2xl">
              <SafeIcon icon={FiCloudRain} className="text-2xl" />
            </div>
            <div>
              <h3 className="text-xl font-black italic">تبشيرات المطر</h3>
              <p className="text-xs opacity-80 font-bold">بشرنا بهطول المطر في منطقتك</p>
            </div>
          </div>

          <button
            onClick={() => setShowRainForm(true)}
            className="w-full bg-white text-blue-700 py-3 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-50 transition-all shadow-lg active:scale-95"
          >
            <SafeIcon icon={FiPlus} />
            إرسال تبشيرة الآن
          </button>
        </div>
        <div className="absolute -bottom-6 -left-6 opacity-10 group-hover:scale-110 transition-transform">
          <SafeIcon icon={FiCloudRain} className="text-9xl" />
        </div>
      </div>

      {showRainForm && <RainReportForm onClose={() => setShowRainForm(false)} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-blue-50">
          <div className="flex items-center gap-2 mb-3">
            <SafeIcon icon={FiAnchor} className="text-blue-600 text-xl" />
            <h4 className="font-black text-gray-800">حالة البحر (الصيادين)</h4>
          </div>
          <div className="space-y-2">
            {marineData.length > 0 ? marineData.map((data, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-blue-50/50 rounded-2xl">
                <span className="font-bold text-xs text-blue-900">{data.city}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{data.status}</span>
                  <span className="font-black text-sm text-blue-600">{data.height}م</span>
                </div>
              </div>
            )) : <p className="text-xs text-gray-400">جاري جلب بيانات البحر...</p>}
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-emerald-50">
          <div className="flex items-center gap-2 mb-3">
            <SafeIcon icon={FiShield} className="text-emerald-600 text-xl" />
            <h4 className="font-black text-gray-800">أفضل جهات الرعي (بناءً على المطر)</h4>
          </div>
          <div className="space-y-2">
            {bestPlaces.map((place, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-emerald-50/50 rounded-2xl">
                <div>
                  <span className="font-bold text-xs text-emerald-900 block">{place.city}</span>
                  <span className="text-[8px] text-emerald-600">{place.region}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${place.status.badgeClass}`}>{place.status.level}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default RuralTools;
