// Supabase Edge Function: forecast-publisher
// يُستدعى مرتين يومياً عبر pg_cron (9:00 و21:00 UTC — بعد توفر تشغيلتي ECMWF)
// يجلب توقعات Open-Meteo لأهم مدن موريتانيا
// وينشر تلقائياً أخبار التوقعات إذا وُجدت أمطار أو عواصف خلال 72 ساعة
// كما ينشر نفس الخبر فوراً على صفحة فيسبوك عبر fb-post-article (بلا مراجعة، عند أول نشر فقط)
//
// كل جولة (AM يعتمد ECMWF 00Z، PM يعتمد ECMWF 12Z) مستقلة تماماً عن الأخرى:
// لكل (يوم × جولة) slug خاص به (forecast-daily-YYYY-MM-DD-AM أو ...-PM).
// كل مقال يذكر بوضوح وقتين منفصلين: وقت صدور تشغيلة النموذج ووقت نشر الخبر.
//
// الجولة المسائية (PM) تقارن جوهر توقعاتها (بمعزل عن التوقيت) بجوهر خبر الصباح
// لنفس اليوم قبل النشر: إن كانت متطابقة، لا يُنشأ مقال PM منفصل — تُضاف فقط
// ملاحظة تأكيد قصيرة على مقال الصباح. إن اختلفت جوهرياً، يُنشر مقال PM مستقل
// (لا يمحو أو يستبدل مقال AM). التحديث فوق نفس المقال يحدث فقط إذا استُدعيت
// نفس الجولة أكثر من مرة (تشغيل مكرر غير متوقع) وتغيّر المحتوى.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

// ينشر على صفحة فيسبوك عبر الدالة المركزية fb-post-article (نفس المسار المستخدم لكل أخبار الموقع)
async function postToFacebookPage(title: string, content: string, slug: string) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/fb-post-article`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, content, slug }),
    });
  } catch (e) {
    console.error('FB post error:', e);
  }
}

// أهم مدن موريتانيا مع إحداثياتها وولاياتها
const CITIES = [
  { city: 'نواكشوط',    lat: 18.079,  lon: -15.965, wilaya: 'نواكشوط الغربية' },
  { city: 'نواذيبو',    lat: 20.933,  lon: -17.034, wilaya: 'داخلت نواذيبو' },
  { city: 'كيدي ماغا',  lat: 16.456,  lon: -13.507, wilaya: 'كيدي ماغا' },
  { city: 'روصو',       lat: 16.513,  lon: -15.653, wilaya: 'الترارزة' },
  { city: 'كيفة',       lat: 16.617,  lon: -11.404, wilaya: 'الحوض الغربي' },
  { city: 'نيمي',       lat: 16.614,  lon: -9.977,  wilaya: 'الحوض الغربي' },
  { city: 'تمبدغت',     lat: 17.251,  lon: -10.619, wilaya: 'الحوض الغربي' },
  { city: 'النعمة',     lat: 17.627,  lon: -7.273,  wilaya: 'الحوض الشرقي' },
  { city: 'باسكنو',     lat: 15.943,  lon: -9.397,  wilaya: 'الحوض الشرقي' },
  { city: 'فصاله',      lat: 15.817,  lon: -12.746, wilaya: 'لعصابه' },
  { city: 'سيلبابي',    lat: 15.174,  lon: -12.745, wilaya: 'كوركول' },
  { city: 'تيجيكجة',    lat: 18.450,  lon: -11.423, wilaya: 'تكانت' },
  { city: 'أطار',       lat: 20.518,  lon: -13.050, wilaya: 'آدرار' },
  { city: 'أكجوجت',     lat: 19.747,  lon: -14.374, wilaya: 'إينشيري' },
  { city: 'ألاك',       lat: 17.294,  lon: -13.660, wilaya: 'البراكنه' },
  { city: 'مال',        lat: 17.057,  lon: -15.310, wilaya: 'البراكنه' },
  { city: 'ايون',       lat: 16.040,  lon: -9.618,  wilaya: 'الحوض الشرقي' },
  { city: 'ولاته',      lat: 17.293,  lon: -7.024,  wilaya: 'الحوض الشرقي' },
  { city: 'بوكي',       lat: 17.858,  lon: -12.382, wilaya: 'لبراكنه' },
  { city: 'المذرذرة',   lat: 16.505,  lon: -12.501, wilaya: 'لعصابه' },
  { city: 'قيدي',       lat: 15.848,  lon: -12.233, wilaya: 'كوركول' },
  { city: 'سيلبابي',    lat: 15.174,  lon: -12.745, wilaya: 'كوركول' },
  { city: 'زويرات',     lat: 22.734,  lon: -12.480, wilaya: 'تيرس زمور' },
  { city: 'تيندوف',     lat: 17.880,  lon: -14.890, wilaya: 'الترارزة' },
];

// WMO weather codes → تصنيف
function classifyCode(code: number): { isRain: boolean; isStorm: boolean; isWind: boolean } {
  if (code >= 95) return { isRain: true,  isStorm: true,  isWind: false };
  if (code >= 61) return { isRain: true,  isStorm: false, isWind: false };
  if (code >= 51) return { isRain: true,  isStorm: false, isWind: false };
  return            { isRain: false, isStorm: false, isWind: false };
}

// تحديد شدة الأمطار من كمية mm
function intensityFromMm(mm: number): string {
  if (mm >= 30) return 'غزيرة جداً';
  if (mm >= 15) return 'غزيرة';
  if (mm >= 5)  return 'متوسطة';
  return 'خفيفة';
}

// تحويل تاريخ إلى أسماء عربية
function arabicDay(d: Date): string {
  return d.toLocaleDateString('ar-SA', { weekday: 'long', timeZone: 'Africa/Abidjan' });
}
function arabicDate(d: Date): string {
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', timeZone: 'Africa/Abidjan' });
}
function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function tg(text: string) {
  if (!TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' }),
  });
}

Deno.serve(async () => {
  try {
    const now   = new Date();
    const today = isoDate(now);

    // جولة النشر: صباحية (تشغيلة ECMWF 00Z، تُستدعى ~9:00 UTC) أو مسائية
    // (تشغيلة ECMWF 12Z، تُستدعى ~21:00 UTC). كل جولة تُنتج مقالها المستقل
    // بدل الكتابة فوق مقال الجولة الأخرى لنفس اليوم.
    const run        = now.getUTCHours() < 12 ? 'AM' : 'PM';
    const modelCycle = run === 'AM' ? '00Z' : '12Z';

    // ── 1. جلب توقعات Open-Meteo لجميع المدن دفعة واحدة ──
    const lats = CITIES.map((c) => c.lat).join(',');
    const lons = CITIES.map((c) => c.lon).join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
      `&daily=weathercode,precipitation_sum,precipitation_probability_max` +
      `&timezone=Africa%2FAbidjan&forecast_days=4`;

    const res  = await fetch(url);
    const json = await res.json();

    // Open-Meteo يُعيد مصفوفة عند طلب عدة مواقع
    const results: unknown[] = Array.isArray(json) ? json : [json];

    // ── 2. تجميع المدن المتأثرة لكل يوم من اليوم+1 حتى اليوم+3 ──
    interface DayEntry {
      date: Date;
      dateStr: string;
      storm: string[];
      rain: string[];
      stormWilaya: string[];
      rainWilaya: string[];
      maxMm: number;
    }

    const byDay: Record<string, DayEntry> = {};

    results.forEach((r: any, idx: number) => {
      const cityInfo = CITIES[idx];
      if (!r?.daily?.time) return;

      r.daily.time.forEach((dateStr: string, di: number) => {
        if (dateStr === today) return; // تجاهل اليوم الحالي

        const code  = r.daily.weathercode?.[di] ?? 0;
        const mm    = r.daily.precipitation_sum?.[di] ?? 0;
        const prob  = r.daily.precipitation_probability_max?.[di] ?? 0;

        const { isRain, isStorm } = classifyCode(code);
        const significant = (isRain && mm >= 3 && prob >= 40) || isStorm;
        if (!significant) return;

        if (!byDay[dateStr]) {
          byDay[dateStr] = {
            date: new Date(dateStr + 'T12:00:00Z'),
            dateStr,
            storm: [], rain: [],
            stormWilaya: [], rainWilaya: [],
            maxMm: 0,
          };
        }
        const entry = byDay[dateStr];
        entry.maxMm = Math.max(entry.maxMm, mm);
        if (isStorm) {
          if (!entry.storm.includes(cityInfo.city)) entry.storm.push(cityInfo.city);
          if (!entry.stormWilaya.includes(cityInfo.wilaya)) entry.stormWilaya.push(cityInfo.wilaya);
        } else {
          if (!entry.rain.includes(cityInfo.city)) entry.rain.push(cityInfo.city);
          if (!entry.rainWilaya.includes(cityInfo.wilaya)) entry.rainWilaya.push(cityInfo.wilaya);
        }
      });
    });

    if (Object.keys(byDay).length === 0) {
      await tg('☀️ لا توقعات أمطار مهمة في الـ 72 ساعة القادمة.');
      return new Response(JSON.stringify({ published: 0, message: 'no significant forecast' }));
    }

    let published = 0;

    // وقت صدور تشغيلة النموذج (ثابت للجولة كلها) ووقت النشر الفعلي — يُعرضان منفصلَين.
    // META_SPLIT هو بداية سطر معلومات النموذج نفسه (وليس فاصلاً مصطنعاً) — يُستخدم
    // فقط لاستخراج "جسم" الخبر من محتوى مقال سابق عند المقارنة، ولا يظهر للقارئ.
    const META_SPLIT = '\n\n🛰️';
    const modelRunUTC = new Date(`${today}T${run === 'AM' ? '00:00:00' : '12:00:00'}Z`);
    const fmtUTCTime = (d: Date) =>
      d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
    const issuedTimeStr    = fmtUTCTime(modelRunUTC);
    const publishedTimeStr = fmtUTCTime(now);

    // ── 3. نشر مقال مستقل لكل (يوم × جولة) — إلا إذا لم تتغيّر التوقعات جوهرياً ──
    for (const [dateStr, entry] of Object.entries(byDay)) {
      // slug حتمي لكل يوم توقّع × جولة نشر — بحد أقصى مقالان لكل يوم (AM/PM)
      const slug = `forecast-daily-${dateStr}-${run}`;

      const { data: existingRows } = await supabase
        .from('news_articles')
        .select('id, content')
        .eq('slug', slug)
        .limit(1);
      const existing = existingRows?.[0] || null;

      const allCities  = [...entry.storm, ...entry.rain];
      const hasStorm   = entry.storm.length > 0;
      const intensity  = intensityFromMm(entry.maxMm);
      const dayAr      = arabicDay(entry.date);
      const dateAr     = arabicDate(entry.date);
      const cityNames  = allCities.slice(0, 4).join(' و');
      const icon       = hasStorm ? '⛈️' : '🌧️';
      const category   = hasStorm ? 'عواصف' : 'أمطار';
      const wilaya     = [...entry.stormWilaya, ...entry.rainWilaya][0] || '';

      const updateTag = run === 'PM' ? ' — تحديث مسائي' : '';
      let title: string;
      if (hasStorm) {
        title = `يتوقع بإذن الله هطول أمطار ${intensity} على ${cityNames} يوم ${dayAr} ${dateAr} مصحوبة بعواصف رعدية${updateTag}`;
      } else {
        title = `يتوقع بإذن الله هطول أمطار ${intensity} على ${cityNames} يوم ${dayAr} ${dateAr}${updateTag}`;
      }

      // ── جسم الخبر (الجزء الجوهري القابل للمقارنة بين الجولتين) ──
      let body = '';
      entry.storm.forEach((city) => {
        const w = CITIES.find((c) => c.city === city)?.wilaya || '';
        body += `يتوقع بإذن الله ${icon} هطول أمطار ${intensity} على ${city}${w ? ` (${w})` : ''} يوم ${dayAr} ${dateAr} مصحوبة بعواصف رعدية.\n\n`;
      });
      entry.rain.forEach((city) => {
        const w = CITIES.find((c) => c.city === city)?.wilaya || '';
        body += `يتوقع بإذن الله 🌧️ هطول أمطار ${intensity} على ${city}${w ? ` (${w})` : ''} يوم ${dayAr} ${dateAr}.\n\n`;
      });
      body += `جعلها الله خيراً وبركة.`;

      // ── وقت صدور بيانات النموذج ووقت نشر الخبر، منفصلان بوضوح ──
      const meta =
        `🛰️ صدرت بيانات النموذج (ECMWF ${modelCycle}) الساعة ${issuedTimeStr}\n` +
        `🕓 نُشر هذا الخبر الساعة ${publishedTimeStr}`;
      const content = `${body}\n\n${meta}`;
      const link = `${Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com'}/#/news/${slug}`;
      const tags = ['توقعات', category, 'أوتوماتيك', run, modelCycle];

      if (existing) {
        // نفس الجولة استُدعيت مرتين — حدّث فقط إذا تغيّر الجسم فعلياً، وإلا تجاهل
        const existingBody = (existing.content || '').split(META_SPLIT)[0].trimEnd();
        if (existingBody === body) continue;

        const { error } = await supabase.from('news_articles').update({
          title, excerpt: title, content, category, wilaya,
          published_at: new Date().toISOString(), tags,
        }).eq('id', existing.id);

        if (!error) {
          published++;
          await tg(`🔄 *تحديث ضمن نفس الجولة (${run}):*\n${title}\n\n🔗 ${link}`);
        }
        continue;
      }

      // ── الجولة المسائية فقط: قارن بجوهر خبر الصباح لنفس اليوم قبل نشر مقال جديد ──
      if (run === 'PM') {
        const amSlug = `forecast-daily-${dateStr}-AM`;
        const { data: amRows } = await supabase
          .from('news_articles')
          .select('id, content')
          .eq('slug', amSlug)
          .limit(1);
        const amArticle = amRows?.[0] || null;

        if (amArticle) {
          const amBody = (amArticle.content || '').split(META_SPLIT)[0].trimEnd();
          if (amBody === body) {
            // لا تغيير جوهري — أضف ملاحظة تأكيد على خبر الصباح بدل نشر مقال مكرر
            const noChangeNote =
              `\n\n🔄 **تحديث مسائي (${modelCycle} — ${publishedTimeStr}):** لا توجد تغييرات جوهرية ` +
              `مقارنة بالنشرة الصباحية.`;
            if (!(amArticle.content || '').includes('تحديث مسائي (')) {
              await supabase.from('news_articles')
                .update({ content: amArticle.content + noChangeNote })
                .eq('id', amArticle.id);
              await tg(`✅ *لا تغيير جوهري (PM — ${modelCycle}):* ${dateStr} — أُضيفت ملاحظة تأكيد بدل مقال جديد.`);
            }
            continue; // لا يُنشأ مقال PM منفصل
          }
        }
      }

      // ── نشر جديد (أول ظهور لهذا اليوم، أو تغيّر جوهري في الجولة المسائية) ──
      const { error } = await supabase.from('news_articles').insert([{
        title, slug, excerpt: title, content, category, wilaya,
        author: 'جاتكم اسحاب',
        is_published: true,
        published_at: new Date().toISOString(),
        tags,
        featured_image: '',
      }]);

      if (!error) {
        published++;
        const roundLabel = run === 'AM' ? 'الجولة الصباحية' : 'الجولة المسائية';
        await tg(`📰 *نُشر تلقائياً (${roundLabel} — ${modelCycle}):*\n${title}\n\n🔗 ${link}`);
        await postToFacebookPage(title, content, slug);
      }
    }

    // إرسال إشعار Push بعد نشر التوقعات
    if (published > 0) {
      const daysLabel = Object.keys(byDay).length;
      const pushTitle = '📅 توقعات جديدة — جاتكم اسحاب';
      const pushBody  = `نُشرت توقعات الأمطار للأيام الـ${daysLabel} القادمة في موريتانيا. اضغط للاطلاع على التفاصيل.`;
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          title: pushTitle,
          body:  pushBody,
          url:   '/',
          tag:   'forecast-update',
          dedupeKey: `forecast-${today}-${run}`,
          signature: `forecast-${today}-${run}`,
          windowMinutes: 600, // أقل من الفارق بين الجولتين حتى لا تُخمَد جولة PM بنافذة AM
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ published, days: Object.keys(byDay).length }), {
      headers: { 'content-type': 'application/json' },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await tg(`❌ خطأ في forecast-publisher: ${msg}`).catch(() => {});
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
