# موريتانيا ميتيو - Mauritania Meteo

تطبيق ويب متقدم لتوقعات الطقس والأقمار الصناعية لموريتانيا، يستخدم بيانات المركز الأوروبي للتنبؤات الجوية (ECMWF) عبر Open-Meteo API.

## 🌟 الميزات

- ✅ **بيانات طقس حقيقية**: تحديث مباشر من Open-Meteo API
- 🗺️ **خرائط تفاعلية**: عرض الأقمار الصناعية والطقس المباشر
- 🌡️ **معلومات دقيقة**: درجة الحرارة، الرطوبة، سرعة الرياح، الضغط
- 🏙️ **7 مدن موريتانية**: نواكشوط، نواذيبو، أطار، روصو، زويرات، النعمة
- 🔍 **بحث ديناميكي**: البحث السريع عن المدن
- 📱 **متجاوب تماماً**: يعمل على جميع الأجهزة
- 🎨 **تصميم عصري**: Tailwind CSS + Framer Motion
- 🛡️ **معالجة أخطاء**: Error Boundary وتوثيق الأخطاء
- ♿ **Accessibility**: دعم ARIA labels وتوافق الشاشات

## 🚀 البدء السريع

### المتطلبات
- Node.js v16+
- npm أو yarn

### التثبيت

```bash
# استنساخ المشروع
git clone <repository-url>
cd meteo-mauritanie

# تثبيت الحزم
npm install

# نسخ متغيرات البيئة
cp .env.example .env.local

# تشغيل التطبيق
npm run dev
```

### البناء والنشر

```bash
# بناء الإصدار الإنتاجي
npm run build

# اختبار الإصدار المبني
npm run preview

# تشغيل الاختبارات
npm test

# عرض نتائج التغطية
npm run test:coverage
```

## 📁 بنية المشروع

```
src/
├── components/
│   ├── Navbar.jsx           # شريط التنقل مع البحث
│   ├── WeatherHero.jsx      # عرض الطقس الرئيسي
│   ├── SatelliteViewer.jsx  # عارض الأقمار الصناعية
│   ├── CityGrid.jsx         # شبكة المدن
│   ├── ErrorBoundary.jsx    # معالج الأخطاء
│   └── SafeIcon.jsx         # مكون الأيقونات الآمن
├── services/
│   └── supabaseClient.js    # إعداد Supabase
├── weatherApi.js            # خدمة الطقس
├── useWeather.js            # Hook مخصص للطقس
├── App.jsx                  # المكون الرئيسي
└── main.jsx                 # نقطة الدخول
```

## 🔌 APIs المستخدمة

### Open-Meteo API
- **الموقع**: https://api.open-meteo.com
- **الميزات**: بيانات الطقس الحالية والتنبؤات
- **المميزات**: مجاني، بدون مفتاح API
- **التحديث**: كل 15 دقيقة

### Windy Map
- **الموقع**: https://www.windy.com
- **الميزات**: خرائط الأقمار الصناعية المباشرة
- **المحدثة**: بالوقت الفعلي

## 🧪 الاختبارات

```bash
# تشغيل جميع الاختبارات
npm test

# تشغيل الاختبارات في وضع المراقبة
npm test -- --watch

# عرض واجهة المستخدم للاختبارات
npm run test:ui

# حساب التغطية
npm run test:coverage
```

### تغطية الاختبارات الحالية
- ✅ SafeIcon Component
- ✅ Weather API Utilities
- ✅ useWeather Hook
- ⏳ CityGrid Component
- ⏳ WeatherHero Component
- ⏳ Error Boundary

**الهدف**: 70%+ تغطية

## 🗄️ Supabase Setup

```sql
-- جدول المدن المفضلة
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  city_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- جدول سجل البحث
CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  query TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- جدول Alerts التنبيهات
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

## 📊 المتغيرات البيئية

اضبط `.env.local` بالقيم التالية:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Weather APIs - Dual Provider Strategy
# مزود أساسي (مجاني، 10K طلب/يوم)
VITE_OPENMETEO_API=https://api.open-meteo.com/v1/forecast

# مزود بديل (اختياري، 1M طلب/شهر - للنطاق الواسع)
VITE_WEATHERAPI_KEY=your-weatherapi-key-here

# Proxy Worker (اختياري - للكاش الموزع)
VITE_PROXY_URL=https://your-cloudflare-worker.com

# Marine API (اختياري)
VITE_MARINE_API_URL=https://marine-api.open-meteo.com/v1/marine

# NASA Events API
VITE_NASA_API_URL=https://eonet.gsfc.nasa.gov/api/v3/events

# Debug
VITE_DEBUG=false
```

### استراتيجية المزودين الثنائية

التطبيق يستخدم **Open-Meteo + WeatherAPI** لضمان عدم انقطاع الخدمة:

1. **المحاولة الأولى**: Open-Meteo API (مجاني، سريع)
2. **الاحتياطي الأول**: WeatherAPI.com (إذا رُفع المفتاح)
3. **الاحتياطي الثاني**: بيانات مخزنة (Cache)
4. **الاحتياطي النهائي**: بيانات افتراضية آمنة

### الحصول على مفاتيح API

**WeatherAPI.com**:
1. سجل على https://www.weatherapi.com
2. اذهب إلى Dashboard واحصل على API Key
3. ضع المفتاح في `VITE_WEATHERAPI_KEY`
4. يدعم 1,000,000 طلب/شهر في الخطة المجانية

**Cloudflare Worker** (اختياري):
- استخدم `weather-proxy-worker.js` للكاش الموزع
- يقلل عدد الطلبات المباشرة للـ APIs
- ينسخ البيانات عبر Cloudflare's edge network

## 🎨 النسق الجمالي

- **الألوان الأساسية**: أزرق (#2563EB) وأخضر صديق (#059669)
- **الخطوط**: -apple-system, BlinkMacSystemFont, Segoe UI
- **التأثيرات**: Blur, Gradient, Shadow
- **الحركات**: Framer Motion animations

## 🔐 الأمان

- ✅ بيانات المستخدم محفوظة في Supabase
- ✅ لا يتم حفظ بيانات الطقس الحساسة
- ✅ Error messages آمنة وخالية من المعلومات الحساسة
- ✅ مفاتيح API آمنة في متغيرات البيئة
- ⏳ سيتم إضافة HTTPS و CSP headers

## 📈 قابلية التوسع

التطبيق مصمم للتعامل مع **2000+ مستخدم متزامن**:

- ✅ Dual-provider weather APIs (Open-Meteo + WeatherAPI)
- ✅ Client-side و Server-side caching
- ✅ Circuit breaker pattern لمعالجة الأخطاء
- ✅ Request rate limiting و concurrency control
- ✅ Stale data fallback (24 ساعة)
- ✅ Cloudflare Worker proxy (اختياري)

## 📝 الترخيص

MIT License

## 🤝 المساهمة

نرحب بالمساهمات! الرجاء:

1. Fork المشروع
2. أنشئ فرع للميزة (`git checkout -b feature/AmazingFeature`)
3. Commit التغييرات (`git commit -m 'Add AmazingFeature'`)
4. Push إلى الفرع (`git push origin feature/AmazingFeature`)
5. افتح Pull Request

## 📧 التواصل

- 📱 Twitter: [@meteo_mauritanie](https://twitter.com)
- 📧 Email: info@mauritaniameteo.com
- 🌐 Website: https://mauritaniameteo.com

## 🎯 الخارطة الزمنية المستقبلية

- [ ] تطبيق Mobile Native (React Native)
- [ ] تنبيهات الطقس الفورية
- [ ] خرائط حرارية تفاعلية
- [ ] التنبؤات الأسبوعية المتقدمة
- [ ] دعم لغات إضافية
- [ ] نمط مظلم (Dark Mode)
- [ ] تطبيق مكتب (Electron)

---

**تم البناء بـ ❤️ لموريتانيا**
