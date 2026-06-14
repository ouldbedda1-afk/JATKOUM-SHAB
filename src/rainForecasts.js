/**
 * توقعات الأمطار - المصدر: المركز الأوروبي للتنبؤات الجوية (ECMWF)
 * يُحدَّث هذا الملف يدوياً بناءً على أحدث نماذج ECMWF
 * لا تُعرض أي توقعات لأيام ماضية (يتم تصفيتها تلقائياً)
 */

export const rainForecasts = [
  {
    date: '2026-06-15',
    date_ar: '15 يونيو 2026',
    cities: ['النعمة', 'باسكنو', 'امرج', 'فصاله', 'عدل بكرو', 'تمبدغة'],
    probability: 85,
    intensity: 'متوسط إلى غزير',
    risk_level: 'عالية',
    icon: '🌧️'
  },
  {
    date: '2026-06-16',
    date_ar: '16 يونيو 2026',
    cities: ['كيفة', 'لعيون', 'باركيول', 'كرو', 'كنكوصة'],
    probability: 70,
    intensity: 'خفيف إلى متوسط',
    risk_level: 'متوسطة',
    icon: '🌦️'
  },
  {
    date: '2026-06-17',
    date_ar: '17 يونيو 2026',
    cities: ['جيكني', 'ولاته', 'انبيكت لحواش', 'فصاله', 'باسكنو'],
    probability: 80,
    intensity: 'متوسط',
    risk_level: 'عالية',
    icon: '🌧️'
  },
];

/**
 * الحصول على توقعات الأمطار لمدينة معينة — يُخفي الأيام الماضية تلقائياً
 */
export function getRainForecastForCity(cityName) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rainForecasts.filter(forecast => {
    const cityExists = forecast.cities.some(
      city => city.toLowerCase() === cityName.toLowerCase()
    );
    if (!cityExists) return false;

    const forecastDate = new Date(forecast.date);
    forecastDate.setHours(0, 0, 0, 0);
    return forecastDate >= today;
  });
}

/**
 * الحصول على توقعات الأمطار لتاريخ معين
 */
export function getRainForecastForDate(date) {
  return rainForecasts.find(
    forecast => forecast.date === date || forecast.date_ar === date
  );
}

/**
 * الحصول على جميع التوقعات الصالحة (المستقبلية فقط — لا يُعرض الماضي أبداً)
 */
export function getValidRainForecasts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rainForecasts
    .filter(forecast => {
      const forecastDate = new Date(forecast.date);
      forecastDate.setHours(0, 0, 0, 0);
      return forecastDate >= today;
    })
    .map(f => ({
      ...f,
      dateAr: f.date_ar,
      riskLevel: f.risk_level,
    }));
}

/**
 * الحصول على أعلى احتمالية للأمطار في الفترة الصالحة
 */
export function getMaxRainProbability() {
  const valid = getValidRainForecasts();
  if (valid.length === 0) return 0;
  return Math.max(...valid.map(f => f.probability));
}

/**
 * الحصول على المدن الأكثر عرضة للأمطار في الفترة القادمة
 */
export function getMostRainyRegions() {
  const valid = getValidRainForecasts();
  const regionScore = {};
  valid.forEach(forecast => {
    forecast.cities.forEach(city => {
      regionScore[city] = (regionScore[city] || 0) + forecast.probability;
    });
  });

  return Object.entries(regionScore)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([city, score]) => ({
      city,
      score: valid.length > 0 ? Math.round(score / valid.length) : 0,
    }));
}
