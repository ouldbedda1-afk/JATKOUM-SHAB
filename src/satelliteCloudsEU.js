/**
 * رصد قمم السحب العميقة (الحمل الحراري) عبر Meteosat IR من EUMETSAT (EUMETView WMS).
 * تغطية كاملة لإفريقيا، تحديث ~كل 15 دقيقة، مجاني وبلا مصادقة، CORS مفتوح.
 *
 * المبدأ: طبقة worldcloudmap_ir108 رمادية —
 *   قيمة أعلى (أفتح) = قمة سحب أبرد = حمل حراري أعمق = عاصفة/مطر مرجّح.
 *   قيمة منخفضة = سماء صافية أو سحب دافئة منخفضة.
 *
 * يُكمّل الرادار/IMERG في الساحل (حيث تغطيتهما ضعيفة أو متأخرة).
 */

const EU_WMS = 'https://view.eumetsat.int/geoserver/wms';
const BBOX = { lonMin: -18, lonMax: -4, latMin: 14, latMax: 28 }; // يغطي موريتانيا وأطرافها
const IMG = 768; // 14° / 768 ≈ 2كم/بكسل
const TTL = 10 * 60 * 1000;

// عتبات عمق السحب (معايرة ميدانية: الصافي ~48، كوبني/كيهيدي ~100-111، أعمق ~174)
const DEEP = 100;       // سحب معتبرة (حمل حراري) — كوبني/كيهيدي ~101-111
const VERY_DEEP = 140;  // قمم شديدة البرودة (عاصفة قوية مرجّحة)

function mapUrl() {
  const b = `${BBOX.lonMin},${BBOX.latMin},${BBOX.lonMax},${BBOX.latMax}`;
  return `${EU_WMS}?service=WMS&request=GetMap&version=1.1.1&layers=mumi:worldcloudmap_ir108` +
    `&styles=&format=image/png&transparent=false&srs=EPSG:4326&bbox=${b}&width=${IMG}&height=${IMG}&_=${Math.floor(Date.now() / TTL)}`;
}

let _canvas = null;
let _ctx = null;
let _cacheData = null;
let _cacheTime = 0;
let _loadingPromise = null;

function getCtx() {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = IMG;
    _canvas.height = IMG;
    _ctx = _canvas.getContext('2d', { willReadFrequently: true });
  }
  return _ctx;
}

function loadCloudData() {
  const now = Date.now();
  if (_cacheData && now - _cacheTime < TTL) return Promise.resolve(_cacheData);
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const ctx = getCtx();
        ctx.clearRect(0, 0, IMG, IMG);
        ctx.drawImage(img, 0, 0, IMG, IMG);
        _cacheData = ctx.getImageData(0, 0, IMG, IMG).data;
        _cacheTime = Date.now();
        resolve(_cacheData);
      } catch {
        resolve(null);
      } finally {
        _loadingPromise = null;
      }
    };
    img.onerror = () => { _loadingPromise = null; resolve(null); };
    img.src = mapUrl();
  });
  return _loadingPromise;
}

/**
 * يرجع المقاطعات التي فوقها قمم سحب عميقة (حمل حراري) الآن.
 * @returns Array<{ city, wilaya, coldness, level }>
 */
export async function getDeepCloudsFromEumetsat(cities) {
  if (!cities || cities.length === 0) return [];
  const data = await loadCloudData();
  if (!data) return [];

  const out = [];
  for (const c of cities) {
    const lat = c.latitude ?? c.lat;
    const lon = c.longitude ?? c.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) continue;

    const cx = Math.round(((lon - BBOX.lonMin) / (BBOX.lonMax - BBOX.lonMin)) * (IMG - 1));
    const cy = Math.round(((BBOX.latMax - lat) / (BBOX.latMax - BBOX.latMin)) * (IMG - 1));

    // أعلى قيمة (أبرد قمة) ضمن نصف قطر ~3 بكسل (~6كم)
    let maxv = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || xx >= IMG || yy < 0 || yy >= IMG) continue;
        const v = data[(yy * IMG + xx) * 4]; // رمادي → القناة الحمراء كافية
        if (v > maxv) maxv = v;
      }
    }

    if (maxv >= DEEP) {
      out.push({
        city: c.city,
        wilaya: c.wilaya || '',
        lat,
        lon,
        coldness: maxv,
        level: maxv >= VERY_DEEP ? 'very_deep' : 'deep',
        // شدّة تقديرية من برودة القمة (لتغذية المتتبّع والتصنيف)
        mmh: maxv >= VERY_DEEP ? 22 : maxv >= 115 ? 10 : 4,
      });
    }
  }

  return out.sort((a, b) => b.coldness - a.coldness);
}
