/**
 * Weather API Service - Open-Meteo
 * مجاني وبدون مفتاح API
 */

const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';

// Mauritanian cities coordinates (Wilayas and main Moughataas)
const mauritanianCities = {
  'نواكشوط': { lat: 18.0735, lon: -15.9582, name: 'Nouakchott', type: 'ولاية' },
  'نواذيبو': { lat: 20.9375, lon: -17.0339, name: 'Nouadhibou', type: 'ولاية' },
  'روصو': { lat: 17.5333, lon: -14.3333, name: 'Rosso', type: 'ولاية' },
  'كيهيدي': { lat: 16.15, lon: -13.50, name: 'Kaédi', type: 'ولاية' },
  'ألاك': { lat: 17.05, lon: -13.91, name: 'Aleg', type: 'ولاية' },
  'كيفة': { lat: 16.61, lon: -11.40, name: 'Kiffa', type: 'ولاية' },
  'لعيون': { lat: 16.66, lon: -9.61, name: 'Aioun', type: 'ولاية' },
  'النعمة': { lat: 16.61, lon: -7.25, name: 'Nema', type: 'مقاطعة' },
  'تجكجة': { lat: 18.55, lon: -11.43, name: 'Tidjikja', type: 'ولاية' },
  'أطار': { lat: 20.51, lon: -13.05, name: 'Atar', type: 'ولاية' },
  'أكجوجت': { lat: 19.75, lon: -14.41, name: 'Akjoujt', type: 'ولاية' },
  'زويرات': { lat: 22.71, lon: -12.47, name: 'Zouérat', type: 'ولاية' },
  'سيلبابي': { lat: 15.15, lon: -12.18, name: 'Sélibaby', type: 'مقاطعة' },
  'بوتلميت': { lat: 17.51, lon: -14.76, name: 'Boutilimit', type: 'مقاطعة' },
  'بوكي': { lat: 16.58, lon: -14.26, name: 'Boghé', type: 'مقاطعة' },
  'الطينطان': { lat: 16.39, lon: -10.16, name: 'Tintane', type: 'مقاطعة' },
  'مقطع لحجار': { lat: 17.50, lon: -13.08, name: 'Magta Lahjar', type: 'مقاطعة' },
  'كرو': { lat: 16.81, lon: -11.83, name: 'Guerou', type: 'مقاطعة' },
  'تمبدغة': { lat: 16.2421, lon: -8.1721, name: 'Timbedra', type: 'مقاطعة' },
  'شنقيط': { lat: 20.45, lon: -12.35, name: 'Chinguetti', type: 'مقاطعة' },
  'وادان': { lat: 20.93, lon: -11.61, name: 'Ouadane', type: 'مقاطعة' },
  'بير أم اكرين': { lat: 25.22, lon: -11.58, name: 'Bir Moghrein', type: 'مقاطعة' },
  'تيشيت': { lat: 18.44, lon: -9.49, name: 'Tichit', type: 'مقاطعة' },
  'باسكنو': { lat: 15.8621, lon: -5.9543, name: 'Bassiknou', type: 'مقاطعة' },
  'كنكوصة': { lat: 15.93, lon: -11.53, name: 'Kankossa', type: 'مقاطعة' },
  'امبود': { lat: 16.18, lon: -12.60, name: 'Mbout', type: 'مقاطعة' },
  'مونغل': { lat: 16.26, lon: -13.23, name: 'Monguel', type: 'مقاطعة' },
  'بابابى': { lat: 16.48, lon: -13.98, name: 'Bababé', type: 'مقاطعة' },
  'امباني': { lat: 16.25, lon: -13.78, name: 'Mbagne', type: 'مقاطعة' },
  'واد الناقة': { lat: 17.91, lon: -15.31, name: 'Ouad Naga', type: 'مقاطعة' },
  'اركيز': { lat: 16.91, lon: -15.28, name: 'Rkiz', type: 'مقاطعة' },
  'المذرذرة': { lat: 16.91, lon: -15.65, name: 'Mederdra', type: 'مقاطعة' },
  'كرمسين': { lat: 16.48, lon: -16.21, name: 'Keur Macène', type: 'مقاطعة' },
  'فصاله': { lat: 15.5580, lon: -5.5228, name: 'Fassala', type: 'بلدية' },
  'عدل بكرو': { lat: 15.6755, lon: -7.0216, name: 'Adel Bagrou', type: 'بلدية' },
  'بوسطيله': { lat: 15.5777, lon: -8.0819, name: 'Bousteila', type: 'بلدية' },
  'انبيكت لحواش': { lat: 16.8450, lon: -5.9423, name: 'NBeiket Lahwach', type: 'مقاطعة' },
  'جيكني': { lat: 15.7388, lon: -8.6703, name: 'Djiguenni', type: 'مقاطعة' },
  'افيرني': { lat: 15.5634, lon: -8.9105, name: 'Afeirni', type: 'بلدية' },
  'اعوينات ازبل': { lat: 16.3848, lon: -8.8877, name: 'Aoueinat Zbel', type: 'بلدية' },
  'امرج': { lat: 16.1069, lon: -7.2143, name: 'Amourj', type: 'مقاطعة' },
  'ولاته': { lat: 17.2966, lon: -7.0240, name: 'Oualata', type: 'مقاطعة' },
};

/**
 * جلب بيانات الطقس لمدينة معينة
 */
export async function getWeatherData(city = 'نواكشوط', customCoords = null) {
  try {
    const coords = customCoords || mauritanianCities[city];
    if (!coords) {
      throw new Error(`مدينة غير معروفة: ${city}`);
    }

    const params = new URLSearchParams({
      latitude: coords.lat,
      longitude: coords.lon,
      current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,pressure_msl,weather_code',
      hourly: 'temperature_2m,precipitation_probability',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
      timezone: 'Africa/Nouakchott',
      temperature_unit: 'celsius',
    });

    const response = await fetch(`${OPEN_METEO_API}?${params}`);
    if (!response.ok) {
      throw new Error(`خطأ في API: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      city,
      cityEn: coords.name,
      cityType: coords.type || 'مدينة',
      ...data,
    };
  } catch (error) {
    console.error('خطأ في جلب بيانات الطقس:', error);
    throw error;
  }
}

/**
 * جلب بيانات الطقس للمدن الرئيسية في موريتانيا لعرضها في الشبكة
 */
export async function getAllCitiesWeather() {
  try {
    const mainCities = [
      'نواكشوط', 'نواذيبو', 'روصو', 'كيهيدي', 'ألاك', 
      'كيفة', 'لعيون', 'النعمة', 'تجكجة', 'أطار', 
      'أكجوجت', 'زويرات', 'سيلبابي', 'تمبدغة', 'باسكنو',
      'جيكني', 'امرج', 'ولاته', 'فصاله', 'عدل بكرو'
    ];
    
    const promises = mainCities.map((city) =>
      getWeatherData(city).catch((error) => {
        console.warn(`فشل جلب بيانات ${city}:`, error);
        return null;
      })
    );

    const results = await Promise.all(promises);
    return results.filter((result) => result !== null);
  } catch (error) {
    console.error('خطأ في جلب بيانات جميع المدن:', error);
    throw error;
  }
}

/**
 * البحث عن مدينة في موريتانيا باستخدام Geocoding API
 */
export async function searchCities(query) {
  try {
    if (!query || query.length < 2) {
      return [];
    }

    // أولاً البحث في المدن المعرفة مسبقاً (أسرع)
    const localResults = Object.keys(mauritanianCities)
      .filter((city) => city.includes(query))
      .map((city) => ({
        name: city,
        ...mauritanianCities[city],
      }));

    // ثانياً البحث عبر API العالمي مع تقييده بموريتانيا (MR)
    const params = new URLSearchParams({
      name: query,
      count: '10',
      language: 'ar',
      format: 'json',
    });

    const response = await fetch(`${GEOCODING_API}?${params}`);
    const data = await response.json();

    const remoteResults = (data.results || [])
      .filter(res => res.country_code === 'MR')
      .map(res => ({
        name: res.name,
        lat: res.latitude,
        lon: res.longitude,
        admin1: res.admin1 // المنطقة/الولاية
      }));

    // دمج النتائج وإزالة التكرار
    const allResults = [...localResults];
    remoteResults.forEach(remote => {
      if (!allResults.find(local => local.name === remote.name)) {
        allResults.push(remote);
      }
    });

    return allResults;
  } catch (error) {
    console.error('خطأ في البحث عن المدن:', error);
    return [];
  }
}

/**
 * تحويل weather code إلى نص عربي
 */
export function getWeatherDescription(weatherCode) {
  const descriptions = {
    0: 'صافي',
    1: 'غائم جزئياً',
    2: 'غائم',
    3: 'غائم جداً',
    45: 'ضبابي',
    48: 'ضبابي بتجمد',
    51: 'رذاذ خفيف',
    53: 'رذاذ متوسط',
    55: 'رذاذ كثيف',
    61: 'مطر خفيف',
    63: 'مطر متوسط',
    65: 'مطر كثيف',
    71: 'ثلج خفيف',
    73: 'ثلج متوسط',
    75: 'ثلج كثيف',
    80: 'زخات خفيفة',
    81: 'زخات متوسطة',
    82: 'زخات كثيفة',
    85: 'زخات ثلجية خفيفة',
    86: 'زخات ثلجية كثيفة',
    95: 'رعد وبرق',
    96: 'رعد وبرق مع برد خفيف',
    99: 'رعد وبرق مع برد كثيف',
  };

  return descriptions[weatherCode] || 'غير معروف';
}

/**
 * جلب أيقونة الطقس بناءً على weather code
 */
export function getWeatherIcon(weatherCode) {
  if (weatherCode === 0) return '☀️';
  if (weatherCode === 1 || weatherCode === 2) return '⛅';
  if (weatherCode === 3) return '☁️';
  if (weatherCode === 45 || weatherCode === 48) return '🌫️';
  if (weatherCode >= 51 && weatherCode <= 67) return '🌧️';
  if (weatherCode >= 71 && weatherCode <= 86) return '❄️';
  if (weatherCode >= 95 && weatherCode <= 99) return '⛈️';
  return '🌤️';
}
