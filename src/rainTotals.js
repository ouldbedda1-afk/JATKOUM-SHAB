// ═══════════════════════════════════════════════════
// المجاميع المطرية — تجميع قراءات rain_measurements تراكمياً
// على مستويين: الولاية ← المقاطعة، ومقارنة السنوات بمتوسط الأرشيف.
//
// الصفوف المخزَّنة تبقى كما وردت في تقارير AMI؛ كل توحيد أو تصحيح هنا يخص
// الحساب فقط ولا يُكتب في قاعدة البيانات:
//  (1) التكرار: تقرير أُدرج أكثر من مرة → تُحسب قراءاته مرة واحدة.
//  (2) الإملاء: «النعمة/النعمه»، «أركيز/اركيز» → مفتاح موحَّد للتجميع.
//  (3) الولاية: صفوف تحمل ولاية خاطئة (خلل تحليل قديم) → تُصحَّح فقط بدليل
//      من الصف نفسه: مقاطعة معروفة، أو اسم ولاية مكتوب في خانة المقاطعة.
// ═══════════════════════════════════════════════════

import { canonicalWilaya, knownMoughataa, rainNameKey } from '../supabase/functions/_shared/rainNames.js';

export { rainNameKey };

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// تقرير أُدرج N مرة تتكرر فيه كل قراءة N مرة بالضبط (القاسم المشترك لكل
// التكرارات = N). قراءة مكرَّرة في المصدر نفسه — قريتان باسم واحد وكمية واحدة —
// لا تُحذف: تشابه القراءتين وحده ليس دليل تكرار.
function dropReinsertedReports(rows) {
  const byReport = new Map();
  const loose = [];
  rows.forEach((r) => {
    if (!r.report_url) { loose.push(r); return; }
    if (!byReport.has(r.report_url)) byReport.set(r.report_url, new Map());
    const groups = byReport.get(r.report_url);
    const key = `${r.wilaya}|${r.moughataa}|${r.village}|${r.mm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  const out = [...loose];
  byReport.forEach((groups) => {
    const copies = [...groups.values()].reduce((g, list) => gcd(g, list.length), 0);
    groups.forEach((list) => {
      out.push(...list.slice(0, copies > 1 ? list.length / copies : list.length));
    });
  });
  return out;
}

/**
 * يحوّل الصفوف الخام إلى قراءات جاهزة للتجميع: ولاية ومقاطعة موحَّدتان ومفتاح
 * للموقع، مع إسقاط نسخ التقرير المُدرج أكثر من مرة. الاسم الأصلي يبقى في
 * wilayaRaw، وسبب أي تصحيح في wilayaFix.
 * normWilaya: توحيد إضافي لاسم الولاية (اختياري) لما لا تعرفه القائمة المشتركة.
 */
export function cleanRainReadings(rows, normWilaya = (w) => w) {
  const numeric = (rows || [])
    .map((r) => ({ ...r, mm: Number(r.mm) }))
    .filter((r) => Number.isFinite(r.mm));

  const readings = dropReinsertedReports(numeric).map((r) => {
    const stated = canonicalWilaya(r.wilaya) || normWilaya(r.wilaya);
    const rawMoughataa = String(r.moughataa || '').trim();
    let wilaya = stated;
    let moughataa = rawMoughataa || '—';
    let wilayaFix = null;

    const known = rawMoughataa ? knownMoughataa(rawMoughataa) : null;
    const moughataaIsWilaya = rawMoughataa ? canonicalWilaya(rawMoughataa) : null;
    if (known) {
      // المقاطعة تحدّد ولايتها (حقيقة إدارية)
      moughataa = known.name;
      if (known.wilaya !== stated) { wilaya = known.wilaya; wilayaFix = 'moughataa'; }
    } else if (moughataaIsWilaya && moughataaIsWilaya !== 'نواكشوط') {
      // خلل تحليل قديم: عنوان الولاية («كوركل»، «غيديماغا») حُفظ في خانة المقاطعة
      moughataa = '—';
      if (moughataaIsWilaya !== stated) { wilaya = moughataaIsWilaya; wilayaFix = 'wilaya-in-moughataa-field'; }
    } else if (!rawMoughataa) {
      // نواكشوط خصوصاً: المقاطعة فارغة واسمها مكتوب في خانة القرية (السبخة، الميناء…).
      // يُملأ اسم المقاطعة فقط إن وافقت ولايتُها الولايةَ المكتوبة — لا تُنقل
      // قرية إلى ولاية أخرى لمجرد أن اسمها يشبه اسم مقاطعة.
      const byVillage = knownMoughataa(r.village);
      if (byVillage && byVillage.wilaya === stated) moughataa = byVillage.name;
    }

    return {
      ...r,
      wilaya,
      wilayaRaw: r.wilaya,
      wilayaFix,
      moughataa,
      moughataaFix: null,
      // مقاطعة مكتوبة صراحةً في تقريرها — وحدها تصلح شاهداً لقرية في تقرير آخر
      moughataaStated: Boolean(known),
      moughataaKey: rainNameKey(moughataa),
      villageKey: rainNameKey(r.village),
    };
  });

  return fillMoughataaFromOtherReports(readings);
}

// قرية بلا مقاطعة في تقريرها تُنسب للمقاطعة التي كُتبت لها صراحةً في تقارير أخرى،
// بشرطين: ثلاثة شواهد على الأقل في الولاية نفسها، واتفاق 90% منها. اسم يتكرر في
// أكثر من مقاطعة («بغداد»، «المبروك») لا يُحسم ويبقى تحت «—».
const MIN_WITNESSES = 3;
const MIN_AGREEMENT = 0.9;

function fillMoughataaFromOtherReports(readings) {
  const witnesses = new Map();
  readings.forEach((r) => {
    if (!r.moughataaStated) return;
    const key = `${r.wilaya}|${r.villageKey}`;
    if (!witnesses.has(key)) witnesses.set(key, new Map());
    const counts = witnesses.get(key);
    counts.set(r.moughataa, (counts.get(r.moughataa) || 0) + 1);
  });

  readings.forEach((r) => {
    if (r.moughataa !== '—') return;
    const counts = witnesses.get(`${r.wilaya}|${r.villageKey}`);
    if (!counts) return;
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const [name, top] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (total < MIN_WITNESSES || top / total < MIN_AGREEMENT) return;
    r.moughataa = name;
    r.moughataaKey = rainNameKey(name);
    r.moughataaFix = 'village-in-other-reports';
  });
  return readings;
}

function newBucket() {
  return { total: 0, count: 0, max: 0, last: null };
}

function addTo(bucket, r) {
  bucket.total += r.mm;
  bucket.count += 1;
  if (r.mm > bucket.max) bucket.max = r.mm;
  if (r.report_published_at && (!bucket.last || r.report_published_at > bucket.last)) {
    bucket.last = r.report_published_at;
  }
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * المجاميع التراكمية من قراءات نظيفة (ناتج cleanRainReadings).
 * يعيد قائمة الولايات مرتبة تنازلياً بالمجموع؛ داخل كل ولاية مقاطعاتها —
 * كلٌّ بمجموعه وعدد قراءاته وأعلى قراءة وآخر تاريخ.
 * total: مجموع القراءات المسجَّلة في كل مواقع الرصد (القرى) — يكبر بعددها،
 *        وليس كمية المطر على مساحة الولاية.
 * avgPerVillage: متوسط مجموع الموقع الواحد — الأنسب للمقارنة بين المناطق.
 */
export function buildRainTotals(readings) {
  const wilayas = new Map();

  (readings || []).forEach((r) => {
    if (!wilayas.has(r.wilaya)) wilayas.set(r.wilaya, { ...newBucket(), moughataas: new Map() });
    const w = wilayas.get(r.wilaya);
    addTo(w, r);

    if (!w.moughataas.has(r.moughataaKey)) {
      w.moughataas.set(r.moughataaKey, { ...newBucket(), moughataa: r.moughataa, villages: new Set() });
    }
    const m = w.moughataas.get(r.moughataaKey);
    addTo(m, r);
    m.villages.add(r.villageKey);
  });

  const byTotal = (a, b) => b.total - a.total;

  return [...wilayas.entries()].map(([wilaya, w]) => {
    const moughataas = [...w.moughataas.values()].map((m) => ({
      moughataa: m.moughataa,
      total: round1(m.total),
      count: m.count,
      max: m.max,
      last: m.last,
      villageCount: m.villages.size,
      avgPerVillage: round1(m.total / m.villages.size),
    })).sort(byTotal);

    const villageCount = moughataas.reduce((n, m) => n + m.villageCount, 0);
    return {
      wilaya,
      total: round1(w.total),
      count: w.count,
      max: w.max,
      last: w.last,
      villageCount,
      avgPerVillage: round1(w.total / villageCount),
      avg: w.total / w.count,
      moughataas,
    };
  }).sort(byTotal);
}

/**
 * العجز/الفائض مقابل معدل مرجعي — الصيغة المعتمدة:
 *   العجز بالمليمتر = المرجع − المسجَّل
 *   نسبة العجز     = (المرجع − المسجَّل) ÷ المرجع × 100
 * ما زاد على المرجع يُعرض فائضاً لا عجزاً سالباً، ومرجع مفقود أو صفري
 * لا تُحسب له نسبة (status: 'not-computable').
 */
export function rainDeficit(recorded, reference) {
  if (!Number.isFinite(recorded) || !Number.isFinite(reference) || reference <= 0) {
    return { status: 'not-computable', mm: null, pct: null };
  }
  const diff = reference - recorded;
  const pct = Math.round((Math.abs(diff) / reference) * 100);
  if (pct === 0) return { status: 'normal', mm: 0, pct: 0 };
  return { status: diff > 0 ? 'deficit' : 'surplus', mm: round1(Math.abs(diff)), pct };
}

// «MM-DD» من طابع ISO — للمقارنة بالفترة نفسها من كل سنة
const monthDay = (iso) => String(iso || '').slice(5, 10);

/**
 * مقارنة كل سنة بمتوسط الأرشيف على مستوى البلاد.
 *
 * مؤشر السنة = متوسط مجموع الموقع (مجموع القراءات ÷ عدد مواقع الرصد)، لأن
 * مجموع القراءات الخام يكبر بعدد المواقع المرصودة لا بكمية المطر.
 * المرجع = متوسط هذا المؤشر عبر السنوات ذات التغطية الكافية دون السنة الجارية.
 * السنة الجارية تُقارَن بالفترة نفسها: مؤشرها حتى اليوم مقابل مؤشر كل سنة
 * مرجعية حتى اليوم نفسه (الشهر-اليوم)، لا بمعدل السنة الكاملة.
 *
 * هذا مؤشر داخلي للأرشيف وليس عجزاً مناخياً: المرجع متوسط تقارير منشورة لا
 * معدلاً مناخياً لمحطات ثابتة، ومواقع الرصد تتغير من سنة لأخرى.
 *
 * سنة قراءاتها أقل من minReadings أرشيفها ناقص: انخفاض أرقامها يعكس نقص
 * التقارير لا قلة المطر، فلا تُحسب لها نسبة ولا تدخل في المرجع.
 */
export function buildYearlyDeficit(readings, { minReadings = 2000, today = new Date() } = {}) {
  const currentYear = today.getUTCFullYear();
  const cutoff = today.toISOString().slice(5, 10);

  const byYear = new Map();
  const bucket = () => ({ total: 0, count: 0, sites: new Set(), reports: new Set() });
  (readings || []).forEach((r) => {
    const year = Number(String(r.report_published_at || '').slice(0, 4));
    if (!year) return;
    if (!byYear.has(year)) byYear.set(year, { full: bucket(), toDate: bucket() });
    const y = byYear.get(year);
    const site = `${r.wilaya}|${r.moughataaKey}|${r.villageKey}`;
    [y.full, monthDay(r.report_published_at) <= cutoff ? y.toDate : null].forEach((b) => {
      if (!b) return;
      b.total += r.mm;
      b.count += 1;
      b.sites.add(site);
      if (r.report_url) b.reports.add(r.report_url);
    });
  });

  const index = (b) => (b.sites.size > 0 ? b.total / b.sites.size : NaN);
  const mean = (values) => {
    const valid = values.filter(Number.isFinite);
    return valid.length ? valid.reduce((a, v) => a + v, 0) / valid.length : NaN;
  };

  const years = [...byYear.entries()].map(([year, y]) => ({
    year,
    full: y.full,
    toDate: y.toDate,
    current: year === currentYear,
    reliable: y.full.count >= minReadings,
  })).sort((a, b) => a.year - b.year);

  const refYears = years.filter((y) => y.reliable && !y.current);
  // أقل من 3 سنوات مرجعية لا يصنع «معدلاً» ذا معنى
  const enough = refYears.length >= 3;
  const reference = enough ? mean(refYears.map((y) => index(y.full))) : NaN;
  const referenceToDate = enough ? mean(refYears.map((y) => index(y.toDate))) : NaN;

  return {
    reference: Number.isFinite(reference) ? round1(reference) : null,
    referenceToDate: Number.isFinite(referenceToDate) ? round1(referenceToDate) : null,
    referenceYears: refYears.map((y) => y.year),
    cutoff,
    years: years.map((y) => {
      // السنة الجارية: الفترة نفسها من السنوات المرجعية
      const b = y.current ? y.toDate : y.full;
      const ref = y.current ? referenceToDate : reference;
      const recorded = index(b);
      const computable = y.reliable || (y.current && b.count >= minReadings / 2);
      const deficit = computable ? rainDeficit(recorded, ref) : { status: 'not-computable', mm: null, pct: null };
      return {
        year: y.year,
        total: round1(b.total),
        count: b.count,
        sites: b.sites.size,
        reports: b.reports.size,
        avgPerSite: Number.isFinite(recorded) ? round1(recorded) : null,
        reference: Number.isFinite(ref) ? round1(ref) : null,
        reliable: y.reliable,
        current: y.current,
        status: deficit.status,
        deficitMm: deficit.status === 'deficit' ? deficit.mm : null,
        deficitPct: deficit.status === 'deficit' ? deficit.pct : null,
        surplusMm: deficit.status === 'surplus' ? deficit.mm : null,
        surplusPct: deficit.status === 'surplus' ? deficit.pct : null,
      };
    }),
  };
}
