import React, { useEffect, useMemo, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { getActiveFires, getAllCitiesWeather, getMarineWeather } from '../weatherApi';
import { getRecentRainReports } from '../supabase';
import { getSatelliteVegetationStatus } from '../satelliteVegetation';
import RainReportForm from './RainReportForm';

const {
  FiActivity,
  FiAlertTriangle,
  FiAnchor,
  FiCloudRain,
  FiDroplet,
  FiMapPin,
  FiPlus,
  FiShield,
  FiTrendingUp,
} = FiIcons;

const bawahRegions = [
  {
    name: 'الحوض الشرقي',
    cities: ['النعمة', 'تمبدغة', 'باسكنو', 'امرج', 'ولاته', 'انبيكت لحواش'],
  },
  {
    name: 'لعصابة',
    cities: ['كيفة', 'كرو', 'كنكوصة'],
  },
  {
    name: 'اترارزة',
    cities: ['روصو', 'بوتلميت', 'اركيز', 'المذرذرة', 'كرمسين', 'واد الناقة'],
  },
  {
    name: 'كوركول',
    cities: ['كيهيدي', 'امبود', 'مونغل'],
  },
];

function getRegionWeatherScore(region, weatherData) {
  const regionWeather = weatherData.filter((item) => region.cities.includes(item.city));
  const rainChance = Math.max(
    0,
    ...regionWeather.map((item) => item.hourly?.precipitation_probability?.[0] || 0)
  );
  const rainSum = regionWeather.reduce(
    (sum, item) => sum + (item.daily?.precipitation_sum?.[0] || 0),
    0
  );
  const maxTemp = Math.max(
    0,
    ...regionWeather.map((item) => item.daily?.temperature_2m_max?.[0] || item.current?.temperature_2m || 0)
  );

  return { rainChance, rainSum, maxTemp };
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

  if (hasFireRisk) {
    return {
      level: 'خطر',
      badgeClass: 'bg-red-100 text-red-700',
      borderClass: 'border-red-100',
      advice: 'غطاء نباتي غير آمن حالياً بسبب قرب الحرائق؛ تجنب الرعي في هذه الجهة.',
      weather,
      satellite,
      verifiedRainReports,
      nearbyFires,
    };
  }

  if ((hasGoodVegetation || hasRain) && !hasHeatRisk) {
    return {
      level: 'جيد',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      borderClass: 'border-emerald-100',
      advice: 'من أفضل أماكن الرعي حالياً؛ الغطاء النباتي مرشح للتحسن بعد المطر.',
      weather,
      satellite,
      verifiedRainReports,
      nearbyFires,
    };
  }

  if (hasMediumVegetation || hasRain) {
    return {
      level: 'متوسط',
      badgeClass: 'bg-blue-100 text-blue-700',
      borderClass: 'border-blue-100',
      advice: 'مكان رعي مقبول؛ يوجد أمل في تحسن الغطاء النباتي مع الحذر من الحرارة.',
      weather,
      satellite,
      verifiedRainReports,
      nearbyFires,
    };
  }

  if (hasHeatRisk) {
    return {
      level: 'حذر',
      badgeClass: 'bg-amber-100 text-amber-700',
      borderClass: 'border-amber-100',
      advice: 'الغطاء النباتي تحت ضغط الحرارة؛ الأفضل الرعي صباحاً وقرب نقاط الماء.',
      weather,
      satellite,
      verifiedRainReports,
      nearbyFires,
    };
  }

  return {
    level: 'متوسط',
    badgeClass: 'bg-gray-100 text-gray-700',
    borderClass: 'border-gray-100',
    advice: 'غطاء نباتي متوسط؛ تابع المطر والتبشيرات قبل اختيار مكان الرعي.',
    weather,
    satellite,
    verifiedRainReports,
    nearbyFires,
  };
}

const RuralTools = () => {
  const [marineData, setMarineData] = useState([]);
  const [weatherData, setWeatherData] = useState([]);
  const [fires, setFires] = useState([]);
  const [rainReports, setRainReports] = useState([]);
  const [vegetationData, setVegetationData] = useState(null);
  const [showRainForm, setShowRainForm] = useState(false);

  useEffect(() => {
    const fetchRuralData = async () => {
      const [marine, weather, activeFires, reports, vegetation] = await Promise.all([
        getMarineWeather(),
        getAllCitiesWeather().catch(() => []),
        getActiveFires().catch(() => []),
        getRecentRainReports().catch(() => []),
        getSatelliteVegetationStatus().catch(() => null),
      ]);

      setMarineData(marine);
      setWeatherData(weather);
      setFires(activeFires);
      setRainReports(reports);
      setVegetationData(vegetation);
    };

    fetchRuralData();
    const interval = setInterval(fetchRuralData, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const bawahStatus = useMemo(
    () => bawahRegions.map((region) => ({
      ...region,
      satellite: vegetationData?.regions?.[region.name] || null,
      status: buildBawahStatus(
        { ...region, satellite: vegetationData?.regions?.[region.name] || null },
        weatherData,
        rainReports,
        fires
      ),
    })),
    [weatherData, rainReports, fires, vegetationData]
  );

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
              <div key={idx} className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-bold">{data.city}:</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  data.height > 1.5 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {data.status} - {data.height}م
                </span>
              </div>
            )) : (
              <p className="text-[10px] text-gray-400 italic">جاري جلب بيانات البحر...</p>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-emerald-50">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <SafeIcon icon={FiActivity} className="text-emerald-600 text-xl" />
              <div>
                <h4 className="font-black text-gray-800">البواه</h4>
                <p className="text-[10px] text-gray-500 font-bold">الغطاء النباتي وأفضل أماكن رعي الحيوان</p>
              </div>
            </div>
            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full text-[10px] font-black">
              أقمار صناعية
            </span>
          </div>
          <div className="mb-3 rounded-2xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-[10px] text-emerald-800 font-bold leading-relaxed">
            {vegetationData
              ? `النتائج مستخلصة من ${vegetationData.source} بتاريخ ${vegetationData.date}.`
              : 'جاري جلب بيانات الغطاء النباتي من صور الأقمار الصناعية المجانية...'}
          </div>

          <div className="space-y-3">
            {bawahStatus.map((region) => (
              <div key={region.name} className={`rounded-2xl border ${region.status.borderClass} bg-gray-50/70 p-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <SafeIcon icon={FiMapPin} className="text-emerald-600 text-sm" />
                      <span className="font-black text-sm text-gray-900">{region.name}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{region.status.advice}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black whitespace-nowrap ${region.status.badgeClass}`}>
                    {region.status.level}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-3 text-[10px]">
                  <div className="bg-white rounded-xl p-2 border border-gray-100">
                    <div className="flex items-center gap-1 text-emerald-700 font-bold">
                      <SafeIcon icon={FiActivity} />
                      النبات
                    </div>
                    <p className="text-gray-600 mt-1">
                      {region.status.satellite
                        ? region.status.satellite.label.replace('غطاء نباتي ', '')
                        : 'ينتظر'}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-gray-100">
                    <div className="flex items-center gap-1 text-blue-700 font-bold">
                      <SafeIcon icon={FiDroplet} />
                      المطر
                    </div>
                    <p className="text-gray-600 mt-1">{Math.round(region.status.weather.rainChance)}%</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-gray-100">
                    <div className="flex items-center gap-1 text-amber-700 font-bold">
                      <SafeIcon icon={FiTrendingUp} />
                      الحرارة
                    </div>
                    <p className="text-gray-600 mt-1">{Math.round(region.status.weather.maxTemp)}°</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-gray-100">
                    <div className="flex items-center gap-1 text-red-700 font-bold">
                      <SafeIcon icon={FiAlertTriangle} />
                      خطر الحريق
                    </div>
                    <p className="text-gray-600 mt-1">{region.status.nearbyFires.length}</p>
                  </div>
                </div>

                {region.status.satellite && (
                  <div className="mt-2 bg-white rounded-xl px-3 py-2 text-[10px] text-gray-600 border border-gray-100">
                    NDVI: {region.status.satellite.ndvi?.toFixed(2)} - {region.status.satellite.label}
                  </div>
                )}

                {region.status.verifiedRainReports.length > 0 && (
                  <div className="mt-2 bg-emerald-50 text-emerald-800 rounded-xl px-3 py-2 text-[10px] font-bold flex items-center gap-1">
                    <SafeIcon icon={FiShield} />
                    آخر مطر موثق: {region.status.verifiedRainReports.length} تبشيرة
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RuralTools;
