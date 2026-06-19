# إعداد الإشعارات الفورية (Web Push)

بنية إرسال إشعار عاجل لكل المتابعين عند رصد البرق أو الأمطار — تعمل حتى لو كان الموقع مغلقاً (على الأجهزة التي ثبّتت التطبيق أو منحت إذن الإشعارات).

## المكوّنات

| الجزء | الملف |
|------|------|
| استقبال الإشعار في الخلفية | [public/sw.js](public/sw.js) — معالجا `push` و`notificationclick` |
| اشتراك المتصفح | [src/pwa.js](src/pwa.js) — `subscribeToPush` / `unsubscribeFromPush` |
| حفظ الاشتراك | [src/supabase.js](src/supabase.js) — `savePushSubscription` / `broadcastPush` |
| جدول قاعدة البيانات | [supabase/migrations/001_push_subscriptions.sql](supabase/migrations/001_push_subscriptions.sql) |
| دالة الإرسال الخلفية | [supabase/functions/send-push/index.ts](supabase/functions/send-push/index.ts) |
| المُجدوِل الخادمي (فحص دوري) | [supabase/functions/check-and-push/index.ts](supabase/functions/check-and-push/index.ts) |
| إطلاق البثّ عند الرصد (متصفح) | [src/components/SatelliteViewer.jsx](src/components/SatelliteViewer.jsx) |

## خطوات التفعيل (مرة واحدة)

### 1) توليد مفاتيح VAPID
```bash
npx web-push generate-vapid-keys
```
ستحصل على `Public Key` و`Private Key`.

### 2) ضبط متغيّرات الواجهة
في ملف `.env`:
```
VITE_VAPID_PUBLIC_KEY=<المفتاح العام>
```

### 3) إنشاء الجدول في Supabase
شغّل محتوى `supabase/migrations/001_push_subscriptions.sql` في SQL Editor (أو `supabase db push`).

### 4) نشر دالة الإرسال
```bash
supabase functions deploy send-push
supabase secrets set \
  VAPID_PUBLIC_KEY=<المفتاح العام> \
  VAPID_PRIVATE_KEY=<المفتاح الخاص> \
  VAPID_SUBJECT=mailto:you@example.com
```

> `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` متوفّران تلقائياً داخل بيئة الدالة.

### 5) إعادة البناء والنشر
```bash
npm run build
```

## كيف يعمل الإطلاق التلقائي

1. عند رصد برق/أمطار مؤكَّدة بالأقمار الصناعية، يستدعي [SatelliteViewer](src/components/SatelliteViewer.jsx) دالة `broadcastPush` مع `signature` يمثّل المدن المتأثرة.
2. دالة `send-push` تتحقق من جدول `push_state`: إن سبق إرسال نفس الحدث خلال 30 دقيقة → تتجاهله (منع التكرار)، وإلا تبثّه لكل المشتركين.
3. الاشتراكات المنتهية (404/410) تُحذف تلقائياً.

هذا يمنع تكرار الإشعار حتى لو فتح عدة زوّار الموقع في نفس اللحظة.

## المُجدوِل الخادمي (مستقل عن الزوّار)

الدالة [supabase/functions/check-and-push/index.ts](supabase/functions/check-and-push/index.ts) تفحص رادار RainViewer + كود الطقس خادمياً (بفكّ ترميز بلاطات PNG عبر `upng-js`)، وتستدعي `send-push` تلقائياً عند رصد برق/أمطار — **دون حاجة لأي زائر مفتوح**.

### النشر
```bash
supabase functions deploy check-and-push
```

### الجدولة كل 10 دقائق (pg_cron)
في SQL Editor:
```sql
-- فعّل الإضافات مرة واحدة
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- استبدل <PROJECT_REF> و<SERVICE_ROLE_KEY>
select cron.schedule(
  'check-and-push-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/check-and-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    )
  );
  $$
);
```

> منع التكرار في `send-push` يضمن إشعاراً واحداً لكل حدث حتى مع تشغيل المجدوِل كل 10 دقائق على نفس العاصفة.

### آليتان تكميليتان
1. **المُجدوِل الخادمي** (`check-and-push`) — التغطية الأساسية المستقلة.
2. **الرصد من المتصفح** ([SatelliteViewer](src/components/SatelliteViewer.jsx)) — يبثّ فوراً عند وجود زائر نشط.

كلاهما يمرّ عبر `send-push` بنفس `dedupeKey`/`signature`، فلا تتكرّر الإشعارات بينهما.
