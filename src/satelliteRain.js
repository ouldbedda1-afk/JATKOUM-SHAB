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

let cachedRadarMeta = null;
let cachedRadarMetaTime = 0;
let cachedFrame = null;
let cachedFrameTime = 0;
let cachedSameDayEvents = [];
let cachedSameDayEventsTime = 0;
let cachedSameDayEventsDay = '';
const FRAME_TTL = 10 * 60 * 1000; // 10 دقائق (معدل تحديث RainViewer)
const SAME_DAY_EVENTS_TTL = 20 * 60 * 1000; // 20 دقيقة لتخفيف الضغط
const HEAVY_RAIN_MMH = 20;

function getDayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * جلب بيانات الرادار الأساسية (المضيف + الإطارات الماضية)
 */
async function getRadarMeta() {
  const now = Date.now();
  if (cachedRadarMeta && now - cachedRadarMetaTime < FRAME_TTL) return cachedRadarMeta;

  const res = await fetch(RAINVIEWER_API);
  if (!res.ok) throw new Error('RainViewer API unavailable');
  const data = await res.json();

  const frames = data.radar?.past;
  if (!frames || frames.length === 0) throw new Error('No radar frames available');

  cachedRadarMeta = { host: data.host, frames };
  cachedRadarMetaTime = now;
  return cachedRadarMeta;
}

/**
 * جلب آخر إطار رادار من RainViewer
 */
async function getLatestRadarFrame() {
  const now = Date.now();
  if (cachedFrame && now - cachedFrameTime < FRAME_TTL) return cachedFrame;

  const data = await getRadarMeta();
  const frames = data.frames;
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
 * قراءة أعلى شدة مطر داخل منطقة محيطة بنقطة (px, py) في بلاطة الرادار.
 * نمسح مربعاً نصف قطره `radius` بكسل بدل بكسل واحد، لالتقاط الخلايا
 * القريبة أو المتّجهة نحو المدينة (zoom 4 ≈ 10كم/بكسل).
 */
async function getTileMaxRain(tileUrl, px, py, radius = 3, colorFn = colorToRainIntensity) {
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

        const x0 = Math.max(0, px - radius);
        const y0 = Math.max(0, py - radius);
        const w = Math.min(256 - x0, radius * 2 + 1);
        const h = Math.min(256 - y0, radius * 2 + 1);
        const { data } = ctx.getImageData(x0, y0, w, h);

        let best = { mmh: 0, label: null };
        for (let i = 0; i < data.length; i += 4) {
          const intensity = colorFn(data[i], data[i + 1], data[i + 2], data[i + 3]);
          if (intensity.mmh > best.mmh) best = intensity;
        }
        resolve(best);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Tile load failed'));
    img.src = tileUrl;
  });
}

/**
 * تحويل لون بكسل IMERG (NASA GIBS) إلى شدة المطر.
 * IMERG يلوّن فقط حيث يوجد هطول (شفاف = لا مطر)، من الأزرق (خفيف) للأحمر/الوردي (غزير جداً).
 */
function colorToImergIntensity(r, g, b, a) {
  if (a < 40) return { mmh: 0, label: null };
  // وردي/بنفسجي قوي = غزير جداً
  if (r > 180 && b > 150 && g < 130) return { mmh: 40, label: 'غزير جداً' };
  // أحمر = غزير
  if (r > 190 && g < 110 && b < 110) return { mmh: 20, label: 'غزير' };
  // برتقالي/أصفر = متوسط
  if (r > 180 && g > 140 && b < 120) return { mmh: 9, label: 'متوسط' };
  // أخضر = خفيف
  if (g > 130 && g >= r && b < 150) return { mmh: 3, label: 'خفيف' };
  // أزرق/سماوي = خفيف جداً
  if (b > 130) return { mmh: 1, label: 'خفيف' };
  // أي بكسل ملوّن آخر = هطول خفيف
  if (a >= 60 && (r + g + b) > 80) return { mmh: 0.8, label: 'خفيف' };
  return { mmh: 0, label: null };
}

const GIBS_IMERG_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/default/GoogleMapsCompatible_Level6';

async function checkImergAtLocation(lat, lon, zoom = 5, radius = 2) {
  const { x, y, px, py } = latLonToTile(lat, lon, zoom);
  const tileUrl = `${GIBS_IMERG_URL}/${zoom}/${y}/${x}.png`; // GIBS = z/y/x
  try {
    return await getTileMaxRain(tileUrl, px, py, radius, colorToImergIntensity);
  } catch {
    return { mmh: 0, label: null };
  }
}

/**
 * مصدر ثانٍ: تقدير المطر من أقمار NASA IMERG (تغطية كاملة تشمل عمق الصحراء).
 * يُكمّل رادار RainViewer في المناطق ضعيفة التغطية الرادارية.
 */
export async function getRainingNowFromIMERG(cities) {
  if (!cities || cities.length === 0) return [];

  const toCheck = cities.filter((c) => c.latitude != null || c.lat != null);
  const results = await Promise.allSettled(
    toCheck.map(async (city) => {
      const lat = city.latitude ?? city.lat;
      const lon = city.longitude ?? city.lon;
      const rain = await checkImergAtLocation(lat, lon);
      return { city, rain };
    })
  );

  return results
    .filter((r) => r.status === 'fulfilled' && r.value.rain.mmh >= 1)
    .map((r) => ({
      city: r.value.city.city,
      wilaya: r.value.city.wilaya || '',
      mmh: r.value.rain.mmh,
      label: r.value.rain.label,
      source: 'imerg',
    }))
    .sort((a, b) => b.mmh - a.mmh);
}

/**
 * تحويل لون بكسل RainViewer إلى شدة المطر
 * RainViewer يستخدم مقياس ألوان قياسي:
 *   شفاف/أزرق فاتح = لا مطر
 *   أزرق → أخضر → أصفر → برتقالي → أحمر = مطر متزايد
 */
function colorToRainIntensity(r, g, b, a) {
  if (a < 40) return { mmh: 0, label: null }; // شفاف = لا مطر

  // أحمر/وردي قوي = مطر غزير جداً
  if (r > 190 && g < 90 && b < 110) return { mmh: 50, label: 'غزير جداً' };
  // برتقالي = مطر غزير
  if (r > 190 && g > 90 && b < 90)  return { mmh: 20, label: 'غزير' };
  // أصفر = مطر متوسط
  if (r > 160 && g > 160 && b < 110) return { mmh: 8, label: 'متوسط' };
  // أخضر = مطر خفيف
  if (g > 120 && g > r && b < 140)  return { mmh: 2, label: 'خفيف' };
  // أزرق/سماوي = رذاذ
  if (b > 120 && b >= g)            return { mmh: 0.5, label: 'رذاذ' };

  // أي بكسل ملوّن معتم بما يكفي ولا يطابق الخلفية = مطر خفيف على الأقل
  if (a >= 80 && (r + g + b) > 60)  return { mmh: 1, label: 'خفيف' };

  return { mmh: 0, label: null };
}

/**
 * فحص هل تمطر فوق إحداثيات معينة الآن عبر الرادار
 */
async function checkRainAtLocation(lat, lon, radarPath, host, zoom = 4, radius = 3) {
  const { x, y, px, py } = latLonToTile(lat, lon, zoom);
  const tileUrl = `https://${host}${radarPath}/256/${zoom}/${x}/${y}/4/1_1.png`;

  try {
    return await getTileMaxRain(tileUrl, px, py, radius);
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
      // دقة عالية مع تغطية كافية (zoom 6 ≈ 2.4كم/بكسل، نصف قطر ~17كم)
      const rain = await checkRainAtLocation(lat, lon, frame.path, frame.host, 6, 3);
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
 * البحث في أرشيف الرادار المتاح لليوم نفسه عن أمطار غزيرة فوق المقاطعات
 * يعيد المقاطعات التي ظهر فوقها مطر غزير مرة واحدة على الأقل خلال إطارات اليوم المتاحة
 */
export async function getSameDayHeavyRainEventsFromSatellite(cities) {
  if (!cities || cities.length === 0) return [];

  const todayKey = getDayKey(Date.now());
  const now = Date.now();
  if (
    cachedSameDayEventsDay === todayKey &&
    cachedSameDayEvents.length > 0 &&
    now - cachedSameDayEventsTime < SAME_DAY_EVENTS_TTL
  ) {
    return cachedSameDayEvents;
  }

  let radarMeta;
  try {
    radarMeta = await getRadarMeta();
  } catch (e) {
    console.warn('🛰️ RainViewer archive غير متاح:', e.message);
    return [];
  }

  const framesToday = (radarMeta.frames || []).filter((frame) => getDayKey(frame.time * 1000) === todayKey);
  if (framesToday.length === 0) {
    cachedSameDayEvents = [];
    cachedSameDayEventsDay = todayKey;
    cachedSameDayEventsTime = now;
    return [];
  }

  const toCheck = cities.filter((c) => c.latitude != null || c.lat != null);
  const eventMap = new Map();

  for (const frame of framesToday) {
    const frameTime = new Date(frame.time * 1000);
    const results = await Promise.allSettled(
      toCheck.map(async (city) => {
        const lat = city.latitude ?? city.lat;
        const lon = city.longitude ?? city.lon;
        const rain = await checkRainAtLocation(lat, lon, frame.path, radarMeta.host);
        return { city, rain };
      })
    );

    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      const { city, rain } = result.value;
      if ((rain?.mmh ?? 0) < HEAVY_RAIN_MMH) return;

      const key = city.city;
      const existing = eventMap.get(key);
      if (!existing) {
        eventMap.set(key, {
          city: city.city,
          wilaya: city.wilaya || '',
          maxMmh: rain.mmh,
          label: rain.label || 'غزير',
          firstSeen: frameTime.toISOString(),
          lastSeen: frameTime.toISOString(),
          framesDetected: 1,
        });
        return;
      }

      existing.maxMmh = Math.max(existing.maxMmh, rain.mmh);
      existing.label = existing.maxMmh >= 50 ? 'غزير جداً' : existing.label || rain.label || 'غزير';
      existing.lastSeen = frameTime.toISOString();
      existing.framesDetected += 1;
    });
  }

  const events = Array.from(eventMap.values()).sort((a, b) => {
    if (b.maxMmh !== a.maxMmh) return b.maxMmh - a.maxMmh;
    return b.framesDetected - a.framesDetected;
  });

  cachedSameDayEvents = events;
  cachedSameDayEventsDay = todayKey;
  cachedSameDayEventsTime = now;
  return events;
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
