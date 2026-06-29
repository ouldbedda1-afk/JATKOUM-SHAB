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
    if (forecastDays > 7) return;

    const hasFreshData = fetchedRef.current === 'fresh';

    // ✅ الحالة 1: البيانات موجودة في Context بدون إحداثيات — فقط إذا لم تكن fallback
    if (!coords && context?.weatherData?.length > 0) {
      const cityData = context.weatherData.find(c => c.city === city);
      if (cityData && !cityData.isFallback) {
        setData(cityData);
        setLoading(false);
        fetchedRef.current = 'fresh';
        return;
      }
    }

    // ✅ الحالة 2: انتظر انتهاء Context قبل الجلب المستقل
    if (context?.loading) return;

    // ✅ الحالة 2.5: الموقع الجغرافي قريب من مدينة معروفة في Context
    if (coords && context?.weatherData?.length > 0) {
      let nearest = null, bestDist = Infinity;
      context.weatherData.forEach(c => {
        const lat = c.latitude || c.lat;
        const lon = c.longitude || c.lon;
        if (!lat || !lon) return;
        const d = Math.abs(lat - coords.lat) + Math.abs(lon - (coords.lon || coords.lng));
        if (d < bestDist) { bestDist = d; nearest = c; }
      });
      if (nearest && bestDist < 0.5 && !nearest.isFallback) {
        setData(nearest);
        setLoading(false);
        fetchedRef.current = 'fresh';
        return;
      }
    }

    // ✅ الحالة 3: جلب مستقل — مرة واحدة فقط (منع إعادة الدخول)
    if (hasFreshData || fetchedRef.current === true) return;
    fetchedRef.current = true;

    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const result = await getWeatherData(city, coords, { forecastDays, bypassCircuit: true });
        if (isMounted) {
          setData(result);
          if (!result?.isFallback) {
            fetchedRef.current = 'fresh';
          } else {
            // إذا رجع fallback، اسمح بإعادة المحاولة لاحقاً
            fetchedRef.current = false;
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          // اسمح بإعادة المحاولة عند الخطأ
          fetchedRef.current = false;
        }
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
