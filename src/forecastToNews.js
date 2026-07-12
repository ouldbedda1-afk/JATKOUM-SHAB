// يحوّل weatherData إلى أخبار توقعات — خبر واحد لكل ولاية
// بنفس تنسيق بطاقات WeatherAlerts في الصفحة الرئيسية

import { toArabicCommune } from './mauritaniaCommuneNamesAr';
import { normalizeMauritaniaWilayaName } from './mauritaniaPlaceNames';
import { adminCreateNews, supabase, saveWeatherSnapshot, broadcastPush } from './supabase';
import { getImageForAlert } from './weatherImages';

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

function slugifyWilaya(wilaya) {
  return wilaya
    .replace(/[أإآا]/g,'a').replace(/ى/g,'y').replace(/ة/g,'h')
    .replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').toLowerCase()
    .slice(0, 50);
}

// slug حتمي لكل ولاية + يوم → يمنع التكرار حتى عند التشغيل المتزامن
function makeDailySlug(wilaya) {
  const today = new Date().toISOString().slice(0, 10);
  return `forecast-${slugifyWilaya(wilaya)}-${today}`;
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

  for (const [dateStr, alerts] of Object.entries(byDay)) {
    const dateObj = new Date(dateStr);
    const dateAr  = arabicFullDate(dateStr);

    // ── رياح قوية ──
    if (alerts.wind.length > 0) {
      const slug = `alert-wind-${dateStr}`;
      if (!(await alertSlugExists(slug))) {
        const topCities = [...new Set(alerts.wind.map(c => c.city))].slice(0, 5);
        const maxSpeed  = Math.max(...alerts.wind.map(c => c.speed));
        const lines     = dedup(alerts.wind, 'city')
          .map(c => `${c.city}${c.wilaya ? ` (${c.wilaya})` : ''}: ${c.speed} كم/س`).join('\n');
        const title = `⚠️ تحذير من رياح قوية — ${join(topCities)} — ${dateAr}`;
        await publish({
          title, slug,
          category: 'طقس',
          tags: ['رياح', 'تحذير', dateStr],
          content:
            `📅 ${dateAr}\n💨 تتوقع التوقعات الجوية رياحاً قوية تتجاوز 50 كم/س في المناطق التالية:\n\n${lines}\n\n` +
            `⚠️ يُنصح بتأمين الأشياء غير الثابتة في الهواء الطلق، وتجنب الطرق الصحراوية.\n\nنسأل الله السلامة. 🤲`,
          image: getImageForAlert('رياح', title),
        });
        published++;
      }
    }

    // ── عواصف رملية / غبار ──
    if (alerts.dust.length > 0) {
      const slug = `alert-dust-${dateStr}`;
      if (!(await alertSlugExists(slug))) {
        const topCities = [...new Set(alerts.dust.map(c => c.city))].slice(0, 5);
        const lines     = dedup(alerts.dust, 'city')
          .map(c => `${c.city}${c.wilaya ? ` (${c.wilaya})` : ''}`).join('\n');
        const title = `⚠️ تحذير من عواصف رملية وغبار — ${join(topCities)} — ${dateAr}`;
        await publish({
          title, slug,
          category: 'طقس',
          tags: ['غبار', 'رمال', 'تحذير', dateStr],
          content:
            `📅 ${dateAr}\n🌪️ يُتوقع تشكّل عواصف رملية وغبار في المناطق التالية:\n\n${lines}\n\n` +
            `⚠️ يُنصح بالبقاء داخل المنازل وإغلاق النوافذ وارتداء أغطية الأنف والفم عند الخروج.\n\nنسأل الله السلامة. 🤲`,
          image: getImageForAlert('رياح', title),
        });
        published++;
      }
    }

    // ── موجة حر ──
    if (alerts.heat.length > 0) {
      const slug = `alert-heat-${dateStr}`;
      if (!(await alertSlugExists(slug))) {
        const topCities = [...new Set(alerts.heat.map(c => c.city))].slice(0, 5);
        const maxTemp   = Math.max(...alerts.heat.map(c => c.temp));
        const lines     = dedup(alerts.heat, 'city')
          .map(c => `${c.city}${c.wilaya ? ` (${c.wilaya})` : ''}: ${c.temp}°م`).join('\n');
        const title = `⚠️ تحذير من موجة حر — حتى ${maxTemp}°م — ${join(topCities)} — ${dateAr}`;
        await publish({
          title, slug,
          category: 'طقس حار',
          tags: ['موجة حر', 'تحذير', dateStr],
          content:
            `📅 ${dateAr}\n🌡️ يُتوقع ارتفاع درجات الحرارة إلى مستويات قصوى في المناطق التالية:\n\n${lines}\n\n` +
            `⚠️ يُنصح بالإكثار من شرب السوائل، وتجنب التعرض المباشر لأشعة الشمس بين 12:00 و16:00، ` +
            `وإيلاء العناية الخاصة للأطفال وكبار السن.\n\nنسأل الله السلامة. 🤲`,
          image: getImageForAlert('حر', title),
        });
        published++;
      }
    }

    // ── برودة شديدة ──
    if (alerts.cold.length > 0) {
      const slug = `alert-cold-${dateStr}`;
      if (!(await alertSlugExists(slug))) {
        const topCities = [...new Set(alerts.cold.map(c => c.city))].slice(0, 5);
        const minTemp   = Math.min(...alerts.cold.map(c => c.temp));
        const lines     = dedup(alerts.cold, 'city')
          .map(c => `${c.city}${c.wilaya ? ` (${c.wilaya})` : ''}: ${c.temp}°م`).join('\n');
        const title = `⚠️ تحذير من برودة شديدة — حتى ${minTemp}°م — ${join(topCities)} — ${dateAr}`;
        await publish({
          title, slug,
          category: 'طقس',
          tags: ['برودة', 'تحذير', dateStr],
          content:
            `📅 ${dateAr}\n🥶 يُتوقع انخفاض درجات الحرارة الليلية بشكل ملحوظ في المناطق التالية:\n\n${lines}\n\n` +
            `⚠️ يُنصح بارتداء الملابس الدافئة، وتوفير التدفئة الكافية خاصة لكبار السن والأطفال.\n\nنسأل الله السلامة. 🤲`,
          image: getImageForAlert('برودة', title),
        });
        published++;
      }
    }
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
