/* global process, console, URL */
// استيراد أرشيف مقاييس الأمطار التاريخي إلى rain_measurements من ملف خطة جاهز
// (import_rows.json الناتج عن التدقيق). لا يمرّ بدالة ami-rain-scraper، فلا تيليغرام
// ولا فيسبوك: هذا الملف لا يعرف إلا جدول القراءات.
//
// الوضع الافتراضي تجريبي (لا كتابة). الكتابة تحتاج --execute و--confirm-host معاً.
//
//   تجربة (قراءة فقط):
//     node scripts/rain-archive-import.mjs --plan import_rows.json
//   تنفيذ:
//     node scripts/rain-archive-import.mjs --plan import_rows.json --execute \
//          --confirm-host <host of SUPABASE_URL> --backup backup.json --log import-log.jsonl
//   تراجع عن تشغيل سابق (يحذف فقط ما أدرجه ذلك التشغيل):
//     node scripts/rain-archive-import.mjs --rollback import-log.jsonl --execute --confirm-host <host>
//
// المتغيران SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY يُقرآن من البيئة ولا يُطبعان.
//
// ضمانات:
//   • تقرير له أي صف في الجدول يُتخطّى كاملاً ← إعادة التشغيل آمنة.
//   • كل تقرير يُدرج بطلب واحد (كله أو لا شيء).
//   • تعذّر التحقق من وجود تقرير = توقف عن ذلك التقرير، لا إدراج بلا تحقق.
//   • نسخة احتياطية كاملة من الجدول قبل أول كتابة، ولا كتابة إن لم يطابق عددُ
//     صفوفها عددَ صفوف الجدول.
//   • لا UPDATE ولا DELETE في مسار الاستيراد؛ الحذف في مسار التراجع فقط، ومحصور
//     بمعرّفات الصفوف (id) التي أدرجها ذلك التشغيل وسجّلها — لا يمكن أن يطال صفاً قديماً.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const COLS = ['report_url', 'report_title', 'report_published_at', 'wilaya', 'moughataa', 'village', 'mm'];

/** يتحقق من سلامة ملف الخطة قبل أي اتصال. يعيد التقارير مجمّعة بالرابط. */
export function validatePlan(rows) {
  const problems = [];
  const byUrl = new Map();
  rows.forEach((r, i) => {
    if (!/^https:\/\/www\.ami\.mr\/archives\/\d+$/.test(r.report_url || '')) problems.push(`row ${i}: bad report_url`);
    if (!r.report_title || !r.wilaya || !r.village) problems.push(`row ${i}: empty title/wilaya/village`);
    if (Number.isNaN(Date.parse(r.report_published_at))) problems.push(`row ${i}: bad date`);
    if (typeof r.mm !== 'number' || !(r.mm > 0) || r.mm > 400) problems.push(`row ${i}: mm out of range (${r.mm})`);
    if (!byUrl.has(r.report_url)) byUrl.set(r.report_url, []);
    byUrl.get(r.report_url).push(r);
  });
  byUrl.forEach((list, url) => {
    if (new Set(list.map((r) => r.report_title)).size > 1 || new Set(list.map((r) => r.report_published_at)).size > 1) {
      problems.push(`${url}: more than one title/date`);
    }
  });
  if (problems.length) throw new Error(`plan rejected:\n${problems.slice(0, 20).join('\n')}`);
  return byUrl;
}

/**
 * ينفّذ الاستيراد عبر محوِّل (قاعدة حقيقية أو قاعدة اختبار).
 * execute=false: لا يستدعي أي دالة كتابة من المحوِّل.
 */
export async function runImport(adapter, rows, { execute = false, limit = Infinity, log = () => {}, backupTo = null } = {}) {
  const byUrl = validatePlan(rows);
  const urls = [...byUrl.keys()];
  const before = await adapter.counts();
  const existing = await adapter.existingUrls(urls);
  const todo = urls.filter((u) => !existing.has(u)).slice(0, limit);
  const summary = {
    execute, planReports: urls.length, planRows: rows.length, before,
    alreadyPresent: existing.size, toImport: todo.length, toImportRows: todo.reduce((n, u) => n + byUrl.get(u).length, 0),
    imported: 0, insertedRows: 0, failed: 0, after: null, verified: null,
  };
  if (!execute) return summary;

  let backup = null;
  if (backupTo) {
    backup = await adapter.backup(backupTo);
    // نسخة ناقصة = لا كتابة
    if (backup.rows !== before.rows) throw new Error(`backup has ${backup.rows} rows but the table has ${before.rows}; nothing was written`);
  }
  const startedAt = new Date().toISOString();
  log({ type: 'start', startedAt, before, toImport: todo.length, backup });

  let consecutiveFailures = 0;
  for (const url of todo) {
    // ثلاثة إخفاقات متتالية = عطل عام (شبكة/صلاحيات) لا مشكلة تقرير بعينه
    if (consecutiveFailures >= 3) { summary.aborted = 'three consecutive failures'; break; }
    const list = byUrl.get(url).map((r) => Object.fromEntries(COLS.map((c) => [c, r[c] ?? null])));
    try {
      // تحقق ثانٍ لحظة الإدراج (قد يكون تشغيل آخر أو الدالة الدورية سبق إليه)
      if (await adapter.reportExists(url)) { log({ type: 'report', url, status: 'exists' }); continue; }
      const ids = await adapter.insertReport(url, list);
      if (ids.length !== list.length) throw new Error(`inserted ${ids.length} of ${list.length} rows`);
      summary.imported++; summary.insertedRows += list.length;
      consecutiveFailures = 0;
      // معرّفات الصفوف المُدرجة: بها وحدها يعمل التراجع
      log({ type: 'report', url, status: 'imported', rows: list.length, ids });
    } catch (err) {
      summary.failed++; consecutiveFailures++;
      log({ type: 'report', url, status: 'failed', error: err.message });
    }
  }

  summary.after = await adapter.counts();
  // التحقق: الجدول زاد بعدد ما أُدرج بالضبط، وكل تقرير مُدرج عدد صفوفه كما في الخطة
  const perReport = await adapter.rowCounts(todo);
  const wrong = todo.filter((u) => perReport.has(u) && perReport.get(u) !== byUrl.get(u).length);
  summary.verified = summary.after.rows === before.rows + summary.insertedRows && wrong.length === 0;
  log({ type: 'end', finishedAt: new Date().toISOString(), ...summary, wrongCounts: wrong });
  return summary;
}

/** يتراجع عن تشغيل سابق: يحذف بالمعرّف (id) الصفوف التي سجّلها ذلك التشغيل، لا غير. */
export async function runRollback(adapter, logLines, { execute = false } = {}) {
  const start = logLines.find((l) => l.type === 'start');
  if (!start) throw new Error('log has no start record');
  const imported = logLines.filter((l) => l.type === 'report' && l.status === 'imported');
  const ids = imported.flatMap((l) => l.ids || []);
  const expectedRows = imported.reduce((n, l) => n + l.rows, 0);
  if (ids.length !== expectedRows) throw new Error('log is incomplete: row ids missing');
  const before = await adapter.counts();
  const summary = { execute, reports: imported.length, expectedRows, before, deletedRows: 0, after: null, restored: null };
  if (!execute) return summary;
  summary.deletedRows = await adapter.deleteRows(ids);
  summary.after = await adapter.counts();
  summary.restored = summary.deletedRows === expectedRows && summary.after.rows === before.rows - expectedRows;
  return summary;
}

/** محوِّل Supabase (supabase-js بمفتاح service role) */
export function supabaseAdapter(client) {
  const must = ({ data, error, count }) => { if (error) throw new Error(error.message); return { data, count }; };
  const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
  // كل الصفوف المطابقة بترقيم صريح (الحد الافتراضي 1000 صف لكل طلب)
  const selectAll = async (build) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data } = must(await build().order('id').range(from, from + 999));
      out.push(...data);
      if (data.length < 1000) return out;
    }
  };
  return {
    async counts() {
      const { count } = must(await client.from('rain_measurements').select('id', { count: 'exact', head: true }));
      const urls = await selectAll(() => client.from('rain_measurements').select('id, report_url'));
      return { rows: count, reports: new Set(urls.map((r) => r.report_url)).size };
    },
    async existingUrls(urls) {
      const found = new Set();
      for (const part of chunks(urls, 50)) {
        (await selectAll(() => client.from('rain_measurements').select('id, report_url').in('report_url', part))).forEach((r) => found.add(r.report_url));
      }
      return found;
    },
    async reportExists(url) {
      const { data } = must(await client.from('rain_measurements').select('id').eq('report_url', url).limit(1));
      return data.length > 0;
    },
    async insertReport(_url, list) {
      const { data } = must(await client.from('rain_measurements').insert(list).select('id'));
      return data.map((r) => r.id);
    },
    async rowCounts(urls) {
      const counts = new Map();
      for (const part of chunks(urls, 50)) {
        (await selectAll(() => client.from('rain_measurements').select('id, report_url').in('report_url', part))).forEach((r) => counts.set(r.report_url, (counts.get(r.report_url) || 0) + 1));
      }
      return counts;
    },
    async deleteRows(ids) {
      let deleted = 0;
      for (const part of chunks(ids, 100)) {
        const { data } = must(await client.from('rain_measurements').delete().in('id', part).select('id'));
        deleted += data.length;
      }
      return deleted;
    },
    async backup(file) {
      const all = await selectAll(() => client.from('rain_measurements').select('*'));
      const body = JSON.stringify(all);
      fs.writeFileSync(file, body);
      return { file, rows: all.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(`--${name}`);
  const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
  const execute = flag('execute');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment');
  // مفتاح حقيقي كله حروف لاتينية؛ غير ذلك يعني أن النص التوضيحي تُرك مكان المفتاح
  if (!/^[\x21-\x7E]{20,}$/.test(key)) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a real key (placeholder text left in place). Paste the service_role key from Supabase > Settings > API.');
  const host = new URL(url).hostname;
  console.log(`target: ${host} | mode: ${execute ? 'EXECUTE (writes)' : 'dry-run (read only)'}`);
  // الكتابة تتطلب كتابة اسم الخادم المستهدف صراحةً — يمنع التنفيذ على مشروع غير المقصود
  if (execute && value('confirm-host') !== host) throw new Error(`--execute needs --confirm-host ${host}`);

  const { createClient } = await import('@supabase/supabase-js');
  const adapter = supabaseAdapter(createClient(url, key, { auth: { persistSession: false } }));

  if (value('rollback')) {
    const lines = fs.readFileSync(value('rollback'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    console.log(JSON.stringify(await runRollback(adapter, lines, { execute }), null, 2));
    return;
  }

  const plan = value('plan');
  if (!plan) throw new Error('--plan <import_rows.json> is required');
  const backupTo = value('backup');
  const logFile = value('log') || `rain-import-${Date.now()}.jsonl`;
  if (execute && !backupTo) throw new Error('--execute needs --backup <file> (full table copy taken before the first write)');
  if (execute && fs.existsSync(logFile)) throw new Error(`log file ${logFile} already exists; choose a new name`);

  const rows = JSON.parse(fs.readFileSync(plan, 'utf8'));
  const summary = await runImport(adapter, rows, {
    execute, backupTo,
    limit: value('limit') ? Number(value('limit')) : Infinity,
    log: (entry) => fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`),
  });
  console.log(JSON.stringify(summary, null, 2));
  if (execute) console.log(`log: ${logFile} | backup: ${backupTo}`);
  if (execute && !summary.verified) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
