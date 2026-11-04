// جدول المدن والبلديات المتابَعة — مصدر واحد للموقع (weatherApi.js) ولدالة
// الخادم wilaya-publisher (يُولَّد منه supabase/functions/_shared/mauritaniaPlaces.ts
// بالأمر npm run generate:places).

import { mauritaniaCommunesList } from './mauritaniaCommunes';
import { COMMUNE_NAMES_AR } from './mauritaniaCommuneNamesAr';
import {
  getCanonicalMauritaniaPlaceKey,
  normalizeMauritaniaMoughataaName,
  normalizeMauritaniaWilayaName,
} from './mauritaniaPlaceNames';

function getCommuneCanonicalKeys(commune) {
  // ملاحظة: لا تُدرج moughataa هنا — تسبب استبعاد كل بلديات المقاطعة خطأً
  // كلما تطابق اسم عاصمة المقاطعة مع بلدية مُتابَعة يدوياً (manualMauritanianCities)
  return [
    commune?.city,
    commune?.name,
  ]
    .map((value) => getCanonicalMauritaniaPlaceKey(value))
    .filter(Boolean);
}

export function getAdministrativeContext(coords = {}) {
  return {
    wilaya: normalizeMauritaniaWilayaName(coords.administrativeWilaya || coords.wilaya),
    moughataa: normalizeMauritaniaMoughataaName(coords.administrativeMoughataa || coords.moughataa),
  };
}

// مدن ومقاطعات وبلديات مستخدمة للرصد والعرض، مع الاحتفاظ بالهيكلة الإدارية الرسمية في المصدر المستورد
export const manualMauritanianCities = {
  // --- نواكشوط (3 ولايات منذ 2014) ---
  'نواكشوط': { lat: 18.0735, lon: -15.9582, name: 'Nouakchott', type: 'عاصمة', wilaya: 'نواكشوط', administrativeWilaya: 'نواكشوط الغربية' },
  'درنعيم': { lat: 18.1270, lon: -15.9420, name: 'Dar Naim', type: 'مقاطعة', wilaya: 'نواكشوط الشمالية' },
  'تيارت': { lat: 18.0930, lon: -15.9770, name: 'Teyarett', type: 'مقاطعة', wilaya: 'نواكشوط الشمالية' },
  'توجنين': { lat: 18.1100, lon: -15.9200, name: 'Toujounine', type: 'مقاطعة', wilaya: 'نواكشوط الشمالية' },
  'تفرغ زينة': { lat: 18.0800, lon: -16.0100, name: 'Tevragh Zeina', type: 'مقاطعة', wilaya: 'نواكشوط الغربية' },
  'السبخة': { lat: 18.0600, lon: -15.9900, name: 'Sebkha', type: 'مقاطعة', wilaya: 'نواكشوط الغربية' },
  'عرفات': { lat: 17.9900, lon: -15.9450, name: 'Arafat', type: 'مقاطعة', wilaya: 'نواكشوط الجنوبية' },
  'المينة': { lat: 18.0100, lon: -15.9700, name: 'El Mina', type: 'مقاطعة', wilaya: 'نواكشوط الجنوبية' },

  // --- الترارزة ---
  'روصو': { lat: 16.513, lon: -15.81, name: 'Rosso', type: 'مقاطعة', wilaya: 'الترارزة' },
  'بوتلميت': { lat: 17.51, lon: -14.76, name: 'Boutilimit', type: 'مقاطعة', wilaya: 'الترارزة' },
  'كرمسين': { lat: 16.48, lon: -16.21, name: 'Keur Macène', type: 'مقاطعة', wilaya: 'الترارزة' },
  'المذرذرة': { lat: 16.91, lon: -15.65, name: 'Mederdra', type: 'مقاطعة', wilaya: 'الترارزة' },
  'واد الناقة': { lat: 17.91, lon: -15.31, name: 'Ouad Naga', type: 'مقاطعة', wilaya: 'الترارزة' },
  'اركيز': { lat: 16.91, lon: -15.28, name: 'Rkiz', type: 'مقاطعة', wilaya: 'الترارزة' },
  'انتيكان': { lat: 16.608, lon: -15.354, name: 'Antikan', type: 'قرية', wilaya: 'الترارزة' },

  // --- البراكنة ---
  'ألاك': { lat: 17.05, lon: -13.91, name: 'Aleg', type: 'مقاطعة', wilaya: 'البراكنة' },
  'بابابى': { lat: 16.48, lon: -13.98, name: 'Bababé', type: 'مقاطعة', wilaya: 'البراكنة' },
  'بوكي': { lat: 16.58, lon: -14.26, name: 'Boghé', type: 'مقاطعة', wilaya: 'البراكنة' },
  'مقاطع لحجار': { lat: 17.513, lon: -13.093, name: 'Magta Lahjar', type: 'مقاطعة', wilaya: 'البراكنة' },
  'امباني': { lat: 16.25, lon: -13.78, name: 'Mbagne', type: 'مقاطعة', wilaya: 'البراكنة' },
  'صنكرافه': { lat: 17.593, lon: -12.837, name: 'Sankrafa', type: 'بلدية', wilaya: 'البراكنة' },

  // --- كوركول ---
  'كيهيدي': { lat: 16.15, lon: -13.50, name: 'Kaédi', type: 'مقاطعة', wilaya: 'كوركول' },
  'امبود': { lat: 16.027075171459536, lon: -12.582155366037124, name: 'Mbout', type: 'مقاطعة', wilaya: 'كوركول' },
  'مقامة': { lat: 15.51, lon: -12.85, name: 'Maghama', type: 'مقاطعة', wilaya: 'كوركول' },
  'مونغل': { lat: 16.26, lon: -13.23, name: 'Monguel', type: 'مقاطعة', wilaya: 'كوركول' },

  // --- كيدماغا ---
  'سيلبابي': { lat: 15.15, lon: -12.18, name: 'Sélibaby', type: 'مقاطعة', wilaya: 'كيدماغا' },
  'ولد ينج': { lat: 15.35, lon: -11.63, name: 'Ould Yengé', type: 'مقاطعة', wilaya: 'كيدماغا' },
  'غابو': { lat: 15.33, lon: -12.57, name: 'Ghabou', type: 'مقاطعة', wilaya: 'كيدماغا' },
  'ونبو': { lat: 15.132, lon: -12.724, name: 'Wompou', type: 'بلدية', wilaya: 'كيدماغا' },
  'لعبلي': { lat: 15.318161600485181, lon: -11.79565738869597, name: 'Labli', type: 'بلدية', wilaya: 'كيدماغا' },

  // --- لعصابه ---
  'كيفة': { lat: 16.61, lon: -11.40, name: 'Kiffa', type: 'مقاطعة', wilaya: 'لعصابه' },
  'باركيول': { lat: 16.63, lon: -12.50, name: 'Barkéol', type: 'مقاطعة', wilaya: 'لعصابه' },
  'كرو': { lat: 16.81, lon: -11.83, name: 'Guerou', type: 'مقاطعة', wilaya: 'لعصابه' },
  'بومديد': { lat: 17.484, lon: -11.367, name: 'Boumdeid', type: 'مقاطعة', wilaya: 'لعصابه' },
  'تناها': { lat: 15.121604003909406, lon: -10.899006284648546, name: 'Tenaha', type: 'بلدية', wilaya: 'لعصابه' },
  'هامد': { lat: 15.633125821113623, lon: -11.516237907118896, name: 'Hamed', type: 'مركز إداري', wilaya: 'لعصابه' },

  // --- الحوض الغربي ---
  'لعيون': { lat: 16.66, lon: -9.61, name: 'Aioun', type: 'مقاطعة', wilaya: 'الحوض الغربي' },
  'كنكوصة': { lat: 15.93, lon: -11.53, name: 'Kankossa', type: 'مقاطعة', wilaya: 'لعصابه' },
  'تامشكط': { lat: 17.42, lon: -10.67, name: 'Tamchekett', type: 'مقاطعة', wilaya: 'الحوض الغربي' },
  'كوبني': { lat: 15.821, lon: -9.415, name: 'Kobenni', type: 'مقاطعة', wilaya: 'الحوض الغربي' },
  'الطينطان': { lat: 16.39, lon: -10.16, name: 'Tintane', type: 'مقاطعة', wilaya: 'الحوض الغربي' },

  // --- الحوض الشرقي ---
  'النعمة': { lat: 16.61, lon: -7.25, name: 'Nema', type: 'مقاطعة', wilaya: 'الحوض الشرقي' },
  'تمبدغة': { lat: 16.2421, lon: -8.1721, name: 'Timbedra', type: 'مقاطعة', wilaya: 'الحوض الشرقي' },
  'باسكنو': { lat: 15.8621, lon: -5.9543, name: 'Bassiknou', type: 'مقاطعة', wilaya: 'الحوض الشرقي' },
  'جيكني': { lat: 15.7388, lon: -8.6703, name: 'Djiguenni', type: 'مقاطعة', wilaya: 'الحوض الشرقي' },
  'امرج': { lat: 16.1069, lon: -7.2143, name: 'Amourj', type: 'مقاطعة', wilaya: 'الحوض الشرقي' },
  'ولاته': { lat: 17.2966, lon: -7.0240, name: 'Oualata', type: 'مقاطعة', wilaya: 'الحوض الشرقي' },
  'فصاله': { lat: 15.5580, lon: -5.5228, name: 'Fassala', type: 'بلدية', wilaya: 'الحوض الشرقي' },
  'عدل بكرو': { lat: 15.6755, lon: -7.0216, name: 'Adel Bagrou', type: 'بلدية', wilaya: 'الحوض الشرقي' },
  'انبيكت لحواش': { lat: 16.8450, lon: -5.9423, name: 'NBeiket Lahwach', type: 'مقاطعة', wilaya: 'الحوض الشرقي' },
  'افيرني': { lat: 15.5634, lon: -8.9105, name: 'Afeirni', type: 'بلدية', wilaya: 'الحوض الشرقي' },
  'اعوينات ازبل': { lat: 16.3848, lon: -8.8877, name: 'Aoueinat Zbel', type: 'بلدية', wilaya: 'الحوض الشرقي' },
  'بوسطيله': { lat: 15.5777, lon: -8.0819, name: 'Bousteila', type: 'بلدية', wilaya: 'الحوض الشرقي' },

  // --- تكانت ---
  'تجكجة': { lat: 18.55, lon: -11.43, name: 'Tidjikja', type: 'مقاطعة', wilaya: 'تكانت' },
  'تيشيت': { lat: 18.44, lon: -9.49, name: 'Tichit', type: 'مقاطعة', wilaya: 'تكانت' },
  'موجريه': { lat: 17.88, lon: -12.37, name: 'Moudjéria', type: 'مقاطعة', wilaya: 'تكانت' },

  // --- آدرار ---
  'أطار': { lat: 20.51, lon: -13.05, name: 'Atar', type: 'مقاطعة', wilaya: 'آدرار' },
  'يغرف': { lat: 20.251962, lon: -13.505931, name: 'Yighref', type: 'قرية', wilaya: 'آدرار' },
  'شنقيط': { lat: 20.45, lon: -12.35, name: 'Chinguetti', type: 'مقاطعة', wilaya: 'آدرار' },
  'وادان': { lat: 20.93, lon: -11.61, name: 'Ouadane', type: 'مقاطعة', wilaya: 'آدرار' },
  'اوجفت': { lat: 20.026, lon: -13.055, name: 'Aoujeft', type: 'مقاطعة', wilaya: 'آدرار' },

  // --- انشيري ---
  'أكجوجت': { lat: 19.75, lon: -14.41, name: 'Akjoujt', type: 'مقاطعة', wilaya: 'انشيري' },
  'بنيشاب': { lat: 19.467, lon: -15.429, name: 'Bennichab', type: 'بلدية', wilaya: 'انشيري' },

  // --- داخلة نواذيبو ---
  'نواذيبو': { lat: 20.9375, lon: -17.0339, name: 'Nouadhibou', type: 'مقاطعة', wilaya: 'داخلة نواذيبو' },

  // --- تيرس زمور ---
  'زويرات': { lat: 22.71, lon: -12.47, name: 'Zouérat', type: 'مقاطعة', wilaya: 'تيرس زمور' },
  'بير أم اكرين': { lat: 25.22, lon: -11.58, name: 'Bir Moghrein', type: 'مقاطعة', wilaya: 'تيرس زمور' },
  'فديريك': { lat: 22.68, lon: -12.72, name: 'Fdérik', type: 'مقاطعة', wilaya: 'تيرس زمور' },
};

const manualCityCanonicalKeySet = new Set(
  Object.entries(manualMauritanianCities)
    .flatMap(([cityKey, city]) => [
      getCanonicalMauritaniaPlaceKey(cityKey),
      getCanonicalMauritaniaPlaceKey(city.name),
    ])
    .filter(Boolean)
);

export const filteredMauritaniaCommunesList = mauritaniaCommunesList.filter(
  (commune) =>
    commune?.city &&
    Number.isFinite(commune.lat) &&
    Number.isFinite(commune.lon) &&
    !getCommuneCanonicalKeys(commune).some((key) => manualCityCanonicalKeySet.has(key))
);

const filteredMauritaniaCommunes = Object.fromEntries(
  filteredMauritaniaCommunesList.map((commune) => [
    commune.city,
    {
      lat: commune.lat,
      lon: commune.lon,
      name: COMMUNE_NAMES_AR[commune.city] || commune.name,
      nameEn: commune.name,
      type: commune.type,
      ...getAdministrativeContext(commune),
      id: commune.id,
      source: commune.source,
    },
  ])
);

export const mauritanianCities = {
  ...filteredMauritaniaCommunes,
  ...manualMauritanianCities,
};
