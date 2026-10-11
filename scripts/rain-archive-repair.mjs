/* global process, console, URL */
// إصلاح تقارير مقاييس الأمطار المخزَّنة التي تختلف عن مصدرها، من ملف خطة جاهز
// (repair_plan.json الناتج عن التدقيق): لكل تقرير معرّفات صفوفه الحالية وصفوفه
// المصحَّحة كما في مقال الوكالة. لا إشعارات ولا نشر.
//
// الوضع الافتراضي تجريبي (لا كتابة). الكتابة تحتاج --execute و--confirm-host معاً.
//
//   تجربة:   node scripts/rain-archive-repair.mjs --plan repair_plan.json
//   تنفيذ:   node scripts/rain-archive-repair.mjs --plan repair_plan.json --execute \
//                 --confirm-host <host> --backup backup.json --log repair-log.jsonl
//   تراجع:   node scripts/rain-archive-repair.mjs --rollback repair-log.jsonl --execute --confirm-host <host>
//
// ضمانات:
//   • تقرير تغيّرت صفوفه منذ إعداد الخطة (معرّفاتها لا تطابق) يُتخطّى ولا يُمسّ.
//   • الترتيب: إدراج الصفوف المصحَّحة أولاً ثم حذف القديمة بمعرّفاتها — عطل بين
//     الخطوتين يترك التقرير مكرراً (يُكمَل أو يُتراجع عنه) لا ناقصاً.
//   • السجل يحفظ الصفوف القديمة كاملة (بمعرّفاتها وأوقاتها) ومعرّفات الجديدة؛
//     التراجع يحذف الجديدة ويعيد القديمة كما كانت.
//   • نسخة احتياطية كاملة من الجدول قبل أول كتابة.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export async function runRepair(adapter, plan, { execute = false, limit = Infinity, log = () => {}, backupTo = null } = {}) {
  const before = await adapter.counts();
  const summary = { execute, planReports: plan.length, before, repaired: 0, skippedChanged: 0, alreadyRepaired: 0, failed: 0, deletedRows: 0, insertedRows: 0, after: null, verified: null };

  // حالة كل تقرير الآن مقابل الخطة
  const todo = [];
  for (const item of plan) {
    const current = await adapter.reportRows(item.report_url);
    const ids = current.map((r) => r.id).sort();
    if (sameSet(ids, item.oldIds)) todo.push({ item, current });
    else if (current.length === item.newRows.length && !ids.some((id) => item.oldIds.includes(id))) summary.alreadyRepaired++;
    else summary.skippedChanged++;
  }
  summary.toRepair = Math.min(todo.length, limit);
  summary.expectedDelta = todo.slice(0, limit).reduce((n, t) => n + t.item.newRows.length - t.item.oldIds.length, 0);
  if (!execute) return summary;

  let backup = null;
  if (backupTo) {
    backup = await adapter.backup(backupTo);
    if (backup.rows !== before.rows) throw new Error(`backup has ${backup.rows} rows but the table has ${before.rows}; nothing was written`);
  }
  log({ type: 'start', startedAt: new Date().toISOString(), before, backup });

  let consecutiveFailures = 0;
  for (const { item, current } of todo.slice(0, limit)) {
    if (consecutiveFailures >= 3) { summary.aborted = 'three consecutive failures'; break; }
    const rows = item.newRows.map((n) => ({
      report_url: item.report_url, report_title: item.report_title, report_published_at: item.report_published_at,
      wilaya: n.wilaya, moughataa: n.moughataa ?? null, village: n.village, mm: n.mm,
    }));
    let newIds = [];
    try {
      newIds = await adapter.insertRows(rows);
      if (newIds.length !== rows.length) throw new Error(`inserted ${newIds.length} of ${rows.length} rows`);
      // السجل قبل الحذف: لو تعطّل الحذف بقي ما يكفي للتراجع
      log({ type: 'report', url: item.report_url, status: 'inserted', newIds, oldRows: current });
      const deleted = await adapter.deleteRows(item.oldIds);
      if (deleted !== item.oldIds.length) throw new Error(`deleted ${deleted} of ${item.oldIds.length} old rows`);
      log({ type: 'report', url: item.report_url, status: 'repaired', inserted: rows.length, deleted });
      summary.repaired++; summary.insertedRows += rows.length; summary.deletedRows += deleted;
      consecutiveFailures = 0;
    } catch (err) {
      summary.failed++; consecutiveFailures++;
      log({ type: 'report', url: item.report_url, status: 'failed', error: err.message, newIds });
    }
  }

  summary.after = await adapter.counts();
  summary.verified = summary.failed === 0
    && summary.after.rows === before.rows + summary.insertedRows - summary.deletedRows
    && summary.after.reports === before.reports;
  log({ type: 'end', finishedAt: new Date().toISOString(), ...summary });
  return summary;
}

/** يتراجع عن تشغيل سابق: يحذف الصفوف التي أدرجها ويعيد الصفوف القديمة كما كانت (بمعرّفاتها). */
export async function runRollback(adapter, logLines, { execute = false } = {}) {
  const inserted = logLines.filter((l) => l.type === 'report' && l.status === 'inserted');
  const before = await adapter.counts();
  const summary = { execute, reports: inserted.length, before, removedNew: 0, restoredOld: 0, after: null, restored: null };
  if (!execute) return summary;
  for (const entry of inserted) {
    summary.removedNew += await adapter.deleteRows(entry.newIds);
    // الصفوف القديمة تُعاد فقط إن كانت محذوفة (تشغيل تعطّل قبل الحذف يُبقيها)
    const present = new Set((await adapter.reportRows(entry.url)).map((r) => r.id));
    const missing = entry.oldRows.filter((r) => !present.has(r.id));
    if (missing.length) summary.restoredOld += (await adapter.insertRows(missing)).length;
  }
  summary.after = await adapter.counts();
  const start = logLines.find((l) => l.type === 'start');
  summary.restored = start ? summary.after.rows === start.before.rows && summary.after.reports === start.before.reports : null;
  return summary;
}

export function supabaseAdapter(client) {
  const must = ({ data, error, count }) => { if (error) throw new Error(error.message); return { data, count }; };
  const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
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
    reportRows: (url) => selectAll(() => client.from('rain_measurements').select('*').eq('report_url', url)),
    async insertRows(rows) {
      const ids = [];
      for (const part of chunks(rows, 500)) {
        const { data } = must(await client.from('rain_measurements').insert(part).select('id'));
        ids.push(...data.map((r) => r.id));
      }
      return ids;
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
  if (!/^[\x21-\x7E]{20,}$/.test(key)) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a real key');
  const host = new URL(url).hostname;
  console.log(`target: ${host} | mode: ${execute ? 'EXECUTE (writes)' : 'dry-run (read only)'}`);
  if (execute && value('confirm-host') !== host) throw new Error(`--execute needs --confirm-host ${host}`);

  const { createClient } = await import('@supabase/supabase-js');
  const adapter = supabaseAdapter(createClient(url, key, { auth: { persistSession: false } }));

  if (value('rollback')) {
    const lines = fs.readFileSync(value('rollback'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    console.log(JSON.stringify(await runRollback(adapter, lines, { execute }), null, 2));
    return;
  }

  if (!value('plan')) throw new Error('--plan <repair_plan.json> is required');
  const backupTo = value('backup');
  const logFile = value('log') || `rain-repair-${Date.now()}.jsonl`;
  if (execute && !backupTo) throw new Error('--execute needs --backup <file>');
  if (execute && fs.existsSync(logFile)) throw new Error(`log file ${logFile} already exists; choose a new name`);

  const plan = JSON.parse(fs.readFileSync(value('plan'), 'utf8'));
  const summary = await runRepair(adapter, plan, {
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
