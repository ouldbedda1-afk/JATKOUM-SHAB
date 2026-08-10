// Supabase Edge Function: forecast-publisher
// يُستدعى مرتين يومياً عبر pg_cron (9:00 و21:00 UTC — بعد توفر تشغيلتي ECMWF)
// يجلب توقعات Open-Meteo لأهم مدن موريتانيا وينشر تلقائياً أخبار التوقعات
// إذا وُجدت أمطار أو عواصف مهمة. كما ينشر نفس الخبر فوراً على صفحة فيسبوك
// عبر fb-post-article (بلا مراجعة، عند أول نشر فقط).
//
// الجولتان غير متماثلتين عمداً:
// • AM (ECMWF 00Z): يعتمد بيانات daily، وينشر مقالاً مستقلاً لكل من يوم+1
//   ويوم+2 (48 ساعة)، بـslug forecast-daily-YYYY-MM-DD-AM لكل يوم.
// • PM (ECMWF 12Z): يعتمد بيانات hourly ويبني توقعاً موحّداً واحداً بدقة
//   الساعة لآخر PM_WINDOW_HOURS ساعة بالضبط من لحظة النشر (لا تقسيم حسب
//   اليوم التقويمي) — مقال واحد بـslug forecast-window-YYYY-MM-DD-PM.
//
// في كلتا الجولتين: كل استدعاء لاحق لنفس الـslug (نفس اليوم × نفس الجولة)
// يقارن توقيعاً جديداً بالتوقيع المخزَّن من آخر نشر لنفس الـslug. إن تطابقا
// تماماً، لا يُنشأ ولا يُحدَّث أي شيء. إن اختلفا، يُحدَّث المقال نفسه في
// مكانه (يبقى نفس الرابط) ليعرض منشور "تحديث" بقسمين واضحين: 📌 التوقع
// السابق ثم 🔄 التحديث الجديد (البلديات المضافة/المحذوفة/التي تغيّرت
// شدتها، وقائمة التوقعات الحالية الكاملة) — لا يُترك القارئ يخمّن الفرق
// بنفسه، ولا يُعتبر التحديث تكراراً فيُتجاهل.
//
// التوقيع (forecast_signature، JSONB مخفي) مبني على البيانات الخام (المدن
// المتأثرة بالعواصف/الأمطار مُجمَّعة حسب الولاية، تصنيف الشدة، كمية الأمطار
// القصوى) — وليس نص المقال المُولَّد. بصمة SHA-256 له بعد تطبيعه (ترتيب
// المفاتيح أبجدياً) تُخزَّن في forecast_signature_hash لمقارنة سريعة.
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

function renderPreviousSummary(prevSig: SignatureData | null | undefined, periodLabel: string): string {
  let s = `📌 **التوقع السابق (${periodLabel}):**\n\n`;
  const entries = Object.entries(prevSig?.by_wilaya || {});
  if (!entries.length) return s + '— لا توجد بيانات سابقة —\n\n';
  entries.forEach(([w, v]) => {
    if (v.storm.length) s += `⛈️ عواصف رعدية على: ${v.storm.join('، ')} (${w})\n`;
    if (v.rain.length)  s += `🌧️ أمطار على: ${v.rain.join('، ')} (${w})\n`;
  });
  return s + '\n';
}

function renderDiff(diff: SignatureDiff, currSig: SignatureData, prevSig: SignatureData | null | undefined, periodLabel: string): string {
  let s = `🔄 **التحديث الجديد (${periodLabel}):**\n\n`;
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

// ── نشر مقال جديد بـslug معيّن، أو تحديثه في مكانه إن تغيّرت توقعاته جوهرياً ──
// (مشترك بين مقالات AM اليومية ومقال نافذة PM الموحّد) — التوقيع المخزَّن على
// كل مقال هو مرجع "التوقع السابق" لمقارنة كل استدعاء لاحق بنفس الـslug.
async function publishOrUpdate(opts: {
  slug: string;
  title: string;
  body: string;
  category: string;
  wilaya: string;
  tags: string[];
  signatureData: SignatureData;
  signatureHash: string;
  periodLabel: string;
  link: string;
  freshLabel: string;
  updateLabel: string;
}): Promise<'published' | 'updated' | 'skipped'> {
  const cols = 'id, title, content, forecast_signature, forecast_signature_hash';
  const { data: rows } = await supabase.from('news_articles').select(cols).eq('slug', opts.slug).limit(1);
  const existing: ArticleRow | null = rows?.[0] || null;

  if (!existing) {
    const { error } = await supabase.from('news_articles').insert([{
      title: opts.title, slug: opts.slug, excerpt: opts.title, content: opts.body,
      category: opts.category, wilaya: opts.wilaya,
      author: 'جاتكم اسحاب', is_published: true, published_at: new Date().toISOString(),
      tags: opts.tags,
      forecast_signature: opts.signatureData, forecast_signature_hash: opts.signatureHash,
      featured_image: '',
    }]);
    if (error) return 'skipped';
    await tg(`📰 *${opts.freshLabel}:*\n${opts.title}\n\n🔗 ${opts.link}`);
    await postToFacebookPage(opts.title, opts.body, opts.slug);
    return 'published';
  }

  // بصمتان متطابقتان = لا تغيير جوهري — لا يُنشأ ولا يُحدَّث أي شيء
  if (existing.forecast_signature_hash === opts.signatureHash) return 'skipped';

  // تغيّر جوهري — تحديث المقال في مكانه (يبقى نفس الرابط)، مع قسمي
  // "📌 التوقع السابق" و"🔄 التحديث الجديد" إن وُجد توقيع سابق صالح للمقارنة
  const diff = existing.forecast_signature ? diffSignatures(existing.forecast_signature, opts.signatureData) : null;
  const diffBlock = diff && diff.hasChanges
    ? renderPreviousSummary(existing.forecast_signature, opts.periodLabel) + renderDiff(diff, opts.signatureData, existing.forecast_signature, opts.periodLabel)
    : '';
  const content = `${opts.body}\n\n${diffBlock}`.trimEnd();

  const { error } = await supabase.from('news_articles').update({
    title: opts.title, excerpt: opts.title, content, category: opts.category, wilaya: opts.wilaya,
    published_at: new Date().toISOString(), tags: opts.tags,
    forecast_signature: opts.signatureData, forecast_signature_hash: opts.signatureHash,
  }).eq('id', existing.id);

  if (error) return 'skipped';
  await tg(`🔄 *${opts.updateLabel}:*\n${opts.title}\n\n🔗 ${opts.link}`);
  return 'updated';
}

// نافذة الجولة المسائية: توقع موحّد لآخر 24 ساعة بدقة الساعة (بدل التقسيم
// حسب اليوم التقويمي) — بيانات hourly من Open-Meteo، وليس daily
const PM_WINDOW_HOURS = 24;

interface CityAgg { storm: string[]; rain: string[]; stormWilaya: string[]; rainWilaya: string[]; maxMm: number }

function buildPmWindowEntry(results: any[], now: Date): CityAgg {
  const windowEnd = new Date(now.getTime() + PM_WINDOW_HOURS * 3600 * 1000);
  const entry: CityAgg = { storm: [], rain: [], stormWilaya: [], rainWilaya: [], maxMm: 0 };

  results.forEach((r: any, idx: number) => {
    const cityInfo = CITIES[idx];
    if (!r?.hourly?.time) return;

    let maxCode = 0, sumMm = 0, maxProb = 0;
    r.hourly.time.forEach((tStr: string, hi: number) => {
      const t = new Date(tStr + ':00Z');
      if (t < now || t >= windowEnd) return;
      maxCode = Math.max(maxCode, r.hourly.weathercode?.[hi] ?? 0);
      sumMm  += r.hourly.precipitation?.[hi] ?? 0;
      maxProb = Math.max(maxProb, r.hourly.precipitation_probability?.[hi] ?? 0);
    });

    const { isRain, isStorm } = classifyCode(maxCode);
    const significant = (isRain && sumMm >= 3 && maxProb >= 40) || isStorm;
    if (!significant) return;

    entry.maxMm = Math.max(entry.maxMm, sumMm);
    if (isStorm) {
      if (!entry.storm.includes(cityInfo.city)) entry.storm.push(cityInfo.city);
      if (!entry.stormWilaya.includes(cityInfo.wilaya)) entry.stormWilaya.push(cityInfo.wilaya);
    } else {
      if (!entry.rain.includes(cityInfo.city)) entry.rain.push(cityInfo.city);
      if (!entry.rainWilaya.includes(cityInfo.wilaya)) entry.rainWilaya.push(cityInfo.wilaya);
    }
  });

  return entry;
}

function buildTitle(cityNames: string, intensity: string, hasStorm: boolean, periodPhrase: string): string {
  return hasStorm
    ? `يتوقع بإذن الله هطول أمطار ${intensity} على ${cityNames} ${periodPhrase} مصحوبة بعواصف رعدية`
    : `يتوقع بإذن الله هطول أمطار ${intensity} على ${cityNames} ${periodPhrase}`;
}

function buildBody(entry: { storm: string[]; rain: string[] }, intensity: string, periodPhrase: string): string {
  let body = '';
  entry.storm.forEach((city) => {
    const w = CITIES.find((c) => c.city === city)?.wilaya || '';
    body += `يتوقع بإذن الله ⛈️ هطول أمطار ${intensity} على ${city}${w ? ` (${w})` : ''} ${periodPhrase} مصحوبة بعواصف رعدية.\n\n`;
  });
  entry.rain.forEach((city) => {
    const w = CITIES.find((c) => c.city === city)?.wilaya || '';
    body += `يتوقع بإذن الله 🌧️ هطول أمطار ${intensity} على ${city}${w ? ` (${w})` : ''} ${periodPhrase}.\n\n`;
  });
  body += `جعلها الله خيراً وبركة.`;
  return body;
}

Deno.serve(async () => {
  try {
    const now   = new Date();
    const today = isoDate(now);

    // جولة النشر: صباحية (تشغيلة ECMWF 00Z، تُستدعى ~9:00 UTC، توقعات يوم+1
    // ويوم+2 كل منها بمقاله الخاص) أو مسائية (تشغيلة ECMWF 12Z، تُستدعى
    // ~21:00 UTC، توقع موحّد لآخر 24 ساعة بدقة الساعة بدل تقسيم الأيام).
    const run        = now.getUTCHours() < 12 ? 'AM' : 'PM';
    const modelCycle = run === 'AM' ? '00Z' : '12Z';

    // ── 1. جلب توقعات Open-Meteo لجميع المدن دفعة واحدة (daily + hourly معاً) ──
    const lats = CITIES.map((c) => c.lat).join(',');
    const lons = CITIES.map((c) => c.lon).join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
      `&daily=weathercode,precipitation_sum,precipitation_probability_max` +
      `&hourly=weathercode,precipitation,precipitation_probability` +
      `&timezone=Africa%2FAbidjan&forecast_days=3`;

    const res  = await fetch(url);
    const json = await res.json();

    // Open-Meteo يُعيد مصفوفة عند طلب عدة مواقع
    const results: any[] = Array.isArray(json) ? json : [json];
    const link = (slug: string) => `${Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com'}/news/${slug}`;

    let published = 0, updated = 0;

    // ═══ الجولة المسائية (PM): مقال موحّد واحد لآخر 24 ساعة ═══════════════
    if (run === 'PM') {
      const entry = buildPmWindowEntry(results, now);

      if (entry.storm.length === 0 && entry.rain.length === 0) {
        await tg(`☀️ لا توقعات أمطار مهمة خلال الـ${PM_WINDOW_HOURS} ساعة القادمة.`);
        return new Response(JSON.stringify({ published: 0, message: 'no significant forecast' }));
      }

      const allCities  = [...entry.storm, ...entry.rain];
      const hasStorm   = entry.storm.length > 0;
      const intensity  = intensityFromMm(entry.maxMm);
      const cityNames  = allCities.slice(0, 4).join(' و');
      const category   = hasStorm ? 'عواصف' : 'أمطار';
      const wilaya     = [...entry.stormWilaya, ...entry.rainWilaya][0] || '';
      const periodPhrase = `خلال الـ${PM_WINDOW_HOURS} ساعة القادمة`;

      const title = buildTitle(cityNames, intensity, hasStorm, periodPhrase);
      const body  = buildBody(entry, intensity, periodPhrase);
      const signatureData = buildSignature(entry, intensity);
      const signatureHash = await sha256Hex(JSON.stringify(canonicalize(signatureData)));
      const slug = `forecast-window-${today}-PM`;

      const result = await publishOrUpdate({
        slug, title, body, category, wilaya,
        tags: ['توقعات', category, 'أوتوماتيك', 'PM', modelCycle],
        signatureData, signatureHash,
        periodLabel: periodPhrase,
        link: link(slug),
        freshLabel: `نُشر تلقائياً (الجولة المسائية — ${modelCycle})`,
        updateLabel: `تحديث الجولة المسائية (${modelCycle})`,
      });
      if (result === 'published') published++;
      if (result === 'updated') updated++;

      if (published + updated > 0) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            title: '📅 توقعات جديدة — جاتكم اسحاب',
            body:  `نُشرت توقعات الأمطار لآخر ${PM_WINDOW_HOURS} ساعة في موريتانيا. اضغط للاطلاع على التفاصيل.`,
            url:   '/',
            tag:   'forecast-update',
            dedupeKey: `forecast-${today}-PM`,
            signature: `forecast-${today}-PM`,
            windowMinutes: 600,
          }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ published, updated }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // ═══ الجولة الصباحية (AM): مقال مستقل لكل يوم من يوم+1 حتى يوم+2 (48 ساعة) ═══
    interface DayEntry extends CityAgg {
      date: Date;
      dateStr: string;
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

    for (const [dateStr, entry] of Object.entries(byDay)) {
      const slug = `forecast-daily-${dateStr}-AM`;

      const allCities  = [...entry.storm, ...entry.rain];
      const hasStorm   = entry.storm.length > 0;
      const intensity  = intensityFromMm(entry.maxMm);
      const dayAr      = arabicDay(entry.date);
      const dateAr     = arabicDate(entry.date);
      const cityNames  = allCities.slice(0, 4).join(' و');
      const category   = hasStorm ? 'عواصف' : 'أمطار';
      const wilaya     = [...entry.stormWilaya, ...entry.rainWilaya][0] || '';
      const periodPhrase = `يوم ${dayAr} ${dateAr}`;

      const title = buildTitle(cityNames, intensity, hasStorm, periodPhrase);
      const body  = buildBody(entry, intensity, periodPhrase);
      const signatureData = buildSignature(entry, intensity);
      const signatureHash = await sha256Hex(JSON.stringify(canonicalize(signatureData)));

      const result = await publishOrUpdate({
        slug, title, body, category, wilaya,
        tags: ['توقعات', category, 'أوتوماتيك', 'AM', modelCycle],
        signatureData, signatureHash,
        periodLabel: periodPhrase,
        link: link(slug),
        freshLabel: `نُشر تلقائياً (الجولة الصباحية — ${modelCycle})`,
        updateLabel: `تحديث ضمن الجولة الصباحية`,
      });
      if (result === 'published') published++;
      if (result === 'updated') updated++;
    }

    if (published + updated > 0) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          title: '📅 توقعات جديدة — جاتكم اسحاب',
          body:  `نُشرت توقعات الأمطار للأيام الـ${Object.keys(byDay).length} القادمة في موريتانيا. اضغط للاطلاع على التفاصيل.`,
          url:   '/',
          tag:   'forecast-update',
          dedupeKey: `forecast-${today}-AM`,
          signature: `forecast-${today}-AM`,
          windowMinutes: 600,
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ published, updated, days: Object.keys(byDay).length }), {
      headers: { 'content-type': 'application/json' },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await tg(`❌ خطأ في forecast-publisher: ${msg}`).catch(() => {});
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
