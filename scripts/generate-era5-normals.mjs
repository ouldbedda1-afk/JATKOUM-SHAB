/* global console, URL, fetch, setTimeout */
// يولّد src/rainEra5Normals.js: المعدل المناخي 1991–2020 لهطول الأمطار في عواصم الولايات
// من بيانات إعادة التحليل ERA5 للمركز الأوروبي (ECMWF)، عبر Open-Meteo Historical API.
//
// لكل مدينة: المعدل السنوي، المعدل التراكمي حتى كل يوم من السنة (للمقارنة بالفترة نفسها)،
// ومجموع كل سنة مكتملة. المتصفح لا يجلب بعد ذلك إلا السنة الجارية.
//
// التشغيل (مرة في السنة تكفي، لإضافة السنة المكتملة):
//   node scripts/generate-era5-normals.mjs
import fs from 'node:fs';

const REF_FROM = 1991;
const REF_TO = 2020;
const LAST_FULL_YEAR = new Date().getUTCFullYear() - 1;

// عواصم الولايات. نواكشوط نقطة واحدة لولاياتها الثلاث (خلية ERA5 واحدة، نحو 25 كم).
const CITIES = [
  ['النعمة', 'الحوض الشرقي', 16.62, -7.26],
  ['لعيون', 'الحوض الغربي', 16.66, -9.61],
  ['كيفه', 'لعصابه', 16.62, -11.40],
  ['كيهيدي', 'كوركول', 16.15, -13.50],
  ['ألاك', 'لبراكنه', 17.05, -13.91],
  ['روصو', 'الترارزة', 16.51, -15.81],
  ['أطار', 'آدرار', 20.52, -13.05],
  ['نواذيبو', 'داخلت نواذيبو', 20.93, -17.03],
  ['تجكجة', 'تكانت', 18.55, -11.43],
  ['سيلبابي', 'كيدي ماغا', 15.16, -12.18],
  ['ازويرات', 'تيرس زمور', 22.73, -12.47],
  ['أكجوجت', 'إينشيري', 19.75, -14.38],
  ['نواكشوط', 'نواكشوط (الولايات الثلاث)', 18.08, -15.98],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => Math.round(n * 10) / 10;

// كل أيام السنة «MM-DD» بما فيها 29 فبراير
const DAYS = [];
for (let d = new Date(Date.UTC(2024, 0, 1)); d.getUTCFullYear() === 2024; d.setUTCDate(d.getUTCDate() + 1)) DAYS.push(d.toISOString().slice(5, 10));

const cities = [];
for (const [name, wilaya, lat, lon] of CITIES) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${REF_FROM}-01-01&end_date=${LAST_FULL_YEAR}-12-31&daily=precipitation_sum&models=era5&timezone=GMT`;
  let json = null;
  for (let attempt = 0; attempt < 6 && !json; attempt++) {
    const res = await fetch(url);
    if (res.ok) json = await res.json();
    else { console.log(`${name}: HTTP ${res.status}, retrying`); await sleep(15000 * (attempt + 1)); }
  }
  if (!json) throw new Error(`could not fetch ${name}`);

  const perYear = {};
  json.daily.time.forEach((date, i) => {
    const year = date.slice(0, 4);
    (perYear[year] ??= {})[date.slice(5)] = json.daily.precipitation_sum[i] ?? 0;
  });

  // المعدل التراكمي حتى كل يوم = متوسط (مجموع السنة حتى ذلك اليوم) عبر سنوات المرجع
  const cumulative = new Array(DAYS.length).fill(0);
  for (let year = REF_FROM; year <= REF_TO; year++) {
    let running = 0;
    DAYS.forEach((day, i) => { running += perYear[year][day] ?? 0; cumulative[i] += running; });
  }
  const refYears = REF_TO - REF_FROM + 1;
  const years = Object.fromEntries(Object.entries(perYear).map(([y, days]) => [y, round1(Object.values(days).reduce((a, b) => a + b, 0))]));

  cities.push({ name, wilaya, lat, lon, normal: round1(cumulative[cumulative.length - 1] / refYears), cumulative: cumulative.map((v) => round1(v / refYears)), years });
  console.log(`${name}: normal ${cities[cities.length - 1].normal} mm | ${LAST_FULL_YEAR}: ${years[LAST_FULL_YEAR]} mm`);
  await sleep(4000);
}

const body = `// ملف مولَّد — لا يُعدَّل يدوياً. المصدر: scripts/generate-era5-normals.mjs
// هطول الأمطار في عواصم الولايات حسب إعادة التحليل ERA5 (المركز الأوروبي ECMWF) عبر Open-Meteo.
// normal: المعدل السنوي ${REF_FROM}–${REF_TO} (مم). cumulative[i]: المعدل التراكمي حتى اليوم i من السنة
// (الفهرس 0 = 1 يناير، والسنة بـ366 يوماً). years: مجموع كل سنة مكتملة.
// تنبيه: ERA5 نموذج لا قياس، وقيمه بالمليمتر أقل من قراءات المقاييس الأرضية (نحو النصف في
// الوسيط)؛ تصلح لمقارنة السنة بمعدلها في المصدر نفسه، لا مرجعاً لقراءات المقاييس.
export const ERA5_REFERENCE = { from: ${REF_FROM}, to: ${REF_TO}, lastFullYear: ${LAST_FULL_YEAR} };
export const ERA5_CITIES = ${JSON.stringify(cities)};
`;
fs.writeFileSync(new URL('../src/rainEra5Normals.js', import.meta.url), body);
console.log(`written: ${cities.length} cities, ${(body.length / 1024).toFixed(0)} KB`);
