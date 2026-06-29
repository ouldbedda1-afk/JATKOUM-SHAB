// Supabase Edge Function: check-and-push
// مُجدوِل خادمي: يفحص رادار RainViewer + كود الطقس دورياً (بلا حاجة لزائر)،
// ويُطلق إشعاراً عاجلاً عبر دالة send-push عند رصد برق/أمطار مؤكدة.
//
// النشر:   supabase functions deploy check-and-push
// الجدولة (كل 10 دقائق) عبر pg_cron — انظر WEB_PUSH_SETUP.md
//
// لا يحتاج أسراراً إضافية: يستخدم SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// المتوفّرين تلقائياً، ويستدعي send-push التي تتكفّل بمنع التكرار.

import UPNG from 'https://esm.sh/upng-js@2.1.0';

const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json';
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

// مقاطعات تمثيلية (الجنوب والوسط حيث تتركّز الأمطار) — name, lat, lon
const CITIES: { city: string; lat: number; lon: number; wilaya: string }[] = [
  { city: 'نواكشوط', lat: 18.0735, lon: -15.9582, wilaya: 'نواكشوط' },
  { city: 'روصو', lat: 17.5333, lon: -14.3333, wilaya: 'الترارزة' },
  { city: 'بوتلميت', lat: 17.51, lon: -14.76, wilaya: 'الترارزة' },
  { city: 'ألاك', lat: 17.05, lon: -13.91, wilaya: 'البراكنة' },
  { city: 'بوكي', lat: 16.58, lon: -14.26, wilaya: 'البراكنة' },
  { city: 'كيهيدي', lat: 16.15, lon: -13.50, wilaya: 'كوركول' },
  { city: 'مقامة', lat: 15.51, lon: -12.85, wilaya: 'كوركول' },
  { city: 'سيلبابي', lat: 15.15, lon: -12.18, wilaya: 'كيدماغا' },
  { city: 'غابو', lat: 15.33, lon: -12.57, wilaya: 'كيدماغا' },
  { city: 'كيفة', lat: 16.61, lon: -11.40, wilaya: 'العصابة' },
  { city: 'كنكوصة', lat: 15.93, lon: -11.53, wilaya: 'الحوض الغربي' },
  { city: 'لعيون', lat: 16.66, lon: -9.61, wilaya: 'الحوض الغربي' },
  { city: 'كوبني', lat: 15.93, lon: -11.21, wilaya: 'الحوض الغربي' },
  { city: 'النعمة', lat: 16.61, lon: -7.25, wilaya: 'الحوض الشرقي' },
  { city: 'تمبدغة', lat: 16.2421, lon: -8.1721, wilaya: 'الحوض الشرقي' },
  { city: 'عدل بكرو', lat: 15.6755, lon: -7.0216, wilaya: 'الحوض الشرقي' },
  { city: 'كيفه', lat: 18.55, lon: -11.43, wilaya: 'تكانت' },
  { city: 'أطار', lat: 20.51, lon: -13.05, wilaya: 'آدرار' },
  { city: 'أكجوجت', lat: 19.75, lon: -14.41, wilaya: 'انشيري' },
  { city: 'نواذيبو', lat: 20.9375, lon: -17.0339, wilaya: 'داخلة نواذيبو' },
];

function latLonToTile(lat: number, lon: number, zoom = 4) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const y = Math.floor(yf);
  const px = Math.floor((((lon + 180) / 360) * n - x) * 256);
  const py = Math.floor((yf - y) * 256);
  return { x, y, px, py, zoom };
}

function colorToMmh(r: number, g: number, b: number, a: number): number {
  if (a < 40) return 0;
  if (r > 190 && g < 90 && b < 110) return 50;
  if (r > 190 && g > 90 && b < 90) return 20;
  if (r > 160 && g > 160 && b < 110) return 8;
  if (g > 120 && g > r && b < 140) return 2;
  if (b > 120 && b >= g) return 0.5;
  if (a >= 80 && (r + g + b) > 60) return 1;
  return 0;
}

const tileCache = new Map<string, Uint8Array | null>();

async function getTileRGBA(host: string, path: string, x: number, y: number): Promise<Uint8Array | null> {
  const key = `${path}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;
  try {
    const url = `https://${host}${path}/256/4/${x}/${y}/4/1_1.png`;
    const res = await fetch(url);
    if (!res.ok) { tileCache.set(key, null); return null; }
    const buf = new Uint8Array(await res.arrayBuffer());
    const img: any = UPNG.decode(buf);
    const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
    tileCache.set(key, rgba);
    return rgba;
  } catch {
    tileCache.set(key, null);
    return null;
  }
}

async function detectRainCities(host: string, path: string) {
  const out: string[] = [];
  for (const c of CITIES) {
    const { x, y, px, py } = latLonToTile(c.lat, c.lon, 4);
    const rgba = await getTileRGBA(host, path, x, y);
    if (!rgba) continue;
    // مسح منطقة محيطة (±3 بكسل) وأخذ أعلى شدة — يلتقط الخلايا القريبة/المتّجهة
    const radius = 3;
    let maxMmh = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const sx = px + dx, sy = py + dy;
        if (sx < 0 || sx > 255 || sy < 0 || sy > 255) continue;
        const idx = (sy * 256 + sx) * 4;
        const mmh = colorToMmh(rgba[idx], rgba[idx + 1], rgba[idx + 2], rgba[idx + 3]);
        if (mmh > maxMmh) maxMmh = mmh;
      }
    }
    if (maxMmh >= 0.5) out.push(c.city);
  }
  return out;
}

async function getThunderCodes(): Promise<Set<string>> {
  // طلب واحد مجمّع لكل المدن: weather_code الحالي
  const lats = CITIES.map((c) => c.lat).join(',');
  const lons = CITIES.map((c) => c.lon).join(',');
  const url = `${OPEN_METEO}?latitude=${lats}&longitude=${lons}&current=weather_code&timezone=Africa%2FNouakchott`;
  const thunder = new Set<string>();
  try {
    const res = await fetch(url);
    if (!res.ok) return thunder;
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data];
    arr.forEach((entry: any, i: number) => {
      const code = entry?.current?.weather_code ?? 0;
      if (code >= 95 && CITIES[i]) thunder.add(CITIES[i].city);
    });
  } catch { /* تجاهل */ }
  return thunder;
}

Deno.serve(async () => {
  try {
    const meta = await fetch(RAINVIEWER_API).then((r) => r.json());
    const frames = meta?.radar?.past;
    if (!frames?.length) return json({ ok: false, reason: 'no radar frames' });
    const latest = frames[frames.length - 1];

    const [rainCitiesAll, thunderSet] = await Promise.all([
      detectRainCities(meta.host, latest.path),
      getThunderCodes(),
    ]);

    const thunderCities = rainCitiesAll.filter((c) => thunderSet.has(c));
    const rainCities = rainCitiesAll.filter((c) => !thunderSet.has(c));

    // إشعارات العواصف موقوفة — الإشعارات مخصصة الآن للتوقعات فقط
    const detected = thunderCities.length > 0 || rainCities.length > 0;
    return json({ ok: true, detected, thunderCities, rainCities, pushed: false });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
