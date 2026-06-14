/**
 * رصد الأمطار الآنية عبر صور الأقمار الصناعية
 * المصدر: RainViewer — رادار أمطار مباشر يُحدَّث كل 10 دقائق
 *
 * الطريقة:
 *  1. نجلب آخر إطار من RainViewer (timestamp)
 *  2. لكل مقاطعة نحسب إحداثيات البلاطة (tile x/y/z)
 *  3. نرسم البلاطة على Canvas ونقرأ لون البكسل عند موقع المقاطعة
 *  4. قيمة اللون تُترجَم إلى شدة المطر (mm/h)
 */

const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json';

let cachedFrame = null;
let cachedFrameTime = 0;
const FRAME_TTL = 10 * 60 * 1000; // 10 دقائق (معدل تحديث RainViewer)

/**
 * جلب آخر إطار رادار من RainViewer
 */
async function getLatestRadarFrame() {
  const now = Date.now();
  if (cachedFrame && now - cachedFrameTime < FRAME_TTL) return cachedFrame;

  const res = await fetch(RAINVIEWER_API);
  if (!res.ok) throw new Error('RainViewer API unavailable');
  const data = await res.json();

  // آخر إطار من الرادار (الأحدث = الأخير في المصفوفة)
  const frames = data.radar?.past;
  if (!frames || frames.length === 0) throw new Error('No radar frames available');

  const latest = frames[frames.length - 1];
  cachedFrame = { path: latest.path, time: latest.time, host: data.host };
  cachedFrameTime = now;
  return cachedFrame;
}

/**
 * تحويل إحداثيات جغرافية إلى إحداثيات بلاطة XYZ
 */
function latLonToTile(lat, lon, zoom = 4) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  // موقع البكسل داخل البلاطة (0-255)
  const px = Math.floor((((lon + 180) / 360) * n - x) * 256);
  const py = Math.floor(
    (((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - y) * 256
  );
  return { x, y, zoom, px, py };
}

/**
 * قراءة لون بكسل في صورة بلاطة عبر Canvas (يعمل في المتصفح)
 */
async function getTilePixelColor(tileUrl, px, py) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
        resolve({ r, g, b, a });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Tile load failed'));
    img.src = tileUrl;
  });
}

/**
 * تحويل لون بكسل RainViewer إلى شدة المطر
 * RainViewer يستخدم مقياس ألوان قياسي:
 *   شفاف/أزرق فاتح = لا مطر
 *   أزرق → أخضر → أصفر → برتقالي → أحمر = مطر متزايد
 */
function colorToRainIntensity(r, g, b, a) {
  if (a < 50) return { mmh: 0, label: null }; // شفاف = لا مطر

  // نحسب "الحرارة" اللونية
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  // أحمر قوي = مطر غزير جداً
  if (r > 200 && g < 80 && b < 80)  return { mmh: 50, label: 'غزير جداً' };
  // برتقالي = مطر غزير
  if (r > 200 && g > 100 && b < 80) return { mmh: 20, label: 'غزير' };
  // أصفر = مطر متوسط
  if (r > 180 && g > 180 && b < 80) return { mmh: 8,  label: 'متوسط' };
  // أخضر = مطر خفيف
  if (r < 100 && g > 150 && b < 100) return { mmh: 2, label: 'خفيف' };
  // أزرق = رذاذ
  if (r < 100 && g < 150 && b > 150) return { mmh: 0.5, label: 'رذاذ' };

  return { mmh: 0, label: null };
}

/**
 * فحص هل تمطر فوق إحداثيات معينة الآن عبر الرادار
 */
async function checkRainAtLocation(lat, lon, radarPath, host) {
  const zoom = 4;
  const { x, y, px, py } = latLonToTile(lat, lon, zoom);
  const tileUrl = `https://${host}${radarPath}/256/${zoom}/${x}/${y}/4/1_1.png`;

  try {
    const color = await getTilePixelColor(tileUrl, px, py);
    return colorToRainIntensity(color.r, color.g, color.b, color.a);
  } catch {
    return { mmh: 0, label: null };
  }
}

/**
 * الدالة الرئيسية: فحص جميع المقاطعات عبر صور الأقمار الصناعية
 * تُعيد: قائمة المقاطعات التي ترصد فيها الأقمار الصناعية أمطاراً الآن
 */
export async function getRainingNowFromSatellite(cities) {
  if (!cities || cities.length === 0) return [];

  let frame;
  try {
    frame = await getLatestRadarFrame();
  } catch (e) {
    console.warn('🛰️ RainViewer غير متاح:', e.message);
    return [];
  }

  const radarAge = Math.round((Date.now() / 1000 - frame.time) / 60);
  console.log(`🛰️ آخر إطار رادار: منذ ${radarAge} دقيقة`);

  // نفحص فقط المقاطعات التي لديها إحداثيات
  const toCheck = cities.filter(c => c.latitude != null || c.lat != null);

  const results = await Promise.allSettled(
    toCheck.map(async city => {
      const lat = city.latitude ?? city.lat;
      const lon = city.longitude ?? city.lon;
      const rain = await checkRainAtLocation(lat, lon, frame.path, frame.host);
      return { city, rain };
    })
  );

  const rainingCities = results
    .filter(r => r.status === 'fulfilled' && r.value.rain.mmh >= 0.5)
    .map(r => ({
      city:    r.value.city.city,
      wilaya:  r.value.city.wilaya || '',
      mmh:     r.value.rain.mmh,
      label:   r.value.rain.label,
      radarAge,
    }))
    .sort((a, b) => b.mmh - a.mmh);

  return rainingCities;
}

/**
 * جلب رابط آخر إطار رادار لعرضه في المشاهد
 */
export async function getLatestRadarTileUrl(zoom = 5) {
  try {
    const frame = await getLatestRadarFrame();
    return {
      urlTemplate: `https://${frame.host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`,
      time: frame.time,
      ageMinutes: Math.round((Date.now() / 1000 - frame.time) / 60),
    };
  } catch {
    return null;
  }
}
