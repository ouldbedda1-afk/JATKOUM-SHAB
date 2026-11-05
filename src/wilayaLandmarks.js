// صورة معلم لكل ولاية، تظهر مع منشورات التوقعات الخاصة بها (public/landmarks).
// كل الصور من ويكيميديا كومنز برخص حرة تشترط ذكر المصوّر والرخصة.
// بعد التعديل شغّل npm run generate:places لتحديث نسخة الخادم.

const NOUAKCHOTT = {
  src: '/landmarks/nouakchott.jpg', label: 'المسجد السعودي في نواكشوط',
  artist: 'Magharebia', license: 'CC BY 2.0',
  page: 'https://commons.wikimedia.org/wiki/File:Saudi_Mosque_Nouakchott.jpg',
};

export const WILAYA_LANDMARKS = {
  'الحوض الشرقي': {
    src: '/landmarks/hodh-chargui.jpg', label: 'مدينة ولاتة التاريخية',
    artist: 'c.hug', license: 'CC BY-SA 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Oualata_02.jpg',
  },
  'الحوض الغربي': {
    src: '/landmarks/hodh-gharbi.jpg', label: 'الطينطان',
    artist: 'c.hug', license: 'CC BY-SA 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Tintane.jpg',
  },
  'لعصابه': {
    src: '/landmarks/assaba.jpg', label: 'مدينة كيفة',
    artist: 'Toksave', license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Kiffa_mauritania.jpg',
  },
  'كوركول': {
    src: '/landmarks/gorgol.jpg', label: 'كيهيدي',
    artist: 'Alexis Doucet', license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Kaedi.JPG',
  },
  'البراكنة': {
    src: '/landmarks/brakna.jpg', label: 'الشارع الرئيسي في ألاك',
    artist: 'Bertramz', license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Aleg,main-street.jpg',
  },
  'الترارزة': {
    src: '/landmarks/trarza.jpg', label: 'كثبان بوتلميت',
    artist: 'Ji-Elle', license: 'ملك عام',
    page: 'https://commons.wikimedia.org/wiki/File:BoutilimitSable.JPG',
  },
  'آدرار': {
    src: '/landmarks/adrar.jpg', label: 'وادي ترجيت',
    artist: 'LBM1948', license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Mauritania,_panor%C3%A1micas_(1997)_05.jpg',
  },
  'داخلة نواذيبو': {
    src: '/landmarks/dakhlet-nouadhibou.jpg', label: 'الرأس الأبيض',
    artist: 'Ammar Hassan', license: 'CC BY 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Cap_Blanc_Mauritania.jpg',
  },
  'تكانت': {
    src: '/landmarks/tagant.jpg', label: 'سوق تجكجة',
    artist: 'Bertramz', license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Tidjikja,marketstreet.jpg',
  },
  'كيدماغا': {
    src: '/landmarks/guidimaka.jpg', label: 'شارع تجاري في سيلبابي',
    artist: 'Alexis Doucet', license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Street_Selibaby.jpg',
  },
  'تيرس زمور': {
    src: '/landmarks/tiris-zemmour.jpg', label: 'ازويرات من كدية الجل',
    artist: 'Jérome Ferri', license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Zou%C3%A9ratt_vu_de_la_Kh%C3%A9dia_d%27Idjil_-_Montagne_de_Fer_%2B915m,_point_culminant_de_la_Mauritanie.jpg',
  },
  'انشيري': {
    src: '/landmarks/inchiri.jpg', label: 'أكجوجت',
    artist: 'Akjoujtcity', license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Akjoujt_City.JPG',
  },
  'نواكشوط': NOUAKCHOTT,
  'نواكشوط الشمالية': NOUAKCHOTT,
  'نواكشوط الغربية': NOUAKCHOTT,
  'نواكشوط الجنوبية': NOUAKCHOTT,
};

// مطابقة متسامحة مع اختلاف الكتابة (تكانت/تاكانت، لبراكنه/البراكنة…)
const wilayaKey = (w) => String(w || '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/^ال|^ل/, '').replace(/ا/g, '').replace(/\s+/g, '');

const BY_KEY = Object.fromEntries(Object.entries(WILAYA_LANDMARKS).map(([w, v]) => [wilayaKey(w), v]));

export function getWilayaLandmark(wilaya) {
  return BY_KEY[wilayaKey(wilaya)] || null;
}

// يجد صورة المعلم من مسارها، لعرض سطر ذكر المصوّر تحت صورة الخبر
export function getLandmarkBySrc(src) {
  if (!src) return null;
  const path = String(src).replace(/^https?:\/\/[^/]+/, '');
  return Object.values(WILAYA_LANDMARKS).find((l) => l.src === path) || null;
}
