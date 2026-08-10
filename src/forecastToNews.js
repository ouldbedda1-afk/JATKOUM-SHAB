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
    for (let i = 0; i < dates.length && count < 2; i++) { // يومان مقبلان ≈ 48 ساعة
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

// ─── 3ب. توقيع التوقع (لمقارنة "هل تغيّر شيء حقيقي؟" بين نشرة وأخرى) ──────
// يُبنى من نفس بيانات entries المستخدمة لتوليد المحتوى، بشكل مطبَّع
// (مرتّب أبجدياً) حتى يبقى ثابتاً بغض النظر عن ترتيب المدن في المصدر.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = canonicalize(value[k]);
      return acc;
    }, {});
  }
  return value;
}

async function hashSignature(signature) {
  const data = new TextEncoder().encode(JSON.stringify(canonicalize(signature)));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildForecastSignature(entries) {
  return entries
    .map(({ day, forecast }) => ({
      dateStr: day.dateStr,
      thunder: [...new Set(forecast.thunder.map((t) => t.city))].sort().map((city) => ({
        city,
        intensity: forecast.thunder.find((t) => t.city === city)?.intensity || null,
      })),
      heavy: [...new Set(forecast.heavy)].sort(),
      moderate: [...new Set(forecast.moderate)].sort(),
      weak: [...new Set(forecast.weak)].sort(),
    }))
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
}

// ─── 3ج. مقارنة توقيعين (السابق والحالي) وإخراج الفروقات ─────────────────
const BUCKET_LABEL = { thunder: 'عواصف رعدية', heavy: 'أمطار غزيرة', moderate: 'أمطار متوسطة', weak: 'أمطار خفيفة' };

function cityBucketMap(daySig) {
  const map = new Map();
  (daySig?.thunder  || []).forEach((t) => map.set(t.city, 'thunder'));
  (daySig?.heavy    || []).forEach((c) => map.set(c, 'heavy'));
  (daySig?.moderate || []).forEach((c) => map.set(c, 'moderate'));
  (daySig?.weak     || []).forEach((c) => map.set(c, 'weak'));
  return map;
}

function diffForecastSignatures(prevSig, currSig) {
  const dateStrs = [...new Set([...(prevSig || []).map((d) => d.dateStr), ...(currSig || []).map((d) => d.dateStr)])].sort();
  const days = [];
  for (const dateStr of dateStrs) {
    const prevDay = (prevSig || []).find((d) => d.dateStr === dateStr);
    const currDay = (currSig || []).find((d) => d.dateStr === dateStr);
    const prevMap = cityBucketMap(prevDay);
    const currMap = cityBucketMap(currDay);

    const added = [], removed = [], changed = [];
    currMap.forEach((bucket, city) => {
      if (!prevMap.has(city)) added.push({ city, bucket });
      else if (prevMap.get(city) !== bucket) changed.push({ city, from: prevMap.get(city), to: bucket });
    });
    prevMap.forEach((bucket, city) => {
      if (!currMap.has(city)) removed.push({ city, bucket });
    });

    if (added.length || removed.length || changed.length) {
      days.push({ dateStr, added, removed, changed, currDay: currDay || { thunder: [], heavy: [], moderate: [], weak: [] } });
    }
  }
  return { days, hasChanges: days.length > 0 };
}

// ─── 3د. عرض قسمي "التوقع السابق" و"التحديث الجديد" في منشور التحديث ─────
function renderPreviousSummary(prevSig) {
  if (!prevSig?.length) return '';
  let s = `📌 **التوقع السابق:**\n\n`;
  prevSig.forEach((day) => {
    s += `**${arabicFullDate(day.dateStr)}**\n`;
    if (day.thunder.length)  s += `⛈️ عواصف رعدية على:\n${bulletList(day.thunder.map((t) => t.city))}\n`;
    if (day.heavy.length)    s += `🌧️ أمطار غزيرة على:\n${bulletList(day.heavy)}\n`;
    if (day.moderate.length) s += `🌦️ أمطار متوسطة على:\n${bulletList(day.moderate)}\n`;
    if (day.weak.length)     s += `🌦️ أمطار خفيفة على:\n${bulletList(day.weak)}\n`;
    s += `\n`;
  });
  return s;
}

function renderUpdateSection(diff) {
  let s = `🔄 **التحديث الجديد:**\n\n`;
  diff.days.forEach(({ dateStr, added, removed, changed, currDay }) => {
    s += `**${arabicFullDate(dateStr)}**\n`;
    if (added.length)   s += `➕ تمت إضافة:\n${bulletList(added.map((a) => a.city))}\n`;
    if (removed.length) s += `➖ تم حذف:\n${bulletList(removed.map((r) => r.city))}\n`;
    if (changed.length) {
      s += `🔁 تغيّرت شدتها:\n${bulletList(changed.map((c) => `${c.city} (${BUCKET_LABEL[c.from]} ← ${BUCKET_LABEL[c.to]})`))}\n`;
    }
    const currentAll = [...currDay.thunder.map((t) => t.city), ...currDay.heavy, ...currDay.moderate, ...currDay.weak];
    s += `📋 أصبحت التوقعات الحالية تشمل:\n${currentAll.length ? bulletList(currentAll) : '— لا مناطق —'}\n\n`;
  });
  return s;
}

function buildWilayaUpdateContent(wilaya, prevSig, diff) {
  const todayStr = new Date().toISOString().slice(0, 10);
  let content = `🌦️ **تحديث التوقعات الجوية – ولاية ${wilaya}**\n**${arabicFullDateWithYear(todayStr)}**\n**جاتكم اسحاب**\n\n`;
  content += renderPreviousSummary(prevSig);
  content += renderUpdateSection(diff);
  content += `⚠️ **تنبيه:** تمثل هذه التوقعات أفضل قراءة للنماذج الجوية في الوقت الحالي، وهي قابلة للتحديث مع صدور بيانات جديدة.\n\n`;
  content += `🤲 **اللهم اسقنا الغيث، ولا تجعلنا من القانطين.**\n\n`;
  const hashtag = `#${wilaya.replace(/\s+/g, '_')}`;
  content += `${hashtag} #موريتانيا #الأمطار #جاتكم_اسحاب`;
  return content;
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

// ─── 5. جلب المقال الحالي (إن وُجد) لنفس الولاية اليوم ────────────────────
// كان هذا سابقاً فحص "هل يوجد مقال؟" فقط (تجاهل عند التكرار). الآن يُعيد
// المقال كاملاً (بما فيه forecast_signature المخزَّن) ليصير مرجعاً تُقارَن
// به كل نشرة جديدة — فتغيّر حقيقي يُنتج منشور تحديث، لا يُتجاهَل.
async function getExistingWilayaArticle(wilaya) {
  const slug = makeDailySlug(wilaya);
  const cols = 'id, title, content, forecast_signature, forecast_signature_hash';
  // أولاً: تحقق بـ slug الحتمي (أكثر دقة)
  const bySlug = await supabase.from('news_articles').select(cols).eq('slug', slug).limit(1);
  if (bySlug.data?.length > 0) return bySlug.data[0];
  // ثانياً: احتياطي — تحقق بـ wilaya + تاريخ اليوم (للتوافق مع المقالات القديمة)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const byWilaya = await supabase.from('news_articles').select(cols)
    .eq('wilaya', wilaya).gte('published_at', todayStart.toISOString()).limit(1);
  return byWilaya.data?.[0] || null;
}

// ─── 6. الدالة الرئيسية ──────────────────────────────────────────────────
export async function autoPublishForecastNews(weatherData) {
  const days = extractForecastDays(weatherData);
  if (!days.length) return { published: 0, updated: 0, skipped: 0, message: 'لا توقعات مهمة' };

  const wilayaGroups = groupByWilaya(days);
  let published = 0, updated = 0, skipped = 0;
  const results = [];

  for (const [wilaya, entries] of wilayaGroups) {
    // تجاهل الولايات ذات الأمطار الضعيفة فقط
    const hasSignificant = entries.some(
      (e) => e.forecast.thunder.length || e.forecast.heavy.length || e.forecast.moderate.length
    );
    if (!hasSignificant) { skipped++; continue; }

    const currSig  = buildForecastSignature(entries);
    const currHash = await hashSignature(currSig);
    const hasStorm = entries.some((e) => e.forecast.thunder.length > 0);
    const existing = await getExistingWilayaArticle(wilaya);

    if (existing) {
      // نفس التوقيع تماماً — لا تغيير حقيقي، لا يُنشأ أي منشور
      if (existing.forecast_signature_hash === currHash) { skipped++; continue; }

      // مقال قديم بلا مرجع مخزَّن (سابق لهذا التحديث) — لا توجد قاعدة موثوقة
      // للمقارنة، فنكتفي بتسجيل التوقيع الحالي كمرجع أول لمقارنات لاحقة
      if (!existing.forecast_signature) {
        await supabase.from('news_articles')
          .update({ forecast_signature: currSig, forecast_signature_hash: currHash })
          .eq('id', existing.id);
        skipped++;
        continue;
      }

      // تغيّر حقيقي — تحديث المقال في مكانه بمنشور يوضح الفرق (السابق/الجديد)
      const diff = diffForecastSignatures(existing.forecast_signature, currSig);
      if (!diff.hasChanges) { skipped++; continue; }

      const title   = `${buildWilayaTitle(wilaya, entries)} — تحديث`;
      const content = buildWilayaUpdateContent(wilaya, existing.forecast_signature, diff);

      try {
        const { error } = await supabase.from('news_articles').update({
          title, excerpt: title, content,
          category: hasStorm ? 'عواصف' : 'أمطار',
          published_at: new Date().toISOString(),
          tags: ['توقعات', wilaya, hasStorm ? 'عواصف' : 'أمطار', 'تحديث'],
          forecast_signature: currSig,
          forecast_signature_hash: currHash,
        }).eq('id', existing.id);
        if (error) throw new Error(error.message);
        updated++;
        results.push({ wilaya, title });
      } catch (e) {
        console.error(`خطأ في تحديث ${wilaya}:`, e);
      }
      continue;
    }

    // لا يوجد مقال بعد لهذه الولاية اليوم — نشر أول نشرة (بلا مقارنة)
    const title   = buildWilayaTitle(wilaya, entries);
    const content = buildWilayaContent(wilaya, entries);

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
        forecast_signature: currSig,
        forecast_signature_hash: currHash,
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

  // إشعار Push بعد نشر أو تحديث التوقعات (مرة واحدة في اليوم)
  if (published > 0 || updated > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const body = published > 0 && updated > 0
      ? `نُشرت توقعات جديدة لـ ${published} ولاية، وتحديث توقعات ${updated} ولاية. اضغط للاطلاع على التفاصيل.`
      : published > 0
        ? `نُشرت توقعات الأمطار لـ ${published} ولاية. اضغط للاطلاع على التفاصيل.`
        : `تحديث في توقعات الأمطار لـ ${updated} ولاية. اضغط للاطلاع على التفاصيل.`;
    broadcastPush({
      title: '📅 توقعات جديدة — جاتكم اسحاب',
      body,
      url: '/',
      tag: 'forecast-update',
      dedupeKey: `forecast-${today}`,
      signature: `forecast-${today}`,
      windowMinutes: 1440,
    }).catch(() => {});
  }

  return { published, updated, skipped, results };
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

// سجل حتمي غير منشور (is_published:false) — لا يظهر على الموقع ولا يُنشر على
// فيسبوك، فقط يمنع تكرار نفس منشور الولاية المجمّع على فيسبوك لاحقاً في نفس اليوم
async function alertSlugMark(slug) {
  try {
    await adminCreateNews({ title: slug, slug, content: '', is_published: false, author: 'جاتكم اسحاب' });
  } catch { /* تجاهل تكرار */ }
}

const SITE_URL = 'https://www.jatkoumshab.com';

// منشور فيسبوك مباشر (بدون خبر مقابل على الموقع) — يُستخدم لتجميع تحذيرات
// عدة بلديات في منشور واحد بدل نشر كل بلدية على حدة على صفحة فيسبوك
async function postFacebookDigest(title, body, linkPath = 'news') {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/fb-post-article`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, content: `${body}\n${SITE_URL}/${linkPath}` }),
    });
  } catch { /* fire-and-forget */ }
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

  // الموقع: خبر مستقل لكل بلدية متأثرة (بصيغة "بلدية X وضواحيها") — يبحث الزائر
  // عن بلديته تحديداً، فهذا يمنحها أفضل ظهور وفهرسة (SEO) على حدة.
  // فيسبوك: لا يُنشر كل هذه الأخبار تلقائياً (سيغرق الصفحة) — بدلاً من ذلك يُجمَع
  // منشور واحد لكل ولاية يسرد كل بلدياتها المتأثرة مع رابط للموقع لكل التفاصيل.
  async function publishPerCommuneAlerts(dateStr, dateAr, entries, { typeKey, category, tagLabel, imageKey, headline, icon, valueOf, recommendations }) {
    if (entries.length === 0) return;
    const list = dedup(entries, 'city');
    const recLines = recommendations.join('\n\n');

    // 1) خبر مستقل لكل بلدية على الموقع (بلا نشر فيسبوك فردي)
    for (const e of list) {
      const slug = `alert-${typeKey}-${dateStr}-${e.city.replace(/\s+/g, '-')}`;
      if (await alertSlugExists(slug)) continue;
      const title = `⚠️ ${headline} على بلدية ${e.city} وضواحيها${e.wilaya ? ` (${e.wilaya})` : ''} — ${dateAr}`;
      await publish({
        title, slug,
        category,
        tags: [tagLabel, 'تحذير', dateStr],
        content:
          `📅 ${arabicFullDateWithYear(dateStr)}\n\n` +
          `${icon} تشير أحدث التوقعات الجوية إلى توقع ${headline.replace('تحذير من ', '')} ` +
          `${valueOf(e) ? `(${valueOf(e)}) ` : ''}في بلدية ${e.city} وضواحيها${e.wilaya ? ` بولاية ${e.wilaya}` : ''}.\n\n` +
          `⚠️ التوصيات:\n\n${recLines}\n\n` +
          `🤲 نسأل الله السلامة للجميع.`,
        image: getImageForAlert(imageKey, title),
      }, { skipFbPost: true });
      published++;
    }

    // 2) منشور فيسبوك واحد لكل ولاية يجمع كل بلدياتها المتأثرة بهذا التحذير
    const byWilaya = new Map();
    list.forEach((e) => {
      const w = e.wilaya || 'مناطق أخرى';
      if (!byWilaya.has(w)) byWilaya.set(w, []);
      byWilaya.get(w).push(e);
    });
    for (const [wilaya, wilayaEntries] of byWilaya) {
      const fbSlug = `alert-${typeKey}-${dateStr}-fb-${wilaya}`.replace(/\s+/g, '-');
      if (await alertSlugExists(fbSlug)) continue; // نفس الولاية والتاريخ لا يُنشر مرتين
      const lines = wilayaEntries.map((e) => `🔸 بلدية ${e.city} وضواحيها${valueOf(e) ? `: ${valueOf(e)}` : ''}`).join('\n');
      const fbTitle = `⚠️ ${headline} — ولاية ${wilaya} — ${dateAr}`;
      const fbBody =
        `${icon} ${fbTitle}\n\n${lines}\n\n⚠️ التوصيات:\n${recLines}\n\n🤲 نسأل الله السلامة للجميع.\n\nتفاصيل كل بلدية على الموقع:`;
      await postFacebookDigest(fbTitle, fbBody, 'news');
      // سجل حتمي (بلا نشر ظاهر على الموقع) لمنع تكرار نفس منشور الولاية لاحقاً في نفس اليوم
      await alertSlugMark(fbSlug);
    }
  }

  for (const [dateStr, alerts] of Object.entries(byDay)) {
    const dateAr = arabicFullDate(dateStr);

    // ── رياح قوية ──
    await publishPerCommuneAlerts(dateStr, dateAr, alerts.wind, {
      typeKey: 'wind', category: 'طقس', tagLabel: 'رياح', imageKey: 'رياح',
      headline: 'تحذير من رياح قوية', icon: '💨',
      valueOf: (e) => `حتى ${e.speed} كم/س`,
      recommendations: ['تثبيت أو إزالة الأغراض القابلة للتطاير.', 'متابعة التحديثات الجوية في حال حدوث أي تغيرات.'],
    });

    // ── عواصف رملية / غبار ──
    await publishPerCommuneAlerts(dateStr, dateAr, alerts.dust, {
      typeKey: 'dust', category: 'طقس', tagLabel: 'غبار', imageKey: 'رياح',
      headline: 'تحذير من عواصف رملية وغبار', icon: '🌪️',
      valueOf: () => '',
      recommendations: ['البقاء داخل المنازل وإغلاق النوافذ.', 'ارتداء أغطية الأنف والفم عند الخروج.'],
    });

    // ── موجة حر ──
    await publishPerCommuneAlerts(dateStr, dateAr, alerts.heat, {
      typeKey: 'heat', category: 'طقس حار', tagLabel: 'موجة حر', imageKey: 'حر',
      headline: 'تحذير من موجة حر', icon: '🌡️',
      valueOf: (e) => `حتى ${e.temp}°م`,
      recommendations: ['الإكثار من شرب السوائل، وتجنب التعرض المباشر لأشعة الشمس بين 12:00 و16:00.', 'إيلاء العناية الخاصة للأطفال وكبار السن.'],
    });

    // ── برودة شديدة ──
    await publishPerCommuneAlerts(dateStr, dateAr, alerts.cold, {
      typeKey: 'cold', category: 'طقس', tagLabel: 'برودة', imageKey: 'برودة',
      headline: 'تحذير من برودة شديدة', icon: '🥶',
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

async function publish({ title, slug, category, tags, content, image }, { skipFbPost = false } = {}) {
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
    }, { skipFbPost });
  } catch (e) {
    // تجاهل خطأ التكرار (slug موجود مسبقاً)
    if (!String(e).includes('duplicate') && !String(e).includes('unique')) throw e;
  }
}
