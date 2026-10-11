// مُحلِّل تقارير مقاييس الأمطار (AMI) — منطق خالص بلا شبكة ولا قاعدة بيانات،
// يستقبل كائن cheerio جاهزاً ليعمل كما هو في Deno (الدالة) وفي Node (الاختبارات).
//
// الصيغ المدعومة (كلها وُجدت فعلاً في أرشيف الوكالة):
//   1. جدول HTML برأس «الولاية/المقاطعة/القرية/الكمية» مع rowspan.
//   2. سطر لكل قراءة «القرية: 40 مم» أو «القرية …… 16مم»، سواء كان السطر
//      فقرة <p> أو <div> أو <li> أو مقطعاً بين <br> داخل فقرة واحدة.
//   3. عناوين مرقَّمة «1. ولاية الحوض الشرقي:» و«* مقاطعة النعمة:».
//   4. تقارير ولاية واحدة لا تذكر الولاية إلا في العنوان أو المقدمة.
//
// قاعدة ثابتة: لا اختلاق. قراءة بلا ولاية مؤكَّدة لا تُستخرج، ويُسجَّل السبب
// في issues ليُراجَع التقرير يدوياً.

import { canonicalWilaya, knownMoughataa, rainNameKey, wilayasMentionedIn } from '../_shared/rainNames.js';

export interface RainRow { wilaya: string; moughataa: string; village: string; mm: number }

export interface ParseResult {
  rows: RainRow[];
  mode: 'table' | 'lines' | 'none';
  // عدد مواضع «رقم + مم» في نص المقال — مرجع مستقل للمقارنة مع rows.length
  mmMentions: number;
  // الجملة التمهيدية (تحمل فترة الرصد: «خلال الـ24 ساعة الماضية»…)
  intro: string;
  issues: string[];
  // أسطر تحمل كمية بالمم ولم تُستخرج منها قراءة (قيمتان في سطر، نثر…) — للمراجعة
  skipped: string[];
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
}

const HEADER_LABELS = new Set(['الولاية', 'المقاطعة', 'القرية', 'الكمية']);
const UNIT = '(?:ملم|مم|ملمتر|مليمتر|ملليمتر|ملليمترا?|ملمترا|م\\.م|م م)';
const MM_MENTION = new RegExp(`\\d+(?:[.,]\\d+)?\\s*${UNIT}(?![\\u0621-\\u064A])`, 'g');
// «رقم + وحدة» في أي موضع من النص (بلا حالة بحث، للاختبار المتكرر)
const HAS_MM = new RegExp(`\\d+(?:[.,،ر]\\d+)?[\\s.]*${UNIT}`);
const NUM = '(\\d+(?:[.,،ر]\\d+)?)';
// فواصل الإحالة البصرية بين الاسم والكمية: نقاط، شرطات بأنواعها، فواصل «,,,,»
const SEP = '\\s:.…,،_=\\-–—‐―';
// «القرية: 40 مم» / «القرية …… 16مم» / «القرية ,,,,, 28,5مم»
const VALUE_WITH_UNIT = new RegExp(`^(.*?)[${SEP}]*${NUM}[\\s.]*${UNIT}[\\s.،؛:]*$`);
// بلا وحدة: يُقبل فقط بفاصل إحالة صريح «القرية ……… 16»
const VALUE_WITH_LEADER = new RegExp(`^(.*?)\\s*[.…,_\\-–—]{2,}\\s*${NUM}[\\s.،؛]*$`);
// كتابة عشرية معكوسة في تقارير قديمة: «5،16 مم» تعني 16.5 و«5ر13مم» تعني 13.5
// (كمية المطر لا تُسجَّل بخانتين عشريتين، والكسر الشائع هو النصف)
const REVERSED_DECIMAL = /(?:^|[^\d.,،ر])\d[،,ر]\d{2,}(?![\d.,،ر])/;

// يحوّل نص الكمية إلى رقم؛ NaN إن تعذّر الجزم بترتيب الكسر (القراءة تُترك للمراجعة).
// reversed: التقرير نفسه يكتب الكسر قبل الصحيح في موضع آخر.
// مقياس المطر يسجّل خانة عشرية واحدة، فترتيب الخانات يدل على ترتيب الكتابة:
//   «5.16» / «5،16» / «5ر16» = 16.5      «16.5» / «28,5» = كما هي
function toMm(token: string, reversed: boolean): number {
  const parts = token.split(/[.,،ر]/);
  if (parts.length === 1) return parseFloat(parts[0]);
  const [a, b] = parts;
  // خانة واحدة ثم خانتان فأكثر: الكسر كُتب أولاً
  if (a.length === 1 && b.length >= 2) return a === '0' ? NaN : parseFloat(`${b}.${a}`);
  if (a.length >= 2 && b.length === 1) return parseFloat(`${a}.${b}`);
  if (a.length >= 2 && b.length >= 2) return NaN;
  // خانة وخانة («8،2»): «ر» تُكتب معكوسة دائماً، وغيرها يتبع أسلوب التقرير
  return reversed || token.includes('ر') ? parseFloat(`${b}.${a}`) : parseFloat(`${a}.${b}`);
}

// يحذف بادئة تنقيط شائعة (- – • * ·) قبل كل سطر
function stripBullet(text: string): string {
  return text.replace(/^[.*\-–•·_]+\s*/, '').trim();
}

// يحذف التطويل (ـ) المستخدم لتمديد الكلمات بصرياً («بـــقـــلـــه» ← «بقله»)
function stripTatweel(text: string): string {
  return text.replace(/ـ+/g, '').trim();
}

// ينظّف أي اسم مُستخرج (ولاية/مقاطعة/قرية) من زخارف التنسيق
function cleanName(text: string): string {
  return stripTatweel(stripBullet(text)).replace(/[\s:.…,،_=\-–—‐―\/]+$/, '').trim();
}

// يحذف بادئة «مقاطعة»/«بمقاطعة» حتى لا تتشتّت المقاطعة الواحدة إلى اسمين
function cleanMoughataa(text: string): string {
  return cleanName(text).replace(/^(مقاطعة|بمقاطعة|في مقاطعة)\s+/, '').trim();
}

type Label =
  | { kind: 'wilaya'; value: string; known: boolean }
  | { kind: 'moughataa'; value: string }
  | { kind: 'ignore' };

// سطر تصنيف (ولاية أو مقاطعة). يُرفض ما كان أطول من اسم إداري معقول أو يحمل
// علامات ترقيم جملة — الفقرة التمهيدية تذكر أسماء الولايات عرضاً داخل جملة.
function classifyLabel(rawLabel: string): Label {
  const label = cleanName(rawLabel);
  if (!label || label.length > 30 || /[،.؟!]/.test(label)) return { kind: 'ignore' };
  // سطر رأس جدول مكتوب نصاً: «الولاية المقاطعة القرية الكمية»
  if (label.includes('القرية') || label.includes('الكمية')) return { kind: 'ignore' };

  const explicitWilaya = /^(ال)?(ولاية|ولايه|لولاية|في ولاية|بولاية)\s*/.test(label);
  const canonical = canonicalWilaya(label);
  if (canonical) return { kind: 'wilaya', value: canonical, known: true };
  // «ولاية س» بإملاء غير معروف: ولاية بنص التقرير، تُحفظ كما وردت وتُعلَّم للمراجعة
  if (explicitWilaya) {
    const value = label.replace(/^(ال)?(ولاية|ولايه|لولاية|في ولاية|بولاية)[\s:\-–]*/, '').trim();
    if (!value) return { kind: 'ignore' };
    return { kind: 'wilaya', value, known: false };
  }
  return { kind: 'moughataa', value: cleanMoughataa(label) };
}

function isRainTable($: any, table: any): boolean {
  const headerText = $(table).find('tr').first().text();
  return headerText.includes('الولاية') && headerText.includes('القرية');
}

// جدول AMI يستخدم rowspan لعمودي الولاية والمقاطعة (الاسم لا يتكرر في كل صف)
function parseRainTable($: any, table: any, issues: string[]): RainRow[] {
  const rows = $(table).find('tr').toArray();
  if (rows.length < 2) return [];

  const results: RainRow[] = [];
  let currentWilaya = '', wilayaLeft = 0;
  let currentMoughataa = '', moughataaLeft = 0;
  // جدول بلا rowspan تُترك فيه خانة الولاية فارغة في الصفوف التابعة
  let sparse = false;
  const labels = new Set<string>();

  // تجاهل الصف الأول (رأس الجدول)
  for (let i = 1; i < rows.length; i++) {
    const tds = $(rows[i]).find('td');
    if (tds.length === 0) continue;
    let idx = 0;

    if (wilayaLeft <= 0) {
      const cell = tds.eq(idx);
      const raw = cleanName(cell.text().replace(/\s+/g, ' '));
      const canonical = canonicalWilaya(raw);
      if (!canonical && raw && !HEADER_LABELS.has(raw)) issues.push(`unknown-wilaya:${raw}`);
      if (raw) {
        currentWilaya = canonical || raw;
        labels.add(currentWilaya);
      } else {
        sparse = true; // خانة فارغة: الصف تابع للولاية المكتوبة في صف مجاور
      }
      wilayaLeft = parseInt(cell.attr('rowspan') || '1', 10) || 1;
      moughataaLeft = 0; // ولاية جديدة → أعِد قراءة المقاطعة دائماً
      idx++;
    }
    if (moughataaLeft <= 0) {
      const cell = tds.eq(idx);
      currentMoughataa = cleanMoughataa(cell.text().replace(/\s+/g, ' '));
      moughataaLeft = parseInt(cell.attr('rowspan') || '1', 10) || 1;
      idx++;
    }
    const village = cleanName(tds.eq(idx).text().replace(/\s+/g, ' ')); idx++;
    const mmText = normalizeDigits(tds.eq(idx).text());
    wilayaLeft--; moughataaLeft--;

    const mmMatch = mmText.match(/(\d+(?:[.,،]\d+)?)/);
    if (!village || !mmMatch) continue;
    if (HEADER_LABELS.has(village) || HEADER_LABELS.has(currentWilaya)) continue;

    const mm = toMm(mmMatch[1], false);
    if (Number.isNaN(mm)) { issues.push(`ambiguous-decimal:${village}=${mmMatch[1]}`); continue; }
    results.push({ wilaya: currentWilaya, moughataa: currentMoughataa, village, mm });
  }

  if (sparse) {
    // تسمية الولاية قد تُكتب في صف وسط مجموعتها (توسيط بصري)، فلا تُعرف حدود
    // المجموعات إلا إذا كان الجدول كله لولاية واحدة
    if (labels.size === 1) {
      const only = [...labels][0];
      results.forEach((r) => { r.wilaya = only; });
      issues.push('table-single-wilaya-label');
    } else {
      issues.push(`sparse-table-labels:${labels.size}`);
      return [];
    }
  }

  // المقاطعة أيضاً قد تُكتب مرة واحدة في صف وسط مجموعتها (بلا rowspan) وتُترك
  // خانتها فارغة في بقية الصفوف. المجموعات في هذه الجداول مرتّبة تنازلياً بالكمية،
  // فبداية كل مجموعة هي الصف الذي تزيد كميته على سابقه. تُعمَّم التسمية على
  // مجموعتها فقط إذا حوت المجموعة تسمية واحدة؛ وإلا تُترك الخانات فارغة كما وردت.
  const usesRowspan = $(table).find('td[rowspan]').length > 0;
  const labelled = results.filter((r) => r.moughataa).length;
  if (!usesRowspan && labelled > 0 && labelled < results.length) {
    const segments: RainRow[][] = [];
    results.forEach((r, i) => {
      const prev = results[i - 1];
      if (!prev || r.mm > prev.mm || r.wilaya !== prev.wilaya) segments.push([]);
      segments[segments.length - 1].push(r);
    });
    let filled = 0;
    segments.forEach((segment) => {
      const names = [...new Set(segment.map((r) => r.moughataa).filter(Boolean))];
      if (names.length !== 1) return;
      segment.forEach((r) => { if (!r.moughataa) { r.moughataa = names[0]; filled++; } });
    });
    if (filled > 0) issues.push(`moughataa-from-centred-label:${filled}`);
  }
  return results.filter((r) => r.wilaya);
}

const BLOCK_TAGS = new Set(['p', 'div', 'li', 'ul', 'ol', 'tr', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'section']);

// يحوّل جسم المقال إلى أسطر نصية: كل عنصر كتلي وكل <br> يفصل سطراً —
// فتُقرأ الصيغ الثلاث (<p> لكل قراءة / <br> داخل فقرة / <div>) بمنطق واحد
export function collectLines($: any, root: any): string[] {
  const lines: string[] = [];
  let current = '';
  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
    current = '';
  };
  const walk = (node: any) => {
    if (node.type === 'text') { current += node.data; return; }
    if (node.type !== 'tag') return;
    if (node.name === 'br') { flush(); return; }
    if (node.name === 'script' || node.name === 'style') return;
    const block = BLOCK_TAGS.has(node.name);
    if (block) flush();
    (node.children || []).forEach(walk);
    if (block) flush();
  };
  $(root).toArray().forEach((el: any) => (el.children || []).forEach(walk));
  flush();
  return lines;
}

interface DraftRow { wilaya: string; moughataa: string; village: string; mm: number }

function parseRainLines(lines: string[], title: string, issues: string[], skipped: string[]): RainRow[] {
  const drafts: DraftRow[] = [];
  const reversed = lines.some((l) => REVERSED_DECIMAL.test(normalizeDigits(l)));
  if (reversed) issues.push('reversed-decimal-notation');
  let currentWilaya = '', currentMoughataa = '';
  let intro = '';

  for (const raw of lines) {
    let text = stripBullet(normalizeDigits(raw));
    if (!text) continue;

    // «1. ولاية الحوض الشرقي:» — الترقيم ليس كمية؛ يُحذف إن لم يبقَ بعده رقم
    const unnumbered = text.replace(/^\d{1,2}\s*[.\-–)\/]+\s*/, '');
    if (unnumbered !== text && !/\d/.test(unnumbered)) text = stripBullet(unnumbered);

    if (!/\d/.test(text)) {
      const cls = classifyLabel(text);
      if (cls.kind === 'wilaya') {
        currentWilaya = cls.value; currentMoughataa = '';
        if (!cls.known) issues.push(`unknown-wilaya:${cls.value}`);
      } else if (cls.kind === 'moughataa') {
        currentMoughataa = cls.value;
      } else if (!intro && drafts.length === 0) {
        intro = text;
      }
      continue;
    }

    const m = text.match(VALUE_WITH_UNIT) || text.match(VALUE_WITH_LEADER);
    if (!m) {
      if (!intro && drafts.length === 0) intro = text;
      // بعد بدء القائمة: سطر فيه كمية ولم يُفهم
      else if (HAS_MM.test(text) && text.length <= 120) skipped.push(text);
      continue;
    }
    // قيمتان في سطر واحد («56 ملم + 06 ملم»، «قرية 63 ملم قرية 60 ملم»): لا تُخمَّن
    if (HAS_MM.test(m[1])) {
      if (text.length <= 160) skipped.push(text);
      continue;
    }

    let village = cleanName(m[1]);
    // عنوان الولاية وأول قراءاتها في سطر واحد: «ولاية غورغول: انجاجبنى غانديغا:… 05 مم»
    const inline = village.match(/^(?:ال)?ولاي[ةه]\s+([^:]+):\s*(.+)$/);
    if (inline && canonicalWilaya(inline[1])) {
      currentWilaya = canonicalWilaya(inline[1])!;
      currentMoughataa = '';
      village = cleanName(inline[2]);
    } else if (/^(?:ال)?ولاي[ةه]\s/.test(village)) {
      // «ولاية نواكشوط…..5 مم»: كمية منسوبة لولاية كاملة لا لموقع — لا تُسجَّل قراءةَ قرية
      skipped.push(text);
      continue;
    }
    const mm = toMm(m[2], reversed);
    if (Number.isNaN(mm)) {
      // كسر لا يُعرف ترتيبه («17.23»، «0.75»): لا تُخمَّن القيمة
      issues.push(`ambiguous-decimal:${village}=${m[2]}`);
      skipped.push(text);
      continue;
    }
    // اسم طويل أو بعلامات جملة = نثر يذكر كمية عرضاً، لا سطر قراءة
    if (!village || village.length > 45 || /[،؟!]/.test(village)) {
      if (drafts.length > 0 && text.length <= 120) skipped.push(text);
      continue;
    }
    // «00 مم» ليست كمية مطر مسجَّلة
    if (mm <= 0) { issues.push(`zero-mm-skipped:${village}`); continue; }

    drafts.push({ wilaya: currentWilaya, moughataa: currentMoughataa, village, mm });
  }

  // ── قراءات بلا ولاية: تُحسم فقط بدليل صريح، وإلا تُترك للمراجعة ──
  const missing = drafts.filter((d) => !d.wilaya);
  if (missing.length > 0) {
    // (أ) المقاطعة المعروفة تحدّد ولايتها (حقيقة إدارية لا تخمين)
    missing.forEach((d) => {
      const known = d.moughataa ? knownMoughataa(d.moughataa) : null;
      if (known) d.wilaya = known.wilaya;
    });
    if (missing.some((d) => d.wilaya)) issues.push('wilaya-from-moughataa');

    // (ب) العنوان يسمّي ولاية واحدة بعينها؛ وإن خلا من أي ولاية فالمقدمة بالشرط نفسه
    const still = missing.filter((d) => !d.wilaya);
    if (still.length > 0) {
      const inTitle = wilayasMentionedIn(title);
      const inIntro = inTitle.length === 0 ? wilayasMentionedIn(intro) : [];
      if (inTitle.length === 1) {
        still.forEach((d) => { d.wilaya = inTitle[0]; });
        issues.push('wilaya-from-title');
      } else if (inIntro.length === 1) {
        still.forEach((d) => { d.wilaya = inIntro[0]; });
        issues.push('wilaya-from-intro');
      } else {
        issues.push(`no-wilaya:${still.length}`);
      }
    }
  }

  return drafts.filter((d) => d.wilaya);
}

/**
 * تقارير تسرد تحت الولاية قرى كل مقاطعة مجموعةً مرتّبة تنازلياً بالكمية، بلا عنوان
 * للمقاطعة: اسمها يَرِد كأحد مواقع المجموعة («عدل بكرو: 25 ملم» بين قرى عدل بكرو).
 * تُنسب المجموعة لمقاطعتها حين تضم مركز مقاطعة واحداً بعينه من ولايتها؛ مجموعة
 * بلا مركز أو بمركزين تبقى بلا مقاطعة. لا تُطبَّق إلا على قائمة مرتّبة فعلاً
 * (مجموعات قليلة وطويلة)، حتى لا تُقسَّم قائمة غير مرتّبة إلى «مجموعات» وهمية.
 * يعيد عدد القراءات التي نُسبت.
 *
 * لا يستدعيها parseRainReport: دقتها وحدها نحو 93% على الأرشيف (مجموعتان متتاليتان
 * قد تندمجان إن لم تزد الكمية بينهما). تُستعمل في تدقيق الأرشيف مع تحقق إضافي:
 * تُقبل المجموعة فقط إن أيّدتها قرى معروفة المقاطعة من تقارير أخرى (دقة 99%).
 */
export function inferGroupMoughataas(rows: RainRow[]): number {
  let filled = 0;
  let start = 0;
  while (start < rows.length) {
    let end = start;
    while (end < rows.length && rows[end].wilaya === rows[start].wilaya) end++;
    const run = rows.slice(start, end);
    start = end;
    if (run.length < 6 || run.some((r) => r.moughataa)) continue;

    const segments: RainRow[][] = [];
    run.forEach((r, i) => {
      if (i === 0 || r.mm > run[i - 1].mm) segments.push([]);
      segments[segments.length - 1].push(r);
    });
    if (segments.length > run.length / 3) continue;

    segments.forEach((segment) => {
      const capitals = segment.filter((r) => knownMoughataa(r.village)?.wilaya === r.wilaya);
      const names = new Set(capitals.map((r) => knownMoughataa(r.village)!.name));
      if (names.size !== 1) return;
      segment.forEach((r) => { r.moughataa = capitals[0].village; filled++; });
    });
  }
  return filled;
}

/** يسجّل تعارض الولاية المكتوبة مع ولاية المقاطعة المعروفة — بلا أي تعديل على الصفوف */
function auditRows(rows: RainRow[], issues: string[]) {
  const conflicts = new Set<string>();
  rows.forEach((r) => {
    const known = r.moughataa ? knownMoughataa(r.moughataa) : null;
    if (known && known.wilaya !== r.wilaya) conflicts.add(`${r.moughataa}@${r.wilaya}≠${known.wilaya}`);
    if (r.mm > 300) issues.push(`very-high-mm:${r.village}=${r.mm}`);
  });
  conflicts.forEach((c) => issues.push(`wilaya-moughataa-conflict:${c}`));

  // نفس القرية بنفس المقاطعة مرتين في تقرير واحد: تكرار في المصدر أو قريتان باسم واحد
  const seen = new Map<string, number[]>();
  rows.forEach((r) => {
    const key = `${rainNameKey(r.wilaya)}|${rainNameKey(r.moughataa)}|${rainNameKey(r.village)}`;
    seen.set(key, [...(seen.get(key) || []), r.mm]);
  });
  let sameValue = 0, differentValue = 0;
  seen.forEach((values) => {
    if (values.length < 2) return;
    if (new Set(values).size === 1) sameValue++; else differentValue++;
  });
  if (sameValue) issues.push(`repeated-site-same-mm:${sameValue}`);
  if (differentValue) issues.push(`repeated-site-different-mm:${differentValue}`);
}

/**
 * يستخرج قراءات تقرير واحد من جسم المقال.
 * root: عنصر(عناصر) جسم المقال؛ title: عنوان المقال (لتحديد ولاية تقارير الولاية الواحدة).
 */
export function parseRainReport($: any, root: any, title = ''): ParseResult {
  const issues: string[] = [];
  const skipped: string[] = [];
  const fullText = normalizeDigits($(root).text());
  const mmMentions = (fullText.match(MM_MENTION) || []).length;

  const lines = collectLines($, root);
  const intro = lines.find((l) => l.length > 40) || '';

  let rows: RainRow[] = [];
  let mode: ParseResult['mode'] = 'none';

  // قد يضم المقال أكثر من جدول (جدول لكل يوم رصد) — تُقرأ كلها
  const tables = $(root).find('table').toArray().filter((t: any) => isRainTable($, t));
  if (tables.length > 0) {
    rows = tables.flatMap((t: any) => parseRainTable($, t, issues));
    if (rows.length > 0) mode = 'table';
    if (tables.length > 1) issues.push(`multiple-tables:${tables.length}`);
  }
  if (rows.length === 0) {
    rows = parseRainLines(lines, title, issues, skipped);
    if (rows.length > 0) mode = 'lines';
  }
  if (rows.length > 0 && skipped.length > 0) issues.push(`skipped-value-lines:${skipped.length}`);

  if (rows.length > 0) auditRows(rows, issues);
  return { rows, mode, mmMentions, intro, issues: [...new Set(issues)], skipped: rows.length > 0 ? skipped : [] };
}
