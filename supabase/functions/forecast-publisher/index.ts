// Supabase Edge Function: forecast-publisher
// يُستدعى كل يوم الساعة 6 صباحاً عبر pg_cron
// يجلب توقعات Open-Meteo لأهم مدن موريتانيا
// وينشر تلقائياً أخبار التوقعات إذا وُجدت أمطار أو عواصف خلال 72 ساعة

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

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

// slug بسيط
function slugify(text: string): string {
  const clean = text
    .replace(/[أإآا]/g, 'a').replace(/[ى]/g, 'y').replace(/[ة]/g, 'h')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
  return `${clean}-${Date.now()}`.slice(0, 80);
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

    // ── 3. نشر مقال لكل يوم متأثر ──
    for (const [dateStr, entry] of Object.entries(byDay)) {
      // تجنب التكرار: هل نُشر مقال لهذا اليوم اليوم؟
      const { data: existing } = await supabase
        .from('news_articles')
        .select('id')
        .ilike('title', `%${arabicDate(entry.date)}%`)
        .eq('is_published', true)
        .limit(1);

      if (existing && existing.length > 0) continue; // مقال موجود مسبقاً

      const allCities  = [...entry.storm, ...entry.rain];
      const hasStorm   = entry.storm.length > 0;
      const intensity  = intensityFromMm(entry.maxMm);
      const dayAr      = arabicDay(entry.date);
      const dateAr     = arabicDate(entry.date);
      const cityNames  = allCities.slice(0, 4).join(' و');
      const icon       = hasStorm ? '⛈️' : '🌧️';
      const category   = hasStorm ? 'عواصف' : 'أمطار';
      const wilaya     = [...entry.stormWilaya, ...entry.rainWilaya][0] || '';

      // ── العنوان بالصيغة المطلوبة ──
      let title: string;
      if (hasStorm) {
        title = `يتوقع بإذن الله هطول أمطار ${intensity} على ${cityNames} يوم ${dayAr} ${dateAr} مصحوبة بعواصف رعدية`;
      } else {
        title = `يتوقع بإذن الله هطول أمطار ${intensity} على ${cityNames} يوم ${dayAr} ${dateAr}`;
      }

      // ── المحتوى التفصيلي ──
      let content = '';
      entry.storm.forEach((city) => {
        const w = CITIES.find((c) => c.city === city)?.wilaya || '';
        content += `يتوقع بإذن الله ${icon} هطول أمطار ${intensity} على ${city}${w ? ` (${w})` : ''} يوم ${dayAr} ${dateAr} مصحوبة بعواصف رعدية.\n\n`;
      });
      entry.rain.forEach((city) => {
        const w = CITIES.find((c) => c.city === city)?.wilaya || '';
        content += `يتوقع بإذن الله 🌧️ هطول أمطار ${intensity} على ${city}${w ? ` (${w})` : ''} يوم ${dayAr} ${dateAr}.\n\n`;
      });
      content += `جعلها الله خيراً وبركة.`;

      const slug = slugify(title);
      const { error } = await supabase.from('news_articles').insert([{
        title,
        slug,
        excerpt: title,
        content,
        category,
        wilaya,
        author: 'جاتكم اسحاب',
        is_published: true,
        published_at: new Date().toISOString(),
        tags: ['توقعات', category, 'أوتوماتيك'],
        featured_image: '',
      }]);

      if (!error) {
        published++;
        await tg(`📰 *نُشر تلقائياً:*\n${title}\n\n🔗 ${Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com'}/#/news/${slug}`);
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
          dedupeKey: `forecast-${today}`,
          signature: `forecast-${today}`,
          windowMinutes: 1440,
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
