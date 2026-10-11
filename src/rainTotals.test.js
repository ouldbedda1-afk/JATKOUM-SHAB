import { describe, it, expect } from 'vitest';
import { buildRainTotals, buildYearlyDeficit, cleanRainReadings, rainDeficit, rainNameKey } from './rainTotals';
import { canonicalWilaya, knownMoughataa, wilayasMentionedIn } from '../supabase/functions/_shared/rainNames.js';

const row = (wilaya, moughataa, village, mm, day = '01', url = `r-${day}`) => ({
  wilaya, moughataa, village, mm, report_url: url, report_published_at: `2026-08-${day}T10:00:00+00:00`,
});

describe('توحيد الأسماء', () => {
  it('يوحّد الصيغ الإملائية في مفتاح واحد', () => {
    expect(rainNameKey('النعمة')).toBe(rainNameKey('النعمه'));
    expect(rainNameKey('أركيز')).toBe(rainNameKey('اركيز'));
    expect(rainNameKey('ومبو ”')).toBe(rainNameKey('ومبو'));
  });

  it('يعرف إملاءات الولايات الواردة في تقارير AMI', () => {
    expect(canonicalWilaya('كوركل')).toBe('كوركول');
    expect(canonicalWilaya('غورغول/')).toBe('كوركول');
    expect(canonicalWilaya('داخلت انواذيبو')).toBe('داخلت نواذيبو');
    expect(canonicalWilaya('الحوض االشرقي')).toBe('الحوض الشرقي');
    expect(canonicalWilaya('الحوض الشرقيي')).toBe('الحوض الشرقي');
    expect(canonicalWilaya('ولاية كيديماغه')).toBe('كيدي ماغا');
    expect(canonicalWilaya('الولايةالحوض الغربي:')).toBe('الحوض الغربي');
    expect(canonicalWilaya('انواكشوط الشمالية')).toBe('نواكشوط الشمالية');
  });

  it('لا يخمّن: اسم غير معروف ليس ولاية', () => {
    expect(canonicalWilaya('الحوض')).toBeNull();
    expect(canonicalWilaya('كيفه')).toBeNull();
    expect(knownMoughataa('قرية ما')).toBeNull();
  });

  it('يربط المقاطعة بولايتها', () => {
    expect(knownMoughataa('مقاطعة النعمه')).toEqual({ wilaya: 'الحوض الشرقي', name: 'النعمة' });
    expect(knownMoughataa('غابو').wilaya).toBe('كيدي ماغا');
  });

  it('لا يعدّ «انواكشوط» في المقدمة ولاية للقراءات (مكان صدور الخبر)', () => {
    expect(wilayasMentionedIn('أفادت شبكة الاتصال اليوم في انواكشوط أن مقاييس المطر')).toEqual([]);
    expect(wilayasMentionedIn('تساقط أمطار في مناطق من الحوض الشرقي')).toEqual(['الحوض الشرقي']);
    expect(wilayasMentionedIn('أمطار على ولايتي كوركول ولعصابه').sort()).toEqual(['كوركول', 'لعصابه'].sort());
  });
});

describe('المجاميع', () => {
  it('يجمع القراءات عبر التقارير لكل مقاطعة ثم لكل ولاية', () => {
    const totals = buildRainTotals(cleanRainReadings([
      row('كوركول', 'أمبود', 'الخلوه', 95, '01'),
      row('كوركول', 'امبود', 'الخلوة', 20, '02'),
      row('كوركول', 'أمبود', 'العداله', 80, '01'),
      row('كوركول', 'كيهيدي', 'كيهيدي', 10, '01'),
    ]));

    expect(totals).toHaveLength(1);
    const [gorgol] = totals;
    expect(gorgol.total).toBe(205);
    expect(gorgol.villageCount).toBe(3);
    expect(gorgol.moughataas.map((m) => m.moughataa)).toEqual(['أمبود', 'كيهيدي']);

    const mbout = gorgol.moughataas[0];
    expect(mbout).toMatchObject({ total: 195, count: 3, max: 95, villageCount: 2, avgPerVillage: 97.5 });
    expect(mbout.last).toContain('2026-08-02');
  });

  it('تقرير أُدرج أربع مرات يُحسب مرة واحدة', () => {
    const once = [row('لعصابه', 'كرو', 'اودي اجريد', 40), row('لعصابه', 'كرو', 'كامور', 20)];
    const totals = buildRainTotals(cleanRainReadings([...once, ...once, ...once, ...once]));
    expect(totals[0].total).toBe(60);
    expect(totals[0].count).toBe(2);
  });

  it('قراءتان متشابهتان في تقرير غير مكرَّر تبقيان (التشابه ليس دليل تكرار)', () => {
    const totals = buildRainTotals(cleanRainReadings([
      row('لعصابه', 'كرو', 'الطبال', 30),
      row('لعصابه', 'كرو', 'الطبال', 30),
      row('لعصابه', 'كرو', 'كامور', 20),
    ]));
    expect(totals[0].total).toBe(80);
    expect(totals[0].count).toBe(3);
  });

  it('القراءة نفسها في تقريرين مختلفين تُحسب مرتين', () => {
    const totals = buildRainTotals(cleanRainReadings([
      row('لعصابه', 'كرو', 'كامور', 20, '01'),
      row('لعصابه', 'كرو', 'كامور', 20, '02'),
    ]));
    expect(totals[0].total).toBe(40);
  });

  it('يصحّح الولاية من المقاطعة المعروفة ويحفظ الاسم الأصلي', () => {
    const readings = cleanRainReadings([
      row('لبراكنه', 'غابو', 'غابو', 30),
      row('داخلت نواذيبو', 'افديرك', 'افديرك', 20),
    ]);
    expect(readings.map((r) => [r.wilaya, r.wilayaRaw, r.wilayaFix])).toEqual([
      ['كيدي ماغا', 'لبراكنه', 'moughataa'],
      ['تيرس زمور', 'داخلت نواذيبو', 'moughataa'],
    ]);
  });

  it('اسم ولاية محفوظ في خانة المقاطعة يحدّد الولاية', () => {
    const [r] = cleanRainReadings([row('الحوض الغربي', 'كوركل', 'الخلوه', 12)]);
    expect(r).toMatchObject({ wilaya: 'كوركول', moughataa: '—', wilayaFix: 'wilaya-in-moughataa-field' });
  });

  it('لا ينقل قرية إلى ولاية أخرى لأن اسمها يشبه اسم مقاطعة', () => {
    const [r] = cleanRainReadings([row('تكانت', null, 'الرياض', 12)]);
    expect(r).toMatchObject({ wilaya: 'تكانت', moughataa: '—', wilayaFix: null });
  });

  it('يملأ مقاطعة نواكشوط من خانة القرية حين توافق الولاية', () => {
    const [r] = cleanRainReadings([row('نواكشوط الجنوبية', null, 'الرياض', 12)]);
    expect(r).toMatchObject({ wilaya: 'نواكشوط الجنوبية', moughataa: 'الرياض' });
  });

  it('يُبقي المقاطعة غير المعروفة تحت ولايتها الأصلية', () => {
    const totals = buildRainTotals(cleanRainReadings([row('تكانت', null, 'قرية ما', 12)]));
    expect(totals[0].wilaya).toBe('تكانت');
    expect(totals[0].moughataas[0].moughataa).toBe('—');
  });
});

describe('rainDeficit', () => {
  it('عجز: المرجع 200 والمسجَّل 150 → 50 مم و25%', () => {
    expect(rainDeficit(150, 200)).toEqual({ status: 'deficit', mm: 50, pct: 25 });
  });

  it('فائض لا عجز سالب: المرجع 200 والمسجَّل 260 → فائض 60 مم و30%', () => {
    expect(rainDeficit(260, 200)).toEqual({ status: 'surplus', mm: 60, pct: 30 });
  });

  it('عند المعدل', () => {
    expect(rainDeficit(200, 200).status).toBe('normal');
  });

  it('مرجع صفري أو مفقود لا تُحسب له نسبة', () => {
    expect(rainDeficit(100, 0).status).toBe('not-computable');
    expect(rainDeficit(100, NaN).status).toBe('not-computable');
    expect(rainDeficit(NaN, 100).status).toBe('not-computable');
  });
});

describe('buildYearlyDeficit', () => {
  // سنة فيها موقعان، كلٌّ بقراءة واحدة قيمتها mm في تاريخ معيّن → متوسط الموقع = mm
  const yearRows = (year, mm, monthDay = '08-01') => ['أ', 'ب'].map((village) => ({
    wilaya: 'تكانت', moughataa: 'تجكجة', village, mm,
    report_url: `r-${year}-${monthDay}`, report_published_at: `${year}-${monthDay}T10:00:00+00:00`,
  }));
  const build = (rows, today = '2027-01-15') => buildYearlyDeficit(cleanRainReadings(rows), { minReadings: 2, today: new Date(`${today}T00:00:00Z`) });
  const byYear = (res) => Object.fromEntries(res.years.map((y) => [y.year, y]));

  it('يحسب العجز والفائض مقابل متوسط السنوات المرجعية', () => {
    const res = build([...yearRows(2022, 60), ...yearRows(2023, 40), ...yearRows(2024, 50)]);
    expect(res.reference).toBe(50);
    expect(res.referenceYears).toEqual([2022, 2023, 2024]);
    const y = byYear(res);
    expect(y[2022]).toMatchObject({ status: 'surplus', surplusMm: 10, surplusPct: 20, deficitPct: null });
    expect(y[2023]).toMatchObject({ status: 'deficit', deficitMm: 10, deficitPct: 20, surplusPct: null });
    expect(y[2024].status).toBe('normal');
  });

  it('السنة الجارية تُقارَن بالفترة نفسها لا بالسنة الكاملة', () => {
    // كل سنة مرجعية: 20 مم قبل 15 أغسطس و80 مم بعده. السنة الجارية حتى 15 أغسطس: 20 مم.
    const ref = (year) => [...yearRows(year, 20, '07-20'), ...yearRows(year, 80, '09-10')];
    const res = build([...ref(2022), ...ref(2023), ...ref(2024), ...yearRows(2025, 20, '07-20')], '2025-08-15');
    const y = byYear(res);
    expect(res.reference).toBe(100);
    expect(res.referenceToDate).toBe(20);
    expect(y[2025]).toMatchObject({ current: true, avgPerSite: 20, reference: 20, status: 'normal' });
  });

  it('لا يحسب نسبة لسنة أرشيفها ناقص ولا يُدخلها في المرجع', () => {
    const res = build([
      ...yearRows(2021, 10).slice(0, 1),
      ...yearRows(2022, 60), ...yearRows(2023, 40), ...yearRows(2024, 50),
    ]);
    expect(res.reference).toBe(50);
    expect(byYear(res)[2021]).toMatchObject({ reliable: false, status: 'not-computable', deficitPct: null });
  });

  it('لا مرجع بأقل من ثلاث سنوات كافية', () => {
    const res = build([...yearRows(2023, 40), ...yearRows(2024, 50)]);
    expect(res.reference).toBeNull();
    expect(res.years.every((y) => y.status === 'not-computable')).toBe(true);
  });
});

describe('مقاطعة القرية من تقارير أخرى', () => {
  const stated = (village, moughataa, n) => Array.from({ length: n }, (_, i) => row('الحوض الشرقي', moughataa, village, 10 + i, String(10 + i)));

  it('تُنسب القرية للمقاطعة التي كُتبت لها صراحةً ثلاث مرات على الأقل', () => {
    const readings = cleanRainReadings([...stated('طير طوبه', 'تمبدغة', 3), row('الحوض الشرقي', null, 'طير طوبه', 35, '01')]);
    const filled = readings.find((r) => r.mm === 35);
    expect(filled).toMatchObject({ moughataa: 'تمبدغة', moughataaFix: 'village-in-other-reports' });
  });

  it('شاهدان لا يكفيان', () => {
    const readings = cleanRainReadings([...stated('طير طوبه', 'تمبدغة', 2), row('الحوض الشرقي', null, 'طير طوبه', 35, '01')]);
    expect(readings.find((r) => r.mm === 35).moughataa).toBe('—');
  });

  it('اسم يتكرر في أكثر من مقاطعة لا يُحسم', () => {
    const readings = cleanRainReadings([
      ...stated('المبروك', 'جكني', 6), ...stated('المبروك', 'تمبدغة', 3).map((r) => ({ ...r, report_url: `x-${r.report_url}` })),
      row('الحوض الشرقي', null, 'المبروك', 35, '01'),
    ]);
    expect(readings.find((r) => r.mm === 35).moughataa).toBe('—');
  });

  it('لا تُستعمل شواهد ولاية أخرى', () => {
    const readings = cleanRainReadings([...stated('بغداد', 'النعمة', 5), row('الحوض الغربي', null, 'بغداد', 35, '01')]);
    expect(readings.find((r) => r.mm === 35).moughataa).toBe('—');
  });
});
