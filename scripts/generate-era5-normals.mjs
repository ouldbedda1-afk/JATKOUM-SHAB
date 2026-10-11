/* global console, URL, fetch, setTimeout */
// يولّد src/rainEra5Normals.js: المعدل المناخي 1991–2020 لهطول الأمطار في عواصم الولايات
// الخمس عشرة من إعادة التحليل ERA5 للمركز الأوروبي (ECMWF)، عبر Open-Meteo Historical API.
//
// المصدر والإحداثيات وطريقة الحساب ثابتة هنا وتُكتب في الملف المولَّد، فكل المدن وكل
// السنوات تُحسب بالطريقة نفسها:
//   • المصدر: archive-api.open-meteo.com، النموذج era5 وحده (0.25°، نحو 25 كم)، المتغير
//     precipitation_sum اليومي، التوقيت GMT.
//   • المعدل السنوي = متوسط مجاميع السنوات 1991–2020.
//   • المعدل التراكمي حتى يوم = متوسط (مجموع السنة من 1 يناير حتى ذلك اليوم) عبر 1991–2020،
//     للمقارنة بالفترة نفسها من السنة الجارية.
//   • مجموع كل سنة مكتملة يُحفظ كما هو.
// المتصفح لا يجلب بعد ذلك إلا السنة الجارية، بالإحداثيات نفسها والنموذج نفسه.
//
// التشغيل (مرة في بداية كل سنة تكفي، لإضافة السنة المكتملة):
//   node scripts/generate-era5-normals.mjs
import fs from 'node:fs';

export const ERA5_SOURCE = {
  api: 'https://archive-api.open-meteo.com/v1/archive',
  model: 'era5',
  variable: 'precipitation_sum',
  timezone: 'GMT',
};
const REF_FROM = 1991;
const REF_TO = 2020;
const LAST_FULL_YEAR = new Date().getUTCFullYear() - 1;

// عواصم الولايات الخمس عشرة: [العاصمة، الولاية، خط العرض، خط الطول]
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
  ['دار النعيم', 'نواكشوط الشمالية', 18.13, -15.92],
  ['تفرغ زينة', 'نواكشوط الغربية', 18.10, -15.98],
  ['عرفات', 'نواكشوط الجنوبية', 18.05, -15.95],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => Math.round(n * 10) / 10;

// كل أيام السنة «MM-DD» بما فيها 29 فبراير
const DAYS = [];
for (let d = new Date(Date.UTC(2024, 0, 1)); d.getUTCFullYear() === 2024; d.setUTCDate(d.getUTCDate() + 1)) DAYS.push(d.toISOString().slice(5, 10));

const cities = [];
for (const [name, wilaya, lat, lon] of CITIES) {
  const url = `${ERA5_SOURCE.api}?latitude=${lat}&longitude=${lon}&start_date=${REF_FROM}-01-01&end_date=${LAST_FULL_YEAR}-12-31&daily=${ERA5_SOURCE.variable}&models=${ERA5_SOURCE.model}&timezone=${ERA5_SOURCE.timezone}`;
  let json = null;
  for (let attempt = 0; attempt < 8 && !json; attempt++) {
    const res = await fetch(url);
    if (res.ok) json = await res.json();
    else { console.log(`${name}: HTTP ${res.status}, retrying`); await sleep(20000 * (attempt + 1)); }
  }
  if (!json) throw new Error(`could not fetch ${name}`);

  const perYear = {};
  let missing = 0;
  json.daily.time.forEach((date, i) => {
    const value = json.daily.precipitation_sum[i];
    if (value === null) missing++;
    (perYear[date.slice(0, 4)] ??= {})[date.slice(5)] = value ?? 0;
  });
  // سنة ناقصة الأيام تُفسد المعدل: لا يُكتب الملف
  if (missing > 0) throw new Error(`${name}: ${missing} days without data`);

  const cumulative = new Array(DAYS.length).fill(0);
  for (let year = REF_FROM; year <= REF_TO; year++) {
    let running = 0;
    DAYS.forEach((day, i) => { running += perYear[year][day] ?? 0; cumulative[i] += running; });
  }
  const refYears = REF_TO - REF_FROM + 1;
  const years = Object.fromEntries(Object.entries(perYear).map(([y, days]) => [y, round1(Object.values(days).reduce((a, b) => a + b, 0))]));

  cities.push({
    name, wilaya, lat, lon,
    // مركز خلية ERA5 التي أعادها المصدر لهذه الإحداثيات
    grid: [json.latitude, json.longitude],
    normal: round1(cumulative[cumulative.length - 1] / refYears),
    cumulative: cumulative.map((v) => round1(v / refYears)),
    years,
  });
  console.log(`${name}: grid ${json.latitude},${json.longitude} | normal ${cities[cities.length - 1].normal} mm | ${LAST_FULL_YEAR}: ${years[LAST_FULL_YEAR]} mm`);
  await sleep(6000);
}

const body = `// ملف مولَّد — لا يُعدَّل يدوياً. المصدر: scripts/generate-era5-normals.mjs
// هطول الأمطار في عواصم الولايات الخمس عشرة حسب إعادة التحليل ERA5 (المركز الأوروبي ECMWF).
// normal: المعدل السنوي ${REF_FROM}–${REF_TO} (مم). cumulative[i]: المعدل التراكمي من 1 يناير حتى اليوم i
// (الفهرس 0 = 1 يناير، والسنة بـ366 يوماً). years: مجموع كل سنة مكتملة. grid: مركز خلية ERA5.
// تنبيه: ERA5 نموذج لا قياس، وقيمه بالمليمتر أقل من قراءات المقاييس الأرضية (نحو النصف في
// الوسيط)؛ تصلح لمقارنة السنة بمعدلها في المصدر نفسه، لا مرجعاً لقراءات المقاييس.
export const ERA5_SOURCE = ${JSON.stringify(ERA5_SOURCE)};
export const ERA5_REFERENCE = { from: ${REF_FROM}, to: ${REF_TO}, lastFullYear: ${LAST_FULL_YEAR}, generatedAt: '${new Date().toISOString().slice(0, 10)}' };
export const ERA5_CITIES = ${JSON.stringify(cities)};
`;
fs.writeFileSync(new URL('../src/rainEra5Normals.js', import.meta.url), body);
console.log(`written: ${cities.length} cities, ${(body.length / 1024).toFixed(0)} KB`);
