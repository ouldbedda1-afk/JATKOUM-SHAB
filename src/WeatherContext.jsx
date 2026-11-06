import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { getAllCitiesWeather, fetchExtraCommunesBatch, getActiveFires, getMarineWeather, clearWeatherCache, getModelRainingNow } from './weatherApi';
import { getRecentRainReports, getRecentBawahReports, getUpcomingRainForecasts, getActiveAlerts, getApprovedNews, getWeatherBulletins } from './supabase';
import { getRainingNowFromSatellite, getSameDayHeavyRainEventsFromSatellite, getRainingNowFromIMERG } from './satelliteRain';
import { MAURITANIA_RADAR_GRID } from './mauritaniaRadarGrid';
import { startLightning, subscribeLightning } from './lightningBlitzortung';
import { updateTracks, clearTracks, removeTrack } from './cellTracking';
import { getDeepCloudsFromEumetsat } from './satelliteCloudsEU';
import { getEcmwfBriefs } from './ecmwfBriefs';

const WeatherContext = createContext(null);

export const useWeatherContext = () => {
  const context = useContext(WeatherContext);
  if (!context) throw new Error('useWeatherContext must be used within a WeatherProvider');
  return context;
};

export const WeatherProvider = ({ children }) => {
  const [weatherData,      setWeatherData]      = useState([]);
  const [fires,            setFires]            = useState([]);
  const [marineData,       setMarineData]       = useState([]);
  const [rainReports,      setRainReports]      = useState([]);
  const [bawahReports,     setBawahReports]     = useState([]);
  const [rainForecasts,    setRainForecasts]    = useState([]);
  const [manualAlerts,      setManualAlerts]      = useState([]);
  const [approvedNews,      setApprovedNews]      = useState([]);
  const [weatherBulletins,  setWeatherBulletins]  = useState([]);
  const [ecmwfBriefs,      setEcmwfBriefs]      = useState([]);
  const [rainingNow,       setRainingNow]       = useState([]);
  const [sameDayRainEvents, setSameDayRainEvents] = useState([]);
  const [trackedCells,     setTrackedCells]     = useState([]);
  const [stormClouds,      setStormClouds]      = useState([]);
  const [stormCloudsUpdatedAt, setStormCloudsUpdatedAt] = useState(null);
  const [lightningStrikes, setLightningStrikes] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [lastUpdated,      setLastUpdated]      = useState(null);
  const [error,            setError]            = useState(null);

  // ✅ نستخدم ref لمنع تشغيل refreshAllData أكثر من مرة في وقت واحد
  const isFetchingRef = useRef(false);
  // ✅ تتبع رؤية الصفحة لإيقاف التحديثات عندما التبويب غير نشط
  const isPageVisibleRef = useRef(true);
  // ✅ تتبع الـ interval ID للتنظيف
  const intervalRef = useRef(null);

  const refreshAllData = async (force = false) => {
    // إذا كانت الصفحة غير مرئية، لا نجلب بيانات جديدة (نحافظ على الموارد)
    if (!isPageVisibleRef.current && !force) {
      console.log('👁️ الصفحة غير مرئية، تخطي التحديث...');
      return;
    }

    // إذا كان هناك جلب جارٍ بالفعل، لا نبدأ جلباً جديداً
    if (isFetchingRef.current && !force) {
      console.log('⏳ جلب البيانات جارٍ بالفعل، تخطي الطلب المكرر...');
      return;
    }

    isFetchingRef.current = true;

    try {
      console.log('🔄 جلب البيانات المركزية...');

      // ✅ كل مصدر يظهر حين يصل: الطقس لا ينتظر أبطأ المصادر (حرائق ناسا تستغرق ثوانيَ أحياناً)
      // — weatherApi.js يتكفل بالـ cache ومنع التكرار
      const side = (promise, set, label) =>
        promise.then((v) => set(v || [])).catch((e) => { console.error(label, e); set([]); });
      const sideSources = Promise.allSettled([
        side(getActiveFires(), setFires, 'fires:'),
        side(getMarineWeather(), setMarineData, 'marine:'),
        side(getRecentRainReports(), setRainReports, 'rain:'),
        side(getRecentBawahReports(), setBawahReports, 'bawah:'),
        side(getUpcomingRainForecasts(), setRainForecasts, 'forecasts:'),
        side(getActiveAlerts(), setManualAlerts, 'alerts:'),
        side(getEcmwfBriefs(), setEcmwfBriefs, 'ecmwf:'),
        side(getApprovedNews(), setApprovedNews, 'news:'),
        side(getWeatherBulletins(), setWeatherBulletins, 'bulletins:'),
      ]);

      const weather = await getAllCitiesWeather().catch(e => { console.error('weather:', e); return []; });
      setWeatherData(weather || []);
      setLoading(false);

      // جلب دفعة دوّارة من البلديات الإضافية في الخلفية (بعد تحميل البيانات الأساسية)
      setTimeout(() => {
        fetchExtraCommunesBatch((extraCities) => {
          setWeatherData(prev => {
            const prevNames = new Set(prev.map(c => c.city));
            const newEntries = extraCities.filter(c => !prevNames.has(c.city));
            return newEntries.length > 0 ? [...prev, ...newEntries] : prev;
          });
        });
      }, 3000);

      // ☁️ الرصد الجديد فقط: قمم سحب Meteosat IR (EUMETSAT) — على البلديات (أسماء وولايات صحيحة)
      if (weather && weather.length > 0) {
        getDeepCloudsFromEumetsat(weather)
          .then((clouds) => {
            // التتبع في المتصفح وحده؛ لا يُحفظ في قاعدة البيانات
            setStormClouds(clouds || []);
            setStormCloudsUpdatedAt(new Date());
            try {
              const { active } = updateTracks(clouds || []);
              setTrackedCells(active);
            } catch (e) { console.warn('storm tracking:', e); }
          })
          .catch((e) => {
            console.warn('🛰️ Meteosat clouds:', e);
            setStormClouds([]);
            setTrackedCells([]);
          });
      } else {
        setStormClouds([]);
        setTrackedCells([]);
      }
      await sideSources;
      setLastUpdated(new Date());
      setError(null);
      console.log('✅ تم تحديث البيانات المركزية بنجاح');
    } catch (err) {
      console.error('❌ خطأ في تحديث البيانات المركزية:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  // ⚡ كشف الصواعق الحقيقي (Blitzortung)
  useEffect(() => {
    startLightning();
    const unsub = subscribeLightning((s) => setLightningStrikes(s));
    return () => unsub();
  }, []);


  useEffect(() => {
    // ✅ جلب أول مرة فقط عند التحميل
    refreshAllData();

    // ✅ تحديث كل 5 دقائق لضمان رصد العواصف والبرق والرياح لحظة بلحظة
    intervalRef.current = setInterval(() => refreshAllData(true), 5 * 60 * 1000);

    // ✅ استماع لتغير رؤية الصفحة (Page Visibility API)
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      isPageVisibleRef.current = isVisible;
      console.log(`👁️ Page visibility: ${isVisible ? 'visible' : 'hidden'}`);
      
      // إذا عاد التبويب للنشاط، جلب فوري (مع تأخير قصير لإعطاء المتصفح وقت للاستقرار)
      if (isVisible) {
        setTimeout(() => refreshAllData(true), 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ✅ استماع للاتصال بالإنترنت (إعادة جلب عند استعادة الاتصال)
    const handleOnline = () => {
      console.log('📡 الاتصال بالإنترنت عاد — جلب بيانات جديدة...');
      refreshAllData(true);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };

    // ✅ [] يضمن أن useEffect لا يُشغَّل إلا مرة واحدة عند التحميل
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (مُعطّل) الرصد القديم بالنموذج — نعتمد Meteosat IR وحده الآن
  const modelRainingNow = useMemo(() => [], []);

  const value = useMemo(() => ({
    weatherData,
    fires,
    marineData,
    rainReports,
    bawahReports,
    rainForecasts,
    manualAlerts,
    approvedNews,
    ecmwfBriefs,
    weatherBulletins,
    rainingNow,
    modelRainingNow,
    sameDayRainEvents,
    trackedCells,
    stormClouds,
    stormCloudsUpdatedAt,
    lightningStrikes,
    loading,
    lastUpdated,
    error,
    refreshAllData,
    clearCache: () => {
      clearWeatherCache();
      refreshAllData(true);
    },
    clearStormAlerts: () => {
      clearTracks();
      setTrackedCells([]);
      setStormClouds([]);
      setStormCloudsUpdatedAt(null);
    },
    removeStormCell: (id) => {
      removeTrack(id);
      setTrackedCells((prev) => prev.filter((t) => t.id !== id));
    }
  }), [
    weatherData, fires, marineData,
    rainReports, bawahReports, rainForecasts, manualAlerts, approvedNews, ecmwfBriefs,
    weatherBulletins, rainingNow, modelRainingNow, sameDayRainEvents, trackedCells, stormClouds, stormCloudsUpdatedAt, lightningStrikes, loading, lastUpdated, error,
  ]);

  return (
    <WeatherContext.Provider value={value}>
      {children}
    </WeatherContext.Provider>
  );
};
