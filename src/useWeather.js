import { useState, useEffect, useCallback } from 'react';
import {
  getWeatherData,
  getAllCitiesWeather,
  getWeatherDescription,
  getWeatherIcon,
} from './weatherApi.js'

/**
 * Custom Hook لجلب بيانات الطقس مع caching
 */
export function useWeather(city = 'نواكشوط', coords = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWeather = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const weatherData = await getWeatherData(city, coords);
      setData(weatherData);
    } catch (err) {
      setError(err.message);
      console.error('خطأ في جلب الطقس:', err);
    } finally {
      setLoading(false);
    }
  }, [city, coords]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  return { data, loading, error, refetch: fetchWeather };
}

/**
 * Hook لجلب بيانات جميع المدن
 */
export function useAllCitiesWeather() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAllCities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const citiesData = await getAllCitiesWeather();
      setData(citiesData);
    } catch (err) {
      setError(err.message);
      console.error('خطأ في جلب بيانات المدن:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllCities();
  }, [fetchAllCities]);

  return { data, loading, error, refetch: fetchAllCities };
}

/**
 * فئة Cache بسيطة
 */
class WeatherCache {
  constructor(ttl = 3600000) {
    // ttl بالميلي ثانية (افتراضي: ساعة واحدة)
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  clear() {
    this.cache.clear();
  }
}

export const weatherCache = new WeatherCache();
