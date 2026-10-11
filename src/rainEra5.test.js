import { describe, it, expect } from 'vitest';
import { dayIndex, era5Anomalies } from './rainEra5';

// مدينة وهمية: معدلها 200 مم، منها 50 مم حتى 31 يوليو و150 حتى 31 أغسطس
const city = (name, years) => {
  const cumulative = new Array(366).fill(0).map((_, i) => (i <= dayIndex('07-31') ? (50 * (i + 1)) / (dayIndex('07-31') + 1)
    : i <= dayIndex('08-31') ? 50 + (100 * (i - dayIndex('07-31'))) / 31 : 200));
  cumulative[cumulative.length - 1] = 200;
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

describe('era5Anomalies', () => {
  it('سنة مكتملة: المجموع مقابل المعدل السنوي — عجز لا فائض سالب', () => {
    const res = era5Anomalies([city('أ', { 2024: 150 }), city('ب', { 2024: 260 }), city('ج', { 2024: 200 })], 2024);
    expect(res.partial).toBe(false);
    expect(res.rows.map((r) => [r.name, r.status, r.pct])).toEqual([['أ', 'deficit', 25], ['ب', 'surplus', 30], ['ج', 'normal', 0]]);
    expect(res).toMatchObject({ below: 1, above: 1, computable: 3 });
  });

  it('السنة الجارية تُقارن بالمعدل حتى اليوم نفسه لا بمعدل السنة كاملة', () => {
    // 50 مم حتى 31 يوليو = عند المعدل، وإن كانت ربع المعدل السنوي فقط
    const res = era5Anomalies([city('أ', {})], 2026, { through: '2026-07-31', totals: { 'أ': 50 } });
    expect(res).toMatchObject({ partial: true, through: '2026-07-31' });
    expect(res.rows[0]).toMatchObject({ recorded: 50, reference: 50, status: 'normal' });
  });

  it('معدل صفري (مدينة جافة في بداية السنة) لا تُحسب له نسبة', () => {
    const dry = { ...city('د', {}), cumulative: new Array(366).fill(0) };
    const res = era5Anomalies([dry], 2026, { through: '2026-02-10', totals: { 'د': 3 } });
    expect(res.rows[0].status).toBe('not-computable');
    expect(res.computable).toBe(0);
  });
});
