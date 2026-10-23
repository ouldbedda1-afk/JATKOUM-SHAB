// Supabase Edge Function: hazard-publisher
// يُستدعى مرة يومياً عبر pg_cron (8:00 UTC = 8:00 بتوقيت موريتانيا) وينشر
// "النشرة الجوية" خارج موسم الأمطار: مقال واحد في اليوم يغطي اليوم ويومين
// بعده، ولا يُنشر إلا إن وُجدت ظاهرة لافتة واحدة على الأقل:
//
// • الغبار: Open-Meteo Air Quality (تركيز الغبار السطحي من نموذج CAMS،
//   ميكروغرام/م³) — متوسط اليوم لكل مدينة، مجمَّعة حسب الولاية. عتبة مطلقة
//   لا تكفي وحدها: الشمال والساحل يتجاوزان 300 في نصف أيام الشتاء، بينما لا
//   يبلغ الشرق والجنوب 400 أبداً؛ لذا يُعتبر اليوم مغبراً إن بلغ عتبة عالية،
//   أو قفز إلى ثلاثة أضعاف وسيط المدينة نفسها في الثلاثين يوماً الماضية.
// • انخفاض درجات الحرارة: الصغرى أو الكبرى أدنى بـ4 درجات فأكثر من متوسط
//   الأيام الثلاثة السابقة في نفس المدينة (شتاء 2025–2026: بين يومين و15
//   يوماً في الموسم حسب المدينة).
// • الموج: Open-Meteo Marine (أقصى ارتفاع يومي) في أربع نقاط ساحلية —
//   ارتفاعه من 2 م (ساحلنا هادئ: نادراً ما تجاوز 2.5 م الشتاء الماضي)، وتراجعه
//   حين ينزل تحتها بعد يوم مرتفع.
//
// slug ثابت لليوم (weather-bulletin-YYYY-MM-DD): إعادة الاستدعاء في نفس اليوم
// تقارن بصمة الظواهر بالمخزَّنة — تطابق = لا شيء، اختلاف = تحديث في المكان.
// فيسبوك عند أول نشر فقط، كما في forecast-publisher.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CITIES, COAST_POINTS } from '../_shared/mauritaniaCities.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const SITE     = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';

const FORECAST_DAYS = 3;   // اليوم + يومان

// الغبار (ميكروغرام/م³): متوسط اليوم
const DUST_HIGH          = 700;
const DUST_VERY_HIGH     = 1000;
const DUST_JUMP_MIN      = 250;  // أدنى متوسط تُقبل معه قاعدة القفزة النسبية
const DUST_JUMP_RATIO    = 3;    // × وسيط المدينة في الأيام الماضية
const DUST_BASELINE_DAYS = 30;

// انخفاض الحرارة (°م) مقارنة بمتوسط الأيام السابقة
const COLD_DROP          = 4;
const COLD_BASELINE_DAYS = 3;

// الموج (م): أقصى ارتفاع يومي
const WAVE_HIGH      = 2.0;
const WAVE_VERY_HIGH = 2.5;

async function tg(text: string) {
  if (!TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

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

// تاريخ عربي بالتقويم الميلادي (ar-SA وحده يُنتج التقويم الهجري)
function arDate(dateStr: string, withWeekday = true): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const opts = { calendar: 'gregory', timeZone: 'Africa/Abidjan' } as const;
  const date = d.toLocaleDateString('ar-SA', { ...opts, day: 'numeric', month: 'long' });
  return withWeekday ? `${d.toLocaleDateString('ar-SA', { ...opts, weekday: 'long' })} ${date}` : date;
}

function dayLabel(dateStr: string, today: string): string {
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  if (dateStr === today)    return `اليوم ${arDate(dateStr)}`;
  if (dateStr === tomorrow) return `غداً ${arDate(dateStr)}`;
  return `يوم ${arDate(dateStr)}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ترتيب مفاتيح JSON أبجدياً بشكل تكراري — نفس البيانات تعطي نفس البصمة دائماً
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

const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Open-Meteo يُعيد مصفوفة عند طلب عدة مواقع، وكائناً واحداً لموقع واحد
async function fetchMulti(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [json];
}

const cityLatLon = () => ({
  lats: CITIES.map((c) => c.lat).join(','),
  lons: CITIES.map((c) => c.lon).join(','),
});

// ── الظواهر ──────────────────────────────────────────────────────────────
interface DustItem  { city: string; wilaya: string; heavy: boolean; mean: number }
interface ColdItem  { city: string; wilaya: string; tmin: number; tmax: number; drop: number }
interface WaveItem  { place: string; height: number; kind: 'high' | 'very_high' | 'calming' }

type ByDay<T> = Record<string, T[]>;

async function dustByDay(today: string): Promise<ByDay<DustItem>> {
  const { lats, lons } = cityLatLon();
  const results = await fetchMulti(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}` +
    `&hourly=dust&timezone=Africa%2FAbidjan&past_days=${DUST_BASELINE_DAYS}&forecast_days=${FORECAST_DAYS}`,
  );

  const byDay: ByDay<DustItem> = {};
  results.forEach((r, idx) => {
    const city = CITIES[idx];
    if (!r?.hourly?.time) return;

    // متوسط كل يوم من قيمه الساعية
    const sums: Record<string, { sum: number; n: number }> = {};
    r.hourly.time.forEach((t: string, hi: number) => {
      const v = r.hourly.dust?.[hi];
      if (v == null) return;
      const s = (sums[t.slice(0, 10)] ||= { sum: 0, n: 0 });
      s.sum += v;
      s.n++;
    });
    const means = Object.entries(sums).map(([d, s]) => [d, s.sum / s.n] as const);
    const baseline = median(means.filter(([d]) => d < today).map(([, m]) => m));

    for (const [dateStr, mean] of means) {
      if (dateStr < today) continue;
      const jump = mean >= DUST_JUMP_MIN && baseline > 0 && mean >= DUST_JUMP_RATIO * baseline;
      if (mean < DUST_HIGH && !jump) continue;
      (byDay[dateStr] ||= []).push({ city: city.city, wilaya: city.wilaya, heavy: mean >= DUST_VERY_HIGH, mean: Math.round(mean) });
    }
  });
  return byDay;
}

async function coldByDay(today: string): Promise<ByDay<ColdItem>> {
  const { lats, lons } = cityLatLon();
  const results = await fetchMulti(
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&daily=temperature_2m_min,temperature_2m_max&timezone=Africa%2FAbidjan` +
    `&past_days=${COLD_BASELINE_DAYS}&forecast_days=${FORECAST_DAYS}`,
  );

  const byDay: ByDay<ColdItem> = {};
  results.forEach((r, idx) => {
    const city = CITIES[idx];
    const time: string[] = r?.daily?.time || [];
    const mins: number[] = r?.daily?.temperature_2m_min || [];
    const maxs: number[] = r?.daily?.temperature_2m_max || [];

    time.forEach((dateStr, i) => {
      if (dateStr < today || i < COLD_BASELINE_DAYS) return;
      const prevMin = mins.slice(i - COLD_BASELINE_DAYS, i);
      const prevMax = maxs.slice(i - COLD_BASELINE_DAYS, i);
      if (mins[i] == null || maxs[i] == null || prevMin.some((v) => v == null) || prevMax.some((v) => v == null)) return;
      const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const drop = Math.max(avg(prevMin) - mins[i], avg(prevMax) - maxs[i]);
      if (drop < COLD_DROP) return;
      (byDay[dateStr] ||= []).push({ city: city.city, wilaya: city.wilaya, tmin: Math.round(mins[i]), tmax: Math.round(maxs[i]), drop: Math.round(drop) });
    });
  });
  return byDay;
}

async function wavesByDay(today: string): Promise<ByDay<WaveItem>> {
  const lats = COAST_POINTS.map((p) => p.lat).join(',');
  const lons = COAST_POINTS.map((p) => p.lon).join(',');
  const results = await fetchMulti(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
    `&daily=wave_height_max&timezone=Africa%2FAbidjan&past_days=1&forecast_days=${FORECAST_DAYS}`,
  );

  const byDay: ByDay<WaveItem> = {};
  results.forEach((r, idx) => {
    const point = COAST_POINTS[idx];
    const time: string[] = r?.daily?.time || [];
    const h: number[] = r?.daily?.wave_height_max || [];

    time.forEach((dateStr, i) => {
      if (dateStr < today || h[i] == null) return;
      let kind: WaveItem['kind'] | null = null;
      if (h[i] >= WAVE_VERY_HIGH) kind = 'very_high';
      else if (h[i] >= WAVE_HIGH) kind = 'high';
      else if (i > 0 && (h[i - 1] ?? 0) >= WAVE_HIGH) kind = 'calming';  // تراجع بعد يوم مرتفع
      if (kind) (byDay[dateStr] ||= []).push({ place: point.place, height: h[i], kind });
    });
  });
  return byDay;
}

// ── صياغة النشرة ─────────────────────────────────────────────────────────
// "الترارزة (بوتلميت، روصو)، تيرس زمور (ازويرات)"
function byWilaya(items: { city: string; wilaya: string }[]): string {
  const groups = new Map<string, string[]>();
  for (const it of items) {
    const list = groups.get(it.wilaya) || [];
    if (!list.includes(it.city)) list.push(it.city);
    groups.set(it.wilaya, list);
  }
  return [...groups].map(([w, cities]) => `${w} (${cities.join('، ')})`).join('، ');
}

function dustSection(days: string[], dust: ByDay<DustItem>, today: string): string {
  const lines: string[] = [];
  for (const d of days) {
    const items = (dust[d] || []).sort((a, b) => b.mean - a.mean);
    if (!items.length) continue;
    const heavy = items.filter((i) => i.heavy);
    const light = items.filter((i) => !i.heavy);
    const parts: string[] = [];
    if (heavy.length) parts.push(`غبار كثيف مع تراجع في مدى الرؤية على ${byWilaya(heavy)}`);
    if (light.length) parts.push(`غبار على ${byWilaya(light)}`);
    lines.push(`• ${dayLabel(d, today)}: ${parts.join('، و')}.`);
  }
  if (!lines.length) return '';
  return `🌫️ **الغبار**\n${lines.join('\n')}\n` +
    'يُنصح مرضى الربو والحساسية بتجنب الخروج غير الضروري وتغطية الأنف والفم، والحذر أثناء القيادة على الطرق بين المدن.';
}

function coldSection(days: string[], cold: ByDay<ColdItem>, today: string): string {
  const lines: string[] = [];
  for (const d of days) {
    const items = (cold[d] || []).sort((a, b) => b.drop - a.drop);
    if (!items.length) continue;
    const cities = items.map((i) => `${i.city} (${i.wilaya}) الصغرى ${i.tmin}° والكبرى ${i.tmax}°`).join('، ');
    lines.push(`• ${dayLabel(d, today)}: ${cities}.`);
  }
  if (!lines.length) return '';
  return `🌡️ **انخفاض في درجات الحرارة**\n${lines.join('\n')}`;
}

function wavesSection(days: string[], waves: ByDay<WaveItem>, today: string): string {
  const lines: string[] = [];
  let anyHigh = false;
  for (const d of days) {
    const items = (waves[d] || []).sort((a, b) => b.height - a.height);
    if (!items.length) continue;
    const parts: string[] = [];
    const veryHigh = items.filter((i) => i.kind === 'very_high');
    const high     = items.filter((i) => i.kind === 'high');
    const calming  = items.filter((i) => i.kind === 'calming');
    const where = (list: WaveItem[]) => list.map((i) => `${i.place} (${fmt1(i.height)} م)`).join('، ');
    if (veryHigh.length) parts.push(`ارتفاع كبير في الموج على سواحل ${where(veryHigh)}`);
    if (high.length)     parts.push(`ارتفاع في الموج على سواحل ${where(high)}`);
    if (calming.length)  parts.push(`تراجع في ارتفاع الموج على سواحل ${where(calming)}`);
    if (veryHigh.length || high.length) anyHigh = true;
    lines.push(`• ${dayLabel(d, today)}: ${parts.join('، و')}.`);
  }
  if (!lines.length) return '';
  // عبارة الحذر وحدها، دون نصح بعدم الإبحار
  return `🌊 **حالة البحر**\n${lines.join('\n')}` + (anyHigh ? '\nيُنصح بالحذر للزوارق التقليدية.' : '');
}

function buildTitle(today: string, has: { dust: boolean; cold: boolean; wavesHigh: boolean; wavesCalm: boolean }): string {
  const topics: string[] = [];
  if (has.dust) topics.push('غبار');
  if (has.cold) topics.push('انخفاض في درجات الحرارة');
  if (has.wavesHigh) topics.push('ارتفاع الموج');
  else if (has.wavesCalm) topics.push('تراجع الموج');
  return `النشرة الجوية ليوم ${arDate(today)}: ${topics.join(' و')}`;
}

Deno.serve(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const days = Array.from({ length: FORECAST_DAYS }, (_, i) =>
      new Date(Date.parse(today + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10));
    const errors: string[] = [];

    // كل مصدر مستقل: تعطّل خدمة أحدها لا يوقف بقية النشرة
    const safe = async <T>(name: string, load: () => Promise<ByDay<T>>): Promise<ByDay<T>> => {
      try { return await load(); } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
        return {};
      }
    };
    const [dust, cold, waves] = await Promise.all([
      safe('dust', () => dustByDay(today)),
      safe('cold', () => coldByDay(today)),
      safe('waves', () => wavesByDay(today)),
    ]);
    if (errors.length) await tg(`❌ hazard-publisher:\n${errors.join('\n')}`);

    const sections = [dustSection(days, dust, today), coldSection(days, cold, today), wavesSection(days, waves, today)].filter(Boolean);
    if (!sections.length) {
      await tg('☀️ لا ظواهر جوية لافتة (غبار، انخفاض حرارة، موج) في الأيام الثلاثة القادمة.');
      return new Response(JSON.stringify({ published: 0, message: 'nothing notable', errors }));
    }

    const allWaves = days.flatMap((d) => waves[d] || []);
    const has = {
      dust: days.some((d) => dust[d]?.length),
      cold: days.some((d) => cold[d]?.length),
      wavesHigh: allWaves.some((w) => w.kind !== 'calming'),
      wavesCalm: allWaves.some((w) => w.kind === 'calming'),
    };
    const title = buildTitle(today, has);
    const body  = sections.join('\n\n');

    // البصمة: الظواهر بمستوياتها (لا القيم الدقيقة) — 2.1 م ← 2.3 م لا يستحق تحديثاً
    const signature = {
      dust:  Object.fromEntries(days.map((d) => [d, (dust[d] || []).map((i) => `${i.city}:${i.heavy ? 'heavy' : 'dust'}`).sort()])),
      cold:  Object.fromEntries(days.map((d) => [d, (cold[d] || []).map((i) => i.city).sort()])),
      waves: Object.fromEntries(days.map((d) => [d, (waves[d] || []).map((i) => `${i.place}:${i.kind}`).sort()])),
    };
    const hash = await sha256Hex(JSON.stringify(canonicalize(signature)));

    const slug = `weather-bulletin-${today}`;
    const link = `${SITE}/news/${slug}`;
    const tags = ['أوتوماتيك', 'النشرة الجوية',
      ...(has.dust ? ['غبار'] : []), ...(has.cold ? ['برودة'] : []), ...(allWaves.length ? ['موج', 'بحر'] : [])];
    const wilaya = days.flatMap((d) => [...(dust[d] || []), ...(cold[d] || [])])[0]?.wilaya || '';

    const { data: rows } = await supabase.from('news_articles')
      .select('id, forecast_signature_hash').eq('slug', slug).limit(1);
    const existing = rows?.[0] || null;

    let result: 'published' | 'updated' | 'skipped' = 'skipped';
    if (!existing) {
      const { error } = await supabase.from('news_articles').insert([{
        title, slug, excerpt: title, content: body, category: 'طقس', wilaya,
        author: 'جاتكم اسحاب', is_published: true, published_at: new Date().toISOString(),
        tags, featured_image: '',
        forecast_signature: signature, forecast_signature_hash: hash,
      }]);
      if (error) await tg(`❌ فشل نشر ${slug}: ${error.message}`);
      else {
        result = 'published';
        await tg(`📰 *نُشرت النشرة الجوية تلقائياً:*\n${title}\n\n🔗 ${link}`);
        await postToFacebookPage(title, body, slug);
      }
    } else if (existing.forecast_signature_hash !== hash) {
      const { error } = await supabase.from('news_articles').update({
        title, excerpt: title, content: `${body}\n\n🔄 حُدّثت هذه النشرة بآخر التوقعات.`, wilaya, tags,
        published_at: new Date().toISOString(),
        forecast_signature: signature, forecast_signature_hash: hash,
      }).eq('id', existing.id);
      if (error) await tg(`❌ فشل تحديث ${slug}: ${error.message}`);
      else {
        result = 'updated';
        await tg(`🔄 *تحديث النشرة الجوية:*\n${title}\n\n🔗 ${link}`);
      }
    }

    if (result !== 'skipped') {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          title: '🌤️ النشرة الجوية — جاتكم اسحاب',
          body:  title,
          url:   `/news/${slug}`,
          tag:   'weather-bulletin',
          dedupeKey: slug,
          signature: slug,
          windowMinutes: 600,
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ result, errors }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await tg(`❌ خطأ في hazard-publisher: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
