// Supabase Edge Function: forecast-publisher
// يُستدعى مرتين يومياً عبر pg_cron (9:00 و21:00 UTC — بعد توفر تشغيلتي ECMWF)
// يجلب توقعات Open-Meteo لأهم مدن موريتانيا
// وينشر تلقائياً أخبار التوقعات إذا وُجدت أمطار أو عواصف خلال 48 ساعة
// كما ينشر نفس الخبر فوراً على صفحة فيسبوك عبر fb-post-article (بلا مراجعة، عند أول نشر فقط)
//
// كل جولة (AM يعتمد ECMWF 00Z، PM يعتمد ECMWF 12Z) تُنتج أو تُحدِّث مقال
// اليوم نفسه: forecast-daily-YYYY-MM-DD-AM هو المقال المرجعي الوحيد لكل يوم؛
// إن نُشر AM ثم اختلفت توقعات PM جوهرياً، لا يُنشأ مقال PM منفصل — يُحدَّث
// مقال AM في مكانه (يبقى نفس الرابط) ليعرض منشور "تحديث" بقسمين واضحين:
// 📌 التوقع السابق ثم 🔄 التحديث الجديد (البلديات المضافة/المحذوفة/التي
// تغيّرت شدتها، وقائمة التوقعات الحالية الكاملة) — لا يُترك القارئ يخمّن
// الفرق بنفسه، ولا يُعتبر التحديث تكراراً فيُتجاهل.
//
// كل نشر (أول مرة أو تحديث) يقارن توقيعاً مبنياً على البيانات الخام
// (المدن المتأثرة بالعواصف/الأمطار مُجمَّعة حسب الولاية، تصنيف الشدة، كمية
// الأمطار القصوى) — وليس نص المقال المُولَّد. يُخزَّن التوقيع الكامل في
// forecast_signature (JSONB، مخفي وغير معروض في أي واجهة) ليكون مرجع
// "التوقع السابق" عند المقارنة القادمة، وتُخزَّن بصمة SHA-256 له بعد تطبيعه
// (ترتيب المفاتيح أبجدياً) في forecast_signature_hash لمقارنة سريعة. إن
// تطابقت البصمتان فلا تغيّر حقيقي، ولا يُنشأ أو يُحدَّث أي شيء.
// ملاحظة: هذه الدالة لا تجلب حرارة أو رياحاً حالياً (فقط weathercode/
// precipitation)، فالتوقيع مبني على ما هو متاح فعلياً من بيانات.

import { createClient } from 'npm:@supabase/supabase-js@2';

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

// ترتيب مفاتيح أي كائن JSON أبجدياً بشكل تكراري (Canonical JSON) — يضمن أن
// نفس البيانات تنتج نفس الـ hash دائماً بغض النظر عن ترتيب بناء الكائن
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── توقيع مُجمَّع حسب الولاية (مرجع "التوقع السابق" للمقارنة) ──────────────
interface WilayaBucket { storm: string[]; rain: string[] }
interface SignatureData {
  by_wilaya: Record<string, WilayaBucket>;
  intensity: string;
  max_precip_mm: number;
}
interface ArticleRow {
  id: string;
  title?: string;
  content: string;
  forecast_signature?: SignatureData | null;
  forecast_signature_hash: string | null;
}

function cityWilaya(city: string): string {
  return CITIES.find((c) => c.city === city)?.wilaya || 'أخرى';
}

function buildSignature(entry: { storm: string[]; rain: string[]; maxMm: number }, intensity: string): SignatureData {
  const byWilaya: Record<string, WilayaBucket> = {};
  entry.storm.forEach((city) => {
    const w = cityWilaya(city);
    (byWilaya[w] ||= { storm: [], rain: [] }).storm.push(city);
  });
  entry.rain.forEach((city) => {
    const w = cityWilaya(city);
    (byWilaya[w] ||= { storm: [], rain: [] }).rain.push(city);
  });
  for (const w of Object.keys(byWilaya)) {
    byWilaya[w].storm.sort();
    byWilaya[w].rain.sort();
  }
  return { by_wilaya: byWilaya, intensity, max_precip_mm: Math.round(entry.maxMm) };
}

// ── مقارنة توقيعين وإخراج الفروقات مجمَّعة حسب الولاية ─────────────────────
type Bucket = 'storm' | 'rain';
interface WilayaDiff {
  added: { city: string; bucket: Bucket }[];
  removed: { city: string; bucket: Bucket }[];
  changed: { city: string; from: Bucket; to: Bucket }[];
}
interface SignatureDiff {
  perWilaya: Record<string, WilayaDiff>;
  intensityChanged: boolean;
  hasChanges: boolean;
}

function cityBucketMap(bucket?: WilayaBucket): Map<string, Bucket> {
  const map = new Map<string, Bucket>();
  (bucket?.storm || []).forEach((c) => map.set(c, 'storm'));
  (bucket?.rain  || []).forEach((c) => map.set(c, 'rain'));
  return map;
}

function diffSignatures(prev: SignatureData | null | undefined, curr: SignatureData): SignatureDiff {
  const wilayas = new Set([...Object.keys(prev?.by_wilaya || {}), ...Object.keys(curr.by_wilaya)]);
  const perWilaya: Record<string, WilayaDiff> = {};

  for (const w of wilayas) {
    const prevMap = cityBucketMap(prev?.by_wilaya?.[w]);
    const currMap = cityBucketMap(curr.by_wilaya[w]);
    const added: WilayaDiff['added'] = [];
    const removed: WilayaDiff['removed'] = [];
    const changed: WilayaDiff['changed'] = [];

    currMap.forEach((bucket, city) => {
      if (!prevMap.has(city)) added.push({ city, bucket });
      else if (prevMap.get(city) !== bucket) changed.push({ city, from: prevMap.get(city)!, to: bucket });
    });
    prevMap.forEach((bucket, city) => {
      if (!currMap.has(city)) removed.push({ city, bucket });
    });

    if (added.length || removed.length || changed.length) perWilaya[w] = { added, removed, changed };
  }

  const intensityChanged = !!prev && (prev.intensity !== curr.intensity || prev.max_precip_mm !== curr.max_precip_mm);
  return { perWilaya, intensityChanged, hasChanges: Object.keys(perWilaya).length > 0 || intensityChanged };
}

// ── عرض قسمي "📌 التوقع السابق" و"🔄 التحديث الجديد" داخل نفس المقال ───────
function bucketLabel(b: Bucket): string { return b === 'storm' ? 'عواصف رعدية' : 'أمطار'; }

function renderPreviousSummary(prevSig: SignatureData | null | undefined, dayAr: string, dateAr: string): string {
  let s = `📌 **التوقع السابق (${dayAr} ${dateAr}):**\n\n`;
  const entries = Object.entries(prevSig?.by_wilaya || {});
  if (!entries.length) return s + '— لا توجد بيانات سابقة —\n\n';
  entries.forEach(([w, v]) => {
    if (v.storm.length) s += `⛈️ عواصف رعدية على: ${v.storm.join('، ')} (${w})\n`;
    if (v.rain.length)  s += `🌧️ أمطار على: ${v.rain.join('، ')} (${w})\n`;
  });
  return s + '\n';
}

function renderDiff(diff: SignatureDiff, currSig: SignatureData, prevSig: SignatureData | null | undefined, dayAr: string, dateAr: string): string {
  let s = `🔄 **التحديث الجديد (${dayAr} ${dateAr}):**\n\n`;
  for (const [w, d] of Object.entries(diff.perWilaya)) {
    s += `**${w}:**\n`;
    if (d.added.length)   s += `➕ أُضيفت: ${d.added.map((a) => a.city).join('، ')}\n`;
    if (d.removed.length) s += `➖ حُذفت: ${d.removed.map((r) => r.city).join('، ')}\n`;
    if (d.changed.length) s += `🔁 تغيّر نوعها: ${d.changed.map((c) => `${c.city} (${bucketLabel(c.from)} ← ${bucketLabel(c.to)})`).join('، ')}\n`;
    s += '\n';
  }
  if (diff.intensityChanged && prevSig) {
    s += `🌡️ تغيّرت الشدة العامة المتوقعة من "${prevSig.intensity}" (حتى ${prevSig.max_precip_mm} مم) إلى "${currSig.intensity}" (حتى ${currSig.max_precip_mm} مم).\n\n`;
  }
  s += `📋 **أصبحت التوقعات الحالية تشمل:**\n`;
  const currEntries = Object.entries(currSig.by_wilaya);
  if (!currEntries.length) s += '— لا مناطق —\n';
  currEntries.forEach(([w, v]) => {
    const all = [...v.storm, ...v.rain];
    if (all.length) s += `${w}: ${all.join('، ')}\n`;
  });
  return s + '\n';
}

// تحويل تاريخ إلى أسماء عربية
// ملاحظة: locale 'ar-SA' يستخدم التقويم الهجري افتراضياً في محرك ICU
// (فيُنتج "٢٨ صفر" بدل "١١ أغسطس") — calendar: 'gregory' يفرض التقويم الميلادي
function arabicDay(d: Date): string {
  return d.toLocaleDateString('ar-SA', { weekday: 'long', calendar: 'gregory', timeZone: 'Africa/Abidjan' });
}
function arabicDate(d: Date): string {
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', calendar: 'gregory', timeZone: 'Africa/Abidjan' });
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
      `&timezone=Africa%2FAbidjan&forecast_days=3`;

    const res  = await fetch(url);
    const json = await res.json();

    // Open-Meteo يُعيد مصفوفة عند طلب عدة مواقع
    const results: unknown[] = Array.isArray(json) ? json : [json];

    // ── 2. تجميع المدن المتأثرة لكل يوم من اليوم+1 حتى اليوم+2 (48 ساعة) ──
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
      await tg('☀️ لا توقعات أمطار مهمة في الـ 48 ساعة القادمة.');
      return new Response(JSON.stringify({ published: 0, message: 'no significant forecast' }));
    }

    let published = 0;

    // وقت صدور تشغيلة النموذج (ثابت للجولة كلها) ووقت النشر الفعلي — يُعرضان منفصلَين.
    const modelRunUTC = new Date(`${today}T${run === 'AM' ? '00:00:00' : '12:00:00'}Z`);
    const fmtUTCTime = (d: Date) =>
      d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
    const issuedTimeStr    = fmtUTCTime(modelRunUTC);
    const publishedTimeStr = fmtUTCTime(now);

    // ── 3. نشر مقال مستقل لكل (يوم × جولة) — إلا إذا لم تتغيّر التوقعات جوهرياً ──
    for (const [dateStr, entry] of Object.entries(byDay)) {
      // slug حتمي لكل يوم توقّع × جولة نشر — بحد أقصى مقالان لكل يوم (AM/PM)
      const slug = `forecast-daily-${dateStr}-${run}`;

      const cols = 'id, title, content, forecast_signature, forecast_signature_hash';
      const { data: existingRows } = await supabase
        .from('news_articles')
        .select(cols)
        .eq('slug', slug)
        .limit(1);
      const existing: ArticleRow | null = existingRows?.[0] || null;

      // الجولة المسائية فقط: هل يوجد أصلاً خبر صباحي لنفس اليوم؟ إن وُجد،
      // هو المقال الذي يُحدَّث في مكانه بدل نشر مقال PM منفصل
      let amArticle: ArticleRow | null = null;
      if (run === 'PM') {
        const amSlug = `forecast-daily-${dateStr}-AM`;
        const { data: amRows } = await supabase
          .from('news_articles')
          .select(cols)
          .eq('slug', amSlug)
          .limit(1);
        amArticle = amRows?.[0] || null;
      }

      // المقال المستهدف بالتحديث في مكانه إن وُجد تغيّر جوهري: نفس الجولة
      // المُعاد استدعاؤها لها أولوية، وإلا فمقال الصباح عند جولة PM
      const target: ArticleRow | null = existing || amArticle;

      const allCities  = [...entry.storm, ...entry.rain];
      const hasStorm   = entry.storm.length > 0;
      const intensity  = intensityFromMm(entry.maxMm);
      const dayAr      = arabicDay(entry.date);
      const dateAr     = arabicDate(entry.date);
      const cityNames  = allCities.slice(0, 4).join(' و');
      const icon       = hasStorm ? '⛈️' : '🌧️';
      const category   = hasStorm ? 'عواصف' : 'أمطار';
      const wilaya     = [...entry.stormWilaya, ...entry.rainWilaya][0] || '';

      // "تحديث مسائي" له معنى فقط عند دمج تحديث PM داخل مقال الصباح
      const updateTag = (run === 'PM' && amArticle && !existing) ? ' — تحديث مسائي' : '';
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

      // ── توقيع البيانات الخام (وليس النص) — أساس كل مقارنة "هل تغيّرت التوقعات؟" ──
      // مُجمَّع حسب الولاية (مرجع "التوقع السابق" عند كل مقارنة قادمة)، مبني على
      // القيم الفعلية: المدن المتأثرة بالعواصف/الأمطار (مرتّبة أبجدياً لثبات
      // الترتيب)، تصنيف الشدة، وكمية الأمطار القصوى (مقرّبة لأقرب مم لتفادي
      // ضجيج الفاصلة العائمة). يُخزَّن كاملاً كـJSONB، وتُحسَب بصمة SHA-256
      // لنسخته المُطبَّعة (canonicalize) لمقارنة سريعة لا تعتمد على ترتيب المفاتيح.
      const signatureData = buildSignature(entry, intensity);
      const signatureHash = await sha256Hex(JSON.stringify(canonicalize(signatureData)));

      // ── وقت صدور بيانات النموذج ووقت نشر الخبر، منفصلان بوضوح ──
      const meta =
        `🛰️ صدرت بيانات النموذج (ECMWF ${modelCycle}) الساعة ${issuedTimeStr}\n` +
        `🕓 نُشر هذا الخبر الساعة ${publishedTimeStr}`;
      const link = `${Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com'}/news/${slug}`;
      const tags = ['توقعات', category, 'أوتوماتيك', run, modelCycle];

      // ── لا يوجد أي مقال بعد لهذا اليوم — نشر أول مقال (بلا مقارنة ممكنة) ──
      if (!target) {
        const content = `${body}\n\n${meta}`;
        const { error } = await supabase.from('news_articles').insert([{
          title, slug, excerpt: title, content, category, wilaya,
          author: 'جاتكم اسحاب',
          is_published: true,
          published_at: new Date().toISOString(),
          tags,
          forecast_signature: signatureData,
          forecast_signature_hash: signatureHash,
          featured_image: '',
        }]);

        if (!error) {
          published++;
          const roundLabel = run === 'AM' ? 'الجولة الصباحية' : 'الجولة المسائية';
          await tg(`📰 *نُشر تلقائياً (${roundLabel} — ${modelCycle}):*\n${title}\n\n🔗 ${link}`);
          await postToFacebookPage(title, content, slug);
        }
        continue;
      }

      // ── يوجد مقال مستهدف (نفس الجولة أُعيد استدعاؤها، أو PM يُحدِّث مقال AM) ──
      // بصمتان متطابقتان = لا تغيير جوهري — لا يُنشأ ولا يُحدَّث أي شيء
      if (target.forecast_signature_hash === signatureHash) {
        if (target === amArticle) {
          const noChangeNote =
            `\n\n🔄 **تحديث مسائي (${modelCycle} — ${publishedTimeStr}):** لا توجد تغييرات جوهرية ` +
            `مقارنة بالنشرة الصباحية.`;
          if (!(amArticle.content || '').includes('تحديث مسائي (')) {
            await supabase.from('news_articles')
              .update({ content: amArticle.content + noChangeNote })
              .eq('id', amArticle.id);
            await tg(`✅ *لا تغيير جوهري (PM — ${modelCycle}):* ${dateStr} — أُضيفت ملاحظة تأكيد بدل مقال جديد.`);
          }
        }
        continue;
      }

      // تغيّر جوهري — تحديث المقال المستهدف في مكانه (يبقى نفس الرابط)، مع
      // قسمي "📌 التوقع السابق" و"🔄 التحديث الجديد" إن وُجد توقيع سابق صالح للمقارنة
      const diff = target.forecast_signature ? diffSignatures(target.forecast_signature, signatureData) : null;
      const diffBlock = diff && diff.hasChanges
        ? renderPreviousSummary(target.forecast_signature, dayAr, dateAr) + renderDiff(diff, signatureData, target.forecast_signature, dayAr, dateAr)
        : '';
      const content = `${body}\n\n${diffBlock}${meta}`;

      const { error } = await supabase.from('news_articles').update({
        title, excerpt: title, content, category, wilaya,
        published_at: new Date().toISOString(), tags,
        forecast_signature: signatureData,
        forecast_signature_hash: signatureHash,
      }).eq('id', target.id);

      if (!error) {
        published++;
        const label = target === amArticle ? 'تحديث مسائي على مقال الصباح' : `تحديث ضمن نفس الجولة (${run})`;
        await tg(`🔄 *${label}:*\n${title}\n\n🔗 ${link}`);
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
