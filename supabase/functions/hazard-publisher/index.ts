// Supabase Edge Function: hazard-publisher
// يُستدعى مرة يومياً عبر pg_cron (8:00 UTC = 8:00 بتوقيت موريتانيا) وينشر
// تلقائياً نشرات الأخطار خارج موسم الأمطار، لليوم ويومين بعده:
//
// • الموج: Open-Meteo Marine (أقصى ارتفاع يومي للموج) في أربع نقاط ساحلية.
//   العتبات من توزيع الموج الفعلي على الساحل (شتاء 2025–2026: نادراً ما تجاوز
//   2.5 م، ووسيطه 1.3–1.7 م).
// • الغبار: Open-Meteo Air Quality (تركيز الغبار السطحي من نموذج CAMS،
//   ميكروغرام/م³) — متوسط اليوم لكل مدينة. عتبة مطلقة لا تكفي وحدها: الشمال
//   والساحل يتجاوزان 300 في نصف أيام الشتاء، بينما لا يبلغ الشرق والجنوب 400
//   أبداً؛ لذا يُعتبر اليوم مغبراً إن بلغ عتبة عالية، أو قفز إلى ثلاثة أضعاف
//   وسيط المدينة نفسها في الثلاثين يوماً الماضية.
//
// كل خطر × يوم = مقال بـslug ثابت (hazard-waves-YYYY-MM-DD / hazard-dust-…).
// الاستدعاء اللاحق لنفس الـslug يقارن بصمة (المكان ← المستوى) بالمخزَّنة: إن
// تطابقتا لا شيء، وإن اختلفتا يُحدَّث المقال في مكانه، وإن زال الخطر يُحدَّث
// بأنه لم يعد متوقعاً. فيسبوك عند أول نشر فقط، كما في forecast-publisher.

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

// الموج (م): أقصى ارتفاع يومي
const WAVE_HIGH      = 2.0;
const WAVE_VERY_HIGH = 2.5;

// الغبار (ميكروغرام/م³): متوسط اليوم
const DUST_HIGH       = 700;
const DUST_VERY_HIGH  = 1000;
const DUST_JUMP_MIN   = 250;  // أدنى متوسط تُقبل معه قاعدة القفزة النسبية
const DUST_JUMP_RATIO = 3;    // × وسيط المدينة في الأيام الماضية
const DUST_BASELINE_DAYS = 30;

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
function periodPhrase(dateStr: string, today: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const opts = { calendar: 'gregory', timeZone: 'Africa/Abidjan' } as const;
  const day  = d.toLocaleDateString('ar-SA', { ...opts, weekday: 'long' });
  const date = d.toLocaleDateString('ar-SA', { ...opts, day: 'numeric', month: 'long' });
  return dateStr === today ? `اليوم ${day} ${date}` : `يوم ${day} ${date}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── بنود الخطر: مكان واحد بمستواه وقيمته ──────────────────────────────────
type Level = 'high' | 'very_high';
interface HazardItem { place: string; wilaya: string; level: Level; value: number }

// البصمة تُبنى من (المكان ← المستوى) فقط: تغيّر القيمة داخل نفس المستوى
// (2.1 م ← 2.3 م) لا يستحق تحديث المقال وإشعار الجميع
type Signature = Record<string, Level>;

function signatureOf(items: HazardItem[]): Signature {
  const sig: Signature = {};
  for (const it of [...items].sort((a, b) => a.place.localeCompare(b.place))) sig[it.place] = it.level;
  return sig;
}

interface HazardKind {
  key: 'waves' | 'dust';
  category: string;
  tags: string[];
  icon: string;
  levelLabel: Record<Level, string>;
  title(items: HazardItem[], period: string): string;
  line(it: HazardItem, period: string): string;
  advice: string[];
  noneLabel: string;   // عبارة "لم يعد متوقعاً"
}

const fmtM = (v: number) => v.toFixed(1).replace('.', ',');

const WAVES: HazardKind = {
  key: 'waves',
  category: 'بحر',
  tags: ['موج', 'بحر', 'الساحل'],
  icon: '🌊',
  levelLabel: { high: 'ارتفاع في الموج', very_high: 'ارتفاع كبير في الموج' },
  title: (items, period) => {
    const top = items.some((i) => i.level === 'very_high') ? 'ارتفاع كبير في الموج' : 'ارتفاع في الموج';
    return `يتوقع ${top} على سواحل ${items.map((i) => i.place).join(' و')} ${period}`;
  },
  line: (it, period) =>
    `🌊 يتوقع ${WAVES.levelLabel[it.level]} على سواحل ${it.place} ${period}، قد يصل إلى ${fmtM(it.value)} م.`,
  // عبارة الحذر وحدها، دون نصح بعدم الإبحار
  advice: ['يُنصح بالحذر للزوارق التقليدية.'],
  noneLabel: 'ارتفاع الموج',
};

const DUST: HazardKind = {
  key: 'dust',
  category: 'طقس',
  tags: ['غبار', 'طقس'],
  icon: '🌫️',
  levelLabel: { high: 'غبار', very_high: 'غبار كثيف' },
  title: (items, period) => {
    const top = items.some((i) => i.level === 'very_high') ? 'غبار كثيف' : 'غبار';
    const names = items.slice(0, 4).map((i) => i.place).join(' و');
    return `يتوقع ${top} على ${names}${items.length > 4 ? ' ومناطق أخرى' : ''} ${period}`;
  },
  line: (it, period) =>
    `🌫️ يتوقع ${DUST.levelLabel[it.level]} على ${it.place} (${it.wilaya}) ${period}${it.level === 'very_high' ? '، مع تراجع في مدى الرؤية' : ''}.`,
  advice: [
    'يُنصح مرضى الربو والحساسية بتجنب الخروج غير الضروري وتغطية الأنف والفم.',
    'الحذر أثناء القيادة على الطرق بين المدن.',
  ],
  noneLabel: 'الغبار',
};

function buildBody(kind: HazardKind, items: HazardItem[], period: string): string {
  const lines = items.map((it) => kind.line(it, period)).join('\n\n');
  return `${lines}\n\n${kind.advice.join('\n')}`;
}

// ── نشر / تحديث / إلغاء مقال خطر واحد ────────────────────────────────────
interface ArticleRow {
  id: string;
  forecast_signature: { hazard?: Signature } | null;
  forecast_signature_hash: string | null;
}

async function syncArticle(kind: HazardKind, dateStr: string, today: string, items: HazardItem[]):
  Promise<'published' | 'updated' | 'retracted' | 'skipped'> {
  const slug   = `hazard-${kind.key}-${dateStr}`;
  const link   = `${SITE}/news/${slug}`;
  const period = periodPhrase(dateStr, today);

  const { data: rows } = await supabase.from('news_articles')
    .select('id, forecast_signature, forecast_signature_hash').eq('slug', slug).limit(1);
  const existing: ArticleRow | null = rows?.[0] || null;
  const prevSig = existing?.forecast_signature?.hazard || {};

  // لا خطر: لا شيء، إلا إن سبق نشر خطر لهذا اليوم — فيُحدَّث بأنه لم يعد متوقعاً
  if (!items.length) {
    if (!existing || !Object.keys(prevSig).length) return 'skipped';
    const title = `تحديث: لم يعد ${kind.noneLabel} متوقعاً ${period}`;
    const content = `🔄 **تحديث:** تشير آخر التوقعات إلى أن ${kind.noneLabel} لم يعد متوقعاً ${period}.\n\n` +
      `📌 **التوقع السابق:** ${Object.keys(prevSig).join('، ')}`;
    const { error } = await supabase.from('news_articles').update({
      title, excerpt: title, content, published_at: new Date().toISOString(),
      forecast_signature: { hazard: {} }, forecast_signature_hash: await sha256Hex('{}'),
    }).eq('id', existing.id);
    if (error) { await tg(`❌ فشل تحديث ${slug}: ${error.message}`); return 'skipped'; }
    await tg(`🔄 *${title}*\n\n🔗 ${link}`);
    return 'retracted';
  }

  const sig   = signatureOf(items);
  const hash  = await sha256Hex(JSON.stringify(sig));
  const title = kind.title(items, period);
  const body  = buildBody(kind, items, period);
  const tags  = ['أوتوماتيك', ...kind.tags];
  const wilaya = items[0].wilaya;

  if (!existing) {
    const { error } = await supabase.from('news_articles').insert([{
      title, slug, excerpt: title, content: body, category: kind.category, wilaya,
      author: 'جاتكم اسحاب', is_published: true, published_at: new Date().toISOString(),
      tags, featured_image: '',
      forecast_signature: { hazard: sig }, forecast_signature_hash: hash,
    }]);
    if (error) { await tg(`❌ فشل نشر ${slug}: ${error.message}`); return 'skipped'; }
    await tg(`📰 *نُشر تلقائياً (${kind.levelLabel.high}):*\n${title}\n\n🔗 ${link}`);
    await postToFacebookPage(title, body, slug);
    return 'published';
  }

  if (existing.forecast_signature_hash === hash) return 'skipped';

  // ما تغيّر منذ النشر السابق — يُكتب صراحة بدل ترك القارئ يقارن بنفسه
  const changes: string[] = [];
  for (const it of items) {
    if (!prevSig[it.place]) changes.push(`➕ أُضيفت: ${it.place}`);
    else if (prevSig[it.place] !== it.level) changes.push(`🔁 ${it.place}: ${kind.levelLabel[prevSig[it.place]]} ← ${kind.levelLabel[it.level]}`);
  }
  for (const place of Object.keys(prevSig)) {
    if (!sig[place]) changes.push(`➖ حُذفت: ${place}`);
  }
  const content = `${body}\n\n🔄 **تحديث ${period}:**\n${changes.join('\n')}`;

  const { error } = await supabase.from('news_articles').update({
    title, excerpt: title, content, category: kind.category, wilaya, tags,
    published_at: new Date().toISOString(),
    forecast_signature: { hazard: sig }, forecast_signature_hash: hash,
  }).eq('id', existing.id);
  if (error) { await tg(`❌ فشل تحديث ${slug}: ${error.message}`); return 'skipped'; }
  await tg(`🔄 *تحديث:*\n${title}\n\n🔗 ${link}`);
  return 'updated';
}

// ── جلب البيانات ─────────────────────────────────────────────────────────
// Open-Meteo يُعيد مصفوفة عند طلب عدة مواقع، وكائناً واحداً لموقع واحد
async function fetchMulti(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [json];
}

async function waveItemsByDay(): Promise<Record<string, HazardItem[]>> {
  const lats = COAST_POINTS.map((p) => p.lat).join(',');
  const lons = COAST_POINTS.map((p) => p.lon).join(',');
  const results = await fetchMulti(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
    `&daily=wave_height_max&timezone=Africa%2FAbidjan&forecast_days=${FORECAST_DAYS}`,
  );

  const byDay: Record<string, HazardItem[]> = {};
  results.forEach((r, idx) => {
    const point = COAST_POINTS[idx];
    (r?.daily?.time || []).forEach((dateStr: string, di: number) => {
      byDay[dateStr] ||= [];
      const h = r.daily.wave_height_max?.[di];
      if (h == null || h < WAVE_HIGH) return;
      byDay[dateStr].push({ place: point.place, wilaya: point.wilaya, value: h, level: h >= WAVE_VERY_HIGH ? 'very_high' : 'high' });
    });
  });
  for (const items of Object.values(byDay)) items.sort((a, b) => b.value - a.value);
  return byDay;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function dustItemsByDay(today: string): Promise<Record<string, HazardItem[]>> {
  const lats = CITIES.map((c) => c.lat).join(',');
  const lons = CITIES.map((c) => c.lon).join(',');
  const results = await fetchMulti(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}` +
    `&hourly=dust&timezone=Africa%2FAbidjan&past_days=${DUST_BASELINE_DAYS}&forecast_days=${FORECAST_DAYS}`,
  );

  const byDay: Record<string, HazardItem[]> = {};
  results.forEach((r, idx) => {
    const city = CITIES[idx];
    if (!r?.hourly?.time) return;

    // متوسط كل يوم من قيمه الساعية
    const sums: Record<string, { sum: number; n: number }> = {};
    r.hourly.time.forEach((t: string, hi: number) => {
      const v = r.hourly.dust?.[hi];
      if (v == null) return;
      const d = t.slice(0, 10);
      (sums[d] ||= { sum: 0, n: 0 }).sum += v;
      sums[d].n++;
    });
    const means = Object.fromEntries(Object.entries(sums).map(([d, s]) => [d, s.sum / s.n]));
    const baseline = median(Object.entries(means).filter(([d]) => d < today).map(([, m]) => m));

    for (const [dateStr, mean] of Object.entries(means)) {
      if (dateStr < today) continue;
      byDay[dateStr] ||= [];
      const jump = mean >= DUST_JUMP_MIN && baseline > 0 && mean >= DUST_JUMP_RATIO * baseline;
      if (mean < DUST_HIGH && !jump) continue;
      byDay[dateStr].push({ place: city.city, wilaya: city.wilaya, value: Math.round(mean), level: mean >= DUST_VERY_HIGH ? 'very_high' : 'high' });
    }
  });
  for (const items of Object.values(byDay)) items.sort((a, b) => b.value - a.value);
  return byDay;
}

Deno.serve(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const counts = { published: 0, updated: 0, retracted: 0 };
    const errors: string[] = [];
    const notified = new Set<string>();   // الأخطار التي نُشر لها أو حُدّث مقال

    // كل خطر مستقل: تعطّل خدمة أحدهما لا يوقف نشرة الآخر
    for (const [kind, load] of [[WAVES, () => waveItemsByDay()], [DUST, () => dustItemsByDay(today)]] as const) {
      let byDay: Record<string, HazardItem[]>;
      try {
        byDay = await load();
      } catch (e) {
        errors.push(`${kind.key}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      for (const [dateStr, items] of Object.entries(byDay).sort()) {
        const r = await syncArticle(kind, dateStr, today, items);
        if (r !== 'skipped') counts[r]++;
        if (r === 'published' || r === 'updated') notified.add(kind.key === 'waves' ? 'حالة البحر على السواحل' : 'توقعات الغبار');
      }
    }

    if (errors.length) await tg(`❌ hazard-publisher:\n${errors.join('\n')}`);

    if (notified.size > 0) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          title: '⚠️ نشرة جديدة — جاتكم اسحاب',
          body:  `نُشرت ${[...notified].join(' و')} في موريتانيا. اضغط للاطلاع على التفاصيل.`,
          url:   '/news',
          tag:   'hazard-update',
          dedupeKey: `hazard-${today}`,
          signature: `hazard-${today}`,
          windowMinutes: 600,
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ ...counts, errors }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await tg(`❌ خطأ في hazard-publisher: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
