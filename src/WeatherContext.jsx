import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { getAllCitiesWeather, fetchExtraCommunesBatch, getActiveFires, getMarineWeather, clearWeatherCache, getModelRainingNow } from './weatherApi';
import { getRecentRainReports, getRecentBawahReports, getUpcomingRainForecasts, getActiveAlerts, getApprovedNews, getWeatherBulletins, syncStormCells, getRemoteSuppressions, getStormCells, supabase as supabaseClient } from './supabase';
import { getSatelliteVegetationStatus } from './satelliteVegetation';
import { getRainingNowFromSatellite, getSameDayHeavyRainEventsFromSatellite, getRainingNowFromIMERG } from './satelliteRain';
import { MAURITANIA_RADAR_GRID } from './mauritaniaRadarGrid';
import { startLightning, subscribeLightning } from './lightningBlitzortung';
import { updateTracks, clearTracks, removeTrack, suppressCell, seedTracks } from './cellTracking';
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
  const [vegetationData,   setVegetationData]   = useState(null);
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

      // ✅ جلب كل البيانات دفعةً واحدة — weatherApi.js يتكفل بالـ cache ومنع التكرار
      const [weather, activeFires, marine, reports, fieldBawahReports, vegetation, forecasts, alerts, ecmwf, news, bulletins] = await Promise.all([
        getAllCitiesWeather().catch(e => { console.error('weather:', e); return []; }),
        getActiveFires().catch(e  => { console.error('fires:',   e); return []; }),
        getMarineWeather().catch(e => { console.error('marine:',  e); return []; }),
        getRecentRainReports().catch(e  => { console.error('rain:',  e); return []; }),
        getRecentBawahReports().catch(e => { console.error('bawah:', e); return []; }),
        getSatelliteVegetationStatus().catch(e => { console.error('veg:', e); return null; }),
        getUpcomingRainForecasts().catch(e => { console.error('forecasts:', e); return []; }),
        getActiveAlerts().catch(e => { console.error('alerts:', e); return []; }),
        getEcmwfBriefs().catch(e => { console.error('ecmwf:', e); return []; }),
        getApprovedNews().catch(e => { console.error('news:', e); return []; }),
        getWeatherBulletins().catch(e => { console.error('bulletins:', e); return []; }),
      ]);

      setWeatherData(weather   || []);
      setFires(activeFires     || []);
      setMarineData(marine     || []);
      setRainReports(reports   || []);
      setBawahReports(fieldBawahReports || []);
      setVegetationData(vegetation);
      setRainForecasts(forecasts || []);
      setManualAlerts(alerts || []);
      setEcmwfBriefs(ecmwf || []);
      setApprovedNews(news || []);
      setWeatherBulletins(bulletins || []);

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
          .then(async (clouds) => {
            try {
              // 1. استعد firstSeen الأصلي من DB (يحل مشكلة إعادة التحميل)
              const dbCells = await getStormCells();
              seedTracks(dbCells);
              // 2. طبّق الإخماد البعيد قبل التتبع
              const remote = await getRemoteSuppressions();
              remote.forEach((s) => suppressCell(s.lat, s.lon,
                (new Date(s.suppressed_until).getTime() - Date.now()) / 3600000));
            } catch { /* تجاهل */ }

            setStormClouds(clouds || []);
            setStormCloudsUpdatedAt(new Date());
            try {
              const { active } = updateTracks(clouds || []);
              setTrackedCells(active);
              syncStormCells(active).catch(() => {});
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

  // 📡 Realtime: استقبال إخماد العواصف من Telegram فوراً
  useEffect(() => {
    if (!supabaseClient) return;
    const channel = supabaseClient
      .channel('storm-suppressions-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'storm_suppressions' },
        (payload) => {
          const { lat, lon, suppressed_until } = payload.new;
          const hoursLeft = (new Date(suppressed_until).getTime() - Date.now()) / 3600000;
          if (hoursLeft > 0) {
            suppressCell(lat, lon, hoursLeft);
            // احذف الخلايا المتأثرة من الحالة فوراً
            setTrackedCells((prev) => {
              const filtered = prev.filter((t) => {
                const d = Math.sqrt((t.lat - lat) ** 2 + (t.lon - lon) ** 2) * 111;
                return d > 85;
              });
              if (filtered.length !== prev.length) {
                syncStormCells(filtered).catch(() => {});
              }
              return filtered;
            });
          }
        }
      )
      .subscribe();
    return () => { supabaseClient.removeChannel(channel); };
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
    vegetationData,
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
    rainReports, bawahReports, rainForecasts, manualAlerts, approvedNews, ecmwfBriefs, vegetationData,
    weatherBulletins, rainingNow, modelRainingNow, sameDayRainEvents, trackedCells, stormClouds, stormCloudsUpdatedAt, lightningStrikes, loading, lastUpdated, error,
  ]);

  return (
    <WeatherContext.Provider value={value}>
      {children}
    </WeatherContext.Provider>
  );
};
