// تنبيه الجراد الصحراوي من مسوحات الفاو (locust_observations)، لصفحة المراعي وشريط الأخبار وصفحات الولايات.
// severity في كل موقع مسح: 0 لا جراد، 1 أفراد متفرقة، 2 تجمعات أو تكاثر، 3 أسراب أو حشود يرقات.
// يُنبَّه حين تُرصد تجمعات فأشد، أو حين ينتشر الجراد: مواقع وُجد فيها في آخر أسبوعين أكثر من الأسبوعين
// قبلهما (3 مواقع على الأقل).

const HALF_MS = 15 * 86400000;
const SPREAD_MIN = 3;

export const LOCUST_LEVEL_TEXT = ['', 'أفراد متفرقة', 'تجمعات جراد أو تكاثر', 'أسراب أو حشود يرقات'];

// «موقع مسح» بعدده: 3 مواقع، 11 موقعاً
export const sitesText = (n) => `${n} ${n >= 3 && n <= 10 ? 'مواقع' : n > 10 ? 'موقعاً' : 'موقع'} مسح`;

export function locustAlert(obs, wilaya = null) {
  const list = (obs || []).filter((o) => !wilaya || o.wilaya === wilaya);
  const positive = list.filter((o) => o.severity > 0);
  if (!positive.length) return null;
  const now = Date.now();
  const age = (o) => now - new Date(`${o.obs_date}T00:00:00Z`).getTime();
  const recent = positive.filter((o) => age(o) <= HALF_MS).length;
  const previous = positive.filter((o) => age(o) > HALF_MS && age(o) <= 2 * HALF_MS).length;
  const level = Math.max(...positive.map((o) => o.severity));
  const spreading = recent >= SPREAD_MIN && recent > previous;
  if (level < 2 && !spreading) return null;
  // الولايات من الأشد إلى الأخف
  const byWilaya = new Map();
  for (const o of positive) {
    const w = o.wilaya || o.region;
    if (w) byWilaya.set(w, Math.max(byWilaya.get(w) ?? 0, o.severity));
  }
  const ranked = [...byWilaya.entries()].sort((a, b) => b[1] - a[1]);
  return {
    level, spreading, recent, previous,
    wilayas: ranked.map(([w]) => w),
    // ولايات أشد مستوى رُصد (حتى لا تُنسب التجمعات إلى ولاية لم يُرصد فيها إلا أفراد)
    worst: ranked.filter(([, v]) => v === level).map(([w]) => w),
    others: ranked.filter(([, v]) => v < level).map(([w]) => w),
    last: positive.reduce((a, o) => (o.obs_date > a ? o.obs_date : a), positive[0].obs_date),
  };
}
