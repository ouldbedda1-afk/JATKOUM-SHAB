// مولَّد آلياً من src/wilayaLandmarks.js بالأمر npm run generate:places — لا تعدّله يدوياً.
// صورة معلم كل ولاية (مسار في public/landmarks)، صورةً بارزة لمنشورات توقعاتها.

export const WILAYA_LANDMARK_SRC: Record<string, string> = {
  "الحوض الشرقي": "/landmarks/hodh-chargui.jpg",
  "الحوض الغربي": "/landmarks/hodh-gharbi.jpg",
  "لعصابه": "/landmarks/assaba.jpg",
  "كوركول": "/landmarks/gorgol.jpg",
  "البراكنة": "/landmarks/brakna.jpg",
  "الترارزة": "/landmarks/trarza.jpg",
  "آدرار": "/landmarks/adrar.jpg",
  "داخلة نواذيبو": "/landmarks/dakhlet-nouadhibou.jpg",
  "تكانت": "/landmarks/tagant.jpg",
  "كيدماغا": "/landmarks/guidimaka.jpg",
  "تيرس زمور": "/landmarks/tiris-zemmour.jpg",
  "انشيري": "/landmarks/inchiri.jpg",
  "نواكشوط": "/landmarks/nouakchott.jpg",
  "نواكشوط الشمالية": "/landmarks/nouakchott.jpg",
  "نواكشوط الغربية": "/landmarks/nouakchott.jpg",
  "نواكشوط الجنوبية": "/landmarks/nouakchott.jpg"
};

// مطابقة متسامحة مع اختلاف الكتابة (كيدي ماغا/كيدماغا، لبراكنه/البراكنة، داخلت/داخلة، إينشيري/انشيري)
const wilayaKey = (w: string) => String(w || '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ت(?=\s)/g, 'ه').replace(/ى/g, 'ي')
  .replace(/^ال|^ل/, '').replace(/[اي]/g, '').replace(/\s+/g, '');
const BY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(WILAYA_LANDMARK_SRC).map(([w, src]) => [wilayaKey(w), src]));

export function landmarkFor(wilaya: string | null | undefined): string | null {
  if (!wilaya) return null;
  return WILAYA_LANDMARK_SRC[wilaya] ?? BY_KEY[wilayaKey(wilaya)] ?? null;
}
