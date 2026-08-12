# جاتكم اسحاب — وثيقة الموقع الشاملة

> آخر تحديث: أغسطس 2026

---

## 1. نظرة عامة على المشروع

**جاتكم اسحاب** موقع موريتاني لرصد الطقس والأمطار يعمل على:

| المكوّن | التقنية |
|---|---|
| الواجهة | React 18 + Vite 5 + TailwindCSS |
| الاستضافة | Vercel (auto-deploy من `main`) |
| قاعدة البيانات | Supabase (PostgreSQL) |
| الدوال الخلفية | Supabase Edge Functions (Deno) |
| الإشعارات | Web Push (VAPID) + Telegram Bot |
| بيانات الطقس | Open-Meteo API + ECMWF |
| مقاييس الأمطار | Supabase → AMI RSS scraper |

---

## 2. المعرّفات والمفاتيح

```
Supabase Project Ref  : udtdfkvtmqfxjezhxaah
Supabase URL          : https://udtdfkvtmqfxjezhxaah.supabase.co
Anon Key (public)     : sb_publishable_xxxx... (انظر Supabase Dashboard → Settings → API)
Supabase Access Token : sbp_xxxx... (احتفظ به بسرية — لا تضعه في الكود)
Site URL              : https://www.jatkoumshab.com
GitHub Repo           : ouldbedda1-afk/JATKOUM-SHAB (branch: main)
```

### متغيرات البيئة في `.env`
```
VITE_SUPABASE_URL=https://udtdfkvtmqfxjezhxaah.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxx... (انظر Supabase Dashboard → Settings → API)
```

### أسرار Edge Functions (مخزّنة في Supabase Secrets)
```
SUPABASE_SERVICE_ROLE_KEY   — مفتاح الخدمة (للعمليات الإدارية)
TELEGRAM_BOT_TOKEN          — توكن بوت Telegram
TELEGRAM_CHAT_ID            — معرّف محادثة الأدمن
FB_PAGE_ID                  — معرّف صفحة فيسبوك
FB_PAGE_ACCESS_TOKEN        — توكن الوصول لصفحة فيسبوك
FB_VERIFY_TOKEN             — توكن التحقق من Webhook فيسبوك
VAPID_PUBLIC_KEY            — مفتاح VAPID للإشعارات
VAPID_PRIVATE_KEY           — المفتاح الخاص VAPID
VAPID_SUBJECT               — عنوان البريد لـ VAPID
SITE_URL                    — https://www.jatkoumshab.com
ADMIN_TOKEN                 — توكن الأدمن للعمليات الحساسة
```

---

## 3. قاعدة البيانات — الجداول

### `livestock_reports` — بلاغات الظالة (الماشية المفقودة/الموجودة)
```sql
id            uuid PRIMARY KEY
report_type   text       -- 'lost' | 'found'
animal_type   text       -- نوع الحيوان
region        text       -- المنطقة
village       text       -- القرية
description   text
contact_phone text
image_url     text
voice_url     text
status        text       -- 'pending' | 'approved' | 'rejected'
reviewed_at   timestamptz
created_at    timestamptz
```

### `rain_reports` — تبشيرات الأمطار (من المستخدمين)
```sql
id                        uuid PRIMARY KEY
city                      text
rain_intensity            text
description               text
is_verified               boolean
latitude / longitude      double precision
facebook_name/url/picture text
facebook_followers        integer
image_url                 text
status                    text       -- 'pending' | 'approved' | 'rejected'
created_at                timestamptz
```

### `rain_measurements` — مقاييس الأمطار الرسمية (AMI)
```sql
id                   bigserial PRIMARY KEY
report_url           text       -- رابط مقال AMI (مفتاح منع التكرار)
report_title         text       -- عنوان المقال
report_published_at  timestamptz
wilaya               text       -- الولاية (مُطبَّعة)
moughataa            text       -- المقاطعة
village              text       -- القرية
mm                   numeric    -- الكمية بالمليمترات
```
**دالة SQL مخصصة:**
```sql
get_rain_reports(p_wilaya, p_year, p_limit, p_offset)
-- تُعيد التقارير الفريدة مع total_count عبر DISTINCT ON(report_url)
```

### `news_articles` — مقالات الأخبار والتوقعات
```sql
id                       uuid PRIMARY KEY
title                    text
slug                     text UNIQUE
excerpt                  text
content                  text
category                 text       -- 'أمطار'|'عواصف'|'طقس'|'طقس حار'|'عام'
wilaya                   text
author                   text
featured_image           text
is_published             boolean
published_at             timestamptz
tags                     text[]
views                    integer
fb_post_id               text       -- معرّف منشور فيسبوك
forecast_signature       jsonb      -- بصمة التوقع (للكشف عن التغييرات)
forecast_signature_hash  text       -- SHA-256 للبصمة
```

### `weather_bulletins` — نشرات "رصد اليوم"
```sql
id         uuid PRIMARY KEY
text       text
icon       text    -- إيموجي تلقائي
created_at timestamptz
```

### `news_submissions` — أخبار المستخدمين (بانتظار مراجعة)
```sql
id, title, body, category, city, author_name, contact, image_url
status: 'pending' | 'approved' | 'rejected'
```

### `push_subscriptions` — اشتراكات الإشعارات الفورية
```sql
id, endpoint (UNIQUE), p256dh, auth, user_agent, created_at
```

### `push_state` — منع تكرار الإشعارات
```sql
key, signature, sent_at
```

### `storm_cells` — خلايا العواصف الرعدية (Blitzortung)
```sql
id, lat, lon, strike_count, first_strike_at, last_strike_at
```

### `storm_suppressions` — خلايا مُخمَدة (مؤقتاً)
```sql
id, lat, lon, suppressed_until
```

### `fb_pending_replies` — ردود فيسبوك المقترحة (تنتظر موافقة)
```sql
id, comment_id, proposed_reply, status: 'pending'|'approved'|'rejected'
```

### `page_visits` — إحصاءات الزيارات
```sql
id, created_at
```

### `agent_queries` — سجل أسئلة المساعد الذكي
```sql
id, question, city, created_at
```

### `bloggers` + `blogger_posts` — المدوّنون
```sql
bloggers: id, name, bio, avatar_url, wilaya, facebook_url
blogger_posts: id, blogger_id, title, content, image_url, published_at
```

---

## 4. Edge Functions — الدوال الخلفية

### `ami-rain-scraper` — جلب مقاييس الأمطار من AMI
**الجدولة:** كل 3 ساعات (`0 */3 * * *`) عبر pg_cron

**المسار الكامل:**
1. يجلب RSS خلاصة `https://www.ami.mr/feed`
2. يصفّي المقالات التي تحتوي "مطر" أو "مقاييس" في عنوانها
3. يتحقق من عدم وجود `report_url` مسبقاً في الجدول
4. يحلّل HTML المقال بـ Cheerio يبحث عن جدول (الولاية/المقاطعة/القرية/الكمية)
5. يُطبّع أسماء الولايات (يدمج الأشكال المختلفة للاسم الواحد)
6. يحفظ القراءات في `rain_measurements`
7. يُرسل إشعار Telegram + ينشر على فيسبوك

**معاملات URL:**
- `?url=https://ami.mr/archives/12345` — معالجة مقال بعينه (بدون نشر FB)
- `?no-fb=1` — تجاهل النشر على فيسبوك
- `?fix-dates=1` — إصلاح التواريخ (لا يُجمع مع `?url=`)

**⚠️ تحذير مهم:** معامل `fix-dates` يُفحص أولاً — لا تضعه مع `?url=`

**استيراد يدوي بالجملة (PowerShell):**
```powershell
# جلب IDs مقالات سنة معينة
$url = "https://www.ami.mr/wp-json/wp/v2/posts?search=مقاييس الأمطار&after=2024-01-01T00:00:00&before=2025-01-01T00:00:00&per_page=100&_fields=id"
$ids = (Invoke-RestMethod -Uri $url).id

# استيراد كل مقال
foreach ($id in $ids) {
  $endpoint = "https://udtdfkvtmqfxjezhxaah.supabase.co/functions/v1/ami-rain-scraper?url=https://www.ami.mr/archives/$id&no-fb=1"
  Invoke-RestMethod -Uri $endpoint -Headers @{ Authorization = "Bearer sb_publishable_xxxx... (انظر Supabase Dashboard → Settings → API)" } -TimeoutSec 100
}
```

**أرشيف مقالات AMI المستوردة حتى الآن:**

| السنة | عدد المقالات | الحالة |
|---|---|---|
| 2026 | 12 | ✅ مستورد |
| 2025 | 22 | ✅ مستورد |
| 2024 | 51 | ✅ مستورد |
| 2023 | 65 | ✅ مستورد |
| 2022 | 71 | ✅ مستورد |
| 2021 | 50 | ✅ مستورد |
| 2020 | 62 | ✅ مستورد |
| 2019 | 43 | ✅ مستورد |
| 2018 | 11 | ✅ مستورد |
| 2017 | 8 | ✅ مستورد |
| 2016 | 5 | ✅ مستورد |
| 2015 | 27 | ✅ مستورد |

---

### `forecast-publisher` — نشر التوقعات الجوية تلقائياً
**الجدولة:** مرتين يومياً (9:00 UTC و 21:00 UTC) عبر pg_cron

**جولة الصباح (AM — 9:00 UTC):**
- يجلب بيانات ECMWF 00Z من Open-Meteo
- يبني توقعاً لكل يوم من يوم+1 ويوم+2
- Slug: `forecast-daily-YYYY-MM-DD-AM`

**جولة المساء (PM — 21:00 UTC):**
- يجلب بيانات ECMWF 12Z من Open-Meteo (hourly)
- توقع موحّد لآخر 24 ساعة القادمة
- Slug: `forecast-window-YYYY-MM-DD-PM`

**آلية منع التكرار:**
- يحسب SHA-256 لبيانات التوقع (مدن × ولايات × شدة)
- إن تطابق الـ hash → لا نشر
- إن اختلف → تحديث المقال في مكانه + قسمي "التوقع السابق" و"التحديث"

**إشعارات:**
- Telegram: عند نشر أو تحديث توقع
- Web Push: لجميع المشتركين
- فيسبوك: عند أول نشر فقط (لا عند التحديث)

**عتبات النشر:**
- أمطار: `mm >= 3` و `probability >= 40%`
- عواصف: weather code `>= 95`

---

### `notify-telegram` — إشعارات Telegram للأدمن
يستقبل إدراجات جديدة (Webhook من قاعدة البيانات أو استدعاء مباشر):

| نوع البلاغ | الرسالة |
|---|---|
| `livestock_reports` | 🐫 بلاغ ظالة جديد مع أزرار نشر/رفض |
| `rain_reports` | 🌧️ تبشيرة مطر جديدة مع أزرار |
| `news_submissions` | 📰 خبر جديد مع أزرار |
| `forecast` | 📅 توقع جوي جديد مع رابط |

---

### `telegram-webhook` — استقبال أوامر Telegram
**أوامر متاحة:**

| الأمر | الوظيفة |
|---|---|
| `/نشر <نص>` | نشر نشرة في "رصد اليوم" |
| `/عاصفة <نص>` | نشر تنبيه عاصفة فوري ⛈️ |
| `/خبر <عنوان>\n<محتوى>` | نشر خبر مباشرة |
| `/حذف` | حذف آخر نشرة |
| `/نشرات` | عرض النشرات النشطة |
| `/اخبار` | آخر الأخبار المنشورة |

**أزرار Callback:**
- `approve:livestock:ID` → نشر بلاغ ظالة
- `reject:livestock:ID` → رفض بلاغ
- `approve:fbreply:ID` → نشر رد فيسبوك
- `storm:suppress:ID` → إخماد خلية عاصفة 3 ساعات

---

### `fb-post-article` — نشر على فيسبوك
ينشر مقال على صفحة فيسبوك عند أول نشر للتوقع أو عند الموافقة على خبر.

### `fb-comment-autoreply` — الرد التلقائي على تعليقات فيسبوك
يقترح ردوداً على التعليقات ويرسلها للأدمن عبر Telegram للموافقة.

### `send-push` — إشعارات Web Push
يرسل إشعار فوري لجميع المشتركين مع منع التكرار عبر `push_state`.

### `storm-notifier` — إشعارات الصواعق
يراقب Blitzortung ويرسل تنبيه إذا تجاوزت الصواعق قريباً عتبة معينة.

### `og-proxy` — Open Graph Proxy
يجلب بيانات Open Graph للروابط الخارجية (لمعاينة الروابط).

---

## 5. بلاغات الظالة — تدفق العمل الكامل

```
المستخدم → LivestockReportPage.jsx
    → يرفع صورة إلى Supabase Storage (bucket: images)
    → يُدرج في livestock_reports (status='pending')
    → notify-telegram يُرسل لك إشعار Telegram مع أزرار ✅/❌
    → تضغط ✅ → telegram-webhook يُغيّر status إلى 'approved'
    → يظهر في الموقع (RLS تُعيد فقط status='approved')
```

**صفحة الواجهة:** `/livestock` ← `LivestockReportPage.jsx`
**في الأدمن:** `/admin` ← قسم "بلاغات الظالة" في `AdminPage.jsx`

---

## 6. مقاييس الأمطار الرسمية — تدفق العمل الكامل

```
AMI RSS Feed (كل 3 ساعات)
    → ami-rain-scraper (Edge Function)
    → تحليل جدول HTML (Cheerio + rowspan tracking)
    → تطبيع أسماء الولايات (WILAYA_NORMALIZE)
    → حفظ في rain_measurements
    → إشعار Telegram + نشر فيسبوك

للعرض في الموقع:
    MeasurementsPage.jsx
        → get_rain_reports() RPC (DISTINCT ON report_url)
        → عرض مجمَّع: تقرير → ولايات → مقاطعات → قرى
        → فلتر: سنة (2015-2026) + ولاية + بحث
        → إحصاءات: ترتيب الولايات + أعلى القراءات
```

**دالة `get_rain_reports` SQL:**
```sql
-- تُعيد تقارير فريدة (مقال AMI = تقرير) مع pagination
get_rain_reports(p_wilaya TEXT, p_year INT, p_limit INT, p_offset INT)
RETURNS TABLE(report_url, report_title, report_published_at, total_count)
```

**الدوال في `supabase.js`:**
- `getRainMeasurementReports({limit, offset, wilaya, year})` — الأرشيف مع ترقيم
- `getRainMeasurementStats(year)` — الإحصاءات والتصنيفات
- `getTopRainRecords10Years(limit)` — أعلى القياسات في 10 سنوات
- `searchRainMeasurements(query, wilaya, year)` — بحث
- `getWilayaReadings(reportUrl)` — قراءات تقرير محدد

---

## 7. نشر التوقعات — طريقتان

### أ) تلقائي (ECMWF عبر Open-Meteo)
`forecast-publisher` Edge Function يعمل مرتين يومياً تلقائياً.

### ب) يدوي (من صفحة الأدمن)
```
/admin → ForecastPublisher.jsx
    → تحديد: المدن، الولايات، الشدة، نوع الطقس، التاريخ
    → adminCreateNews() → إدراج في news_articles
    → notify-telegram يُرسل لك إشعار Telegram فوراً
    → postToFacebookPage() → نشر على فيسبوك
```

**أوامر نشر من Telegram مباشرة:**
```
/نشر يتوقع بإذن الله هطول أمطار على نواكشوط الليلة
```

---

## 8. صفحات الموقع وملفاتها

| الصفحة | الملف | الوظيفة |
|---|---|---|
| الرئيسية | `Home.jsx` | طقس + توقعات + أخبار + بطاقة أعلى المقاييس |
| مقاييس الأمطار | `MeasurementsPage.jsx` | أرشيف رسمي شهري مع بحث وإحصاءات |
| أرشيف التوقعات | `ForecastArchivePage.jsx` | أرشيف شهري للتوقعات المنشورة |
| بلاغات الظالة | `LivestockReportPage.jsx` | إرسال ومشاهدة البلاغات |
| الأخبار | `NewsSection` | مقالات الطقس والتوقعات |
| الأدمن | `AdminPage.jsx` | لوحة تحكم كاملة |
| المدوّنون | `BloggersPage.jsx` | صفحات المدوّنين |

---

## 9. الأدمن — `/admin`

**الأقسام:**
1. **نشر التوقعات** — `ForecastPublisher.jsx`
2. **رصد اليوم** — نشرات `weather_bulletins`
3. **الإحصاءات** — زيارات يومية + مشتركو Push
4. **بلاغات الظالة** — مراجعة وقبول/رفض
5. **تبشيرات المطر** — مراجعة وقبول/رفض
6. **خلايا العواصف** — مراقبة خلايا Blitzortung
7. **مقاييس AMI** — إدارة الأرشيف

---

## 10. النشر والتطوير

### تشغيل محلي
```bash
cd JATKOUM-SHAB-main
npm install
npm run dev        # يعمل على http://localhost:5173
```

### النشر على Vercel
```
Push إلى branch main → Vercel يبني تلقائياً → يُنشر على jatkoumshab.com
```
**⚠️ ملف `.env` يجب أن يكون مضبوطاً في Vercel Environment Variables**

### نشر Edge Function
```bash
SUPABASE_ACCESS_TOKEN=sbp_xxxx...
npx supabase functions deploy <function-name> --no-verify-jwt
```

### تطبيق migrations قاعدة البيانات
```bash
# عبر CLI (قد يفشل إذا كانت migrations قديمة موجودة)
npx supabase db push

# البديل: عبر Supabase Dashboard → SQL Editor → لصق محتوى ملف .sql
```

### تطبيق SQL مباشرة (Management API)
```powershell
$sql = "SELECT * FROM rain_measurements LIMIT 5"
$body = @{ query = $sql } | ConvertTo-Json
Invoke-RestMethod `
  -Uri "https://api.supabase.com/v1/projects/udtdfkvtmqfxjezhxaah/database/query" `
  -Method POST `
  -Headers @{ Authorization = "Bearer <SUPABASE_ACCESS_TOKEN>"; "Content-Type" = "application/json" } `
  -Body $body
```

---

## 11. الجدولة التلقائية (pg_cron)

| الوظيفة | الجدول |
|---|---|
| `ami-rain-scraper` | كل 3 ساعات (`0 */3 * * *`) |
| `forecast-publisher` | مرتين يومياً (9:00 و 21:00 UTC) |

---

## 12. تطبيع أسماء الولايات

AMI يكتب أسماء الولايات بأشكال مختلفة. خريطة التطبيع `WILAYA_NORMALIZE`:

```javascript
'اسابه' / 'آسابه' / 'عصابه' / 'لعصابة' → 'لعصابه'
'البراكنة' / 'لبراكنة'                   → 'لبراكنه'
'الترارزه' / 'اترارزه'                   → 'الترارزة'
'ادرار' / 'أدرار'                         → 'آدرار'
'نواذيبو' / 'داخلة نواذيبو'              → 'داخلت نواذيبو'
'اينشيري' / 'انشيري'                      → 'إينشيري'
'كيدي ماغه' / 'گيديماغه'                 → 'كيدي ماغا'
```

---

## 13. الترتيب الرسمي للولايات

```
01 — الحوض الشرقي    09 — نواكشوط الغربية
02 — الحوض الغربي    10 — نواكشوط الجنوبية
03 — لعصابه          11 — داخلت نواذيبو
04 — كوركول          12 — تكانت
05 — لبراكنه         13 — كيدي ماغا
06 — الترارزة        14 — تيرس زمور
07 — آدرار           15 — إينشيري
08 — نواكشوط الشمالية
```

---

## 14. مكتبات JavaScript الرئيسية

| المكتبة | الاستخدام |
|---|---|
| `@supabase/supabase-js` | التواصل مع قاعدة البيانات |
| `react-router-dom` | التنقل بين الصفحات (SPA) |
| `echarts` / `echarts-for-react` | الرسوم البيانية في الإحصاءات |
| `framer-motion` | الانيميشن |
| `react-icons` | الأيقونات |
| `date-fns` | معالجة التواريخ |
| `cheerio` | تحليل HTML (في Edge Functions) |

---

## 15. التنسيق — ملاحظات مهمة

- **الأرقام:** دائماً لاتينية (Western) — نستخدم locale `ar-u-nu-latn`
- **التقويم:** ميلادي دائماً — نضيف `calendar: 'gregory'` لمنع Hijri
- **الاتجاه:** RTL — `dir="rtl"` على كل الصفحات
- **الألوان الرئيسية:** `#0b2c5e` (كحلي داكن) و `#1d4ed8` (أزرق)
