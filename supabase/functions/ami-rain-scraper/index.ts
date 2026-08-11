// Supabase Edge Function: ami-rain-scraper
// يُستدعى دورياً عبر pg_cron. يفحص خلاصة RSS للوكالة الموريتانية للأنباء
// (ami.mr) بحثاً عن تقارير "مقاييس الأمطار" الرسمية الدورية الصادرة عن
// وزارة الداخلية (عنوان يحتوي "تساقط"/"تهاطل" + "مطر")، ويحفظ قراءات كل
// قرية (ولاية/مقاطعة/قرية/كمية بالمم) في جدول rain_measurements — دون أي
// محاولة لربط القرية ببلديتها (AMI لا يوفر هذا الربط، والبيانات تُنشر كما
// وردت: ولاية/مقاطعة/قرية).
//
// جدول AMI الأصلي يستخدم rowspan لعمودي الولاية والمقاطعة (لا يتكرر
// الاسم في كل صف)، لذا يتتبّع المُحلِّل (parseRainTable) عدد الصفوف
// المتبقية تحت كل قيمة عبر خاصية rowspan HTML بدل افتراض تكرارها.
//
// report_url (رابط المقال) هو مفتاح منع التكرار: تقرير سبقت معالجته
// (توجد له صفوف في الجدول) يُتجاهَل بالكامل ولا يُعاد تحليله أو حفظه.

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as cheerio from 'npm:cheerio@1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

async function tg(text: string) {
  if (!TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' }),
  });
}

const AMI_FEED_URL = 'https://www.ami.mr/feed';
const UA = 'Mozilla/5.0 (compatible; JatkoumShabBot/1.0)';

interface FeedItem { title: string; link: string; pubDate: string }

// تحليل RSS بسيط بالتعابير النمطية — الخلاصة بلا CDATA حول العنوان (تحقّقنا يدوياً)
function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.split('<item>').slice(1);
  for (const block of blocks) {
    const title   = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link    = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    if (title.trim() && link.trim()) {
      items.push({ title: title.trim(), link: link.trim(), pubDate: pubDate.trim() });
    }
  }
  return items;
}

// شبكة واسعة عمداً — AMI يصوغ العناوين بأشكال مختلفة (تساقطات/تهاطلات/
// أمطار متفرقة/مقاييس...)، والتصفية الحقيقية والدقيقة تحدث لاحقاً بالتحقق
// من وجود جدول قياسات فعلي (رأس "الولاية/المقاطعة/القرية/الكمية") في
// parseRainTable — لا نعتمد على العنوان وحده لتفادي تفويت تقارير حقيقية
function isRainReportTitle(title: string): boolean {
  return title.includes('مطر') || title.includes('مقاييس');
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
}

const HEADER_LABELS = new Set(['الولاية', 'المقاطعة', 'القرية', 'الكمية']);

interface RainRow { wilaya: string; moughataa: string; village: string; mm: number }

// ── تطبيع أسماء الولايات (AMI يكتبها بإملاءات مختلفة عبر التقارير: لعصابه/
// لعصابة/العصابة...) — بلا هذا التطبيع تتشتّت نفس الولاية إلى عدة "ولايات"
// مختلفة في الإحصاءات. المطابقة تامة فقط (بعد التنظيف) لتفادي مطابقة اسم
// ولاية يظهر عرضاً داخل جملة طويلة (كفقرة تمهيدية تذكر عدة ولايات).
const WILAYA_CANONICAL: Record<string, string> = {};
function addWilaya(canonical: string, variants: string[]) {
  WILAYA_CANONICAL[canonical] = canonical;
  for (const v of variants) WILAYA_CANONICAL[v] = canonical;
}
addWilaya('نواكشوط الشمالية', ['نواكشوط الشماليه', 'انواكشوط الشمالية', 'انواكشوط الشماليه']);
addWilaya('نواكشوط الغربية', ['نواكشوط الغربيه', 'انواكشوط الغربية', 'انواكشوط الغربيه']);
addWilaya('نواكشوط الجنوبية', ['نواكشوط الجنوبيه', 'انواكشوط الجنوبية', 'انواكشوط الجنوبيه']);
addWilaya('الحوض الشرقي', ['ولاية الحوض الشرقي']);
addWilaya('الحوض الغربي', ['ولاية الحوض الغربي']);
addWilaya('لعصابه', ['لعصابة', 'العصابة', 'ولاية لعصابه']);
addWilaya('كوركول', ['ولاية كوركول']);
addWilaya('لبراكنه', ['البراكنة', 'لبراكنة', 'ولاية لبراكنه']);
addWilaya('الترارزة', ['اترارزه', 'الترارزه']);
addWilaya('آدرار', ['ولاية آدرار']);
addWilaya('كيدي ماغا', ['كيدي ماغه', 'گيديماغه', 'كيديماغه', 'ولاية كيدي ماغا', 'ولاية كيدي ماغه']);
addWilaya('إينشيري', ['اينشيري', 'إنشيري', 'انشيري']);
addWilaya('تكانت', []);
addWilaya('تيرس زمور', []);
addWilaya('داخلت نواذيبو', ['نواذيبو']);

// AMI يكتب نفس الولاية بإملاءات مختلفة عبر التقارير — ليس فقط ة/ه (اترارزة/
// اترارزه) بل أيضاً همزات الألف (اترارزه/أترارزه) والمسافة بين الكلمات
// (كيدي ماغا/كيديماغا، أمثلة حقيقية وُجدت جميعها فعلياً). بدل إضافة كل صيغة
// يدوياً كلما ظهرت واحدة جديدة، تُطابَق الولاية بتطبيع شامل عند المقارنة
// فقط (الاسم المُخزَّن نفسه لا يتغيّر): توحيد كل أشكال الألف (أ/إ/آ ← ا)،
// توحيد ة/ه، وحذف المسافات بين الكلمات بالكامل.
function normalizeArabicForMatch(s: string): string {
  return s.replace(/[أإآ]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/\s+/g, '');
}
const WILAYA_LOOKUP: Record<string, string> = {};
for (const [k, v] of Object.entries(WILAYA_CANONICAL)) {
  WILAYA_LOOKUP[normalizeArabicForMatch(k)] = v;
}

// يحذف بادئة تنقيط شائعة (- – • * ·) قبل كل فقرة — بعض التقارير تكتب
// "* المقاطعة:" و"* القرية: XX ملم"، وأخرى "– الولاية" بلا أي نقطتين إطلاقاً
function stripBullet(text: string): string {
  return text.replace(/^[*\-–•·]+\s*/, '').trim();
}

// يحذف التطويل (ـ) المستخدم أحياناً لتمديد الكلمات بصرياً في النص المُبَرَّر
// (مثال: "بـــقـــلـــه" ← "بقله")
function stripTatweel(text: string): string {
  return text.replace(/ـ+/g, '').trim();
}

// ينظّف أي اسم مُستخرج (ولاية/مقاطعة/قرية) من زخارف التنسيق الشائعة —
// يُطبَّق على مخرجات كلا المُحلِّلين (الجدول والفقرات) لأن نفس المشاكل
// (تطويل، بادئة تنقيط) تظهر أحياناً حتى داخل خلايا الجدول
function cleanName(text: string): string {
  return stripTatweel(stripBullet(text)).replace(/:$/, '').trim();
}

// يحذف بادئة "مقاطعة"/"بمقاطعة" — بعض التقارير تكتب "مقاطعة كنكوصه" وأخرى
// "كنكوصه" فقط لنفس المقاطعة، فتتشتّت إحصائياً كمقاطعتين مختلفتين بلا هذا التوحيد
function cleanMoughataa(text: string): string {
  return cleanName(text).replace(/^(مقاطعة|بمقاطعة)\s+/, '').trim();
}

// سطر تصنيف (وليس قرية+كمية) قد يكون اسم ولاية معروفاً أو اسم مقاطعة —
// لكن الفقرة التمهيدية لأي تقرير تذكر أحياناً اسم ولاية ضمن جملة كاملة
// ("...من ولايتي الحوض الغربي ولعصابه...")؛ رفض أي "تصنيف" أطول من طول
// معقول لاسم إداري، أو يحوي علامات ترقيم جملة، يمنع هذا الالتباس
function classifyLabel(rawLabel: string): { kind: 'wilaya' | 'moughataa' | 'ignore'; value: string } {
  const label = cleanName(rawLabel).replace(/^(ولاية|لولاية)\s+/, '').trim();
  if (!label || label.length > 25 || /[،.؟!]/.test(label)) return { kind: 'ignore', value: '' };
  const canonical = WILAYA_LOOKUP[normalizeArabicForMatch(label)];
  if (canonical) return { kind: 'wilaya', value: canonical };
  return { kind: 'moughataa', value: cleanMoughataa(label) };
}

function parseRainTable($: cheerio.CheerioAPI, table: any): RainRow[] {
  const rows = $(table).find('tr').toArray();
  if (rows.length < 2) return [];

  const results: RainRow[] = [];
  let currentWilaya = '', wilayaLeft = 0;
  let currentMoughataa = '', moughataaLeft = 0;

  // تجاهل الصف الأول (رأس الجدول)
  for (let i = 1; i < rows.length; i++) {
    const tds = $(rows[i]).find('td');
    if (tds.length === 0) continue;
    let idx = 0;

    if (wilayaLeft <= 0) {
      const cell = tds.eq(idx);
      const cls = classifyLabel(cell.text());
      currentWilaya = cls.kind === 'wilaya' ? cls.value : cleanName(cell.text());
      wilayaLeft = parseInt(cell.attr('rowspan') || '1', 10) || 1;
      idx++;
    }
    if (moughataaLeft <= 0) {
      const cell = tds.eq(idx);
      currentMoughataa = cleanMoughataa(cell.text());
      moughataaLeft = parseInt(cell.attr('rowspan') || '1', 10) || 1;
      idx++;
    }
    const village = cleanName(tds.eq(idx).text()); idx++;
    const mmText  = normalizeDigits(tds.eq(idx).text());
    wilayaLeft--; moughataaLeft--;

    const mmMatch = mmText.match(/([\d.]+)/);
    if (!village || !mmMatch || !currentWilaya) continue;
    if (HEADER_LABELS.has(village) || HEADER_LABELS.has(currentWilaya)) continue;

    const mm = parseFloat(mmMatch[1]);
    if (!Number.isFinite(mm)) continue;

    results.push({ wilaya: currentWilaya, moughataa: currentMoughataa, village, mm });
  }
  return results;
}

function parseRainParagraphs($: cheerio.CheerioAPI, container: any): RainRow[] {
  const paragraphs = $(container).find('p').toArray();
  const results: RainRow[] = [];
  let currentWilaya = '', currentMoughataa = '';

  for (const p of paragraphs) {
    const raw = $(p).text().replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const text = stripBullet(raw);
    if (!text) continue;

    // سطر تصنيف (ولاية أو مقاطعة): لا يحتوي رقماً — بنقطتين أو بدونها.
    // يُتجاهَل تماماً (لا وِلاية ولا مقاطعة) إن كان فقرة تمهيدية طويلة
    // تذكر اسم ولاية عرضاً ضمن جملة كاملة (classifyLabel.kind === 'ignore')
    if (!/\d/.test(normalizeDigits(text))) {
      const cls = classifyLabel(text);
      if (cls.kind === 'wilaya') { currentWilaya = cls.value; currentMoughataa = ''; }
      else if (cls.kind === 'moughataa') { currentMoughataa = cls.value; }
      continue;
    }

    // سطر قرية + كمية: "القرية XX ملم"، أو "القرية: XX ملم"، أو بفاصل نقاط/إحالة
    // بصرية بين الاسم والرقم مثل "القرية.......XX ملم"
    const normalized = normalizeDigits(text).replace(/[،,](?=\d)/g, '.');
    const m = normalized.match(/^(.*?)[\s:.…]+([\d.]+)\s*(?:ملم|مم)\.?$/);
    if (!m || !currentWilaya) continue;

    const village = cleanName(m[1]);
    const mm = parseFloat(m[2]);
    if (!village || !Number.isFinite(mm)) continue;

    results.push({ wilaya: currentWilaya, moughataa: currentMoughataa, village, mm });
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    // معالجة يدوية لمقال محدد (نسخ احتياطي/اختبار) — فقط عند تمرير
    // ?url=... صراحةً؛ التشغيل الدوري العادي (بلا معامل) لا يتأثر إطلاقاً
    const manualUrl = new URL(req.url).searchParams.get('url');
    const items: FeedItem[] = manualUrl
      ? [{ title: '(معالجة يدوية)', link: manualUrl, pubDate: new Date().toISOString() }]
      : parseFeed(await (await fetch(AMI_FEED_URL, { headers: { 'User-Agent': UA } })).text());
    const candidates = manualUrl ? items : items.filter((it) => isRainReportTitle(it.title));

    let reportsProcessed = 0, inserted = 0, skippedExisting = 0, skippedNoTable = 0;

    for (const item of candidates) {
      const reportUrl = item.link;

      const { data: existing } = await supabase
        .from('rain_measurements')
        .select('id')
        .eq('report_url', reportUrl)
        .limit(1);
      if (existing && existing.length > 0) { skippedExisting++; continue; }

      const articleRes = await fetch(reportUrl, { headers: { 'User-Agent': UA } });
      const html = await articleRes.text();
      const $ = cheerio.load(html);
      // ملاحظة: .entry-content وحدها غير موثوقة — الصفحة تحتوي عنصراً آخر
      // بنفس الاسم (قائمة تنقّل الشاشة الجانبية) يسبق جسم المقال الحقيقي في
      // شجرة DOM. .single-post-content مقصورة على المقال نفسه فقط.
      const article = $('.single-post-content').first();

      // العنوان وحده شبكة واسعة (قد يطابق مقالاً غير متعلق بالمقاييس فعلاً) —
      // التصفية الحقيقية: أول جدول يحمل رأساً فعلياً "الولاية.../القرية..."،
      // وإلا صيغة الفقرات البديلة (بعض التقارير تُكتب بلا جدول HTML إطلاقاً)
      const table = $(article).find('table').toArray().find((t) => {
        const headerText = $(t).find('tr').first().text();
        return headerText.includes('الولاية') && headerText.includes('القرية');
      });

      const rows = table ? parseRainTable($, table) : parseRainParagraphs($, article);
      if (rows.length === 0) { skippedNoTable++; continue; }

      const publishedAt = new Date(item.pubDate).toISOString();
      const insertRows = rows.map((r) => ({
        report_url: reportUrl,
        report_title: item.title,
        report_published_at: publishedAt,
        wilaya: r.wilaya,
        moughataa: r.moughataa || null,
        village: r.village,
        mm: r.mm,
      }));

      const { error } = await supabase.from('rain_measurements').insert(insertRows);
      if (!error) {
        inserted += insertRows.length;
        reportsProcessed++;
        await tg(`🌧️ *تقرير مقاييس أمطار جديد (AMI):*\n${item.title}\n${insertRows.length} قراءة\n🔗 ${reportUrl}`);
      }
    }

    return new Response(JSON.stringify({
      candidatesFound: candidates.length, reportsProcessed, inserted, skippedExisting, skippedNoTable,
    }), { headers: { 'content-type': 'application/json' } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await tg(`❌ خطأ في ami-rain-scraper: ${msg}`).catch(() => {});
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
