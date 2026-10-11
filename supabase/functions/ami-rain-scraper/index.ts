// Supabase Edge Function: ami-rain-scraper
// يحفظ تقارير «مقاييس الأمطار» الرسمية (وزارة الداخلية عبر الوكالة الموريتانية
// للأنباء ami.mr) في جدول rain_measurements: صف لكل قراءة (ولاية/مقاطعة/قرية/مم)
// كما وردت في التقرير، دون أي ربط للقرية ببلديتها.
//
// أوضاع التشغيل:
//   (بلا معامل)        التشغيل الدوري عبر pg_cron: يراجع أرشيف آخر LOOKBACK_DAYS
//                      يوماً عبر بحث WordPress (لا آخر عناصر RSS وحدها)، فيُستدرك
//                      في كل تشغيل أي تقرير فات جلبه. RSS احتياط إن تعطّل البحث.
//   ?backfill=1&from=YYYY-MM-DD&to=YYYY-MM-DD[&max=20]
//                      استيراد تاريخي على دفعات. بلا أي إشعار أو نشر.
//   ?url=<رابط مقال>   معالجة مقال واحد يدوياً. بلا إشعار إلا مع notify=1.
//   ?dry=1             (مع أي وضع) تحليل فقط: لا كتابة ولا إشعار، ويعيد ما كان سيُحفظ.
//   ?fix-dates=1       إصلاح تواريخ النشر المخزَّنة (يُشغَّل يدوياً).
//
// الإشعارات (تيليغرام لكل تقرير + فيسبوك) تخص التقارير الجديدة فقط: تقرير نُشر
// خلال FRESH_HOURS ساعة. ما يلتقطه الأرشيف من تقارير أقدم يُحفظ بصمت ويُذكر في
// ملخص واحد. no-fb=1 يمنع فيسبوك في كل الأحوال.
//
// منع التكرار: report_url مفتاح التقرير — تقرير له صفوف في الجدول يُتجاهَل. وإن
// وُجد جدول rain_report_log (ترحيل 019) يُحجز التقرير فيه قبل الإدراج، فيمتنع
// إدراجه مرتين عند تزامن تشغيلين، ويُسجَّل فيه نجاح كل محاولة أو سبب فشلها.

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as cheerio from 'npm:cheerio@1';
import { parseRainReport, type RainRow } from './parser.ts';
import { rainNameKey } from '../_shared/rainNames.js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

const FB_PAGE_ID    = Deno.env.get('FB_PAGE_ID') ?? '';
const FB_PAGE_TOKEN = Deno.env.get('FB_PAGE_ACCESS_TOKEN') ?? '';
const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';

async function tg(text: string) {
  if (!TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' }),
  });
}

const AMI_ORIGIN   = 'https://www.ami.mr';
const AMI_FEED_URL = `${AMI_ORIGIN}/feed`;
const AMI_POSTS    = `${AMI_ORIGIN}/wp-json/wp/v2/posts`;
const UA = 'Mozilla/5.0 (compatible; JatkoumShabBot/1.0)';

const LOOKBACK_DAYS = 21;
const FRESH_HOURS   = 48;
// كلمات عناوين تقارير المقاييس كما وردت فعلاً في أرشيف الوكالة (بحث WordPress
// يطابق جزء الكلمة: «أمطار» تطابق «الأمطار»)
const ARCHIVE_TERMS = ['تساقط', 'تهاطل', 'أمطار', 'امطار', 'مطرية', 'هطول', 'مقاييس'];
const MIN_ROWS = 3;

// html: جسم المقال إن جاء مع نتيجة البحث (يُغني عن طلب إضافي لكل مقال)
interface Candidate { link: string; title: string; pubDate: string; wpId: string | null; html?: string }

function wpIdOf(link: string): string | null {
  return link.match(/\/archives\/(\d+)/)?.[1] ?? null;
}

function isAmiUrl(link: string): boolean {
  try {
    const host = new URL(link).hostname;
    return host === 'www.ami.mr' || host === 'ami.mr';
  } catch {
    return false;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&#8211;/g, '–').replace(/&amp;/g, '&').trim();
}

// تحليل RSS بسيط بالتعابير النمطية — الخلاصة بلا CDATA حول العنوان (تحقّقنا يدوياً)
function parseFeed(xml: string): Candidate[] {
  const items: Candidate[] = [];
  const blocks = xml.split('<item>').slice(1);
  for (const block of blocks) {
    const title   = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link    = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    if (title.trim() && link.trim()) {
      items.push({ title: title.trim(), link: link.trim(), pubDate: pubDate.trim(), wpId: wpIdOf(link.trim()) });
    }
  }
  return items;
}

// شبكة واسعة عمداً — AMI يصوغ العناوين بأشكال مختلفة (تساقطات/تهاطلات/
// أمطار متفرقة/مقاييس...)، والتصفية الحقيقية تحدث بتحليل جسم المقال.
// «مطار» لا «مطر»: كلمة «الأمطار» لا تحوي «مطر»، وهذا ما كان يُسقط أغلب التقارير.
function isRainReportTitle(title: string): boolean {
  return /مطر|مطار|مقاييس|تساقط|تهاطل|هطول/.test(title);
}

function gmtToIso(raw: string): string {
  return new Date(raw.endsWith('Z') ? raw : `${raw}Z`).toISOString();
}

// مقالات الأمطار المنشورة بين تاريخين، عبر بحث WordPress REST (العنوان + المحتوى)
async function searchArchive(afterIso: string, beforeIso: string | null): Promise<Candidate[]> {
  // موقع الوكالة بطيء (نحو 10 ثوانٍ للطلب): الكلمات تُبحث بالتوازي حتى لا
  // تستنفد الدالة مهلتها
  const perTerm = await Promise.all(ARCHIVE_TERMS.map(async (term) => {
    const hits: Candidate[] = [];
    let page = 1, totalPages = 1;
    while (page <= totalPages && page <= 30) {
      const qs = new URLSearchParams({
        search: term, per_page: '100', page: String(page), orderby: 'date', order: 'asc',
        after: afterIso, _fields: 'id,date_gmt,link,title,content',
      });
      if (beforeIso) qs.set('before', beforeIso);
      const res = await fetch(`${AMI_POSTS}?${qs}`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`archive search HTTP ${res.status} (${term}, page ${page})`);
      totalPages = Number(res.headers.get('x-wp-totalpages') || '1');
      for (const p of await res.json()) {
        const title = stripTags(p.title?.rendered ?? '');
        if (!isRainReportTitle(title)) continue;
        hits.push({
          link: p.link, title, pubDate: gmtToIso(p.date_gmt), wpId: String(p.id), html: p.content?.rendered ?? '',
        });
      }
      page++;
    }
    return hits;
  }));

  const found = new Map<string, Candidate>();
  perTerm.flat().forEach((c) => found.set(c.link, c));
  return [...found.values()].sort((a, b) => a.pubDate.localeCompare(b.pubDate));
}

interface Article { title: string; pubDate: string; html: string }

// جسم المقال من WordPress REST (العنوان والتاريخ الحقيقيان معه)؛ وإن تعذّر فصفحة المقال
async function fetchArticle(c: Candidate): Promise<Article> {
  if (c.html) return { title: c.title, pubDate: c.pubDate, html: c.html };
  if (c.wpId) {
    const res = await fetch(`${AMI_POSTS}/${c.wpId}?_fields=id,date_gmt,title,content`, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const post = await res.json();
      return {
        title: stripTags(post.title?.rendered ?? '') || c.title,
        pubDate: post.date_gmt ? gmtToIso(post.date_gmt) : c.pubDate,
        html: post.content?.rendered ?? '',
      };
    }
  }
  const res = await fetch(c.link, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`article HTTP ${res.status}`);
  // .single-post-content مقصورة على المقال نفسه (.entry-content يسبقها عنصر
  // آخر بالاسم نفسه: قائمة التنقّل الجانبية)
  const $ = cheerio.load(await res.text());
  return { title: c.title, pubDate: c.pubDate, html: $('.single-post-content').first().html() ?? '' };
}

// ── سجل التقارير (اختياري: يعمل إن طُبِّق ترحيل 019، ويُتجاوز بصمت إن لم يُطبَّق) ──
let logAvailable: boolean | null = null;

type Claim = 'claimed' | 'already-imported' | 'no-log';

async function claimReport(c: Candidate): Promise<Claim> {
  if (logAvailable === false) return 'no-log';
  const { error } = await supabase.from('rain_report_log').insert({
    report_url: c.link, wp_id: c.wpId, title: c.title, published_at: c.pubDate, status: 'processing',
  });
  if (!error) { logAvailable = true; return 'claimed'; }
  // 42P01: الجدول غير موجود (الترحيل لم يُطبَّق) — PGRST205: غير معروف لـ PostgREST
  if (error.code === '42P01' || error.code === 'PGRST205') { logAvailable = false; return 'no-log'; }
  if (error.code !== '23505') throw new Error(`rain_report_log: ${error.message}`);

  logAvailable = true;
  // محجوز سابقاً: يُعاد فقط ما لم يكتمل (فشل، أو حجز عالق منذ أكثر من 15 دقيقة)
  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await supabase
    .from('rain_report_log')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('report_url', c.link)
    // الطابع الزمني بين علامتي تنصيص: نقطتاه وفواصله محجوزة في صيغة or() لدى PostgREST
    .or(`status.in.(failed,no-data),and(status.eq.processing,updated_at.lt."${staleBefore}")`)
    .select('report_url');
  return data && data.length > 0 ? 'claimed' : 'already-imported';
}

async function logOutcome(link: string, fields: Record<string, unknown>) {
  if (!logAvailable) return;
  await supabase.from('rain_report_log')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('report_url', link);
}

// الوكالة تعيد أحياناً نشر جدول سبق نشره بعنوان ورابط جديدين (8 ثم 18 سبتمبر 2023):
// رابط مختلف فلا يكشفه فحص report_url. مقال محتواه مطابق تماماً — المواقع نفسها
// بالكميات نفسها — لتقرير مخزَّن نُشر خلال REPUBLISH_DAYS يوماً قبله لا يُحفظ ثانيةً.
const REPUBLISH_DAYS = 45;
const MIN_ROWS_FOR_REPUBLICATION = 10;

async function findRepublished(rows: RainRow[], pubDate: string): Promise<string | null> {
  if (rows.length < MIN_ROWS_FOR_REPUBLICATION) return null;
  const content = (list: { village: string; mm: number }[]) =>
    list.map((r) => `${rainNameKey(r.village)}=${Number(r.mm)}`).sort().join(',');
  const mine = content(rows);
  const from = new Date(new Date(pubDate).getTime() - REPUBLISH_DAYS * 86_400_000).toISOString();

  const stored = new Map<string, { village: string; mm: number }[]>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('rain_measurements')
      .select('report_url, village, mm')
      .gte('report_published_at', from)
      .lte('report_published_at', pubDate)
      .order('id')
      .range(offset, offset + 999);
    // تعذّر الفحص ≠ «لا تكرار»: يُرفع الخطأ فلا يُدرج التقرير في هذا التشغيل
    if (error || !data) throw new Error(`republication check: ${error?.message ?? 'no data'}`);
    for (const r of data) stored.set(r.report_url, [...(stored.get(r.report_url) ?? []), r]);
    if (data.length < 1000) break;
  }
  for (const [url, list] of stored) {
    if (list.length === rows.length && content(list) === mine) return url;
  }
  return null;
}

// ينشر تقرير المقاييس على صفحة فيسبوك — للتقارير الجديدة فقط
async function postToFacebook(rows: RainRow[], title: string): Promise<void> {
  if (!FB_PAGE_ID || !FB_PAGE_TOKEN) return;

  // أعلى 5 قراءات تنازلياً
  const top5 = [...rows].sort((a, b) => b.mm - a.mm).slice(0, 5);

  // الولايات المشمولة (فريدة، مرتبة أبجدياً)
  const wilayas = [...new Set(rows.map((r) => r.wilaya))].sort().join(' | ');

  const topLines = top5
    .map((r) => `• ${r.village}${r.moughataa ? ` (${r.moughataa})` : ''} — ${r.mm} مم`)
    .join('\n');

  const message =
    `🌧️ ${title}\n\n` +
    `📊 ${rows.length} موقع مُسجَّل\n\n` +
    `🏆 أعلى القراءات:\n${topLines}\n\n` +
    `📍 الولايات: ${wilayas}\n\n` +
    `🔗 التفاصيل الكاملة: ${SITE_URL}/measurements\n\n` +
    `المصدر: الوكالة الموريتانية للأنباء`;

  const res = await fetch(`https://graph.facebook.com/v19.0/${FB_PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, access_token: FB_PAGE_TOKEN }),
  });

  if (!res.ok) {
    const err = await res.text();
    await tg(`⚠️ فشل النشر على فيسبوك: ${err.slice(0, 200)}`).catch(() => {});
  }
}

// يجلب عنوان المقال وتاريخ نشره الحقيقيَّين من WordPress REST API
async function fetchWpMeta(articleUrl: string): Promise<{ title: string; pubDate: string }> {
  const fallback = { title: '(معالجة يدوية)', pubDate: new Date().toISOString() };
  try {
    const postId = wpIdOf(articleUrl);
    if (!postId) return fallback;
    const res = await fetch(`${AMI_POSTS}/${postId}?_fields=date_gmt,date,title`, { headers: { 'User-Agent': UA } });
    if (!res.ok) return fallback;
    const post = await res.json();
    const raw = post.date_gmt ?? post.date;
    return {
      title: stripTags(post.title?.rendered ?? '') || fallback.title,
      pubDate: raw ? gmtToIso(raw) : fallback.pubDate,
    };
  } catch {
    return fallback;
  }
}

// ══════════════════════════════════════════════════════════════════
// وضع إصلاح التواريخ (?fix-dates) — يُشغَّل مرة واحدة فقط
// يجلب تاريخ النشر الحقيقي من WP REST API لكل report_url مخزَّن
// ويُحدِّث report_published_at + report_title في الجدول
// ══════════════════════════════════════════════════════════════════
async function fixDates(): Promise<Response> {
  // جلب كل الروابط الفريدة المخزَّنة
  const { data: rows, error } = await supabase
    .from('rain_measurements')
    .select('report_url, report_title, report_published_at');
  if (error || !rows) return new Response(JSON.stringify({ error: String(error) }), { status: 500 });

  const seen = new Map<string, { title: string; pubDate: string }>();
  for (const r of rows) {
    if (!seen.has(r.report_url)) seen.set(r.report_url, { title: r.report_title, pubDate: r.report_published_at });
  }

  let updated = 0, skipped = 0, failed = 0;
  for (const [url, current] of seen) {
    const meta = await fetchWpMeta(url);
    // تجاهل إذا لم يتغيّر التاريخ أو كان الـ API غير متاح (يعيد fallback)
    const samePubDate = Math.abs(new Date(meta.pubDate).getTime() - new Date(current.pubDate).getTime()) < 60_000;
    const sameTitle = meta.title === current.title || meta.title === '(معالجة يدوية)';
    if (samePubDate && sameTitle) { skipped++; continue; }

    const { error: upErr } = await supabase
      .from('rain_measurements')
      .update({
        report_published_at: meta.pubDate,
        ...(meta.title !== '(معالجة يدوية)' ? { report_title: meta.title } : {}),
      })
      .eq('report_url', url);

    if (upErr) { failed++; } else { updated++; }
  }

  const msg = `✅ fix-dates: ${updated} روابط مُحدَّثة، ${skipped} بدون تغيير، ${failed} فشل`;
  await tg(msg);
  return new Response(JSON.stringify({ updated, skipped, failed, total: seen.size }), { headers: { 'content-type': 'application/json' } });
}

interface Outcome {
  link: string;
  title: string;
  pubDate: string;
  status: 'imported' | 'would-import' | 'exists' | 'no-data' | 'duplicate' | 'failed';
  rows: number;
  issues?: string[];
  error?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const params = new URL(req.url).searchParams;

    // وضع إصلاح التواريخ — يُشغَّل بـ ?fix-dates=1
    if (params.has('fix-dates')) return fixDates();

    const dry        = params.get('dry') === '1';
    const noFacebook = params.get('no-fb') === '1';
    const manualUrl  = params.get('url');
    const backfill   = params.get('backfill') === '1';
    const mode = manualUrl ? 'manual' : backfill ? 'backfill' : 'cron';

    let candidates: Candidate[];
    const sourceErrors: string[] = [];

    if (manualUrl) {
      if (!isAmiUrl(manualUrl)) return json({ error: 'url must be an ami.mr article' }, 400);
      candidates = [{ link: manualUrl, wpId: wpIdOf(manualUrl), ...(await fetchWpMeta(manualUrl)) }];
    } else if (backfill) {
      const from = params.get('from'), to = params.get('to');
      if (!from || !to) return json({ error: 'backfill needs from=YYYY-MM-DD&to=YYYY-MM-DD' }, 400);
      candidates = await searchArchive(`${from}T00:00:00`, `${to}T23:59:59`);
    } else {
      // الخلاصة تعرض آخر المقالات فقط، فتقرير يخرج منها قبل جلبه يضيع نهائياً؛
      // لذلك المصدر الأساسي هو الأرشيف، والخلاصة احتياط إن تعطّل البحث.
      try {
        const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 19);
        candidates = await searchArchive(since, null);
      } catch (e) {
        sourceErrors.push(`archive: ${e instanceof Error ? e.message : String(e)}`);
        const feed = parseFeed(await (await fetch(AMI_FEED_URL, { headers: { 'User-Agent': UA } })).text());
        candidates = feed.filter((it) => isRainReportTitle(it.title));
      }
    }

    // الاستيراد التاريخي على دفعات صغيرة حتى لا تتجاوز الدالة مهلتها
    const max = Math.min(Number(params.get('max')) || (backfill ? 20 : 50), 100);
    const outcomes: Outcome[] = [];
    let attempted = 0;
    const notifyEach = mode === 'cron' || (mode === 'manual' && params.get('notify') === '1');

    for (const c of candidates) {
      const { data: existing, error: existsErr } = await supabase
        .from('rain_measurements')
        .select('id')
        .eq('report_url', c.link)
        .limit(1);
      // تعذّر التحقق من وجود التقرير ≠ «غير موجود»: لا إدراج بلا تحقق، وإلا تكرّر
      // التقرير في كل تشغيل يفشل فيه هذا الاستعلام
      if (existsErr || !existing) {
        outcomes.push({ link: c.link, title: c.title, pubDate: c.pubDate, status: 'failed', rows: 0, error: `exists-check: ${existsErr?.message ?? 'no data'}` });
        continue;
      }
      if (existing.length > 0) {
        outcomes.push({ link: c.link, title: c.title, pubDate: c.pubDate, status: 'exists', rows: 0 });
        continue;
      }
      if (attempted >= max) break;

      try {
        const article = await fetchArticle(c);
        const $ = cheerio.load(`<div id="ami-root">${article.html}</div>`);
        const parsed = parseRainReport($, $('#ami-root'), article.title);

        // أقل من MIN_ROWS قراءات: خبر يذكر كمية عرضاً، أو تقرير بصيغة غير مفهومة
        if (parsed.rows.length < MIN_ROWS) {
          outcomes.push({ link: c.link, title: article.title, pubDate: article.pubDate, status: 'no-data', rows: parsed.rows.length, issues: parsed.issues });
          continue;
        }
        const twin = await findRepublished(parsed.rows, article.pubDate);
        if (twin) {
          outcomes.push({ link: c.link, title: article.title, pubDate: article.pubDate, status: 'duplicate', rows: parsed.rows.length, error: `same content as ${twin}` });
          continue;
        }
        // الحد max يُحتسب للتقارير الفعلية فقط: مقال بلا بيانات يُعاد فحصه في كل
        // تشغيل، ولو استهلك من الحد لتوقف الاستيراد التاريخي عند أول دفعة منها
        attempted++;
        if (dry) {
          outcomes.push({ link: c.link, title: article.title, pubDate: article.pubDate, status: 'would-import', rows: parsed.rows.length, issues: parsed.issues });
          continue;
        }

        const claim = await claimReport({ ...c, title: article.title, pubDate: article.pubDate });
        if (claim === 'already-imported') {
          outcomes.push({ link: c.link, title: article.title, pubDate: article.pubDate, status: 'exists', rows: 0 });
          continue;
        }

        const insertRows = parsed.rows.map((r) => ({
          report_url: c.link,
          report_title: article.title,
          report_published_at: article.pubDate,
          wilaya: r.wilaya,
          moughataa: r.moughataa || null,
          village: r.village,
          mm: r.mm,
        }));
        const { error } = await supabase.from('rain_measurements').insert(insertRows);
        if (error) throw new Error(`insert: ${error.message}`);

        await logOutcome(c.link, { status: 'imported', rows_count: insertRows.length, issues: parsed.issues, error: null });
        outcomes.push({ link: c.link, title: article.title, pubDate: article.pubDate, status: 'imported', rows: insertRows.length, issues: parsed.issues });

        const fresh = Date.now() - new Date(article.pubDate).getTime() < FRESH_HOURS * 3_600_000;
        if (notifyEach && fresh) {
          await Promise.all([
            tg(`🌧️ *تقرير مقاييس أمطار جديد (AMI):*\n${article.title}\n${insertRows.length} قراءة\n🔗 ${c.link}`),
            noFacebook ? Promise.resolve() : postToFacebook(parsed.rows, article.title),
          ]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logOutcome(c.link, { status: 'failed', error: message }).catch(() => {});
        outcomes.push({ link: c.link, title: c.title, pubDate: c.pubDate, status: 'failed', rows: 0, error: message });
      }
    }

    const count = (s: Outcome['status']) => outcomes.filter((o) => o.status === s).length;
    const imported = outcomes.filter((o) => o.status === 'imported');
    const summary = {
      mode, dry,
      candidatesFound: candidates.length,
      reportsProcessed: imported.length,
      inserted: imported.reduce((n, o) => n + o.rows, 0),
      wouldImport: count('would-import'),
      skippedExisting: count('exists'),
      skippedNoTable: count('no-data'),
      skippedDuplicate: count('duplicate'),
      failed: count('failed'),
      remaining: Math.max(0, candidates.length - outcomes.length),
      sourceErrors,
      // التفاصيل لما تغيّر أو تعذّر فقط — «موجود سابقاً» لا يحتاج سرداً
      details: outcomes.filter((o) => o.status !== 'exists'),
    };

    // ملخص واحد للتشغيل الدوري: تقارير قديمة التقطها الأرشيف، أو أي فشل
    if (!dry && mode === 'cron') {
      const late = imported.filter((o) => Date.now() - new Date(o.pubDate).getTime() >= FRESH_HOURS * 3_600_000);
      const lines: string[] = [];
      if (late.length) lines.push(`🗂️ استُدركت ${late.length} تقارير فائتة من الأرشيف (${late.reduce((n, o) => n + o.rows, 0)} قراءة).`);
      // استخراج جزئي أو اسم غير معروف: حُفظ المؤكَّد فقط، والتقرير يحتاج نظرة بشرية
      const partial = imported.filter((o) => (o.issues ?? []).some((i) => /^(no-wilaya|unknown-wilaya|skipped-value-lines|wilaya-moughataa-conflict)/.test(i)));
      if (partial.length) lines.push(`🔎 تقارير حُفظت وتحتاج مراجعة:\n${partial.map((o) => `${o.link} — ${(o.issues ?? []).join('، ')}`).join('\n').slice(0, 700)}`);
      if (summary.failed) lines.push(`⚠️ تعذّر جلب ${summary.failed} تقارير:\n${outcomes.filter((o) => o.status === 'failed').map((o) => `${o.link} — ${o.error}`).join('\n').slice(0, 600)}`);
      if (sourceErrors.length) lines.push(`⚠️ مصدر متعطّل: ${sourceErrors.join(' | ')}`);
      if (lines.length) await tg(`ami-rain-scraper\n${lines.join('\n')}`).catch(() => {});
    }

    return json(summary);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await tg(`❌ خطأ في ami-rain-scraper: ${msg}`).catch(() => {});
    return json({ error: msg }, 500);
  }
});
