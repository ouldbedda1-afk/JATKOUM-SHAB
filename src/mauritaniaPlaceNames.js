const PLACE_NAME_ALIASES = {
  // مرادفات تهجئة محلية
  'امبيكتلحواش': 'انبيكتلحواش', // امبيكت لحواش = انبيكت لحواش
  nouakchott: 'نواكشوط',
  rosso: 'روصو',
  boutilimit: 'بوتلميت',
  keurmacene: 'كرمسين',
  mederdra: 'المذرذرة',
  ouadnaga: 'وادالناقة',
  rkiz: 'اركيز',
  aleg: 'ألاك',
  bababe: 'بابابى',
  boghe: 'بوكي',
  magtalahjar: 'مقاطعلحجار',
  mbagne: 'امباني',
  sangrave: 'صنكرافه',
  sankrafa: 'صنكرافه',
  kaedi: 'كيهيدي',
  mbout: 'امبود',
  maghama: 'مقامة',
  monguel: 'مونغل',
  selibaby: 'سيلبابي',
  selibabi: 'سيلبابي',
  ouldyenge: 'ولدينج',
  ghabou: 'غابو',
  wompou: 'ونبو',
  labli: 'لعبلي',
  leebelli: 'لعبلي',
  kiffa: 'كيفة',
  barkeol: 'باركيول',
  guerou: 'كرو',
  boumdeid: 'بومديد',
  tenaha: 'تناها',
  hamed: 'هامد',
  aioun: 'لعيون',
  aiounelatrouss: 'لعيون',
  kankossa: 'كنكوصة',
  tamchekett: 'تمشكط',
  kobenni: 'كوبني',
  tintane: 'الطينطان',
  nema: 'النعمة',
  timbedra: 'تمبدغة',
  bassiknou: 'باسكنو',
  basseknou: 'باسكنو',
  djiguenni: 'جيكني',
  amourj: 'امرج',
  oualata: 'ولاته',
  fassala: 'فصاله',
  adelbagrou: 'عدلبكرو',
  nbeiketlahwach: 'انبيكتلحواش',
  afeirni: 'افيرني',
  aoueinatezbel: 'اعويناتازبل',
  aoueinatezbel: 'اعويناتازبل',
  bousteila: 'بوسطيله',
  tidjikja: 'تجكجة',
  tichit: 'تيشيت',
  moudjeria: 'موجريه',
  atar: 'أطار',
  chinguetti: 'شنقيط',
  chinguitti: 'شنقيط',
  ouadane: 'وادان',
  aoujeft: 'اوجفت',
  akjoujt: 'أكجوجت',
  bennichab: 'بنيشاب',
  nouadhibou: 'نواذيبو',
  zouerat: 'زويرات',
  birmoghrein: 'بيرأماكرين',
  fderik: 'فديريك',
};

const WILAYA_NAME_ALIASES = {
  guidimagha: 'كيدماغا',
  gorgol: 'كوركول',
  trarza: 'الترارزة',
  brakna: 'البراكنة',
  assaba: 'لعصابه',
  // توحيد الصيغ العربية المختلفة لاسم الولاية إلى "لعصابه"
  'العصابة': 'لعصابه',
  'العصابه': 'لعصابه',
  'لعصابة': 'لعصابه',
  tagant: 'تكانت',
  adrar: 'آدرار',
  inchiri: 'إنشيري',
  hodhchargui: 'الحوضالشرقي',
  hodhelgharbi: 'الحوضالغربي',
  hodelgharbi: 'الحوضالغربي',
  hodechergui: 'الحوضالشرقي',
  dakhlehnouadhibou: 'داخلةنواذيبو',
  tiriszemmour: 'تيرسزمور',
  nouakchottnord: 'نواكشوطالشمالية',
  nouakchottouest: 'نواكشوطالغربية',
  nouakchottsud: 'نواكشوطالجنوبية',
};

const MOUGHATAA_NAME_ALIASES = {
  selibaby: 'سيلبابي',
  selibabi: 'سيلبابي',
  ouldyenge: 'ولدينج',
  ghabou: 'غابو',
  wompou: 'ونبو',
  rkiz: 'اركيز',
  aleg: 'ألاك',
  bababe: 'بابابى',
  boghe: 'بوكي',
  magtalahjar: 'مقاطعلحجار',
  mbagne: 'امباني',
  kaedi: 'كيهيدي',
  mbout: 'امبود',
  maghama: 'مقامة',
  monguel: 'مونغل',
  kiffa: 'كيفة',
  barkeol: 'باركيول',
  guerou: 'كرو',
  boumdeid: 'بومديد',
  aioun: 'لعيون',
  aiounelatrouss: 'لعيون',
  tamchekett: 'تمشكط',
  kobeni: 'كوبني',
  kobenni: 'كوبني',
  tintane: 'الطينطان',
  nema: 'النعمة',
  timbedra: 'تمبدغة',
  bassiknou: 'باسكنو',
  basseknou: 'باسكنو',
  djiguenni: 'جيكني',
  amourj: 'امرج',
  oualata: 'ولاته',
  nbeiketlehwach: 'انبيكتلحواش',
  nbeiketlahwach: 'انبيكتلحواش',
  adelbagrou: 'عدلبكرو',
  tidjikja: 'تجكجة',
  tichit: 'تيشيت',
  moudjeria: 'موجريه',
  atar: 'أطار',
  chinguetti: 'شنقيط',
  chinguitti: 'شنقيط',
  ouadane: 'وادان',
  aoujeft: 'اوجفت',
  akjoujt: 'أكجوجت',
  nouadhibou: 'نواذيبو',
  zouerat: 'زويرات',
  birmoghrein: 'بيرأماكرين',
  birmoughrein: 'بيرأماكرين',
  fderik: 'فديريك',
  fdeirick: 'فديريك',
  tevraghzeina: 'تفرغزينة',
  tefraghzeina: 'تفرغزينة',
  darnaim: 'درنعيم',
  teyarett: 'تيارت',
  toujounine: 'توجنين',
  arafat: 'عرفات',
  elmina: 'المينة',
  sebkha: 'السبخة',
  ksar: 'لكصر',
  riad: 'الرياض',
  riyad: 'الرياض',
  touil: 'تويل',
  tekane: 'تيكان',
  chami: 'الشامي',
  maal: 'مال',
};

export const OFFICIAL_MAURITANIA_ADMIN_COUNTS = {
  wilayas: 15,
  moughataas: 63,
  communes: 238,
};

export const OFFICIAL_MAURITANIA_WILAYA_ORDER = [
  'الحوض الشرقي',
  'الحوض الغربي',
  'لعصابه',
  'كوركول',
  'البراكنة',
  'الترارزة',
  'آدرار',
  'داخلة نواذيبو',
  'تكانت',
  'كيدماغا',
  'تيرس زمور',
  'إنشيري',
  'نواكشوط الشمالية',
  'نواكشوط الغربية',
  'نواكشوط الجنوبية',
];

export function normalizeMauritaniaPlaceName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['`’.-]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export function getCanonicalMauritaniaPlaceKey(value) {
  const normalized = normalizeMauritaniaPlaceName(value);
  return PLACE_NAME_ALIASES[normalized] || normalized;
}

export function areMauritaniaPlaceNamesEquivalent(a, b) {
  return getCanonicalMauritaniaPlaceKey(a) === getCanonicalMauritaniaPlaceKey(b);
}

export function normalizeMauritaniaWilayaName(value) {
  const normalized = normalizeMauritaniaPlaceName(value);
  const canonical = WILAYA_NAME_ALIASES[normalized] || normalized;

  switch (canonical) {
    case 'الحوضالشرقي':
      return 'الحوض الشرقي';
    case 'الحوضالغربي':
      return 'الحوض الغربي';
    case 'داخلةنواذيبو':
      return 'داخلة نواذيبو';
    case 'تيرسزمور':
      return 'تيرس زمور';
    case 'نواكشوطالشمالية':
      return 'نواكشوط الشمالية';
    case 'نواكشوطالغربية':
      return 'نواكشوط الغربية';
    case 'نواكشوطالجنوبية':
      return 'نواكشوط الجنوبية';
    default:
      return String(value || '').trim();
  }
}

export function normalizeMauritaniaMoughataaName(value) {
  const normalized = normalizeMauritaniaPlaceName(value);
  const canonical = MOUGHATAA_NAME_ALIASES[normalized] || normalized;

  switch (canonical) {
    case 'ولدينج':
      return 'ولد ينج';
    case 'تفرغزينة':
      return 'تفرغ زينة';
    case 'انبيكتلحواش':
      return 'انبيكت لحواش';
    case 'عدلبكرو':
      return 'عدل بكرو';
    case 'بيرأماكرين':
      return 'بير أم اكرين';
    default:
      return String(value || '').trim();
  }
}

export function getMauritaniaWilayaAdminOrderIndex(value) {
  const normalized = normalizeMauritaniaWilayaName(value);
  const index = OFFICIAL_MAURITANIA_WILAYA_ORDER.indexOf(normalized);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function compareMauritaniaWilayaAdminOrder(a, b) {
  const indexDiff = getMauritaniaWilayaAdminOrderIndex(a) - getMauritaniaWilayaAdminOrderIndex(b);
  if (indexDiff !== 0) return indexDiff;
  return normalizeMauritaniaWilayaName(a).localeCompare(normalizeMauritaniaWilayaName(b), 'ar');
}
