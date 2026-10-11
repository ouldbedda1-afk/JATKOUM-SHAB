/* global console, URL */
// يولّد src/rainVillageMoughataas.js: جدول (ولاية + قرية ← مقاطعة) مستخرج من تقارير AMI
// نفسها — كل قرية كُتبت لها مقاطعتها صراحةً في ثلاثة تقارير على الأقل، وباتفاق 90%.
// يُستعمل في الموقع لنسبة القراءات التي أغفل تقريرها المقاطعة، في كل السنوات.
//
// قراءة فقط من rain_measurements بالمفتاح العام. التشغيل:
//   node --env-file=.env scripts/generate-rain-village-moughataas.mjs
/* global process */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { canonicalWilaya, knownMoughataa, rainNameKey } from '../supabase/functions/_shared/rainNames.js';

const MIN_WITNESSES = 3;
const MIN_AGREEMENT = 0.9;

const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { count, error } = await client.from('rain_measurements').select('id', { count: 'exact', head: true });
if (error) throw new Error(error.message);

const rows = [];
const offsets = Array.from({ length: Math.ceil(count / 1000) }, (_, i) => i * 1000);
for (let i = 0; i < offsets.length; i += 6) {
  const pages = await Promise.all(offsets.slice(i, i + 6).map((from) => client
    .from('rain_measurements').select('report_url, wilaya, moughataa, village').order('id').range(from, from + 999)));
  pages.forEach((p) => { if (p.error) throw new Error(p.error.message); rows.push(...p.data); });
}

// شاهد واحد لكل (تقرير، قرية): تقرير يكرر القرية لا يُحسب مرتين
const witnesses = new Map();
const seen = new Set();
rows.forEach((r) => {
  const known = r.moughataa ? knownMoughataa(r.moughataa) : null;
  if (!known) return;
  // الولاية من المقاطعة نفسها (حقيقة إدارية)، لا من خانة الولاية التي قد تكون خاطئة
  const key = `${known.wilaya}|${rainNameKey(r.village)}`;
  if (seen.has(`${r.report_url}|${key}`)) return;
  seen.add(`${r.report_url}|${key}`);
  if (!witnesses.has(key)) witnesses.set(key, new Map());
  witnesses.get(key).set(known.name, (witnesses.get(key).get(known.name) || 0) + 1);
});

const byWilaya = {};
let ambiguous = 0, few = 0;
witnesses.forEach((counts, key) => {
  const [wilaya, village] = key.split('|');
  if (!village || !canonicalWilaya(wilaya)) return;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const [name, top] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (total < MIN_WITNESSES) { few++; return; }
  if (top / total < MIN_AGREEMENT) { ambiguous++; return; }
  // مركز المقاطعة نفسه يعرفه الكود أصلاً
  if (rainNameKey(name) === village) return;
  ((byWilaya[wilaya] ??= {})[name] ??= []).push(village);
});

const entries = Object.values(byWilaya).reduce((n, m) => n + Object.values(m).reduce((k, l) => k + l.length, 0), 0);
Object.values(byWilaya).forEach((m) => Object.values(m).forEach((l) => l.sort()));
const body = `// ملف مولَّد — لا يُعدَّل يدوياً. المصدر: scripts/generate-rain-village-moughataas.mjs
// قرى كُتبت مقاطعتها صراحةً في ${MIN_WITNESSES} تقارير AMI على الأقل وباتفاق ${MIN_AGREEMENT * 100}%.
// البنية: ولاية ← مقاطعة ← [مفاتيح القرى (rainNameKey)]. عدد القرى: ${entries}.
export const RAIN_VILLAGE_MOUGHATAAS = ${JSON.stringify(byWilaya, null, 1)};
`;
fs.writeFileSync(new URL('../src/rainVillageMoughataas.js', import.meta.url), body);
console.log(`villages written: ${entries} | skipped: ${few} with fewer than ${MIN_WITNESSES} reports, ${ambiguous} named in more than one moughataa | readings scanned: ${rows.length}`);
