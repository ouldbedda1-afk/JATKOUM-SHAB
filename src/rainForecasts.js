/**
 * توقعات الأمطار المتوقعة
 * البيانات من خدمة الأرصاد الجوية الوطنية
 */

export const rainForecasts = [
  {
    date: '2026-06-09',
    dateAr: '9 يونيو',
    cities: ['كيفة', 'لعيون', 'النعمة', 'باسكنو', 'جيكني', 'أمرج', 'ولاته', 'فصاله', 'عدل بكرو'],
    probability: 90,
    intensity: 'متوسط إلى غزير',
    icon: '🌧️'
  },
  {
    date: '2026-06-10',
    dateAr: '10 يونيو',
    cities: ['فصاله'],
    probability: 75,
    intensity: 'خفيف إلى متوسط',
    icon: '🌧️'
  },
  {
    date: '2026-06-14',
    dateAr: '14 يونيو',
    cities: ['النعمة', 'باسكنو', 'أمرج', 'فصاله', 'عدل بكرو'],
    probability: 85,
    intensity: 'متوسط إلى غزير',
    icon: '🌧️'
  }
];

/**
 * الحصول على توقعات الأمطار لمدينة معينة
 */
export function getRainForecastForCity(cityName) {
  return rainForecasts.filter(forecast => 
    forecast.cities.some(city => city.toLowerCase() === cityName.toLowerCase())
  );
}

/**
 * الحصول على توقعات الأمطار لتاريخ معين
 */
export function getRainForecastForDate(date) {
  return rainForecasts.find(forecast => forecast.date === date || forecast.dateAr === date);
}

/**
 * الحصول على أعلى احتمالية للأمطار في الفترة
 */
export function getMaxRainProbability() {
  return Math.max(...rainForecasts.map(f => f.probability));
}

/**
 * الحصول على المدن الأكثر عرضة للأمطار
 */
export function getMostRainyRegions() {
  const regionCount = {};
  rainForecasts.forEach(forecast => {
    forecast.cities.forEach(city => {
      regionCount[city] = (regionCount[city] || 0) + forecast.probability;
    });
  });
  
  return Object.entries(regionCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([city, score]) => ({ city, score: Math.round(score / rainForecasts.length) }));
}
