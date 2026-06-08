# Rain Forecasts Management Guide

## نظام توقعات الأمطار الأتوماتيكي

هذا الدليل يشرح كيفية إدارة وتحديث توقعات الأمطار في التطبيق.

---

## 📊 البنية الأساسية

### البيانات المحلية (Default)
الإعدادات الافتراضية موجودة في `src/components/RainForecastAlerts.jsx`:

```javascript
const RAIN_FORECASTS = [
  {
    date: '2026-06-08',
    dateAr: '8 يونيو',
    cities: ['سيلبابي', 'جيكني', 'تمبدغة', 'عدل بكرو'],
    probability: 80,
    intensity: 'متوسط إلى غزير',
    icon: '🌧️',
    riskLevel: 'عالية'
  },
  // ... المزيد من التوقعات
];
```

### البيانات من Supabase (Optional)
إذا كنت تريد إدارة التوقعات ديناميكياً من قاعدة بيانات:

```javascript
// جدول Supabase المطلوب
CREATE TABLE rain_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  date_ar TEXT,
  cities JSON, -- ["مدينة1", "مدينة2", ...]
  probability INT,
  intensity TEXT,
  risk_level TEXT,
  icon TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- فهرس لتحسين الأداء
CREATE INDEX idx_rain_forecasts_date ON rain_forecasts(date);
```

---

## 🔄 التحديثات التلقائية

### الخيار 1: تحديث يدوي عبر Supabase Dashboard

1. اذهب إلى Supabase Dashboard
2. اختر الجدول `rain_forecasts`
3. أضف أو عدّل الصفوف مباشرة

**المزايا:**
- لا تحتاج أي كود
- تحديث فوري لكل المستخدمين

### الخيار 2: API إدارة (Admin Panel)

```typescript
// في المستقبل: src/components/AdminRainForecasts.jsx
import { addRainForecast, updateRainForecast } from '../supabase';

async function submitForecast(forecastData) {
  const result = await addRainForecast({
    date: '2026-06-15',
    dateAr: '15 يونيو',
    cities: ['نواكشوط', 'نواذيبو'],
    probability: 75,
    intensity: 'متوسط',
    riskLevel: 'عالية',
    icon: '🌧️'
  });
  return result;
}
```

### الخيار 3: Webhook من خدمة الأرصاد الخارجية

```typescript
// في serverless function (مثلاً Cloudflare Worker)
export async function handleWeatherUpdate(request) {
  const forecast = await request.json();
  
  // أضف التوقعات إلى Supabase
  await supabase
    .from('rain_forecasts')
    .insert([forecast]);
  
  return { success: true };
}
```

---

## 🔔 نظام التنبيهات (Notifications)

عند تحديث التوقعات، يتم:

1. **التنبيه البصري** في الصفحة (toast notification)
2. **تحديث البيانات** تلقائياً في Context
3. **Web Push** إذا كان المستخدم قد وافق (اختياري)

### تفعيل Web Push Notifications

```typescript
// في RainForecastAlerts.jsx
const sendNotification = (title, body) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: body,
      icon: '🌧️',
      badge: '🌧️'
    });
  }
};

// عند التحديث
useEffect(() => {
  if (forecasts.length > 0) {
    sendNotification('توقعات أمطار جديدة', 'تحقق من التفاصيل أعلاه');
  }
}, [forecasts]);
```

---

## 🎯 سيناريوهات الاستخدام

### السيناريو 1: تحديث بسيط

```bash
1. افتح Supabase Dashboard
2. أضف صف جديد في جدول rain_forecasts
3. البيانات تظهر فوراً على الموقع
```

### السيناريو 2: تحديث مجموعي

```typescript
// عند استقبال بيانات من الأرصاد الجوية
const forecastsFromWeatherService = [
  { date: '2026-06-20', cities: [...], ... },
  { date: '2026-06-21', cities: [...], ... },
];

for (const forecast of forecastsFromWeatherService) {
  await addRainForecast(forecast);
}
```

### السيناريو 3: تحديث محدد

```typescript
// تحديث توقعات محددة فقط
await updateRainForecast(forecastId, {
  probability: 85,
  risk_level: 'عالية جداً'
});
```

---

## 🚀 التكامل مع الخدمات الخارجية

### مثال: Integration مع API الأرصاد الوطنية

```typescript
// scheduled function (كل ساعة)
async function syncWeatherForecasts() {
  try {
    // جلب البيانات من الأرصاد الجوية
    const response = await fetch('https://weather-api.mr/forecasts');
    const newForecasts = await response.json();
    
    // حذف التوقعات القديمة
    await supabase
      .from('rain_forecasts')
      .delete()
      .lt('date', new Date().toISOString());
    
    // إضافة التوقعات الجديدة
    for (const forecast of newForecasts) {
      await addRainForecast({
        date: forecast.date,
        dateAr: convertToArabic(forecast.date),
        cities: forecast.regions,
        probability: forecast.rain_probability,
        intensity: forecast.intensity,
        riskLevel: calculateRiskLevel(forecast),
        icon: selectIcon(forecast)
      });
    }
    
    console.log('✅ تم تحديث التوقعات بنجاح');
  } catch (error) {
    console.error('❌ خطأ في تحديث التوقعات:', error);
  }
}
```

---

## 📱 شاشات العرض

### الشاشة الرئيسية
توقعات الأمطار تظهر في الأعلى مع:
- تنبيه التحديثات
- بطاقات قابلة للتوسيع
- معلومات المقاطعات والبلديات
- مستويات الخطر الملونة
- نصائح الأمان

### التفاصيل المتوسعة
عند النقر على أي توقعة:
- قائمة المدن المتأثرة
- شدة الأمطار المتوقعة
- نصائح الأمان والحماية

---

## ⚙️ متغيرات البيئة

لا توجد متغيرات بيئة خاصة مطلوبة لهذه الميزة.

إذا كنت تستخدم Supabase، تأكد من:
- `VITE_SUPABASE_URL` ✅
- `VITE_SUPABASE_ANON_KEY` ✅

---

## 🔐 الأمان

- التوقعات قابلة للقراءة من الجميع (public)
- فقط الـ admin يمكنه تحديث التوقعات
- استخدم Supabase Row Level Security (RLS):

```sql
-- السماح للجميع بالقراءة
CREATE POLICY "Allow public read" ON rain_forecasts
  FOR SELECT USING (true);

-- السماح فقط للـ admin بالكتابة
CREATE POLICY "Allow admin write" ON rain_forecasts
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'admin');
```

---

## 📊 إحصائيات وتحليلات

```typescript
// احصائيات التوقعات
export function getRainForecastStats() {
  const totalCities = new Set(
    forecasts.flatMap(f => f.cities)
  ).size;
  
  const maxProbability = Math.max(
    ...forecasts.map(f => f.probability)
  );
  
  const avgIntensity = forecasts.length > 0 
    ? forecasts.reduce((sum, f) => sum + f.probability, 0) / forecasts.length
    : 0;
    
  return { totalCities, maxProbability, avgIntensity };
}
```

---

## 🐛 استكشاف الأخطاء

### المشكلة: التوقعات لا تظهر

```typescript
// 1. تحقق من البيانات
console.log('forecasts:', forecasts);

// 2. تحقق من الاتصال بـ Supabase
const { data } = await supabase.from('rain_forecasts').select('*');
console.log('data:', data);

// 3. تحقق من الأخطاء
if (!isSupabaseConfigured) {
  console.warn('⚠️ Supabase غير مُعد - استخدام البيانات الافتراضية');
}
```

### المشكلة: التحديثات لا تصل

```typescript
// 1. تحقق من subscription
const subscription = subscribeToRainForecasts(callback);

// 2. تحقق من الـ permissions
// اطلب من المستخدم السماح بالإشعارات

// 3. افحص الـ browser console للأخطاء
```

---

## 📝 الملفات ذات الصلة

- `src/components/RainForecastAlerts.jsx` - مكون العرض الرئيسي
- `src/supabase.js` - دوال قاعدة البيانات
- `src/WeatherContext.jsx` - State management
- `src/rainForecasts.js` - دوال مساعدة

---

## 🎓 الدروس التعليمية

### درس 1: إضافة توقعة مطر جديدة

```typescript
// 1. في Supabase Dashboard أو عبر API
const newForecast = {
  date: '2026-06-20',
  dateAr: '20 يونيو',
  cities: ['نواكشوط', 'روصو'],
  probability: 70,
  intensity: 'خفيف',
  riskLevel: 'منخفضة',
  icon: '🌤️'
};

// 2. التطبيق يتحدث تلقائياً
// 3. جميع المستخدمين يرون التحديث
```

---

**آخر تحديث**: 8 يونيو 2026

