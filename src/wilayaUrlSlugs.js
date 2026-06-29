// تحويل ثنائي الاتجاه بين اسم الولاية ومعرّف URL
export const WILAYA_TO_SLUG = {
  'الحوض الشرقي':       'hodh-chargui',
  'الحوض الغربي':       'hodh-gharbi',
  'لعصابه':             'assaba',
  'لبراكنه':            'brakna',
  'كوركول':             'gorgol',
  'كيدماغا':            'guidimakha',
  'تاكانت':             'tagant',
  'آدرار':              'adrar',
  'انشيري':             'inchiri',
  'إينشيري':            'inchiri',
  'تيرس زمور':          'tiris-zemmour',
  'داخلت نواذيبو':      'dakhlet-nouadhibou',
  'ترارزه':             'trarza',
  'نواكشوط الشمالية':   'nouakchott-nord',
  'نواكشوط الغربية':    'nouakchott-ouest',
  'نواكشوط الجنوبية':   'nouakchott-sud',
  'نواذيبو':            'nouadhibou',
};

export const SLUG_TO_WILAYA = Object.fromEntries(
  Object.entries(WILAYA_TO_SLUG).map(([name, slug]) => [slug, name])
);

export function wilayaToSlug(name) {
  return WILAYA_TO_SLUG[name] || name.replace(/\s+/g, '-').toLowerCase().slice(0, 40);
}

export function slugToWilaya(slug) {
  return SLUG_TO_WILAYA[slug] || slug;
}
