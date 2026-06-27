// يحوّل weatherData إلى أخبار توقعات — خبر واحد لكل ولاية
// بنفس تنسيق بطاقات WeatherAlerts في الصفحة الرئيسية

import { toArabicCommune } from './mauritaniaCommuneNamesAr';
import { normalizeMauritaniaWilayaName } from './mauritaniaPlaceNames';
import { adminCreateNews, supabase, saveWeatherSnapshot } from './supabase';

const DAYS_AR   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function dayName(dateStr)  { return DAYS_AR[new Date(dateStr).getDay()]; }
function arabicFullDate(dateStr) {
  const d = new Date(dateStr);
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]}`;
}
function isRainySeason(dateStr) { const m = new Date(dateStr).getMonth()+1; return m>=6 && m<=10; }

function rainLevel(mm) {
  if (mm >= 20) return 'غزيرة جداً';
  if (mm >= 10) return 'غزيرة';
  if (mm >= 5)  return 'متوسطة';
  if (mm >= 1)  return 'ضعيفة';
  return null;
}

function join(arr) {
  if (!arr.length) return '';
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join('، ') + ' و' + arr[arr.length - 1];
}

// ─── 1. استخراج التوقعات مقسّمة حسب الولاية (نفس منطق WeatherAlerts) ──────
export function extractForecastDays(weatherData) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const map = {};

  (weatherData || []).forEach((city) => {
    const dates = city.daily?.time               || [];
    const codes = city.daily?.weather_code       || [];
    const rains = city.daily?.precipitation_sum  || [];

    let count = 0;
    for (let i = 0; i < dates.length && count < 3; i++) {
      if (!dates[i] || dates[i] <= todayStr) continue;
      count++;
      const dateStr   = dates[i];
      const code      = codes[i] ?? 0;
      const mm        = rains[i] ?? 0;
      const wilayaKey = normalizeMauritaniaWilayaName(city.wilaya) || 'مناطق أخرى';
      const cityAr    = toArabicCommune(city.city) || city.city;

      if (!map[dateStr]) map[dateStr] = { dateStr, wilayas: {} };
      if (!map[dateStr].wilayas[wilayaKey]) {
        map[dateStr].wilayas[wilayaKey] = { wilaya: wilayaKey, thunder: [], heavy: [], moderate: [], weak: [] };
      }
      const wf = map[dateStr].wilayas[wilayaKey];

      if (code >= 95) {
        const intensity = isRainySeason(dateStr)
          ? (mm >= 10 ? 'غزيرة' : 'متوسطة')
          : (mm >= 5  ? 'غزيرة' : mm >= 1 ? 'متوسطة' : null);
        wf.thunder.push({ city: cityAr, intensity });
      } else if (mm >= 1 || code >= 61) {
        const lvl = rainLevel(mm);
        if      (lvl === 'غزيرة جداً' || lvl === 'غزيرة') wf.heavy.push(cityAr);
        else if (lvl === 'متوسطة')                          wf.moderate.push(cityAr);
        else if (lvl === 'ضعيفة')                           wf.weak.push(cityAr);
      }
    }
  });

  return Object.values(map)
    .map((day) => ({
      ...day,
      forecasts: Object.values(day.wilayas).filter(
        (f) => f.thunder.length || f.heavy.length || f.moderate.length || f.weak.length
      ),
    }))
    .filter((day) => day.forecasts.length > 0)
    .sort((a, b) => new Date(a.dateStr) - new Date(b.dateStr));
}

// ─── 2. تجميع حسب الولاية (ولاية → أيامها) — نفس wilayaGroups ────────────
function groupByWilaya(days) {
  const map = new Map();
  days.forEach((day) => {
    day.forecasts.forEach((forecast) => {
      const w = forecast.wilaya;
      if (!map.has(w)) map.set(w, []);
      map.get(w).push({ day, forecast });
    });
  });
  return map; // Map<wilaya, [{day, forecast}]>
}

// ─── 3. بناء محتوى الخبر بنفس تنسيق بطاقة الولاية ────────────────────────
function buildWilayaContent(wilaya, entries) {
  const anyThunder = entries.some((e) => e.forecast.thunder.length > 0);
  const intro = anyThunder
    ? `تشير آخر التوقعات الجوية للأيام القادمة إلى فرص لهطول أمطار متفاوتة الشدة على عدة مناطق من الولاية مع توقع نشاط للعواصف الرعدية في بعض المناطق.`
    : `تشير آخر التوقعات الجوية للأيام القادمة إلى فرص لهطول أمطار متفاوتة الشدة على عدة مناطق من الولاية.`;

  let content = `${intro}\n\n`;

  entries.forEach(({ day, forecast }) => {
    content += `📅 ${arabicFullDate(day.dateStr)}\n`;

    const thunder  = [...new Set(forecast.thunder.map((t) => t.city))];
    const heavy    = [...new Set(forecast.heavy)];
    const moderate = [...new Set(forecast.moderate)];
    const weak     = [...new Set(forecast.weak)];

    if (thunder.length)  content += `⛈️ عواصف رعدية مصحوبة بأمطار، بعضها غزير: ${join(thunder)}.\n`;
    if (heavy.length)    content += `🌧️ أمطار غزيرة متوقعة في ${join(heavy)}.\n`;
    if (moderate.length) content += `🌦️ أمطار متوسطة متوقعة في ${join(moderate)}.\n`;
    if (weak.length)     content += `🌂 أمطار ضعيفة متوقعة في ${join(weak)}.\n`;

    content += `\n`;
  });

  content += `بإذن الله 🤲\nاللهم اسقنا الغيث ولا تجعلنا من القانطين\n\n`;
  content += `المصدر: Open-Meteo (ECMWF/GFS) — جاتكم اسحاب`;
  return content;
}

// ─── 4. بناء عنوان الخبر ──────────────────────────────────────────────────
function buildWilayaTitle(wilaya, entries) {
  // نجمع أبرز المدن المتأثرة عبر كل الأيام
  const allThunder  = entries.flatMap((e) => e.forecast.thunder.map((t) => t.city));
  const allHeavy    = entries.flatMap((e) => e.forecast.heavy);
  const allModerate = entries.flatMap((e) => e.forecast.moderate);
  const allCities   = [...new Set([...allThunder, ...allHeavy, ...allModerate])];
  const hasStorm    = allThunder.length > 0;

  // تحديد الشدة السائدة
  const intensity   = allThunder.length ? (entries.flatMap(e=>e.forecast.thunder).find(t=>t.intensity)?.intensity || 'متوسطة')
                    : allHeavy.length   ? 'غزيرة'
                    : 'متوسطة';

  // أسماء أيام التوقع
  const daysStr = [...new Set(entries.map((e) => dayName(e.day.dateStr)))].join(' و');

  const top = allCities.slice(0, 3);
  const loc = top.length ? top.join(' و') : wilaya;

  if (hasStorm) {
    return `يتوقع بإذن الله هطول أمطار ${intensity} على ${loc} (${wilaya}) مصحوبة بعواصف رعدية`;
  }
  return `يتوقع بإذن الله هطول أمطار ${intensity} على ${loc} (${wilaya})`;
}

function slugify(text) {
  return text
    .replace(/[أإآا]/g,'a').replace(/ى/g,'y').replace(/ة/g,'h')
    .replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').toLowerCase()
    .slice(0, 70) + '-' + Date.now();
}

// ─── 5. تجنب التكرار ─────────────────────────────────────────────────────
async function articleExistsForWilaya(wilaya) {
  // هل نُشر خبر تحمل وسومه اسم الولاية اليوم؟
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const { data } = await supabase
    .from('news_articles')
    .select('id')
    .eq('wilaya', wilaya)
    .gte('published_at', todayStart.toISOString())
    .limit(1);
  return data && data.length > 0;
}

// ─── 6. الدالة الرئيسية ──────────────────────────────────────────────────
export async function autoPublishForecastNews(weatherData) {
  const days = extractForecastDays(weatherData);
  if (!days.length) return { published: 0, skipped: 0, message: 'لا توقعات مهمة' };

  const wilayaGroups = groupByWilaya(days);
  let published = 0, skipped = 0;
  const results = [];

  for (const [wilaya, entries] of wilayaGroups) {
    // تجاهل الولايات ذات الأمطار الضعيفة فقط
    const hasSignificant = entries.some(
      (e) => e.forecast.thunder.length || e.forecast.heavy.length || e.forecast.moderate.length
    );
    if (!hasSignificant) { skipped++; continue; }

    // تجنب التكرار
    const exists = await articleExistsForWilaya(wilaya);
    if (exists) { skipped++; continue; }

    const title   = buildWilayaTitle(wilaya, entries);
    const content = buildWilayaContent(wilaya, entries);
    const hasStorm  = entries.some((e) => e.forecast.thunder.length > 0);

    try {
      await adminCreateNews({
        title,
        slug: slugify(title),
        excerpt: title,
        content,
        category: hasStorm ? 'عواصف' : 'أمطار',
        wilaya,
        author: 'جاتكم اسحاب',
        is_published: true,
        tags: ['توقعات', 'ECMWF', wilaya, hasStorm ? 'عواصف' : 'أمطار'],
        featured_image: '',
      });
      published++;
      results.push({ wilaya, title });
    } catch (e) {
      console.error(`خطأ في نشر ${wilaya}:`, e);
    }
  }

  // حفظ snapshot يومي بالتوقعات الكاملة
  try {
    await saveWeatherSnapshot(days, (weatherData || []).length);
  } catch (e) {
    console.warn('تحذير: فشل حفظ snapshot:', e);
  }

  return { published, skipped, results };
}
