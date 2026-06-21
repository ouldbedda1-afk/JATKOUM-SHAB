# نظام المراجعة: الأخبار + بلاغات الظالة

التدفّق: **المستخدم يرسل → معلّق → الإدارة تراجع في `/admin` → موافقة → يُنشر في الموقع**.

## المكوّنات
| الجزء | الملف |
|------|------|
| جداول + RLS | [supabase/migrations/002_moderation.sql](supabase/migrations/002_moderation.sql) |
| دالة المراجعة الخادمية | [supabase/functions/moderate/index.ts](supabase/functions/moderate/index.ts) |
| دوال العميل | [src/supabase.js](src/supabase.js) — `submitNews` / `getApprovedNews` / `adminListPending` / `adminModerate` |
| نموذج إرسال خبر | [src/components/NewsSubmitForm.jsx](src/components/NewsSubmitForm.jsx) |
| لوحة الإدارة | [src/components/AdminPage.jsx](src/components/AdminPage.jsx) → المسار `/#/admin` |

## كيف يعمل
- **الأخبار**: زر "✍️ أرسل خبراً" في الرئيسية → يُحفظ بحالة `pending`. بعد اعتماده يظهر في شريط الأخبار.
- **تبشيرات المطر**: زر "💧 أرسل تبشيرة مطر" → تسجيل دخول فيسبوك (اسم+صورة) + موقع + صورة → `pending`. بعد الاعتماد تظهر في "تبشيرات المطر الميدانية" وعلى **خريطة الأمطار الحية**.
- **الظالة**: أي بلاغ جديد يُحفظ `pending` ولا يظهر في صفحة الظالة إلا بعد الاعتماد.
- **الإدارة**: صفحة `/#/admin` → كلمة سرّ → ثلاثة تبويبات (الأخبار / تبشيرات المطر / الظالة) → اعتماد أو رفض.

## الهجرات
شغّل بالترتيب في SQL Editor:
1. [002_moderation.sql](supabase/migrations/002_moderation.sql) — الأخبار + الظالة
2. [003_rain_reports_moderation.sql](supabase/migrations/003_rain_reports_moderation.sql) — تبشيرات المطر + أعمدة الناشر

## خطوات التفعيل
### 1) قاعدة البيانات
شغّل [002_moderation.sql](supabase/migrations/002_moderation.sql) في Supabase SQL Editor.

> ملاحظة: الملف يفعّل RLS على `livestock_reports` ويجعل القراءة للمعتمد فقط. تأكد أن لديك سياسة إدراج مناسبة (مضمّنة في الملف).

### 2) نشر دالة المراجعة
```bash
supabase functions deploy moderate
supabase secrets set ADMIN_TOKEN=<كلمة سرّ قوية للإدارة>
```

### 3) إعادة البناء والنشر
```bash
npm run build
```

## الأمان
- اعتماد/رفض وقراءة المعلّقة تتمّ حصراً عبر دالة `moderate` التي تتحقق من `ADMIN_TOKEN` (سرّ خادمي).
- مفتاح anon لا يستطيع قراءة المعلّقة ولا تغيير الحالة (RLS).
- كلمة سرّ الإدارة تُحفظ في `sessionStorage` فقط أثناء الجلسة، ولا تُكتب في الكود.
