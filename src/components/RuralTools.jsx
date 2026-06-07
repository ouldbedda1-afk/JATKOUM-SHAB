import React, { useEffect, useMemo, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { getActiveFires, getAllCitiesWeather, getMarineWeather } from '../weatherApi';
import { getRecentBawahReports, getRecentRainReports } from '../supabase';
import { getSatelliteVegetationStatus } from '../satelliteVegetation';
import RainReportForm from './RainReportForm';
import BawahReportForm from './BawahReportForm';

const {
  FiActivity,
  FiAlertTriangle,
  FiAnchor,
  FiCamera,
  FiCloud,
  FiCloudRain,
  FiDroplet,
  FiMap,
  FiMapPin,
  FiPlus,
  FiShield,
  FiTrendingDown,
  FiTrendingUp,
} = FiIcons;

const bawahRegions = [
  {
    name: 'الحوض الشرقي',
    cities: ['النعمة', 'تمبدغة', 'باسكنو', 'امرج', 'ولاته', 'انبيكت لحواش'],
    mapClass: 'top-[42%] right-[18%] w-24 h-20',
  },
  {
    name: 'لعصابة',
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

function getTrendIcon(trend) {
  if (trend === 'تحسنت') return FiTrendingUp;
  if (trend === 'تراجعت') return FiTrendingDown;
  return FiActivity;
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
  const [marineData, setMarineData] = useState([]);
  const [weatherData, setWeatherData] = useState([]);
  const [fires, setFires] = useState([]);
  const [rainReports, setRainReports] = useState([]);
  const [bawahReports, setBawahReports] = useState([]);
  const [vegetationData, setVegetationData] = useState(null);
  const [showRainForm, setShowRainForm] = useState(false);
  const [showBawahForm, setShowBawahForm] = useState(false);

  useEffect(() => {
    const fetchRuralData = async () => {
      const [marine, weather, activeFires, reports, vegetation, fieldBawahReports] = await Promise.all([
        getMarineWeather(),
        getAllCitiesWeather().catch(() => []),
        getActiveFires().catch(() => []),
        getRecentRainReports().catch(() => []),
        getSatelliteVegetationStatus().catch(() => null),
        getRecentBawahReports().catch(() => []),
      ]);

      setMarineData(marine);
      setWeatherData(weather);
      setFires(activeFires);
      setRainReports(reports);
      setVegetationData(vegetation);
      setBawahReports(fieldBawahReports);
    };

    fetchRuralData();
    const interval = setInterval(fetchRuralData, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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

  const cloudImprovementAlerts = bawahStatus.filter((region) => {
    const weakVegetation = (region.status.satellite?.score ?? 0) <= 1;
    return weakVegetation && (region.status.weather.hasClouds || region.status.weather.rainChance >= 20);
  });

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
      {showBawahForm && <BawahReportForm onClose={() => setShowBawahForm(false)} />}

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
            <button
              onClick={() => setShowBawahForm(true)}
              className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1"
            >
              <SafeIcon icon={FiCamera} />
              أبلغ
            </button>
          </div>

          <div className="mb-3 rounded-2xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-[10px] text-emerald-800 font-bold leading-relaxed">
            {vegetationData
              ? `النتائج مستخلصة من ${vegetationData.source} بتاريخ ${vegetationData.date}.`
              : 'جاري جلب بيانات الغطاء النباتي من صور الأقمار الصناعية المجانية...'}
          </div>

          {cloudImprovementAlerts.length > 0 && (
            <div className="mb-3 rounded-2xl bg-blue-50 border border-blue-100 px-3 py-2 text-[10px] text-blue-800 font-bold flex gap-2">
              <SafeIcon icon={FiCloud} className="text-blue-600 shrink-0 mt-0.5" />
              تحسن متوقع في البواه خلال الأيام القادمة قرب: {cloudImprovementAlerts.map((region) => region.name).join('، ')}.
            </div>
          )}

          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-black text-gray-800">
                <SafeIcon icon={FiMap} className="text-emerald-600" />
                خريطة البواه
              </div>
              <div className="flex gap-2 text-[9px] font-bold text-gray-500">
                <span>أخضر جيد</span>
                <span>أصفر متوسط</span>
                <span>أحمر خطر</span>
              </div>
            </div>
            <div className="relative h-56 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden border border-white">
              <div className="absolute inset-x-[18%] top-[8%] bottom-[8%] rounded-[45%] border-2 border-dashed border-slate-300 bg-white/40"></div>
              {bawahStatus.map((region) => (
                <div
                  key={region.name}
                  className={`absolute ${region.mapClass} rounded-[45%] border-2 ${getMapColor(region.status)} text-white shadow-md flex items-center justify-center text-[10px] font-black text-center px-1`}
                  title={region.status.level}
                >
                  {region.name}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 p-3 mb-3">
            <h5 className="text-xs font-black text-gray-800 mb-2">أفضل 5 أماكن للرعي اليوم</h5>
            <div className="space-y-2">
              {bestPlaces.map((place, index) => (
                <div key={`${place.region}-${place.city}`} className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-700">{index + 1}. {place.city}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${place.status.badgeClass}`}>
                    {place.status.level}
                  </span>
                </div>
              ))}
            </div>
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
                      {region.status.satellite ? region.status.satellite.label.replace('غطاء نباتي ', '') : 'ينتظر'}
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
                      الحريق
                    </div>
                    <p className="text-gray-600 mt-1">{region.status.nearbyFires.length}</p>
                  </div>
                </div>

                {region.status.satellite && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white rounded-xl px-3 py-2 text-gray-600 border border-gray-100">
                      NDVI: {region.status.satellite.ndvi?.toFixed(2)}
                    </div>
                    <div className="bg-white rounded-xl px-3 py-2 text-gray-600 border border-gray-100 flex items-center gap-1">
                      <SafeIcon icon={getTrendIcon(region.status.satellite.trend)} />
                      {region.status.satellite.trend}
                    </div>
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

          {bawahReports.length > 0 && (
            <div className="mt-3 rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
              <h5 className="text-xs font-black text-emerald-900 mb-2">بلاغات المنمين الحديثة</h5>
              <div className="space-y-1">
                {bawahReports.slice(0, 3).map((report) => (
                  <div key={report.id || report.created_at} className="text-[10px] text-emerald-800 font-bold">
                    {report.region || 'منطقة غير محددة'} - {report.notes || 'بواه جيدة مرسلة بصورة'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RuralTools;
