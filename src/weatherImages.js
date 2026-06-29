// صور محلية في مجلد public/weather — مضمونة التحميل بدون اعتماد على CDN خارجي

export const WEATHER_IMAGES = {
  // ⛈️ عواصف رعدية مع أمطار غزيرة — سحب داكنة ومطر ثقيل
  thunder: '/weather/thunder.jpg',

  // 🌧️ أمطار غزيرة — زخات مطر كثيفة
  heavy_rain: '/weather/heavy_rain.jpg',

  // 🌦️ أمطار موريتانيا — مطر متوسط
  rain: '/weather/rain.jpg',

  // 🌬️ عاصفة رملية / هرماتان — غبار وكثبان
  wind: '/weather/wind.jpg',

  // 🔥 موجة حر / صحراء — كثبان رملية وشمس حارقة
  heat: '/weather/heat.jpg',

  // 💧 فيضانات — مياه جارية
  flood: '/weather/flood.jpg',

  // ☁️ طقس عام — سماء ملبّدة بالغيوم
  default: '/weather/default.jpg',
};

/**
 * اختيار الصورة حسب نوع الحدث
 */
export function getWeatherImage(type) {
  return WEATHER_IMAGES[type] || WEATHER_IMAGES.default;
}

/**
 * استنتاج الصورة المناسبة من تصنيف الخبر وعنوانه
 */
export function getImageForAlert(category = '', title = '') {
  const text = (category + ' ' + title).toLowerCase();

  if (text.includes('عواصف') || text.includes('رعدي') || text.includes('برق'))
    return WEATHER_IMAGES.thunder;
  if (text.includes('فيضان'))
    return WEATHER_IMAGES.flood;
  if (text.includes('غزير') || text.includes('غزيرة'))
    return WEATHER_IMAGES.heavy_rain;
  if (text.includes('رياح') || text.includes('رمال') || text.includes('هرماتان') || text.includes('غبار'))
    return WEATHER_IMAGES.wind;
  if (text.includes('حر') || text.includes('حرارة'))
    return WEATHER_IMAGES.heat;
  if (text.includes('أمطار') || text.includes('مطر') || text.includes('هطول') || text.includes('أمطار'))
    return WEATHER_IMAGES.rain;

  return WEATHER_IMAGES.default;
}
