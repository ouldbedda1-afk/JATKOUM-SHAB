// Supabase Edge Function: seasonal-bulletin
// النشرة الموسمية كل شهرين: توقعات الأمطار والحرارة للشهرين القادمين في ولايات موريتانيا
// مقارنةً بالمعدل، ونظرة على الأشهر الأربعة التالية، وحصيلة الأمطار حتى الآن.
//
// • التوقعات: النموذج الموسمي للمركز الأوروبي ECMWF SEAS5 (متوسط المجموعة) عبر Open-Meteo،
//   يُحدَّث يوم 5 من كل شهر. لكل ولاية متوسط نقاط بلدياتها (_shared/mauritaniaPlaces.ts).
// • الحصيلة: إعادة التحليل ERA5 في عواصم الولايات مقابل معدل 1991–2020
//   (_shared/era5Normals.ts) — النسبة لا الكمية، فقيم ERA5 أقل من قراءات المقاييس.
//
// لا تُنشر تلقائياً: تُحفظ مسودة (slug seasonal-YYYY-MM) وتصل الإدارةَ على تيليغرام بزر
// نشر (telegram-webhook) ورابط لتعديلها في لوحة الإدارة.
//
// يُستدعى عبر pg_cron يوم 7 من يناير ومارس ومايو ويوليو وسبتمبر ونوفمبر.
// النشر:  supabase functions deploy seasonal-bulletin --no-verify-jwt
// الطلب (POST): {} — أو { "dry": true } لإرجاع النص دون حفظه ولا إرساله.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PLACES } from '../_shared/mauritaniaPlaces.ts';
import { ERA5_CITIES, ERA5_SOURCE } from '../_shared/era5Normals.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const SITE     = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';

const SEASONAL_API = 'https://seasonal-api.open-meteo.com/v1/seasonal';
const CHUNK = 100;               // حد أقصى للنقاط في طلب Open-Meteo واحد
const MAX_POINTS_PER_WILAYA = 20;

// معدل أمطار دون هذا الحد (مم) في الفترة = فصل جاف: النسبة من معدل شبه منعدم مضلِّلة
// («250%» من 7 مم)، فلا تُعرض
const MIN_NORMAL_MM = 10;
// فرق عن المعدل ضمن هذه النسبة = «قريبة من المعدل»
const NEAR_RAIN_PCT = 15;
const NEAR_TEMP_C = 0.5;
// حصيلة ERA5: معدل مرجعي دون هذا الحد لا يُقارن به، وفرق ضمن ±5% قريب من المعدل
// (القيمتان نفسهما في src/rainEra5.js)
const MIN_REFERENCE_MM = 5;
const NEAR_NORMAL_PCT = 5;

// الولايات بترتيبها الرسمي؛ نواكشوط الثلاث في سطر واحد: توقعاتها شبه متطابقة
const GROUPS: { name: string; members: string[] }[] = [
  { name: 'الحوض الشرقي', members: ['الحوض الشرقي'] },
  { name: 'الحوض الغربي', members: ['الحوض الغربي'] },
  { name: 'لعصابه', members: ['لعصابه'] },
  { name: 'كوركول', members: ['كوركول'] },
  { name: 'البراكنة', members: ['البراكنة'] },
  { name: 'الترارزة', members: ['الترارزة'] },
  { name: 'آدرار', members: ['آدرار'] },
  { name: 'داخلة نواذيبو', members: ['داخلة نواذيبو'] },
  { name: 'تكانت', members: ['تكانت'] },
  { name: 'كيدماغا', members: ['كيدماغا'] },
  { name: 'تيرس زمور', members: ['تيرس زمور'] },
  { name: 'انشيري', members: ['انشيري'] },
  { name: 'نواكشوط', members: ['نواكشوط الغربية', 'نواكشوط الشمالية', 'نواكشوط الجنوبية', 'نواكشوط'] },
];
// أسماء الولايات في ملف ERA5 ← أسماء الموقع
const ERA5_WILAYA: Record<string, string> = {
  'لبراكنه': 'البراكنة', 'داخلت نواذيبو': 'داخلة نواذيبو', 'كيدي ماغا': 'كيدماغا', 'إينشيري': 'انشيري',
};

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

const groupOf = (wilaya: string) => GROUPS.findIndex((g) => g.members.includes(wilaya));
const joinAr = (items: string[]) => items.join('، ');
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ── 1. التوقعات الموسمية ─────────────────────────────────────────────────
type GroupForecast = {
  months: string[];                   // YYYY-MM-01 للأشهر الستة
  rain2: number; normal2: number;     // مجموع الشهرين: المتوقع والمعدل (مم)
  temp2: number;                      // متوسط فرق الحرارة عن المعدل في الشهرين (°م)
  rain4: number; normal4: number;     // الأشهر الأربعة التالية
};

// نقاط موزّعة بانتظام على بلديات الولاية، حتى MAX_POINTS_PER_WILAYA
function samplePoints() {
  const points: { lat: number; lon: number; group: number }[] = [];
  GROUPS.forEach((_, gi) => {
    const list = PLACES.filter((p) => groupOf(p.wilaya) === gi);
    const step = Math.max(1, list.length / MAX_POINTS_PER_WILAYA);
    for (let i = 0; i < list.length && points.filter((p) => p.group === gi).length < MAX_POINTS_PER_WILAYA; i += step) {
      const p = list[Math.floor(i)];
      points.push({ lat: p.lat, lon: p.lon, group: gi });
    }
  });
  return points;
}

async function fetchSeasonal(): Promise<GroupForecast[]> {
  const points = samplePoints();
  const perGroup: { months: string[]; rain2: number[]; normal2: number[]; temp2: number[]; rain4: number[]; normal4: number[] }[] =
    GROUPS.map(() => ({ months: [], rain2: [], normal2: [], temp2: [], rain4: [], normal4: [] }));

  for (let i = 0; i < points.length; i += CHUNK) {
    const chunk = points.slice(i, i + CHUNK);
    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat).join(','),
      longitude: chunk.map((p) => p.lon).join(','),
      monthly: 'precipitation_mean,precipitation_anomaly,temperature_2m_anomaly',
      models: 'ecmwf_seas5_ensemble_mean',
      forecast_months: '6',
    });
    const res = await fetch(`${SEASONAL_API}?${params}`);
    if (!res.ok) throw new Error(`seasonal-api ${res.status}: ${await res.text()}`);
    const body = await res.json();
    const series = Array.isArray(body) ? body : [body];
    series.forEach((s, k) => {
      const m = s.monthly;
      const rain: number[] = m.precipitation_mean, anom: number[] = m.precipitation_anomaly, temp: number[] = m.temperature_2m_anomaly;
      if ([rain, anom, temp].some((a) => !a || a.length < 6 || a.slice(0, 6).some((v: number | null) => v == null))) return;
      const g = perGroup[chunk[k].group];
      g.months = m.time.slice(0, 6);
      g.rain2.push(rain[0] + rain[1]);
      g.normal2.push(rain[0] - anom[0] + rain[1] - anom[1]);
      g.temp2.push((temp[0] + temp[1]) / 2);
      const r4 = rain.slice(2, 6).reduce((a, b) => a + b, 0);
      g.rain4.push(r4);
      g.normal4.push(r4 - anom.slice(2, 6).reduce((a, b) => a + b, 0));
    });
  }

  return perGroup.map((g, gi) => {
    if (!g.rain2.length) throw new Error(`seasonal-api: لا بيانات لولاية ${GROUPS[gi].name}`);
    return {
      months: g.months,
      rain2: avg(g.rain2), normal2: avg(g.normal2), temp2: avg(g.temp2),
      rain4: avg(g.rain4), normal4: avg(g.normal4),
    };
  });
}

type RainClass = 'above' | 'near' | 'below' | 'showers' | 'dry';

function rainClass(rain: number, normal: number): { cls: RainClass; text: string } {
  if (normal < MIN_NORMAL_MM) {
    return rain >= 3 ? { cls: 'showers', text: 'هطولات خفيفة متفرقة محتملة' } : { cls: 'dry', text: 'لا أمطار تُذكر' };
  }
  const pct = Math.round((rain / normal - 1) * 100);
  if (pct >= NEAR_RAIN_PCT) return { cls: 'above', text: `أمطار أعلى من المعدل بنحو ${pct}%` };
  if (pct <= -NEAR_RAIN_PCT) return { cls: 'below', text: `أمطار أقل من المعدل بنحو ${-pct}%` };
  return { cls: 'near', text: 'أمطار قريبة من المعدل' };
}

function tempText(anomaly: number): string {
  if (anomaly >= NEAR_TEMP_C) return `حرارة أعلى من المعدل بنحو ${anomaly.toFixed(1)}°م`;
  if (anomaly <= -NEAR_TEMP_C) return `حرارة أقل من المعدل بنحو ${(-anomaly).toFixed(1)}°م`;
  return 'حرارة قريبة من المعدل';
}

// ── 2. حصيلة الأمطار حسب ERA5 ───────────────────────────────────────────
const DAYS_BEFORE_MONTH = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const dayIndex = (isoDate: string) => DAYS_BEFORE_MONTH[Number(isoDate.slice(5, 7)) - 1] + Number(isoDate.slice(8, 10)) - 1;

type Accumulation = { label: string; lines: { group: number; recorded: number; reference: number }[] };

// من يناير إلى مايو لم يبدأ الموسم بعد: تُعرض حصيلة السنة الماضية كاملة
async function fetchAccumulation(today: string): Promise<Accumulation> {
  const year = Number(today.slice(0, 4));
  const previousYear = Number(today.slice(5, 7)) < 6;
  const params = new URLSearchParams({
    latitude: ERA5_CITIES.map((c) => c.lat).join(','),
    longitude: ERA5_CITIES.map((c) => c.lon).join(','),
    start_date: previousYear ? `${year - 1}-01-01` : `${year}-01-01`,
    end_date: previousYear ? `${year - 1}-12-31` : today,
    daily: ERA5_SOURCE.variable,
    models: ERA5_SOURCE.model,
    timezone: ERA5_SOURCE.timezone,
  });
  const res = await fetch(`${ERA5_SOURCE.api}?${params}`);
  if (!res.ok) throw new Error(`era5 ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const series = Array.isArray(body) ? body : [body];

  // آخر يوم متاح لكل العواصم معاً (ERA5 يتأخر نحو 5 أيام)
  let last = Infinity;
  series.forEach((s) => {
    const v: (number | null)[] = s.daily.precipitation_sum;
    let i = v.length - 1;
    while (i >= 0 && v[i] === null) i--;
    last = Math.min(last, i);
  });
  if (!Number.isFinite(last) || last < 0) throw new Error('era5: لا بيانات بعد');
  const through: string = series[0].daily.time[last];

  const byGroup = new Map<number, { recorded: number[]; reference: number[] }>();
  series.forEach((s, idx) => {
    const city = ERA5_CITIES[idx];
    const values: (number | null)[] = s.daily.precipitation_sum.slice(0, last + 1);
    if (values.some((v) => v === null)) return;
    const group = groupOf(ERA5_WILAYA[city.wilaya] ?? city.wilaya);
    if (group < 0) return;
    const recorded = (values as number[]).reduce((a, b) => a + b, 0);
    const reference = previousYear ? city.normal : city.cumulative[dayIndex(through)];
    if (!byGroup.has(group)) byGroup.set(group, { recorded: [], reference: [] });
    byGroup.get(group)!.recorded.push(recorded);
    byGroup.get(group)!.reference.push(reference);
  });

  const d = new Date(through);
  return {
    label: previousYear
      ? `حصيلة أمطار سنة ${year - 1} كاملة`
      : `حصيلة الأمطار منذ 1 يناير حتى ${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}`,
    lines: [...byGroup].sort(([a], [b]) => a - b)
      .map(([group, v]) => ({ group, recorded: avg(v.recorded), reference: avg(v.reference) })),
  };
}

function accumulationText(recorded: number, reference: number): string | null {
  if (reference < MIN_REFERENCE_MM) return null;
  const pct = Math.round(((recorded - reference) / reference) * 100);
  if (Math.abs(pct) <= NEAR_NORMAL_PCT) return 'قريبة من المعدل';
  return pct > 0 ? `أعلى من المعدل بنحو ${pct}%` : `أقل من المعدل بنحو ${-pct}%`;
}

// ── 3. نص النشرة ────────────────────────────────────────────────────────
const monthName = (iso: string) => MONTHS_AR[Number(iso.slice(5, 7)) - 1];
const monthYear = (iso: string) => `${monthName(iso)} ${iso.slice(0, 4)}`;

function periodLabel(a: string, b: string): string {
  return a.slice(0, 4) === b.slice(0, 4) ? `${monthName(a)} و${monthName(b)} ${a.slice(0, 4)}` : `${monthYear(a)} و${monthYear(b)}`;
}

function buildBulletin(today: string, forecasts: GroupForecast[], acc: Accumulation | null) {
  const months = forecasts[0].months;
  const period = periodLabel(months[0], months[1]);
  const title = `النشرة الموسمية: الأمطار والحرارة في ولايات موريتانيا خلال ${period}`;
  const d = new Date(today);
  const dateLine = `${DAYS_AR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  let c = `🌍 **النشرة الموسمية – ${period}**\n**${dateLine}**\n**جاتكم اسحاب**\n\n`;
  c += 'تعرض هذه النشرة، كل شهرين، الاتجاه العام المتوقع للأمطار والحرارة في ولايات موريتانيا مقارنةً بالمعدل، ' +
    'بحسب النموذج الموسمي للمركز الأوروبي للتوقعات الجوية (ECMWF)، مع حصيلة الأمطار حتى الآن.\n\n';

  // الشهران القادمان
  c += `🌧️ **الأمطار والحرارة المتوقعة – ${period}**\n`;
  forecasts.forEach((f, gi) => {
    c += `• **${GROUPS[gi].name}:** 🌧️ ${rainClass(f.rain2, f.normal2).text} · 🌡️ ${tempText(f.temp2)}\n`;
  });
  c += '\n';

  // الأشهر الأربعة التالية: الولايات مجمّعة حسب الاتجاه
  c += `📅 **نظرة أبعد: من ${monthYear(months[2])} إلى ${monthYear(months[5])}**\n`;
  const byClass = new Map<RainClass, string[]>();
  forecasts.forEach((f, gi) => {
    const { cls } = rainClass(f.rain4, f.normal4);
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls)!.push(GROUPS[gi].name);
  });
  const dryAll = [...byClass.keys()].every((k) => k === 'dry' || k === 'showers');
  if (dryAll) {
    c += 'فصل جاف عموماً في كل الولايات، دون أمطار تُذكر إلا هطولات خفيفة متفرقة.\n\n';
  } else {
    const labels: [RainClass, string][] = [
      ['above', '🟢 أمطار أعلى من المعدل'], ['near', '⚪ أمطار قريبة من المعدل'], ['below', '🟠 أمطار أقل من المعدل'],
    ];
    for (const [cls, label] of labels) if (byClass.get(cls)?.length) c += `${label}: ${joinAr(byClass.get(cls)!)}\n`;
    const dry = [...(byClass.get('dry') ?? []), ...(byClass.get('showers') ?? [])];
    if (dry.length) c += `🏜️ فصل جاف: ${joinAr(dry)}\n`;
    c += '\n';
  }

  // الحصيلة
  if (acc) {
    const lines = acc.lines
      .map((l) => ({ name: GROUPS[l.group].name, text: accumulationText(l.recorded, l.reference) }))
      .filter((l) => l.text);
    if (lines.length) {
      c += `📊 **${acc.label}**\n`;
      lines.forEach((l) => { c += `• **${l.name}:** ${l.text}\n`; });
      c += 'مقارنةً بمعدل 1991–2020 في عاصمة كل ولاية، حسب إعادة التحليل ERA5.\n\n';
    }
  }

  c += '⚠️ **تنبيه:** التوقعات الموسمية احتمالية، تصف الاتجاه العام للأشهر القادمة ولا تحدد أحوال يوم بعينه، ' +
    'ومهارتها في منطقة الساحل متوسطة. تُتابع مع التوقعات اليومية على الموقع والنشرات الرسمية للأرصاد الجوية الموريتانية.\n\n';
  c += '🤲 **اللهم اسقنا الغيث، ولا تجعلنا من القانطين.**\n\n';
  c += '#موريتانيا #النشرة_الموسمية #الأمطار #جاتكم_اسحاب';

  return { title, content: c, slug: `seasonal-${months[0].slice(0, 7)}` };
}

// ── 4. المسودة وتيليغرام ────────────────────────────────────────────────
async function sendDraftToAdmin(id: string, content: string) {
  if (!TOKEN || !ADMIN_ID) return;
  const header = '📝 مسودة النشرة الموسمية جاهزة للمراجعة\n\n';
  const footer = '\n\nℹ️ إن صدر توقع رسمي (PRESASS أو الأرصاد الجوية الموريتانية) فأضفه من لوحة الإدارة قبل النشر. ' +
    'النشر يضعها على الموقع وفيسبوك.';
  const body = content.replace(/\*\*/g, '');
  const text = header + (body.length > 3600 ? body.slice(0, 3600) + '…' : body) + footer;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: ADMIN_ID,
      text,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ نشر', callback_data: `approve:seasonal:${id}` }, { text: '🗑️ حذف', callback_data: `reject:seasonal:${id}` }],
          [{ text: '✏️ تعديل في لوحة الإدارة', url: `${SITE}/admin` }],
        ],
      },
    }),
  });
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const today = new Date().toISOString().slice(0, 10);

    const forecasts = await fetchSeasonal();
    // الحصيلة إضافة: تعذّرها لا يمنع النشرة
    const acc = await fetchAccumulation(today).catch(() => null);
    const bulletin = buildBulletin(today, forecasts, acc);
    if (body.dry) return json(bulletin);

    const { data: existing } = await supabase.from('news_articles')
      .select('id, is_published').eq('slug', bulletin.slug).maybeSingle();
    if (existing?.is_published) return json({ skipped: 'منشورة مسبقاً', slug: bulletin.slug });

    const row = {
      title: bulletin.title, excerpt: bulletin.title, content: bulletin.content,
      category: 'أمطار', author: 'جاتكم اسحاب', is_published: false,
      tags: ['النشرة الموسمية', 'توقعات', 'أمطار'], featured_image: '/weather/rain.jpg',
    };
    if (existing) {
      // مسودة سابقة للفترة نفسها: يُحدَّث نصها، ولا تُرسل إلى تيليغرام مرة أخرى
      const { error } = await supabase.from('news_articles').update(row).eq('id', existing.id);
      if (error) throw error;
      return json({ updated: bulletin.slug });
    }

    const { data, error } = await supabase.from('news_articles')
      .insert([{ ...row, slug: bulletin.slug }]).select('id').single();
    if (error) throw error;
    await sendDraftToAdmin(data.id, bulletin.content);
    return json({ draft: bulletin.slug, id: data.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
