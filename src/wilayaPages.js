// صفحات الولايات (/wilaya/<slug>): القائمة الواحدة التي تقرؤها الصفحة وتذييل الموقع وخريطة الموقع
// (scripts/generate-sitemap.js) وسكربت ما بعد البناء (scripts/prerender-wilayas.mjs) الذي يكتب
// لكل ولاية ملف HTML بعنوانها ووصفها لمحركات البحث ومعاينات الشبكات الاجتماعية.
//
// mapName: اسمها في خريطة الولايات وفي جداول المراعي والحرائق (نواكشوط الثلاث فيها «نواكشوط»).
// capital: عاصمتها، لمنحنى الأيام القادمة.

export const WILAYA_PAGES = [
  { slug: 'hodh-chargui',       name: 'الحوض الشرقي',      mapName: 'الحوض الشرقي',  capital: { name: 'النعمة', lat: 16.62, lon: -7.26 } },
  { slug: 'hodh-gharbi',        name: 'الحوض الغربي',      mapName: 'الحوض الغربي',  capital: { name: 'لعيون', lat: 16.66, lon: -9.61 } },
  { slug: 'assaba',             name: 'لعصابه',            mapName: 'لعصابه',        capital: { name: 'كيفة', lat: 16.62, lon: -11.4 } },
  { slug: 'gorgol',             name: 'كوركول',            mapName: 'كوركول',        capital: { name: 'كيهيدي', lat: 16.15, lon: -13.5 } },
  { slug: 'brakna',             name: 'البراكنة',          mapName: 'البراكنة',      capital: { name: 'ألاك', lat: 17.05, lon: -13.91 } },
  { slug: 'trarza',             name: 'الترارزة',          mapName: 'الترارزة',      capital: { name: 'روصو', lat: 16.51, lon: -15.81 } },
  { slug: 'adrar',              name: 'آدرار',             mapName: 'آدرار',         capital: { name: 'أطار', lat: 20.52, lon: -13.05 } },
  { slug: 'dakhlet-nouadhibou', name: 'داخلة نواذيبو',     mapName: 'داخلة نواذيبو', capital: { name: 'نواذيبو', lat: 20.93, lon: -17.03 } },
  { slug: 'tagant',             name: 'تكانت',             mapName: 'تكانت',         capital: { name: 'تجكجة', lat: 18.55, lon: -11.43 } },
  { slug: 'guidimakha',         name: 'كيدماغا',           mapName: 'كيدماغا',       capital: { name: 'سيلبابي', lat: 15.16, lon: -12.18 } },
  { slug: 'tiris-zemmour',      name: 'تيرس زمور',         mapName: 'تيرس زمور',     capital: { name: 'ازويرات', lat: 22.73, lon: -12.47 } },
  { slug: 'inchiri',            name: 'انشيري',            mapName: 'انشيري',        capital: { name: 'أكجوجت', lat: 19.75, lon: -14.38 } },
  { slug: 'nouakchott-nord',    name: 'نواكشوط الشمالية',  mapName: 'نواكشوط',       capital: { name: 'دار النعيم', lat: 18.13, lon: -15.92 } },
  { slug: 'nouakchott-ouest',   name: 'نواكشوط الغربية',   mapName: 'نواكشوط',       capital: { name: 'تفرغ زينة', lat: 18.1, lon: -15.98 } },
  { slug: 'nouakchott-sud',     name: 'نواكشوط الجنوبية',  mapName: 'نواكشوط',       capital: { name: 'عرفات', lat: 18.05, lon: -15.95 } },
];

export const wilayaPageBySlug = (slug) => WILAYA_PAGES.find((w) => w.slug === slug) || null;

// عنوان الصفحة ووصفها: نفسهما في التطبيق وفي ملف HTML المولَّد لمحركات البحث
export const wilayaPageTitle = (w) => `طقس ولاية ${w.name} اليوم: الأمطار والحرارة والتوقعات | جاتكم اسحاب`;
export const wilayaPageDescription = (w) =>
  `حالة الطقس الآن في بلديات ولاية ${w.name}، وتوقعات الأمطار والحرارة للأيام القادمة في ${w.capital.name} وبقية الولاية، ` +
  'وقراءات محطات الرصد، وحالة المراعي والحرائق.';
