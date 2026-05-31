# 🔧 دليل استكشاف الأخطاء

## مشاكل شائعة وحلولها

### 1. خطأ: "Module not found"
```
Error: Cannot find module '@supabase/supabase-js'
```

**الحل:**
```bash
npm install
```

---

### 2. خطأ: متغيرات البيئة غير محددة
```
⚠️ متغيرات Supabase غير محددة. بعض الميزات قد لا تعمل.
```

**الحل:**
1. انسخ `.env.example` إلى `.env.local`
2. أضف قيم Supabase (اختياري)
```bash
cp .env.example .env.local
```

---

### 3. الاختبارات لا تعمل
```
Error: Cannot find module 'vitest'
```

**الحل:**
```bash
npm install
npm test
```

---

### 4. خطأ CORS من Open-Meteo
```
Access-Control-Allow-Origin error
```

**الحل:**
- Open-Meteo API مجاني وبدون CORS issues
- تأكد من الاتصال بالإنترنت
- جرّب من متصفح آخر

---

### 5. الطقس لا يظهر
**الأسباب المحتملة:**
1. ✅ عدم الاتصال بالإنترنت
2. ✅ API مقيّد (timeout)
3. ✅ خطأ في المتصفح (F12 → Console)

**الحل:**
```javascript
// افتح F12 وشغّل:
fetch('https://api.open-meteo.com/v1/forecast?latitude=18.0735&longitude=-15.9582&current=temperature_2m')
  .then(r => r.json())
  .then(d => console.log(d))
```

---

### 6. الأيقونات لا تظهر
```
Warning: Icon not found
```

**الحل:**
- تأكد من `react-icons` مثبت
```bash
npm install react-icons
```

---

### 7. ESLint errors
```
Parsing error: Unexpected token
```

**الحل:**
```bash
npm run lint
npm run lint:error
```

---

### 8. Tests تفشل
```
Cannot find module testing-library
```

**الحل:**
```bash
npm install @testing-library/react @testing-library/jest-dom jsdom
npm test
```

---

## 📊 Debug Mode

### تفعيل وضع Debug
```javascript
// في main.jsx
const debug = import.meta.env.VITE_DEBUG === 'true';
if (debug) {
  console.log('🔍 Debug Mode Enabled');
}
```

---

## 🔐 مشاكل الأمان

### Token Exposure
❌ لا تنسخ keys مباشرة إلى الكود:
```javascript
// ❌ خطأ
const key = "pk_live_...";
```

✅ استخدم متغيرات البيئة:
```javascript
// ✅ صحيح
const key = import.meta.env.VITE_SUPABASE_KEY;
```

---

## 📱 مشاكل الهاتف

### الخط صغير جداً
```css
/* أضف في index.css */
body {
  font-size: 16px; /* لا تقل عن 16px */
}
```

### الاتجاه RTL لا يعمل
```html
<!-- تأكد من وجود dir="rtl" -->
<html lang="ar" dir="rtl">
```

---

## 🐛 Debugging Tools

### React DevTools
```
Chrome → Extensions → React DevTools
```

### Network Tab
```
F12 → Network → معاينة API calls
```

### Console
```javascript
// اطبع البيانات
console.log('Weather:', weatherData);
console.table(cities);
```

---

## 📝 Log Files

### حفظ الأخطاء
```javascript
import { errorLogger } from './errorLogger';

errorLogger.getErrors();  // جميع الأخطاء
errorLogger.exportErrors(); // JSON format
```

---

## 🚨 Emergency Mode

### إعادة تعيين كاملة
```bash
# حذف جميع البيانات المخزنة
rm -rf node_modules
rm package-lock.json

# تثبيت جديد
npm install

# تشغيل جديد
npm run dev
```

---

## 📞 الدعم الفني

### معلومات النظام
```javascript
// F12 → Console
navigator.userAgent
navigator.language
window.location.href
```

### إرسال تقرير الخطأ
```javascript
import { errorLogger } from './errorLogger';
const errors = errorLogger.exportErrors();
// أرسله إلى support@mauritaniameteo.com
```

---

## ✅ قائمة التحقق

عند مواجهة مشكلة:
- [ ] تحديث npm `npm update`
- [ ] مسح cache `npm cache clean --force`
- [ ] إعادة تشغيل الخادم
- [ ] فتح DevTools (F12)
- [ ] التحقق من Console للأخطاء
- [ ] فحص Network tab للـ API calls
- [ ] جرب متصفح آخر
- [ ] جرب من جهاز آخر

---

**آخر تحديث:** 2026-05-23
