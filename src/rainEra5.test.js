import { describe, it, expect } from 'vitest';
import { MIN_REFERENCE_MM, dayIndex, era5Anomalies, summariseCurrentYear } from './rainEra5';
import { ERA5_CITIES, ERA5_REFERENCE, ERA5_SOURCE } from './rainEra5Normals';

// مدينة وهمية: معدلها 200 مم، منها 50 مم حتى 31 يوليو و150 حتى 31 أغسطس
const city = (name, years = {}) => {
  const cumulative = new Array(366).fill(0).map((_, i) => (i <= dayIndex('07-31') ? (50 * (i + 1)) / (dayIndex('07-31') + 1)
    : i <= dayIndex('08-31') ? 50 + (100 * (i - dayIndex('07-31'))) / 31 : 200));
  return { name, wilaya: `ولاية ${name}`, lat: 16, lon: -12, normal: 200, cumulative, years };
};

describe('dayIndex', () => {
  it('يرقّم أيام سنة من 366 يوماً', () => {
    expect(dayIndex('01-01')).toBe(0);
    expect(dayIndex('02-29')).toBe(59);
    expect(dayIndex('03-01')).toBe(60);
    expect(dayIndex('12-31')).toBe(365);
  });
});

describe('era5Anomalies — أمثلة معروفة النتيجة', () => {
  it('سنة مكتملة: المجموع مقابل المعدل السنوي', () => {
    // 150 من 200 = أقل بـ25%؛ 260 من 200 = أعلى بـ30%؛ 200 من 200 = عند المعدل
    const res = era5Anomalies([city('أ', { 2024: 150 }), city('ب', { 2024: 260 }), city('ج', { 2024: 200 })], 2024);
    expect(res.partial).toBe(false);
    expect(res.rows.map((r) => [r.name, r.recorded, r.reference, r.status, r.pct])).toEqual([
      ['أ', 150, 200, 'below', 25], ['ب', 260, 200, 'above', 30], ['ج', 200, 200, 'normal', 0],
    ]);
    expect(res).toMatchObject({ below: 1, above: 1, computable: 3 });
  });

  it('السنة الجارية تُقارن بالمعدل حتى اليوم نفسه لا بمعدل السنة كاملة', () => {
    // 50 مم حتى 31 يوليو = عند المعدل، وإن كانت ربع المعدل السنوي فقط
    const jul = era5Anomalies([city('أ')], 2026, { through: '2026-07-31', totals: { 'أ': 50 } });
    expect(jul).toMatchObject({ partial: true, through: '2026-07-31' });
    expect(jul.rows[0]).toMatchObject({ recorded: 50, reference: 50, status: 'normal' });
    // المجموع نفسه حتى 31 أغسطس، حيث المعدل 150: أقل بثلثين
    const aug = era5Anomalies([city('أ')], 2026, { through: '2026-08-31', totals: { 'أ': 50 } });
    expect(aug.rows[0]).toMatchObject({ reference: 150, status: 'below', pct: 67 });
  });

  it('معدل مرجعي منعدم أو شبه منعدم: لا نتيجة', () => {
    const dry = { ...city('د'), cumulative: new Array(366).fill(0) };
    const tiny = { ...city('هـ'), cumulative: new Array(366).fill(MIN_REFERENCE_MM - 0.1) };
    const res = era5Anomalies([dry, tiny], 2026, { through: '2026-02-10', totals: { 'د': 3, 'هـ': 3 } });
    expect(res.rows.map((r) => [r.status, r.pct, r.recorded])).toEqual([['not-computable', null, null], ['not-computable', null, null]]);
    expect(res.computable).toBe(0);
  });

  it('بيانات ناقصة لعاصمة: لا نتيجة لها وحدها', () => {
    const res = era5Anomalies([city('أ'), city('ب')], 2026, { through: '2026-08-31', totals: { 'أ': 120, 'ب': null } });
    expect(res.rows.map((r) => r.status)).toEqual(['below', 'not-computable']);
    expect(res.computable).toBe(1);
  });

  it('سنة غير موجودة في الجدول: لا نتيجة', () => {
    expect(era5Anomalies([city('أ', { 2024: 150 })], 1980).rows[0].status).toBe('not-computable');
  });
});

describe('summariseCurrentYear', () => {
  const serie = (values) => ({ daily: { time: values.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`), precipitation_sum: values } });

  it('يقف عند آخر يوم متاح لكل العواصم معاً', () => {
    const res = summariseCurrentYear([city('أ'), city('ب')], [serie([1, 2, 3, null, null]), serie([0, 5, 0, 4, null])]);
    expect(res).toEqual({ through: '2026-01-03', totals: { 'أ': 6, 'ب': 5 } });
  });

  it('يوم ناقص وسط الفترة يُسقط نتيجة تلك العاصمة', () => {
    const res = summariseCurrentYear([city('أ'), city('ب')], [serie([1, null, 3, 4]), serie([1, 1, 1, 1])]);
    expect(res.totals).toEqual({ 'أ': null, 'ب': 4 });
  });
});

describe('الملف المولَّد (ERA5 الفعلي)', () => {
  it('خمس عشرة عاصمة، بمصدر ونموذج ثابتين', () => {
    expect(ERA5_CITIES).toHaveLength(15);
    expect(new Set(ERA5_CITIES.map((c) => c.wilaya)).size).toBe(15);
    expect(ERA5_SOURCE).toMatchObject({ model: 'era5', variable: 'precipitation_sum', timezone: 'GMT' });
    expect(ERA5_REFERENCE).toMatchObject({ from: 1991, to: 2020 });
  });

  it('المعدل السنوي = متوسط مجاميع 1991–2020، والمعدل التراكمي ينتهي عنده ولا ينقص', () => {
    ERA5_CITIES.forEach((c) => {
      const years = Array.from({ length: 30 }, (_, i) => c.years[1991 + i]);
      expect(years.every(Number.isFinite)).toBe(true);
      const mean = years.reduce((a, b) => a + b, 0) / 30;
      expect(Math.abs(mean - c.normal)).toBeLessThan(0.2);
      expect(c.cumulative).toHaveLength(366);
      expect(c.cumulative[365]).toBe(c.normal);
      expect(c.cumulative.every((v, i) => i === 0 || v >= c.cumulative[i - 1])).toBe(true);
    });
  });

  it('سنة مكتملة حقيقية: النسبة تطابق الحساب اليدوي', () => {
    const res = era5Anomalies(ERA5_CITIES, 2022);
    res.rows.forEach((r, i) => {
      const c = ERA5_CITIES[i];
      const expected = Math.round((Math.abs(c.normal - c.years[2022]) / c.normal) * 100);
      expect(r.pct).toBe(expected);
      if (expected > 0) expect(r.status).toBe(c.years[2022] < c.normal ? 'below' : 'above');
    });
  });
});
