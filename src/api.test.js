import { describe, it, expect, beforeAll } from 'vitest';
import { 
  getWeatherData,
  getAllCitiesWeather,
  searchCities,
  getWeatherDescription,
  getWeatherIcon,
} from './weatherApi';

/**
 * اختبارات شاملة للـ APIs
 */

describe('🌍 Open-Meteo API Tests', () => {
  
  describe('✅ getWeatherData - جلب بيانات الطقس', () => {
    it('يجب أن يجلب بيانات الطقس لنواكشوط', async () => {
      const data = await getWeatherData('نواكشوط');
      
      // التحقق من البنية الأساسية
      expect(data).toBeDefined();
      expect(data.city).toBe('نواكشوط');
      expect(data.cityEn).toBe('Nouakchott');
      expect(data.current).toBeDefined();
      expect(data.hourly).toBeDefined();
      expect(data.daily).toBeDefined();
    });

    it('يجب أن تحتوي البيانات الحالية على temperature_2m', async () => {
      const data = await getWeatherData('نواكشوط');
      expect(data.current.temperature_2m).toBeDefined();
      expect(typeof data.current.temperature_2m).toBe('number');
    });

    it('يجب أن تحتوي البيانات الحالية على weather_code', async () => {
      const data = await getWeatherData('نواكشوط');
      expect(data.current.weather_code).toBeDefined();
      expect(typeof data.current.weather_code).toBe('number');
    });

    it('يجب أن تحتوي البيانات الحالية على wind_speed_10m', async () => {
      const data = await getWeatherData('نواكشوط');
      expect(data.current.wind_speed_10m).toBeDefined();
      expect(typeof data.current.wind_speed_10m).toBe('number');
    });

    it('يجب أن تحتوي البيانات الحالية على relative_humidity_2m', async () => {
      const data = await getWeatherData('نواكشوط');
      expect(data.current.relative_humidity_2m).toBeDefined();
      expect(typeof data.current.relative_humidity_2m).toBe('number');
    });

    it('يجب أن تحتوي البيانات الحالية على pressure_msl', async () => {
      const data = await getWeatherData('نواكشوط');
      expect(data.current.pressure_msl).toBeDefined();
      expect(typeof data.current.pressure_msl).toBe('number');
    });

    it('يجب أن تحتوي البيانات الهورية على time و temperature_2m', async () => {
      const data = await getWeatherData('نواكشوط');
      expect(data.hourly.time).toBeDefined();
      expect(Array.isArray(data.hourly.time)).toBe(true);
      expect(data.hourly.temperature_2m).toBeDefined();
      expect(Array.isArray(data.hourly.temperature_2m)).toBe(true);
      expect(data.hourly.time.length).toBeGreaterThan(0);
    });

    it('يجب أن تحتوي البيانات الهورية على precipitation_probability', async () => {
      const data = await getWeatherData('نواكشوط');
      expect(data.hourly.precipitation_probability).toBeDefined();
      expect(Array.isArray(data.hourly.precipitation_probability)).toBe(true);
    });

    it('يجب أن تحتوي البيانات اليومية على جميع المعاملات المطلوبة', async () => {
      const data = await getWeatherData('نواكشوط');
      expect(data.daily.time).toBeDefined();
      expect(data.daily.weather_code).toBeDefined();
      expect(data.daily.temperature_2m_max).toBeDefined();
      expect(data.daily.temperature_2m_min).toBeDefined();
      expect(data.daily.precipitation_sum).toBeDefined();
      expect(data.daily.wind_speed_10m_max).toBeDefined();
    });

    it('يجب أن ترفع خطأ للمدن غير المعروفة', async () => {
      try {
        await getWeatherData('مدينة غير موجودة');
        expect(true).toBe(false); // لا يجب الوصول هنا
      } catch (error) {
        expect(error.message).toContain('غير معروفة');
      }
    });
  });

  describe('📍 getAllCitiesWeather - جلب بيانات جميع المدن', () => {
    it('يجب أن يجلب بيانات جميع المدن الموريتانية', async () => {
      const data = await getAllCitiesWeather();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('يجب أن تحتوي كل مدينة على البيانات الكاملة', async () => {
      const data = await getAllCitiesWeather();
      for (const city of data) {
        expect(city.city).toBeDefined();
        expect(city.current).toBeDefined();
        expect(city.current.temperature_2m).toBeDefined();
      }
    });
  });

  describe('🔍 searchCities - البحث عن المدن', () => {
    it('يجب أن يرجع مصفوفة فارغة للاستعلامات القصيرة', async () => {
      const result = await searchCities('ن');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('يجب أن يجد المدن التي تحتوي على الاستعلام', async () => {
      const result = await searchCities('نوا');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('يجب أن يرجع نتائج تحتوي على اسم وإحداثيات', async () => {
      const result = await searchCities('نوا');
      expect(result[0].name).toBeDefined();
      expect(result[0].lat).toBeDefined();
      expect(result[0].lon).toBeDefined();
    });
  });

  describe('🌦️ getWeatherDescription - وصف الطقس', () => {
    it('يجب أن يرجع وصف صحيح للطقس الصافي', () => {
      expect(getWeatherDescription(0)).toBe('صافي');
    });

    it('يجب أن يرجع وصف صحيح للمطر', () => {
      expect(getWeatherDescription(61)).toBe('مطر خفيف');
    });

    it('يجب أن يرجع وصف صحيح للثلج', () => {
      expect(getWeatherDescription(71)).toBe('ثلج خفيف');
    });

    it('يجب أن يرجع "غير معروف" للأكواد غير المعروفة', () => {
      expect(getWeatherDescription(999)).toBe('غير معروف');
    });
  });

  describe('😊 getWeatherIcon - أيقونة الطقس', () => {
    it('يجب أن يرجع أيقونة صحيحة للطقس الصافي', () => {
      expect(getWeatherIcon(0)).toBe('☀️');
    });

    it('يجب أن يرجع أيقونة صحيحة للغيوم', () => {
      expect(getWeatherIcon(3)).toBe('☁️');
    });

    it('يجب أن يرجع أيقونة صحيحة للمطر', () => {
      expect(getWeatherIcon(61)).toBe('🌧️');
    });

    it('يجب أن يرجع أيقونة صحيحة للثلج', () => {
      expect(getWeatherIcon(71)).toBe('❄️');
    });

    it('يجب أن يرجع أيقونة صحيحة للعواصف الرعدية', () => {
      expect(getWeatherIcon(95)).toBe('⛈️');
    });
  });
});

/**
 * اختبارات Supabase
 */
describe('🗄️ Supabase Connection Tests', () => {
  
  it('يجب أن تكون الدوال المتوقعة معرفة', () => {
    // نتحقق من وجود الدوال في الملف
    const supabaseModule = require('./supabase.js');
    expect(supabaseModule.testConnection).toBeDefined();
    expect(supabaseModule.addFavoriteCity).toBeDefined();
    expect(supabaseModule.getFavoriteCities).toBeDefined();
    expect(supabaseModule.removeFavoriteCity).toBeDefined();
    expect(supabaseModule.addSearchHistory).toBeDefined();
    expect(supabaseModule.getSearchHistory).toBeDefined();
    expect(supabaseModule.getActiveAlerts).toBeDefined();
  });

  it('يجب أن يكون العميل مهيأ بشكل صحيح', () => {
    const supabaseModule = require('./supabase.js');
    expect(supabaseModule.supabase).toBeDefined();
  });
});
