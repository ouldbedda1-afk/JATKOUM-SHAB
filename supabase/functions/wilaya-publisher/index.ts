// Supabase Edge Function: wilaya-publisher
// يُستدعى عبر pg_cron (07:00 و13:00 و20:00 UTC) وينشر ما كان ينشره متصفح أول زائر
// للموقع (src/forecastToNews.js سابقاً):
//
// • توقعات الأمطار لكل ولاية لليومين القادمين — خبر واحد لكل ولاية في اليوم
//   (slug forecast-<ولاية>-YYYY-MM-DD). إن تغيّرت التوقعات في استدعاء لاحق
//   يُعاد كتابة الخبر في مكانه بالشكل نفسه مع سطر "🔄 تحديث الساعة HH:MM".
// • تحذيرات الرياح القوية والحر والبرودة للأيام القادمة: خبر لكل بلدية، أو خبر
//   واحد للولاية إن شمل التحذير عدداً من بلدياتها، ومنشور فيسبوك واحد لكل ولاية.
// • لقطة يومية للتوقعات في weather_snapshots.
//
// النقاط من _shared/mauritaniaPlaces.ts (مولَّد من جدول الموقع نفسه)، والتواريخ
// بتوقيت موريتانيا (UTC) — لا يتأثر النشر بجهاز الزائر ولا بموعد دخوله.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PLACES, WILAYA_SLUGS } from '../_shared/mauritaniaPlaces.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const SITE     = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';

const CHUNK = 100;  // حد أقصى للنقاط في طلب Open-Meteo واحد

// عدد البلديات من ولاية واحدة تحت تحذير واحد الذي يُنشر عنده خبر الولاية بدل
// أخبار البلديات
const WILAYA_MIN_COMMUNES = 3;

async function tg(text: string) {
  if (!TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

// fb-post-article يقبل الطلبات الموقّعة بمفتاح الخدمة فقط
async function postToFacebook(title: string, content: string, slug?: string): Promise<string | null> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/fb-post-article`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ title, content, slug }),
    });
    const r = await res.json().catch(() => ({}));
    return r?.ok && r.id ? r.id : null;
  } catch {
    return null;
  }
}

async function broadcastPush(payload: Record<string, unknown>) {
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ── التواريخ: "YYYY-MM-DD" يُقرأ منتصف ليل UTC، وتوقيت موريتانيا هو UTC ──
const DAYS_AR   = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function arabicFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${DAYS_AR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}`;
}
function arabicFullDateWithYear(dateStr: string): string {
  return `${arabicFullDate(dateStr)} ${new Date(dateStr).getUTCFullYear()}`;
}
function isRainySeason(dateStr: string): boolean {
  const m = new Date(dateStr).getUTCMonth() + 1;
  return m >= 6 && m <= 10;
}

// صور public/weather — نفس قواعد src/weatherImages.js
function imageFor(category: string, title: string): string {
  const text = `${category} ${title}`;
  if (/عواصف|رعدي|برق/.test(text)) return '/weather/thunder.jpg';
  if (text.includes('فيضان')) return '/weather/flood.jpg';
  if (text.includes('غزير')) return '/weather/heavy_rain.jpg';
  if (/رياح|رمال|هرماتان|غبار/.test(text)) return '/weather/wind.jpg';
  if (text.includes('حر')) return '/weather/heat.jpg';
  if (/أمطار|مطر|هطول/.test(text)) return '/weather/rain.jpg';
  return '/weather/default.jpg';
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

// ── 1. جلب التوقعات اليومية لكل النقاط ─────────────────────────────────────
interface PlaceWeather {
  city: string;
  wilaya: string;
  daily: { time: string[]; weather_code: number[]; precipitation_sum: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; wind_speed_10m_max: number[] };
}

async function fetchWeather(): Promise<PlaceWeather[]> {
  const out: PlaceWeather[] = [];
  for (let start = 0; start < PLACES.length; start += CHUNK) {
    const chunk = PLACES.slice(start, start + CHUNK);
    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat).join(','),
      longitude: chunk.map((p) => p.lon).join(','),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
      timezone: 'Africa/Nouakchott',
      forecast_days: '3',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const json = await res.json();
    const items = Array.isArray(json) ? json : [json];
    if (items.length !== chunk.length) throw new Error('Open-Meteo: عدد النتائج لا يطابق عدد النقاط');
    items.forEach((item, i) => out.push({ city: chunk[i].city, wilaya: chunk[i].wilaya, daily: item.daily }));
  }
  return out;
}

// ── 2. استخراج توقعات الأمطار مقسّمة حسب اليوم والولاية ────────────────────
interface WilayaForecast { wilaya: string; thunder: { city: string; intensity: string | null }[]; heavy: string[]; moderate: string[]; weak: string[] }
interface ForecastDay { dateStr: string; forecasts: WilayaForecast[] }

function rainLevel(mm: number): string | null {
  if (mm >= 20) return 'غزيرة جداً';
  if (mm >= 10) return 'غزيرة';
  if (mm >= 5)  return 'متوسطة';
  if (mm >= 1)  return 'ضعيفة';
  return null;
}

function extractForecastDays(weather: PlaceWeather[], today: string): ForecastDay[] {
  const map: Record<string, Record<string, WilayaForecast>> = {};
  for (const place of weather) {
    const { time = [], weather_code = [], precipitation_sum = [] } = place.daily || {};
    let count = 0;
    for (let i = 0; i < time.length && count < 2; i++) {  // يومان مقبلان ≈ 48 ساعة
      if (!time[i] || time[i] <= today) continue;
      count++;
      const dateStr = time[i];
      const code = weather_code[i] ?? 0;
      const mm = precipitation_sum[i] ?? 0;
      const wilaya = place.wilaya || 'مناطق أخرى';
      const wf = ((map[dateStr] ||= {})[wilaya] ||= { wilaya, thunder: [], heavy: [], moderate: [], weak: [] });

      if (code >= 95) {
        const intensity = isRainySeason(dateStr)
          ? (mm >= 10 ? 'غزيرة' : 'متوسطة')
          : (mm >= 5 ? 'غزيرة' : mm >= 1 ? 'متوسطة' : null);
        wf.thunder.push({ city: place.city, intensity });
      } else if (mm >= 1 || code >= 61) {
        const lvl = rainLevel(mm);
        if (lvl === 'غزيرة جداً' || lvl === 'غزيرة') wf.heavy.push(place.city);
        else if (lvl === 'متوسطة') wf.moderate.push(place.city);
        else if (lvl === 'ضعيفة') wf.weak.push(place.city);
      }
    }
  }
  return Object.entries(map)
    .map(([dateStr, wilayas]) => ({
      dateStr,
      forecasts: Object.values(wilayas).filter((f) => f.thunder.length || f.heavy.length || f.moderate.length || f.weak.length),
    }))
    .filter((d) => d.forecasts.length)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
}

interface Entry { day: { dateStr: string }; forecast: WilayaForecast }

function groupByWilaya(days: ForecastDay[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const day of days) {
    for (const forecast of day.forecasts) {
      if (!map.has(forecast.wilaya)) map.set(forecast.wilaya, []);
      map.get(forecast.wilaya)!.push({ day, forecast });
    }
  }
  return map;
}

// ── 3. التوقيع: مرجع "هل تغيّر شيء حقيقي؟" بين استدعاء وآخر ────────────────
type DaySig = { dateStr: string; thunder: { city: string; intensity: string | null }[]; heavy: string[]; moderate: string[]; weak: string[] };

function buildSignature(entries: Entry[]): DaySig[] {
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

function cityBucketMap(day?: DaySig): Map<string, string> {
  const map = new Map<string, string>();
  (day?.thunder || []).forEach((t) => map.set(t.city, 'thunder'));
  (day?.heavy || []).forEach((c) => map.set(c, 'heavy'));
  (day?.moderate || []).forEach((c) => map.set(c, 'moderate'));
  (day?.weak || []).forEach((c) => map.set(c, 'weak'));
  return map;
}

function hasChanges(prev: DaySig[], curr: DaySig[]): boolean {
  const dates = new Set([...prev.map((d) => d.dateStr), ...curr.map((d) => d.dateStr)]);
  for (const dateStr of dates) {
    const a = cityBucketMap(prev.find((d) => d.dateStr === dateStr));
    const b = cityBucketMap(curr.find((d) => d.dateStr === dateStr));
    if (a.size !== b.size || [...b].some(([city, bucket]) => a.get(city) !== bucket)) return true;
  }
  return false;
}

// ── 4. نص الخبر ──────────────────────────────────────────────────────────
const bulletList = (list: string[]) => list.map((c) => `• ${c}`).join('\n');

function buildWilayaContent(wilaya: string, entries: Entry[], today: string, isUpdate: boolean): string {
  const anyThunder = entries.some((e) => e.forecast.thunder.length > 0);
  const intro = anyThunder
    ? `تشير آخر التوقعات الجوية، **بمشيئة الله**، إلى فرص لهطول أمطار متفاوتة الشدة على عدد من مناطق ولاية ${wilaya}، مع توقع نشاط للعواصف الرعدية في بعض المناطق.`
    : `تشير آخر التوقعات الجوية، **بمشيئة الله**، إلى فرص لهطول أمطار متفاوتة الشدة على عدد من مناطق ولاية ${wilaya}.`;

  const heading = isUpdate ? 'تحديث التوقعات الجوية' : 'التوقعات الجوية';
  let content = `🌦️ **${heading} – ولاية ${wilaya}**\n**${arabicFullDateWithYear(today)}**\n**جاتكم اسحاب**\n\n`;
  // توقيت موريتانيا هو UTC
  if (isUpdate) content += `🔄 **تحديث الساعة ${new Date().toISOString().slice(11, 16)}**\n\n`;
  content += `${intro}\n\n`;

  for (const { day, forecast } of entries) {
    content += `**${arabicFullDate(day.dateStr)}**\n`;
    const thunder  = [...new Set(forecast.thunder.map((t) => t.city))];
    const heavy    = [...new Set(forecast.heavy)];
    const moderate = [...new Set(forecast.moderate)];
    const weak     = [...new Set(forecast.weak)];
    if (thunder.length)  content += `⛈️ **عواصف رعدية مصحوبة بأمطار**، قد تكون غزيرة أحياناً، على:\n${bulletList(thunder)}\n`;
    if (heavy.length)    content += `🌧️ **أمطار غزيرة متوقعة** على:\n${bulletList(heavy)}\n`;
    if (moderate.length) content += `🌦️ **أمطار متوسطة متوقعة** على:\n${bulletList(moderate)}\n`;
    if (weak.length)     content += `🌦️ **أمطار خفيفة متوقعة** على:\n${bulletList(weak)}\n`;
    content += '\n';
  }

  content += '⚠️ **تنبيه:** تمثل هذه التوقعات أفضل قراءة للنماذج الجوية في الوقت الحالي، وهي قابلة للتحديث مع صدور بيانات جديدة.\n\n';
  content += '🤲 **اللهم اسقنا الغيث، ولا تجعلنا من القانطين.**\n\n';
  content += `#${wilaya.replace(/\s+/g, '_')} #موريتانيا #الأمطار #جاتكم_اسحاب`;
  return content;
}

function buildWilayaTitle(wilaya: string, entries: Entry[]): string {
  const allThunder  = entries.flatMap((e) => e.forecast.thunder.map((t) => t.city));
  const allHeavy    = entries.flatMap((e) => e.forecast.heavy);
  const allModerate = entries.flatMap((e) => e.forecast.moderate);
  const allCities   = [...new Set([...allThunder, ...allHeavy, ...allModerate])];
  const intensity = allThunder.length ? (entries.flatMap((e) => e.forecast.thunder).find((t) => t.intensity)?.intensity || 'متوسطة')
                  : allHeavy.length   ? 'غزيرة'
                  : 'متوسطة';
  const loc = allCities.length ? allCities.slice(0, 3).join(' و') : wilaya;
  return allThunder.length
    ? `يتوقع بإذن الله هطول أمطار ${intensity} على ${loc} (${wilaya}) مصحوبة بعواصف رعدية`
    : `يتوقع بإذن الله هطول أمطار ${intensity} على ${loc} (${wilaya})`;
}

const wilayaSlug = (w: string) => WILAYA_SLUGS[w] || w.replace(/\s+/g, '-').toLowerCase().slice(0, 40);

// ── 5. نشر توقعات الولايات ───────────────────────────────────────────────
async function publishForecasts(days: ForecastDay[], today: string) {
  let published = 0, updated = 0, skipped = 0;
  const results: { wilaya: string; title: string }[] = [];

  for (const [wilaya, entries] of groupByWilaya(days)) {
    // الولايات ذات الأمطار الضعيفة وحدها لا تُنشر
    if (!entries.some((e) => e.forecast.thunder.length || e.forecast.heavy.length || e.forecast.moderate.length)) { skipped++; continue; }

    const slug = `forecast-${wilayaSlug(wilaya)}-${today}`;
    const currSig = buildSignature(entries);
    const currHash = await sha256Hex(JSON.stringify(canonicalize(currSig)));
    const hasStorm = entries.some((e) => e.forecast.thunder.length > 0);
    const category = hasStorm ? 'عواصف' : 'أمطار';
    const title = buildWilayaTitle(wilaya, entries);

    const { data: rows } = await supabase.from('news_articles')
      .select('id, forecast_signature, forecast_signature_hash').eq('slug', slug).limit(1);
    const existing = rows?.[0];

    if (existing) {
      if (existing.forecast_signature_hash === currHash) { skipped++; continue; }
      const prevSig: DaySig[] = Array.isArray(existing.forecast_signature) ? existing.forecast_signature : [];
      if (prevSig.length && !hasChanges(prevSig, currSig)) { skipped++; continue; }
      const updTitle = `${title} — تحديث`;
      const { error } = await supabase.from('news_articles').update({
        title: updTitle, excerpt: updTitle,
        content: buildWilayaContent(wilaya, entries, today, true),
        category, published_at: new Date().toISOString(),
        tags: ['توقعات', wilaya, category, 'تحديث'],
        forecast_signature: currSig, forecast_signature_hash: currHash,
      }).eq('id', existing.id);
      if (error) await tg(`❌ wilaya-publisher: فشل تحديث ${slug}: ${error.message}`);
      else { updated++; results.push({ wilaya, title: updTitle }); }
      continue;
    }

    const content = buildWilayaContent(wilaya, entries, today, false);
    const { data: inserted, error } = await supabase.from('news_articles').insert([{
      title, slug, excerpt: title, content, category, wilaya,
      author: 'جاتكم اسحاب', is_published: true, published_at: new Date().toISOString(),
      tags: ['توقعات', wilaya, category],
      featured_image: imageFor(category, title),
      forecast_signature: currSig, forecast_signature_hash: currHash,
    }]).select('id').single();
    if (error) { await tg(`❌ wilaya-publisher: فشل نشر ${slug}: ${error.message}`); continue; }
    published++;
    results.push({ wilaya, title });
    const fbId = await postToFacebook(title, content, slug);
    if (fbId) await supabase.from('news_articles').update({ fb_post_id: fbId }).eq('id', inserted.id);
  }

  if (published || updated) {
    const body = published && updated
      ? `نُشرت توقعات جديدة لـ ${published} ولاية، وتحديث توقعات ${updated} ولاية. اضغط للاطلاع على التفاصيل.`
      : published
        ? `نُشرت توقعات الأمطار لـ ${published} ولاية. اضغط للاطلاع على التفاصيل.`
        : `تحديث في توقعات الأمطار لـ ${updated} ولاية. اضغط للاطلاع على التفاصيل.`;
    await broadcastPush({
      title: '📅 توقعات جديدة — جاتكم اسحاب', body, url: '/', tag: 'forecast-update',
      dedupeKey: `forecast-${today}`, signature: `forecast-${today}`, windowMinutes: 1440,
    });
    await tg(`📰 *توقعات الولايات:* نُشرت ${published}، وحُدّثت ${updated}.\n🔗 ${SITE}/news`);
  }
  return { published, updated, skipped, results };
}

// ── 6. تحذيرات الرياح والحر والبرودة ────────────────────────────────────
interface AlertEntry { city: string; wilaya: string; value: number }

async function slugExists(slug: string): Promise<boolean> {
  const { data } = await supabase.from('news_articles').select('id').eq('slug', slug).limit(1);
  return !!data?.length;
}

// سجل غير منشور يمنع تكرار منشور فيسبوك نفسه في نفس اليوم
async function markSlug(slug: string) {
  await supabase.from('news_articles').insert([{ title: slug, slug, content: '', is_published: false, author: 'جاتكم اسحاب' }]);
}

async function insertAlert(row: { title: string; slug: string; category: string; tags: string[]; content: string; imageKey: string }): Promise<boolean> {
  const { error } = await supabase.from('news_articles').insert([{
    title: row.title, slug: row.slug, excerpt: row.title, content: row.content, category: row.category,
    author: 'جاتكم اسحاب', is_published: true, published_at: new Date().toISOString(),
    tags: row.tags, featured_image: imageFor(row.imageKey, row.title),
  }]);
  return !error;
}

interface AlertKind {
  typeKey: string; category: string; tagLabel: string; imageKey: string; headline: string; icon: string;
  valueOf: (e: AlertEntry) => string; recommendations: string[];
  severity: (e: AlertEntry) => number;  // الأكبر هو الأشد
}

const ALERT_KINDS: Record<'wind' | 'heat' | 'cold', AlertKind> = {
  wind: {
    typeKey: 'wind', category: 'طقس', tagLabel: 'رياح', imageKey: 'رياح', headline: 'تحذير من رياح قوية', icon: '💨',
    valueOf: (e) => `حتى ${e.value} كم/س`, severity: (e) => e.value,
    recommendations: ['تثبيت أو إزالة الأغراض القابلة للتطاير.', 'متابعة التحديثات الجوية في حال حدوث أي تغيرات.'],
  },
  heat: {
    typeKey: 'heat', category: 'طقس حار', tagLabel: 'موجة حر', imageKey: 'حر', headline: 'تحذير من موجة حر', icon: '🌡️',
    valueOf: (e) => `حتى ${e.value}°م`, severity: (e) => e.value,
    recommendations: ['الإكثار من شرب السوائل، وتجنب التعرض المباشر لأشعة الشمس بين 12:00 و16:00.', 'إيلاء العناية الخاصة للأطفال وكبار السن.'],
  },
  cold: {
    typeKey: 'cold', category: 'طقس', tagLabel: 'برودة', imageKey: 'برودة', headline: 'تحذير من برودة شديدة', icon: '🥶',
    valueOf: (e) => `حتى ${e.value}°م`, severity: (e) => -e.value,
    recommendations: ['ارتداء الملابس الدافئة.', 'توفير التدفئة الكافية خاصة لكبار السن والأطفال.'],
  },
};

// القرى تأتي من PLACES بلاحقة " (قرية)": "قرية يغرف" لا "بلدية يغرف (قرية)"
const VILLAGE_SUFFIX = ' (قرية)';
const placeLabel = (city: string) =>
  city.endsWith(VILLAGE_SUFFIX) ? `قرية ${city.slice(0, -VILLAGE_SUFFIX.length)}` : `بلدية ${city}`;

// خبر لكل بلدية على الموقع، أو خبر واحد للولاية إن شمل التحذير WILAYA_MIN_COMMUNES
// بلديات فأكثر منها؛ وفيسبوك: منشور واحد لكل ولاية
async function publishAlerts(dateStr: string, entries: AlertEntry[], kind: AlertKind): Promise<number> {
  if (!entries.length) return 0;
  const dateAr = arabicFullDate(dateStr);
  const recLines = kind.recommendations.join('\n\n');
  const phenomenon = kind.headline.replace('تحذير من ', '');
  const closing = '🤲 نسأل الله السلامة للجميع.';
  let published = 0;

  const byWilaya = new Map<string, AlertEntry[]>();
  for (const e of entries) {
    const w = e.wilaya || 'مناطق أخرى';
    if (!byWilaya.has(w)) byWilaya.set(w, []);
    if (!byWilaya.get(w)!.some((x) => x.city === e.city)) byWilaya.get(w)!.push(e);
  }

  for (const [wilaya, list] of byWilaya) {
    const asWilaya = !!list[0].wilaya && list.length >= WILAYA_MIN_COMMUNES;
    const worst = list.reduce((a, b) => (kind.severity(b) > kind.severity(a) ? b : a));

    if (asWilaya) {
      const slug = `alert-${kind.typeKey}-${dateStr}-wilaya-${wilayaSlug(wilaya)}`;
      if (!(await slugExists(slug))) {
        const title = `⚠️ ${kind.headline} على ولاية ${wilaya} — ${dateAr}`;
        if (await insertAlert({
          title, slug, category: kind.category, imageKey: kind.imageKey, tags: [kind.tagLabel, 'تحذير', wilaya, dateStr],
          content: `📅 ${arabicFullDateWithYear(dateStr)}\n\n` +
            `${kind.icon} تشير أحدث التوقعات الجوية إلى توقع ${phenomenon} (${kind.valueOf(worst)}) في عدد من بلديات ولاية ${wilaya}.\n\n` +
            `⚠️ التوصيات:\n\n${recLines}\n\n${closing}`,
        })) published++;
      }
    } else {
      for (const e of list) {
        const slug = `alert-${kind.typeKey}-${dateStr}-${e.city.replace(VILLAGE_SUFFIX, '').replace(/\s+/g, '-')}`;
        if (await slugExists(slug)) continue;
        const title = `⚠️ ${kind.headline} على ${placeLabel(e.city)} وضواحيها${e.wilaya ? ` (${e.wilaya})` : ''} — ${dateAr}`;
        if (await insertAlert({
          title, slug, category: kind.category, imageKey: kind.imageKey, tags: [kind.tagLabel, 'تحذير', dateStr],
          content: `📅 ${arabicFullDateWithYear(dateStr)}\n\n` +
            `${kind.icon} تشير أحدث التوقعات الجوية إلى توقع ${phenomenon} (${kind.valueOf(e)}) ` +
            `في ${placeLabel(e.city)} وضواحيها${e.wilaya ? ` بولاية ${e.wilaya}` : ''}.\n\n` +
            `⚠️ التوصيات:\n\n${recLines}\n\n${closing}`,
        })) published++;
      }
    }

    const fbSlug = `alert-${kind.typeKey}-${dateStr}-fb-${wilaya}`.replace(/\s+/g, '-');
    if (await slugExists(fbSlug)) continue;
    const lines = asWilaya
      ? `🔸 عدد من بلديات الولاية: ${kind.valueOf(worst)}`
      : list.map((e) => `🔸 ${placeLabel(e.city)} وضواحيها: ${kind.valueOf(e)}`).join('\n');
    const fbTitle = `⚠️ ${kind.headline} — ولاية ${wilaya} — ${dateAr}`;
    await postToFacebook(fbTitle,
      `${kind.icon} ${fbTitle}\n\n${lines}\n\n⚠️ التوصيات:\n${recLines}\n\n${closing}\n\n` +
      `${asWilaya ? 'التفاصيل على الموقع:' : 'تفاصيل كل بلدية على الموقع:'}\n${SITE}/news`);
    await markSlug(fbSlug);
  }
  return published;
}

async function publishWeatherAlerts(weather: PlaceWeather[], today: string): Promise<number> {
  const byDay: Record<string, { wind: AlertEntry[]; heat: AlertEntry[]; cold: AlertEntry[] }> = {};
  for (const place of weather) {
    const { time = [], temperature_2m_max = [], temperature_2m_min = [], wind_speed_10m_max = [] } = place.daily || {};
    time.forEach((dateStr, i) => {
      if (!dateStr || dateStr <= today) return;
      const d = (byDay[dateStr] ||= { wind: [], heat: [], cold: [] });
      const base = { city: place.city, wilaya: place.wilaya };
      const speed = wind_speed_10m_max[i] ?? 0;
      const tmax = temperature_2m_max[i] ?? 0;
      const tmin = temperature_2m_min[i] ?? 99;
      if (speed >= 50) d.wind.push({ ...base, value: Math.round(speed) });
      if (tmax >= 45)  d.heat.push({ ...base, value: Math.round(tmax) });
      if (tmin <= 10)  d.cold.push({ ...base, value: Math.round(tmin) });
    });
  }
  let published = 0;
  for (const [dateStr, alerts] of Object.entries(byDay)) {
    published += await publishAlerts(dateStr, alerts.wind, ALERT_KINDS.wind);
    published += await publishAlerts(dateStr, alerts.heat, ALERT_KINDS.heat);
    published += await publishAlerts(dateStr, alerts.cold, ALERT_KINDS.cold);
  }
  return published;
}

Deno.serve(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weather = await fetchWeather();
    const days = extractForecastDays(weather, today);

    const forecasts = days.length ? await publishForecasts(days, today) : { published: 0, updated: 0, skipped: 0, results: [] };
    const alerts = await publishWeatherAlerts(weather, today);

    const { error: snapErr } = await supabase.from('weather_snapshots').upsert(
      { snapshot_date: today, forecasts: days, cities_count: weather.length },
      { onConflict: 'snapshot_date' },
    );
    if (snapErr) console.warn('weather_snapshots:', snapErr.message);

    return new Response(JSON.stringify({ places: weather.length, forecasts, alerts }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await tg(`❌ خطأ في wilaya-publisher: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
