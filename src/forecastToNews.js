// يحوّل weatherData إلى أخبار توقعات — خبر واحد لكل ولاية
// بنفس تنسيق بطاقات WeatherAlerts في الصفحة الرئيسية

import { toArabicCommune } from './mauritaniaCommuneNamesAr';
import { normalizeMauritaniaWilayaName } from './mauritaniaPlaceNames';
import { adminCreateNews, supabase, saveWeatherSnapshot, broadcastPush } from './supabase';
import { getImageForAlert } from './weatherImages';
import { wilayaToSlug } from './wilayaUrlSlugs';

const DAYS_AR   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function dayName(dateStr)  { return DAYS_AR[new Date(dateStr).getDay()]; }
function arabicFullDate(dateStr) {
  const d = new Date(dateStr);
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]}`;
}
function arabicFullDateWithYear(dateStr) {
  const d = new Date(dateStr);
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}
function isRainySeason(dateStr) { const m = new Date(dateStr).getMonth()+1; return m>=6 && m<=10; }

function rainLevel(mm) {
  if (mm >= 20) return 'غزيرة جداً';
  if (mm >= 10) return 'غزيرة';
  if (mm >= 5)  return 'متوسطة';
  if (mm >= 1)  return 'ضعيفة';
  return null;
}

// ─── 1. استخراج التوقعات مقسّمة حسب الولاية (نفس منطق WeatherAlerts) ──────
export function extractForecastDays(weatherData) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const map = {};

  (weatherData || []).forEach((city) => {
    if (city?.isFallback) return; // بيانات احتياطية وهمية (صفرية) — لا تُستخدم لتوليد أخبار
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
function bulletList(list) {
  return list.map((c) => `• ${c}`).join('\n');
}

function buildWilayaContent(wilaya, entries) {
  const anyThunder = entries.some((e) => e.forecast.thunder.length > 0);
  const intro = anyThunder
    ? `تشير آخر التوقعات الجوية، **بمشيئة الله**، إلى فرص لهطول أمطار متفاوتة الشدة على عدد من مناطق ولاية ${wilaya}، مع توقع نشاط للعواصف الرعدية في بعض المناطق.`
    : `تشير آخر التوقعات الجوية، **بمشيئة الله**، إلى فرص لهطول أمطار متفاوتة الشدة على عدد من مناطق ولاية ${wilaya}.`;

  const todayStr = new Date().toISOString().slice(0, 10);
  let content = `🌦️ **التوقعات الجوية – ولاية ${wilaya}**\n**${arabicFullDateWithYear(todayStr)}**\n**جاتكم اسحاب**\n\n${intro}\n\n`;

  entries.forEach(({ day, forecast }) => {
    content += `**${arabicFullDate(day.dateStr)}**\n`;

    const thunder  = [...new Set(forecast.thunder.map((t) => t.city))];
    const heavy    = [...new Set(forecast.heavy)];
    const moderate = [...new Set(forecast.moderate)];
    const weak     = [...new Set(forecast.weak)];

    if (thunder.length)  content += `⛈️ **عواصف رعدية مصحوبة بأمطار**، قد تكون غزيرة أحياناً، على:\n${bulletList(thunder)}\n`;
    if (heavy.length)    content += `🌧️ **أمطار غزيرة متوقعة** على:\n${bulletList(heavy)}\n`;
    if (moderate.length) content += `🌦️ **أمطار متوسطة متوقعة** على:\n${bulletList(moderate)}\n`;
    if (weak.length)     content += `🌦️ **أمطار خفيفة متوقعة** على:\n${bulletList(weak)}\n`;

    content += `\n`;
  });

  content += `⚠️ **تنبيه:** تمثل هذه التوقعات أفضل قراءة للنماذج الجوية في الوقت الحالي، وهي قابلة للتحديث مع صدور بيانات جديدة.\n\n`;
  content += `🤲 **اللهم اسقنا الغيث، ولا تجعلنا من القانطين.**\n\n`;
  const hashtag = `#${wilaya.replace(/\s+/g, '_')}`;
  content += `${hashtag} #موريتانيا #الأمطار #جاتكم_اسحاب`;
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

// slug حتمي لكل ولاية + يوم → يمنع التكرار حتى عند التشغيل المتزامن
// ملاحظة: استخدام wilayaToSlug (معرّفات إنجليزية فريدة مضبوطة يدوياً في
// wilayaUrlSlugs.js) إلزامي هنا — التحويل الصوتي الحرفي القديم (استبدال
// الألف بـ"a" وحذف بقية الحروف) كان يُنتج نفس المعرّف "a-a" لكل من
// "الحوض الشرقي" و"الحوض الغربي"، فيظن النظام أن أحدهما نُشر مسبقاً
// عندما تُنشر الأخرى، ويتجاهل نشرها بصمت.
function makeDailySlug(wilaya) {
  const today = new Date().toISOString().slice(0, 10);
  return `forecast-${wilayaToSlug(wilaya)}-${today}`;
}

// ─── 5. تجنب التكرار ─────────────────────────────────────────────────────
async function articleExistsForWilaya(wilaya) {
  const slug = makeDailySlug(wilaya);
  // أولاً: تحقق بـ slug الحتمي (أكثر دقة)
  const bySlug = await supabase.from('news_articles').select('id').eq('slug', slug).limit(1);
  if (bySlug.data?.length > 0) return true;
  // ثانياً: احتياطي — تحقق بـ wilaya + تاريخ اليوم (للتوافق مع المقالات القديمة)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const byWilaya = await supabase.from('news_articles').select('id')
    .eq('wilaya', wilaya).gte('published_at', todayStart.toISOString()).limit(1);
  return byWilaya.data?.length > 0;
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
        slug: makeDailySlug(wilaya),
        excerpt: title,
        content,
        category: hasStorm ? 'عواصف' : 'أمطار',
        wilaya,
        author: 'جاتكم اسحاب',
        is_published: true,
        tags: ['توقعات', wilaya, hasStorm ? 'عواصف' : 'أمطار'],
        featured_image: getImageForAlert(hasStorm ? 'عواصف' : 'أمطار', title),
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

  // إشعار Push بعد نشر التوقعات (مرة واحدة في اليوم)
  if (published > 0) {
    const today = new Date().toISOString().slice(0, 10);
    broadcastPush({
      title: '📅 توقعات جديدة — جاتكم اسحاب',
      body: `نُشرت توقعات الأمطار لـ ${published} ولاية. اضغط للاطلاع على التفاصيل.`,
      url: '/',
      tag: 'forecast-update',
      dedupeKey: `forecast-${today}`,
      signature: `forecast-${today}`,
      windowMinutes: 1440,
    }).catch(() => {});
  }

  return { published, skipped, results };
}

// ─── 7. تحذيرات الرياح / الغبار / الحرارة / البرودة ─────────────────────────
// تُستدعى مرة واحدة في اليوم بعد autoPublishForecastNews
// تنشر تحذيراً لكل نوع × كل يوم متأثر في الـ 3 أيام القادمة

const DUST_CODES = new Set([7, 8, 9, 30, 31, 32, 33, 34, 35]);

function isDust(code) { return DUST_CODES.has(code); }

async function alertSlugExists(slug) {
  const { data } = await supabase.from('news_articles').select('id').eq('slug', slug).limit(1);
  return data?.length > 0;
}

export async function autoPublishWeatherAlerts(weatherData) {
  const todayStr = new Date().toISOString().slice(0, 10);
  let published = 0;

  // جمع البيانات اليومية لكل مدينة
  // Map<dateStr, { wind: [{city,wilaya,speed}], heat: [{city,wilaya,temp}], cold: [{city,wilaya,temp}], dust: [{city,wilaya}] }>
  const byDay = {};

  (weatherData || []).forEach((city) => {
    if (city?.isFallback) return; // بيانات احتياطية وهمية (صفرية) — لا تُستخدم لإصدار تحذيرات
    const dates    = city.daily?.time                || [];
    const maxTemps = city.daily?.temperature_2m_max  || [];
    const minTemps = city.daily?.temperature_2m_min  || [];
    const maxWinds = city.daily?.wind_speed_10m_max  || [];
    const codes    = city.daily?.weather_code        || [];
    const wilaya   = normalizeMauritaniaWilayaName(city.wilaya) || '';
    const cityAr   = toArabicCommune(city.city) || city.city;

    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i];
      if (!dateStr || dateStr <= todayStr) continue;

      if (!byDay[dateStr]) byDay[dateStr] = { wind: [], heat: [], cold: [], dust: [] };
      const d = byDay[dateStr];

      const speed = maxWinds[i] ?? 0;
      const tmax  = maxTemps[i] ?? 0;
      const tmin  = minTemps[i] ?? 99;
      const code  = codes[i]    ?? 0;

      if (speed >= 50) d.wind.push({ city: cityAr, wilaya, speed: Math.round(speed) });
      if (tmax  >= 45) d.heat.push({ city: cityAr, wilaya, temp: Math.round(tmax) });
      if (tmin  <= 10) d.cold.push({ city: cityAr, wilaya, temp: Math.round(tmin) });
      if (isDust(code) || speed >= 60) d.dust.push({ city: cityAr, wilaya });
    }
  });

  // خبر واحد فقط لكل نوع تحذير × يوم (وليس خبراً لكل بلدية) — يسرد كل البلديات
  // المتأثرة داخل نفس الخبر بصيغة "بلدية X وضواحيها" الموحّدة.
  function communeLine(entry, valueLabel) {
    return `🔸 بلدية ${entry.city} وضواحيها${entry.wilaya ? ` (${entry.wilaya})` : ''}${valueLabel ? `: ${valueLabel}` : ''}`;
  }

  async function publishDayAlert(dateStr, dateAr, entries, { typeKey, category, tagLabel, imageKey, headline, icon, intro, valueOf, recommendations }) {
    if (entries.length === 0) return;
    const slug = `alert-${typeKey}-${dateStr}`;
    if (await alertSlugExists(slug)) return;

    const list = dedup(entries, 'city');
    const primary = list[0];
    const extraCount = list.length - 1;
    const title = extraCount > 0
      ? `⚠️ ${headline} على بلدية ${primary.city} وضواحيها وعدة بلديات أخرى (${list.length}) — ${dateAr}`
      : `⚠️ ${headline} على بلدية ${primary.city} وضواحيها${primary.wilaya ? ` (${primary.wilaya})` : ''} — ${dateAr}`;

    const lines = list.map((e) => communeLine(e, valueOf(e))).join('\n\n');
    const recLines = recommendations.map((r) => r).join('\n\n');

    await publish({
      title, slug,
      category,
      tags: [tagLabel, 'تحذير', dateStr],
      content:
        `📅 ${arabicFullDateWithYear(dateStr)}\n\n` +
        `${icon} ${intro}\n\n` +
        `${lines}\n\n` +
        `⚠️ التوصيات:\n\n${recLines}\n\n` +
        `🤲 نسأل الله السلامة للجميع.`,
      image: getImageForAlert(imageKey, title),
    });
    published++;
  }

  for (const [dateStr, alerts] of Object.entries(byDay)) {
    const dateAr = arabicFullDate(dateStr);

    // ── رياح قوية ──
    await publishDayAlert(dateStr, dateAr, alerts.wind, {
      typeKey: 'wind', category: 'طقس', tagLabel: 'رياح', imageKey: 'رياح',
      headline: 'تحذير من رياح قوية', icon: '💨',
      intro: 'تشير أحدث التوقعات الجوية إلى توقع هبوب رياح قوية في المناطق التالية:',
      valueOf: (e) => `حتى ${e.speed} كم/س`,
      recommendations: ['تثبيت أو إزالة الأغراض القابلة للتطاير.', 'متابعة التحديثات الجوية في حال حدوث أي تغيرات.'],
    });

    // ── عواصف رملية / غبار ──
    await publishDayAlert(dateStr, dateAr, alerts.dust, {
      typeKey: 'dust', category: 'طقس', tagLabel: 'غبار', imageKey: 'رياح',
      headline: 'تحذير من عواصف رملية وغبار', icon: '🌪️',
      intro: 'تشير أحدث التوقعات الجوية إلى توقع تشكّل عواصف رملية وغبار في المناطق التالية:',
      valueOf: () => '',
      recommendations: ['البقاء داخل المنازل وإغلاق النوافذ.', 'ارتداء أغطية الأنف والفم عند الخروج.'],
    });

    // ── موجة حر ──
    await publishDayAlert(dateStr, dateAr, alerts.heat, {
      typeKey: 'heat', category: 'طقس حار', tagLabel: 'موجة حر', imageKey: 'حر',
      headline: 'تحذير من موجة حر', icon: '🌡️',
      intro: 'تشير أحدث التوقعات الجوية إلى توقع ارتفاع درجات الحرارة إلى مستويات قصوى في المناطق التالية:',
      valueOf: (e) => `حتى ${e.temp}°م`,
      recommendations: ['الإكثار من شرب السوائل، وتجنب التعرض المباشر لأشعة الشمس بين 12:00 و16:00.', 'إيلاء العناية الخاصة للأطفال وكبار السن.'],
    });

    // ── برودة شديدة ──
    await publishDayAlert(dateStr, dateAr, alerts.cold, {
      typeKey: 'cold', category: 'طقس', tagLabel: 'برودة', imageKey: 'برودة',
      headline: 'تحذير من برودة شديدة', icon: '🥶',
      intro: 'تشير أحدث التوقعات الجوية إلى توقع انخفاض درجات الحرارة الليلية بشكل ملحوظ في المناطق التالية:',
      valueOf: (e) => `حتى ${e.temp}°م`,
      recommendations: ['ارتداء الملابس الدافئة.', 'توفير التدفئة الكافية خاصة لكبار السن والأطفال.'],
    });
  }

  return { published };
}

// دوال مساعدة داخلية
function dedup(arr, key) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item[key])) return false;
    seen.add(item[key]);
    return true;
  });
}

async function publish({ title, slug, category, tags, content, image }) {
  try {
    await adminCreateNews({
      title, slug,
      excerpt: title,
      content,
      category,
      author: 'جاتكم اسحاب',
      is_published: true,
      tags,
      featured_image: image || '',
    });
  } catch (e) {
    // تجاهل خطأ التكرار (slug موجود مسبقاً)
    if (!String(e).includes('duplicate') && !String(e).includes('unique')) throw e;
  }
}
