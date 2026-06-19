import { useState, useEffect, useRef } from 'react';
import { getWeatherData, getAllCitiesWeather } from './weatherApi.js';
import { useWeatherContext } from './WeatherContext';

/**
 * Hook لجلب بيانات طقس مدينة واحدة.
 * يعطي الأولوية لبيانات Context المركزي لتجنب طلبات زائدة.
 */
export function useWeather(city = 'نواكشوط', coords = null, { forecastDays = 7 } = {}) {
  const context = useWeatherContext();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // إعادة تعيين عند تغيير المدينة أو الإحداثيات
    fetchedRef.current = false;
    setData(null);
    setError(null);
    setLoading(true);
  }, [city, coords?.lat, coords?.lon, forecastDays]);

  // ✅ مسار التوقعات الموسّعة (>7 أيام): جلب مستقل لا يعتمد على Context
  // لتجنّب سباق إلغاء الطلب عند تحديث Context أثناء الجلب.
  useEffect(() => {
    if (forecastDays <= 7) return;

    let active = true;
    fetchedRef.current = true; // نمنع الـ effect الأساسي من التدخل
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await getWeatherData(city, coords, { forecastDays });
        if (active) setData(result);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, coords?.lat, coords?.lon, forecastDays]);

  useEffect(() => {
    if (forecastDays > 7) return; // يتكفّل به الـ effect المخصص أعلاه
    if (fetchedRef.current) return;

    // ✅ الحالة 1: البيانات موجودة في Context (لا إحداثيات مخصصة) وعدد الأيام لا يتجاوز 7
    if (!coords && forecastDays <= 7 && context?.weatherData?.length > 0) {
      const cityData = context.weatherData.find(c => c.city === city);
      if (cityData) {
        setData(cityData);
        setLoading(false);
        fetchedRef.current = true;
        return;
      }
    }

    // ✅ الحالة 2: Context لا يزال يحمّل — انتظر حتى يكتمل (إلا عند طلب توقعات موسّعة)
    if (!coords && forecastDays <= 7 && context?.loading) {
      return;
    }

    // ✅ الحالة 2.5: الموقع الجغرافي قريب جداً من مدينة معروفة
    if (coords && context?.weatherData?.length > 0) {
      const nearest = context.weatherData.find(c => {
        // Open-Meteo يرجع latitude و longitude في البيانات
        const lat = c.latitude || c.lat; 
        const lon = c.longitude || c.lon;
        if (!lat || !lon) return false;

        const latDiff = Math.abs(lat - coords.lat);
        const lonDiff = Math.abs(lon - (coords.lon || coords.lng));
        return latDiff < 0.15 && lonDiff < 0.15;
      });

      if (nearest) {
        console.log(`📍 الموقع الجغرافي قريب من ${nearest.city}، استخدام بيانات الـ Context.`);
        setData(nearest);
        setLoading(false);
        fetchedRef.current = true;
        return;
      }
    }

    // ✅ الحالة 3: إحداثيات مخصصة، أو المدينة غير موجودة في Context بعد اكتمال تحميله
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const result = await getWeatherData(city, coords, { forecastDays });
        if (isMounted) setData(result);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => { isMounted = false; };
  }, [city, coords?.lat, coords?.lon, coords?.lng, forecastDays, context?.weatherData, context?.loading]);

  return { data, loading, error };
}

/**
 * Hook لجلب بيانات جميع المدن — يعتمد على Context المركزي.
 */
export function useAllCitiesWeather() {
  const context = useWeatherContext();
  return {
    data:    context.weatherData,
    loading: context.loading,
    error:   context.error,
    refetch: context.refreshAllData,
  };
}
