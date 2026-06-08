import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { getAllCitiesWeather, getActiveFires, getMarineWeather, clearWeatherCache } from './weatherApi';
import { getRecentRainReports, getRecentBawahReports, getUpcomingRainForecasts } from './supabase';
import { getSatelliteVegetationStatus } from './satelliteVegetation';

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
  const [vegetationData,   setVegetationData]   = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [lastUpdated,      setLastUpdated]      = useState(null);
  const [error,            setError]            = useState(null);

  // ✅ نستخدم ref لمنع تشغيل refreshAllData أكثر من مرة في وقت واحد
  const isFetchingRef = useRef(false);

  const refreshAllData = async (force = false) => {
    // إذا كان هناك جلب جارٍ بالفعل، لا نبدأ جلباً جديداً
    if (isFetchingRef.current && !force) {
      console.log('⏳ جلب البيانات جارٍ بالفعل، تخطي الطلب المكرر...');
      return;
    }

    isFetchingRef.current = true;

    try {
      console.log('🔄 جلب البيانات المركزية...');

      // ✅ جلب كل البيانات دفعةً واحدة — weatherApi.js يتكفل بالـ cache ومنع التكرار
      const [weather, activeFires, marine, reports, fieldBawahReports, vegetation, forecasts] = await Promise.all([
        getAllCitiesWeather().catch(e => { console.error('weather:', e); return []; }),
        getActiveFires().catch(e  => { console.error('fires:',   e); return []; }),
        getMarineWeather().catch(e => { console.error('marine:',  e); return []; }),
        getRecentRainReports().catch(e  => { console.error('rain:',  e); return []; }),
        getRecentBawahReports().catch(e => { console.error('bawah:', e); return []; }),
        getSatelliteVegetationStatus().catch(e => { console.error('veg:', e); return null; }),
        getUpcomingRainForecasts().catch(e => { console.error('forecasts:', e); return []; }),
      ]);

      setWeatherData(weather   || []);
      setFires(activeFires     || []);
      setMarineData(marine     || []);
      setRainReports(reports   || []);
      setBawahReports(fieldBawahReports || []);
      setVegetationData(vegetation);
      setRainForecasts(forecasts || []);
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

  useEffect(() => {
    // ✅ جلب أول مرة فقط عند التحميل
    refreshAllData();

    // ✅ تحديث كل 20 دقيقة (مزامنة مع مدة الـ cache في weatherApi.js)
    const interval = setInterval(() => refreshAllData(true), 20 * 60 * 1000);
    return () => clearInterval(interval);

    // ✅ [] يضمن أن useEffect لا يُشغَّل إلا مرة واحدة عند التحميل
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    weatherData,
    fires,
    marineData,
    rainReports,
    bawahReports,
    rainForecasts,
    vegetationData,
    loading,
    lastUpdated,
    error,
    refreshAllData,
    clearCache: () => {
      clearWeatherCache();
      refreshAllData(true);
    }
  }), [
    weatherData, fires, marineData,
    rainReports, bawahReports, rainForecasts, vegetationData,
    loading, lastUpdated, error,
  ]);

  return (
    <WeatherContext.Provider value={value}>
      {children}
    </WeatherContext.Provider>
  );
};
