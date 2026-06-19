import { mauritaniaCommunes } from './mauritaniaCommunes';

/**
 * Weather API Service - Open-Meteo
 * محسّن لمنع خطأ 429 (Too Many Requests)
 */

const OPEN_METEO_API = import.meta.env.VITE_OPENMETEO_API || 'https://api.open-meteo.com/v1/forecast';
const MARINE_API = import.meta.env.VITE_MARINE_API_URL || 'https://marine-api.open-meteo.com/v1/marine';
const NASA_EONET_API = import.meta.env.VITE_NASA_API_URL || 'https://eonet.gsfc.nasa.gov/api/v3/events';const WEATHERAPI_KEY = import.meta.env.VITE_WEATHERAPI_KEY || ''; // WeatherAPI.com كـ fallback provider
// إذا حُدِّد Proxy في بيئة البناء، استخدمه لتجميع الطلبات وتقليل 429.
// بخلاف ذلك، اتصل مباشرةً بـ Open-Meteo.
const PROXY_URL = import.meta.env.VITE_PROXY_URL && !import.meta.env.VITE_PROXY_URL.includes('example.workers.dev') 
  ? import.meta.env.VITE_PROXY_URL.replace(/\/$/, '') 
  : '';

function buildProxyTarget(sourceUrl) {
  if (!PROXY_URL) return sourceUrl;
  return `${PROXY_URL}/proxy?url=${encodeURIComponent(sourceUrl)}`;
}

// --- Cache في الذاكرة (يُمسح عند إعادة التحميل) ---
const memoryCache = new Map();

// --- Cache دائم في localStorage (يبقى بعد إعادة التحميل) ---
const LS_PREFIX = 'wx_cache_';
const DAILY_LIMIT_KEY = `${LS_PREFIX}daily_limit_blocked`;
const CACHE_DURATION = 5 * 60 * 1000; // تقليل المدة إلى 5 دقائق لرصد العواصف والرياح فوراً
const STALE_DURATION = 24 * 60 * 60 * 1000; // إمكانية استخدام بيانات قديمة لمدة يوم عند تعطل الـ API

function isDailyLimitBlocked() {
  try {
    const ts = Number(localStorage.getItem(DAILY_LIMIT_KEY));
    return ts && (Date.now() - ts) < DAILY_LIMIT_RECOVERY_TIME;
  } catch {
    return false;
  }
}

function markDailyLimitBlocked() {
  try {
    localStorage.setItem(DAILY_LIMIT_KEY, String(Date.now()));
  } catch {}
}

function clearDailyLimitBlock() {
  try {
    localStorage.removeItem(DAILY_LIMIT_KEY);
  } catch {}
}

// --- حماية من الطلبات المتزامنة المتعددة لنفس المفتاح ---
const pendingRequests = new Map();

// --- Circuit Breaker - حماية عند تكرار 429 ---
let isCircuitOpen = false;
let circuitOpenTime = 0;
let currentCircuitDuration = 5 * 60 * 1000;
const CIRCUIT_RECOVERY_TIME = 5 * 60 * 1000; // زيادة مدة الانتظار إلى 5 دقائق عند الحظر
const DAILY_LIMIT_RECOVERY_TIME = 24 * 60 * 60 * 1000;

function checkCircuit() {
  if (isDailyLimitBlocked()) {
    return false;
  }

  if (isCircuitOpen) {
    if (Date.now() - circuitOpenTime > currentCircuitDuration) {
      isCircuitOpen = false;
      clearDailyLimitBlock();
      console.log('🔄 Circuit Breaker: محاولة إعادة الاتصال...');
      return true;
    }
    return false;
  }
  return true;
}

function openCircuit(durationMs = CIRCUIT_RECOVERY_TIME) {
  isCircuitOpen = true;
  circuitOpenTime = Date.now();
  currentCircuitDuration = durationMs;
  if (durationMs === DAILY_LIMIT_RECOVERY_TIME) {
    markDailyLimitBlocked();
  }
  const minutes = Math.round(durationMs / 60000);
  console.error(`🚫 Circuit Breaker: تم تفعيل وضع الحماية بسبب تجاوز حد الطلبات. سيتم إيقاف الطلبات لمدة ${minutes} دقيقة${minutes === 1 ? '' : 'ات'}.`);
}

function isDailyLimitMessage(message) {
  return /Daily API request limit exceeded|request limit exceeded|too many requests/i.test(message);
}

function lsGet(key, allowStale = false) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    
    const age = Date.now() - timestamp;
    if (age < CACHE_DURATION) return data;
    
    // إذا كانت البيانات "قديمة" ولكن مسموح بها (عند فشل الـ API)
    if (allowStale && age < STALE_DURATION) {
      console.warn(`📜 استخدام بيانات قديمة لـ ${key} (عمرها: ${Math.round(age/60000)} دقيقة)`);
      return data;
    }
    
    if (age >= STALE_DURATION) {
      localStorage.removeItem(LS_PREFIX + key);
    }
  } catch {}
  return null;
}

function lsSet(key, data) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    // localStorage ممتلئ — نمسح البيانات القديمة
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(LS_PREFIX))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {}
  }
}

function isValidWeatherData(data) {
  // ترفض البيانات الصفرية أو الـ fallback
  if (!data) return false;
  if (Array.isArray(data)) {
    return data.length > 0 && data.some(d => d?.current?.temperature_2m != null && !d.isFallback);
  }
  return !data.isFallback && data?.current?.temperature_2m != null;
}

function getCached(key, allowStale = false) {
  // 1) ذاكرة سريعة أولاً
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < CACHE_DURATION && isValidWeatherData(mem.data)) return mem.data;
  // 2) localStorage ثانياً
  const ls = lsGet(key, allowStale);
  if (ls && isValidWeatherData(ls)) return ls;
  return null;
}

function setCached(key, data) {
  memoryCache.set(key, { data, timestamp: Date.now() });
  lsSet(key, data);
}

/**
 * مسح كافة بيانات التخزين المؤقت للطقس
 */
export function clearWeatherCache() {
  memoryCache.clear();
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .forEach(k => localStorage.removeItem(k));
    console.log('🧹 تم مسح ذاكرة التخزين المؤقت للطقس بنجاح');
  } catch (e) {
    console.error('❌ فشل مسح ذاكرة التخزين المؤقت:', e);
  }
}

// --- Global Request Manager ---
let lastRequestTime = 0;
const MIN_REQUEST_GAP = 2000; // فجوة 2 ثانية بين الطلبات

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_GAP) {
    const wait = MIN_REQUEST_GAP - timeSinceLast;
    await new Promise(r => setTimeout(r, wait));
  }
  lastRequestTime = Date.now();
}

// --- Simple concurrency limiter to avoid burst requests ---
let concurrentRequests = 0;
const MAX_CONCURRENT_REQUESTS = 1; // طلب واحد في كل مرة لتفادي 429
const requestQueue = [];

function acquireSlot() {
  if (concurrentRequests < MAX_CONCURRENT_REQUESTS) {
    concurrentRequests++;
    return Promise.resolve();
  }
  return new Promise(resolve => requestQueue.push(resolve));
}

function releaseSlot() {
  concurrentRequests = Math.max(0, concurrentRequests - 1);
  if (requestQueue.length > 0) {
    const next = requestQueue.shift();
    concurrentRequests++;
    next();
  }
}

async function enqueueFetch(url, options) {
  await acquireSlot();
  try {
    return await fetchWithRetry(url, options);
  } finally {
    releaseSlot();
  }
}

/**
 * fetch مع إعادة المحاولة التدريجية عند 429
 */
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 3000) {
  if (!checkCircuit()) {
    throw new Error('Too Many Requests (Circuit Open)');
  }

  // انتظار الفجوة الزمنية قبل كل طلب (إلا إذا كان طلباً لناسا مثلاً)
  if (url.includes('open-meteo.com')) {
    await waitForRateLimit();
  }

  try {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const bodyText = await response.text();
      const parsedMessage = (() => {
        try {
          const json = JSON.parse(bodyText);
          return json.reason || json.error || bodyText;
        } catch {
          return bodyText;
        }
      })();

      const isDailyLimit = isDailyLimitMessage(parsedMessage);
      if (isDailyLimit) {
        openCircuit(DAILY_LIMIT_RECOVERY_TIME);
        throw new Error('Daily API request limit exceeded');
      }

      // Respect Retry-After header if present
      const ra = response.headers && response.headers.get ? response.headers.get('Retry-After') : null;
      if (ra) {
        const raMs = Number(ra) * 1000 || backoff;
        console.warn(`⚠️ 429 — Retry-After header: ${ra}s, waiting ${raMs}ms`);
        await new Promise(r => setTimeout(r, raMs + Math.random() * 1000));
      }

      if (retries > 0) {
        const wait = backoff + Math.random() * 1000;
        console.warn(`⚠️ 429 — إعادة المحاولة بعد ${Math.round(wait)}ms (${retries} محاولات متبقية)`);
        await new Promise(r => setTimeout(r, wait));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      } else {
        openCircuit();
        throw new Error('API error: Too Many Requests');
      }
    }

    return response;
  } catch (error) {
    if (error.message && error.message.includes('Too Many Requests')) throw error;

    if (retries > 0) {
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

// جميع مقاطعات وبلديات موريتانيا الـ 56 مقاطعة مع أهم البلديات
const manualMauritanianCities = {
  // --- نواكشوط (3 ولايات منذ 2014) ---
  'نواكشوط': { lat: 18.0735, lon: -15.9582, name: 'Nouakchott', type: 'عاصمة', wilaya: 'نواكشوط' },
  'درنعيم': { lat: 18.1270, lon: -15.9420, name: 'Dar Naim', type: 'مقاطعة', wilaya: 'نواكشوط الشمالية' },
  'تيارت': { lat: 18.0930, lon: -15.9770, name: 'Teyarett', type: 'مقاطعة', wilaya: 'نواكشوط الشمالية' },
  'توجنين': { lat: 18.1100, lon: -15.9200, name: 'Toujounine', type: 'مقاطعة', wilaya: 'نواكشوط الشمالية' },
  'تفرغ زينة': { lat: 18.0800, lon: -16.0100, name: 'Tevragh Zeina', type: 'مقاطعة', wilaya: 'نواكشوط الغربية' },
  'السبخة': { lat: 18.0600, lon: -15.9900, name: 'Sebkha', type: 'مقاطعة', wilaya: 'نواكشوط الغربية' },
  'عرفات': { lat: 17.9900, lon: -15.9450, name: 'Arafat', type: 'مقاطعة', wilaya: 'نواكشوط الجنوبية' },
  'المينة': { lat: 18.0100, lon: -15.9700, name: 'El Mina', type: 'مقاطعة', wilaya: 'نواكشوط الجنوبية' },

  // --- الترارزة ---
  'روصو': { lat: 17.5333, lon: -14.3333, name: 'Rosso', type: 'مقاطعة', wilaya: 'الترارزة' },
  'بوتلميت': { lat: 17.51, lon: -14.76, name: 'Boutilimit', type: 'مقاطعة', wilaya: 'الترارزة' },
  'كرمسين': { lat: 16.48, lon: -16.21, name: 'Keur Macène', type: 'مقاطعة', wilaya: 'الترارزة' },
  'المذرذرة': { lat: 16.91, lon: -15.65, name: 'Mederdra', type: 'مقاطعة', wilaya: 'الترارزة' },
  'واد الناقة': { lat: 17.91, lon: -15.31, name: 'Ouad Naga', type: 'مقاطعة', wilaya: 'الترارزة' },
  'اركيز': { lat: 16.91, lon: -15.28, name: 'Rkiz', type: 'مقاطعة', wilaya: 'الترارزة' },

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
  'ونبو': { lat: 15.45, lon: -12.08, name: 'Wompou', type: 'بلدية', wilaya: 'كيدماغا' },
  'لعبلي': { lat: 15.318161600485181, lon: -11.79565738869597, name: 'Labli', type: 'بلدية', wilaya: 'كيدماغا' },

  // --- العصابة ---
  'كيفة': { lat: 16.61, lon: -11.40, name: 'Kiffa', type: 'مقاطعة', wilaya: 'العصابة' },
  'باركيول': { lat: 16.63, lon: -12.50, name: 'Barkéol', type: 'مقاطعة', wilaya: 'العصابة' },
  'كرو': { lat: 16.81, lon: -11.83, name: 'Guerou', type: 'مقاطعة', wilaya: 'العصابة' },
  'بومديد': { lat: 16.38, lon: -10.03, name: 'Boumdeid', type: 'مقاطعة', wilaya: 'العصابة' },
  'تناها': { lat: 15.121604003909406, lon: -10.899006284648546, name: 'Tenaha', type: 'بلدية', wilaya: 'العصابة' },
  'هامد': { lat: 15.633125821113623, lon: -11.516237907118896, name: 'Hamed', type: 'مركز إداري', wilaya: 'العصابة' },

  // --- الحوض الغربي ---
  'لعيون': { lat: 16.66, lon: -9.61, name: 'Aioun', type: 'مقاطعة', wilaya: 'الحوض الغربي' },
  'كنكوصة': { lat: 15.93, lon: -11.53, name: 'Kankossa', type: 'مقاطعة', wilaya: 'العصابة' },
  'تمشكط': { lat: 17.42, lon: -10.67, name: 'Tamchekett', type: 'مقاطعة', wilaya: 'الحوض الغربي' },
  'كوبني': { lat: 15.93, lon: -11.21, name: 'Kobenni', type: 'مقاطعة', wilaya: 'الحوض الغربي' },
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
  'شنقيط': { lat: 20.45, lon: -12.35, name: 'Chinguetti', type: 'مقاطعة', wilaya: 'آدرار' },
  'وادان': { lat: 20.93, lon: -11.61, name: 'Ouadane', type: 'مقاطعة', wilaya: 'آدرار' },
  'اوجفت': { lat: 20.25, lon: -13.58, name: 'Aoujeft', type: 'مقاطعة', wilaya: 'آدرار' },

  // --- انشيري ---
  'أكجوجت': { lat: 19.75, lon: -14.41, name: 'Akjoujt', type: 'مقاطعة', wilaya: 'انشيري' },
  'بنيشاب': { lat: 21.83, lon: -14.52, name: 'Bennichab', type: 'بلدية', wilaya: 'انشيري' },

  // --- داخلة نواذيبو ---
  'نواذيبو': { lat: 20.9375, lon: -17.0339, name: 'Nouadhibou', type: 'مقاطعة', wilaya: 'داخلة نواذيبو' },

  // --- تيرس زمور ---
  'زويرات': { lat: 22.71, lon: -12.47, name: 'Zouérat', type: 'مقاطعة', wilaya: 'تيرس زمور' },
  'بير أم اكرين': { lat: 25.22, lon: -11.58, name: 'Bir Moghrein', type: 'مقاطعة', wilaya: 'تيرس زمور' },
  'فديريك': { lat: 22.68, lon: -12.72, name: 'Fdérik', type: 'مقاطعة', wilaya: 'تيرس زمور' },
};

const mauritanianCities = {
  ...mauritaniaCommunes,
  ...manualMauritanianCities,
};

/**
 * البحث عن مدينة في القائمة المحلية
 */
export async function searchCities(query) {
  if (!query) return [];
  const normalizedQuery = query.toLowerCase().trim();
  
  return Object.entries(mauritanianCities)
    .filter(([name, data]) => 
      name.toLowerCase().includes(normalizedQuery) || 
      data.name.toLowerCase().includes(normalizedQuery)
    )
    .map(([name, data]) => ({
      name,
      ...data
    }));
}

/**
 * رصد "الأمطار الآن" حسب نموذج Open-Meteo (مصدر داعم للرادار).
 * يعتمد على current.precipitation و weather_code الحاليين.
 * تُوسَم النتائج بـ source: 'model' لتمييزها عن الرصد الراداري المؤكد.
 *
 * أكواد WMO: 51-57 رذاذ، 61-67 مطر، 80-82 زخات، 95-99 رعدية.
 */
export function getModelRainingNow(weatherData) {
  if (!weatherData || weatherData.length === 0) return [];

  const out = [];
  weatherData.forEach((c) => {
    const code = c.current?.weather_code ?? 0;
    const precip = c.current?.precipitation ?? 0;

    const isThunder = code >= 95;
    const isRainCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || isThunder;
    const isRaining = precip > 0.1 || isRainCode;
    if (!isRaining) return;

    let mmh = precip > 0 ? precip : 0.5;
    let label;
    if (isThunder) label = 'رعدية';
    else if (mmh >= 20 || code === 65 || code === 82) label = 'غزير';
    else if (mmh >= 8 || code === 63 || code === 81) label = 'متوسط';
    else if (mmh >= 2 || code === 61 || code === 80) label = 'خفيف';
    else label = 'رذاذ';

    out.push({
      city: c.city,
      wilaya: c.wilaya || '',
      mmh: Math.round(mmh * 10) / 10,
      label,
      code,
      isThunder,
      source: 'model',
    });
  });

  return out.sort((a, b) => b.mmh - a.mmh);
}

/**
 * جلب البيانات من WeatherAPI.com كـ fallback provider
 * تحويل الاستجابة إلى صيغة مشابهة للـ Open-Meteo للتوافقية
 */
async function fetchFromWeatherAPI(lat, lon, cityName = '') {
  if (!WEATHERAPI_KEY) throw new Error('WeatherAPI key not configured');
  
  try {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${lat},${lon}&days=7&aqi=no`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`WeatherAPI error: ${response.status}`);
    }

    const data = await response.json();
    const current = data.current;
    const forecast = data.forecast;

    // تحويل إلى صيغة Open-Meteo
    const result = {
      latitude: lat,
      longitude: lon,
      timezone: data.location.tz_id,
      current: {
        temperature_2m: current.temp_c,
        weather_code: current.condition.code, // WeatherAPI code
        wind_speed_10m: current.wind_kph,
        wind_direction_10m: current.wind_degree,
        relative_humidity_2m: current.humidity,
        pressure_msl: current.pressure_mb,
        precipitation: current.precip_mm ?? 0,
      },
      hourly: {
        time: [],
        temperature_2m: [],
        precipitation_probability: [],
        wind_speed_10m: [],
        wind_direction_10m: [],
        weather_code: [],
      },
      daily: {
        time: [],
        weather_code: [],
        temperature_2m_max: [],
        temperature_2m_min: [],
        precipitation_sum: [],
        wind_speed_10m_max: [],
      }
    };

    // ملء البيانات اليومية من التوقع
    if (forecast && forecast.forecastday) {
      forecast.forecastday.forEach((day) => {
        result.daily.time.push(day.date);
        result.daily.weather_code.push(day.day.condition.code);
        result.daily.temperature_2m_max.push(day.day.maxtemp_c);
        result.daily.temperature_2m_min.push(day.day.mintemp_c);
        result.daily.precipitation_sum.push(day.day.totalprecip_mm);
        result.daily.wind_speed_10m_max.push(day.day.maxwind_kph);

        (day.hour || []).forEach((hour) => {
          result.hourly.time.push(hour.time);
          result.hourly.temperature_2m.push(hour.temp_c);
          result.hourly.precipitation_probability.push(hour.chance_of_rain ?? 0);
          result.hourly.wind_speed_10m.push(hour.wind_kph);
          result.hourly.wind_direction_10m.push(hour.wind_degree);
          result.hourly.weather_code.push(hour.condition.code);
        });
      });
    }

    return result;
  } catch (error) {
    console.warn('⚠️ WeatherAPI fetch failed:', error.message);
    throw error;
  }
}

function getCardinalDirection(fromLat, fromLon, toLat, toLon) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLon = toRad(toLon - fromLon);
  const y = Math.sin(dLon) * Math.cos(toRad(toLat));
  const x =
    Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLon);
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

  if (degrees >= 337.5 || degrees < 22.5) return 'شمال';
  if (degrees < 67.5) return 'شمال شرقي';
  if (degrees < 112.5) return 'شرق';
  if (degrees < 157.5) return 'جنوب شرقي';
  if (degrees < 202.5) return 'جنوب';
  if (degrees < 247.5) return 'جنوب غربي';
  if (degrees < 292.5) return 'غرب';
  return 'شمال غربي';
}

export async function getActiveFires() {
  const cacheKey = 'active_fires';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // منع الطلبات المتزامنة
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

  const promise = (async () => {
    try {
      const nasaUrl = `${NASA_EONET_API}?category=wildfires&status=open`;
      const target = buildProxyTarget(nasaUrl);
      const response = await enqueueFetch(target);
      if (!response.ok) throw new Error('Failed to fetch fires');

      const data = await response.json();
      const mauritaniaFires = [];
      const MR_BOUNDS = { minLat: 14.7, maxLat: 27.5, minLon: -17.1, maxLon: -4.8 };

      if (data.events) {
        for (const event of data.events) {
          if (event.geometry) {
            for (const geo of event.geometry) {
              const [lon, lat] = geo.coordinates;
              if (lat >= MR_BOUNDS.minLat && lat <= MR_BOUNDS.maxLat &&
                lon >= MR_BOUNDS.minLon && lon <= MR_BOUNDS.maxLon) {

                let nearestCity = 'نواكشوط';
                let minDistance = Infinity;
                for (const [name, coords] of Object.entries(mauritanianCities)) {
                  const dist = Math.sqrt(Math.pow(lat - coords.lat, 2) + Math.pow(lon - coords.lon, 2));
                  if (dist < minDistance) { minDistance = dist; nearestCity = name; }
                }

                if (minDistance < 2.0) {
                  const cityCoords = mauritanianCities[nearestCity];
                  mauritaniaFires.push({
                    id: event.id, title: event.title, lat, lon, nearestCity,
                    direction: getCardinalDirection(cityCoords.lat, cityCoords.lon, lat, lon),
                    distanceKm: Math.round(minDistance * 111),
                    date: geo.date
                  });
                }
              }
            }
          }
        }
      }

      setCached(cacheKey, mauritaniaFires);
      return mauritaniaFires;
    } catch (error) {
      console.error('Error fetching fires:', error);
      return [];
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

export async function getWeatherData(city = 'نواكشوط', customCoords = null, { forecastDays = 7 } = {}) {
  // تقريب الإحداثيات لمنع طلبات مكررة بسبب فروقات بسيطة جداً في الموقع
  const lat = customCoords ? Math.round(customCoords.lat * 100) / 100 : null; // تقليل الدقة لزيادة فرصة الـ Cache
  const lon = customCoords ? Math.round(customCoords.lon * 100) / 100 : null;
  
  // نُضمّن عدد الأيام في المفتاح حتى لا تُخلط بيانات 7 أيام مع 14 يوم
  const daysSuffix = forecastDays > 7 ? `_d${forecastDays}` : '';
  const cacheKey = (customCoords ? `coord_${lat}_${lon}` : `city_${city}`) + daysSuffix;

  const allowStale = isCircuitOpen || isDailyLimitBlocked();
  const cached = getCached(cacheKey, allowStale);
  if (cached) return cached;

  if (allowStale) {
    const stale = getCached(cacheKey, true);
    if (stale) return stale;
    return buildFallbackWeather(city, customCoords || mauritanianCities[city] || { lat: null, lon: null, name: city, type: 'مدينة' });
  }

  // منع الطلبات المتزامنة لنفس المفتاح
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

  const promise = (async () => {
    try {
      const coords = customCoords || mauritanianCities[city];
      if (!coords) throw new Error(`مدينة غير معروفة: ${city}`);

      const params = new URLSearchParams({
        latitude: coords.lat,
        longitude: coords.lon,
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,pressure_msl,precipitation',
        hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
        timezone: 'Africa/Nouakchott',
        temperature_unit: 'celsius',
        forecast_days: forecastDays,
      });

      const sourceUrl = `${OPEN_METEO_API}?${params}`;
      const target = buildProxyTarget(sourceUrl);
      const response = await enqueueFetch(target);
      if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText || ''}`);

      const data = await response.json();
      const result = {
        city,
        cityEn: coords.name,
        cityType: coords.type || 'مدينة',
        ...data,
      };

      if (result && result.current) {
        setCached(cacheKey, result);
      }
      return result;
    } catch (error) {
      console.error('Error fetching weather from Open-Meteo:', error);
      const isDailyLimitError = error.message && error.message.includes('Daily API request limit exceeded');
      const isTooManyRequests = error.message && error.message.includes('Too Many Requests');
      
      // إذا كان الخطأ بسبب daily limit، حاول WeatherAPI كـ fallback
      if ((isDailyLimitError || isTooManyRequests || isDailyLimitBlocked()) && WEATHERAPI_KEY) {
        try {
          console.log(`🔄 Attempting WeatherAPI fallback for ${city}...`);
          const coords = customCoords || mauritanianCities[city];
          const weatherAPIData = await fetchFromWeatherAPI(coords.lat, coords.lon, city);
          const result = {
            city,
            cityEn: coords.name,
            cityType: coords.type || 'مدينة',
            source: 'weatherapi',
            ...weatherAPIData,
          };
          setCached(cacheKey, result);
          return result;
        } catch (weatherAPIError) {
          console.warn('⚠️ WeatherAPI fallback also failed:', weatherAPIError.message);
          // Fall through to cache/fallback logic
        }
      }
      
      // Last resort: use cached/fallback data
      const staleFallback = getCached(cacheKey, true);
      if (staleFallback) {
        console.warn(`📜 Using stale weather data for ${city} due to API failure`);
        return staleFallback;
      }
      return buildFallbackWeather(city, customCoords || mauritanianCities[city] || { lat: null, lon: null, name: city, type: 'مدينة' });
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

export async function getAllCitiesWeather() {
  // جميع مقاطعات موريتانيا الـ 56 + أهم البلديات
  const mainCities = [
    // نواكشوط
    'نواكشوط',
    // الترارزة
    'روصو', 'بوتلميت', 'كرمسين', 'المذرذرة', 'واد الناقة', 'اركيز',
    // البراكنة
    'ألاك', 'بابابى', 'بوكي', 'مقاطع لحجار', 'امباني', 'صنكرافه',
    // كوركول
    'كيهيدي', 'امبود', 'مقامة', 'مونغل',
    // كيدماغا
    'سيلبابي', 'ولد ينج', 'غابو', 'ونبو', 'لعبلي',
    // العصابة
    'كيفة', 'باركيول', 'كرو', 'بومديد', 'تناها', 'هامد',
    // الحوض الغربي
    'لعيون', 'كنكوصة', 'تمشكط', 'كوبني', 'الطينطان',
    // الحوض الشرقي
    'النعمة', 'تمبدغة', 'باسكنو', 'جيكني', 'امرج', 'ولاته',
    'فصاله', 'عدل بكرو', 'انبيكت لحواش', 'افيرني', 'اعوينات ازبل', 'بوسطيله',
    // تكانت
    'تجكجة', 'تيشيت', 'موجريه',
    // آدرار
    'أطار', 'شنقيط', 'وادان', 'اوجفت',
    // انشيري
    'أكجوجت', 'بنيشاب',
    // داخلة نواذيبو
    'نواذيبو',
    // تيرس زمور
    'زويرات', 'بير أم اكرين', 'فديريك',
  ];

  const cacheKey = 'all_cities_weather';

  // Cache أولاً (يشمل localStorage لمنع إعادة الجلب بعد تحديث الصفحة)
  const cached = getCached(cacheKey, isCircuitOpen);
  if (cached) {
    console.log('✅ بيانات المدن من الـ cache');
    return cached;
  }

  if (isCircuitOpen || isDailyLimitBlocked()) {
    return lsGet(cacheKey, true) || getFallbackCitiesWeather(mainCities);
  }

  // منع الطلبات المتزامنة لنفس المفتاح
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

  const promise = (async () => {
    try {
      // طلب واحد لكل المدن دفعةً واحدة (batch)
      const lats = mainCities.map(c => mauritanianCities[c].lat).join(',');
      const lons = mainCities.map(c => mauritanianCities[c].lon).join(',');

      const params = new URLSearchParams({
        latitude: lats,
        longitude: lons,
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,pressure_msl,precipitation',
        hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
        timezone: 'Africa/Nouakchott',
        forecast_days: 7,
      });

      const sourceUrl = `${OPEN_METEO_API}?${params}`;
      const target = buildProxyTarget(sourceUrl);
      const response = await enqueueFetch(target);
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText || ''}`);
      }

      const data = await response.json();
      const dataItems = Array.isArray(data) ? data : [data];

      // إذا كانت الاستجابة غير متوقعة، نجرب الاسترجاع بالمدينة الواحدة
      if (dataItems.length !== mainCities.length || dataItems.some(item => !item.current)) {
        throw new Error('Invalid batch weather response');
      }

      const results = dataItems.map((item, index) => {
        const cityName = mainCities[index];
        const coords = mauritanianCities[cityName];
        return {
          city: cityName,
          cityEn: coords.name,
          cityType: coords.type || 'مقاطعة',
          ...item
        };
      });

      if (results.length > 0) {
        setCached(cacheKey, results);
        lsSet(cacheKey + '_stale', results);
      }
      return results;
    } catch (error) {
      console.warn('Batch weather request failed:', error.message);
      const isDailyLimitError = error.message && (
        error.message.includes('Daily API request limit exceeded') ||
        error.message.includes('Too Many Requests') ||
        isDailyLimitBlocked()
      );

      if (isDailyLimitError) {
        console.log('🚫 Daily limit hit, using stale/fallback data');
        const cachedFallback = lsGet(cacheKey, true) || lsGet(cacheKey + '_stale');
        if (cachedFallback) {
          console.log(`✅ Returning cached weather for ${mainCities.length} cities`);
          return cachedFallback;
        }
        return getFallbackCitiesWeather(mainCities);
      }

      // Non-daily-limit error: try individual city fetches
      console.log('⚠️ Batch failed, trying individual cities via fallback logic...');
      
      const results = [];
      for (const cityName of mainCities) {
        try {
          const cityData = await getWeatherData(cityName);
          results.push(cityData);
        } catch (err) {
          console.warn(`Failed to fetch weather for ${cityName}:`, err.message);
          results.push(buildFallbackWeather(cityName, mauritanianCities[cityName]));
        }
        await new Promise(r => setTimeout(r, 200)); // pause بين الطلبات
      }

      if (results.length > 0) {
        setCached(cacheKey, results);
        lsSet(cacheKey + '_stale', results);
        return results;
      }

      console.error('Error fetching all cities weather:', error);
      return lsGet(cacheKey, true) || lsGet(cacheKey + '_stale') || getFallbackCitiesWeather(mainCities);
    } finally {
      // ✅ إصلاح: تنظيف pendingRequests في جميع الحالات (نجاح أو فشل)
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

export async function getMarineWeather() {
  const cacheKey = 'marine_weather';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

  const locations = {
    'نواذيبو': { lat: 20.93, lon: -17.03 },
    'نواكشوط': { lat: 18.07, lon: -15.96 }
  };

  const buildStatusFromWind = (windSpeed) => {
    const height = Math.round(Math.min(4.0, windSpeed * 0.25) * 10) / 10;
    let status = 'هادئ';
    if (windSpeed > 15) status = 'هائج جداً';
    else if (windSpeed > 10) status = 'مضطرب';
    else if (windSpeed > 6) status = 'متوسط';
    return { height, status };
  };

  const fallbackMarine = async () => {
    const estimates = [];
    for (const [city, coords] of Object.entries(locations)) {
      try {
        const weather = await getWeatherData(city, coords);
        const currentWind = weather.current?.wind_speed_10m ?? 0;
        const { height, status } = buildStatusFromWind(currentWind);
        estimates.push({ city, height, status });
      } catch (err) {
        console.warn(`⚠️ marine fallback failed for ${city}:`, err.message);
      }
    }
    return estimates;
  };

  const promise = (async () => {
    try {
      const lats = Object.values(locations).map(c => c.lat).join(',');
      const lons = Object.values(locations).map(c => c.lon).join(',');

      const url = `${MARINE_API}?latitude=${lats}&longitude=${lons}&current=wave_height&timezone=Africa/Nouakchott`;
      const target = buildProxyTarget(url);
      const response = await enqueueFetch(target);

      if (!response.ok) {
        throw new Error('Marine API error');
      }

      const data = await response.json();
      const dataArray = Array.isArray(data) ? data : [data];

      const results = Object.keys(locations).map((city, index) => {
        const height = dataArray[index]?.current?.wave_height ?? 0;
        let status = 'هادئ';
        if (height > 2.5) status = 'هائج جداً';
        else if (height > 1.5) status = 'مضطرب';
        else if (height > 0.8) status = 'متوسط';
        return { city, height, status };
      });

      setCached(cacheKey, results);
      return results;
    } catch (error) {
      console.warn('⚠️ Marine API failed، استخدام fallback عبر بيانات الرياح الساحلية');
      const fallback = await fallbackMarine();
      if (fallback.length > 0) {
        setCached(cacheKey, fallback);
        return fallback;
      }
      console.error('Error fetching marine weather:', error);
      return [];
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

function buildFallbackWeather(city, coords) {
  const now = new Date();
  const dailyTime = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  });

  return {
    city,
    cityEn: coords?.name || city,
    cityType: coords?.type || 'مدينة',
    latitude: coords?.lat || null,
    longitude: coords?.lon || null,
    isFallback: true,
    current: {
      temperature_2m: 0,
      weather_code: 0,
      wind_speed_10m: 0,
      wind_direction_10m: 0,
      relative_humidity_2m: 0,
      pressure_msl: 1013,
      precipitation: 0,
    },
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
      temperature_2m: Array(24).fill(0),
      precipitation_probability: Array(24).fill(0),
      wind_speed_10m: Array(24).fill(0),
      wind_direction_10m: Array(24).fill(0),
      weather_code: Array(24).fill(0),
    },
    daily: {
      time: dailyTime,
      weather_code: Array(7).fill(0),
      temperature_2m_max: Array(7).fill(0),
      temperature_2m_min: Array(7).fill(0),
      precipitation_sum: Array(7).fill(0),
      wind_speed_10m_max: Array(7).fill(0),
    },
  };
}

function getFallbackCitiesWeather(cityNames) {
  return cityNames.map(cityName => buildFallbackWeather(cityName, mauritanianCities[cityName] || { lat: null, lon: null, name: cityName, type: 'مقاطعة' }));
}

export const getWeatherDescription = (code) => {
  const descriptions = {
    0: 'سماء صافية', 1: 'صافي غالباً', 2: 'غائم جزئياً', 3: 'غائم',
    45: 'ضباب', 48: 'ضباب صقيعي',
    51: 'رذاذ خفيف', 53: 'رذاذ متوسط', 55: 'رذاذ كثيف',
    61: 'مطر خفيف', 63: 'مطر متوسط', 65: 'مطر غزير',
    80: 'زخات مطر خفيفة', 81: 'زخات مطر متوسطة', 82: 'زخات مطر عنيفة',
    95: 'عواصف رعدية', 96: 'عواصف رعدية مع برد خفيف', 99: 'عواصف رعدية مع برد شديد',
  };
  return descriptions[code] || 'غير معروف';
};

export const getWeatherIcon = (code) => {
  if (code === 0) return '☀️';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 65) return '🌧️';
  if (code <= 82) return '⛈️';
  if (code >= 95) return '⚡';
  return '🌡️';
};

/**
 * استخراج تحذيرات العواصف الرعدية والرياح القوية من بيانات الطقس
 * المصدر: ECMWF عبر Open-Meteo
 */
export function getThunderstormAlerts(weatherData) {
  if (!weatherData || weatherData.length === 0) return [];

  const alerts = [];
  const now = new Date();
  const next72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  weatherData.forEach(city => {
    if (!city || !city.city) return;

    const currentCode = city.current?.weather_code ?? 0;
    const currentWind = city.current?.wind_speed_10m ?? 0;

    // عاصفة رعدية حالية
    if (currentCode >= 95) {
      alerts.push({
        id: `thunder_now_${city.city}`,
        type: 'thunderstorm',
        city: city.city,
        cityEn: city.cityEn,
        wilaya: city.wilaya || '',
        severity: currentCode === 99 ? 'شديدة جداً' : currentCode === 96 ? 'شديدة' : 'متوسطة',
        icon: currentCode === 99 ? '⛈️🌨' : '⛈️',
        message: getWeatherDescription(currentCode),
        isNow: true,
        windSpeed: currentWind,
        date: now.toISOString().slice(0, 10),
      });
    }

    // رياح قوية حالية (> 60 كم/س)
    if (currentCode < 95 && currentWind > 60) {
      alerts.push({
        id: `wind_now_${city.city}`,
        type: 'wind',
        city: city.city,
        cityEn: city.cityEn,
        wilaya: city.wilaya || '',
        severity: currentWind > 90 ? 'خطيرة جداً' : currentWind > 70 ? 'خطيرة' : 'عالية',
        icon: '💨',
        message: `رياح قوية (${Math.round(currentWind)} كم/س)`,
        isNow: true,
        windSpeed: currentWind,
        date: now.toISOString().slice(0, 10),
      });
    }

    // توقعات العواصف خلال 72 ساعة القادمة
    if (city.daily && city.daily.time) {
      city.daily.time.forEach((dateStr, i) => {
        const dayDate = new Date(dateStr + 'T12:00:00');
        if (dayDate <= now || dayDate > next72h) return;

        const dayCode = city.daily.weather_code?.[i] ?? 0;
        const dayMaxWind = city.daily.wind_speed_10m_max?.[i] ?? 0;

        if (dayCode >= 95) {
          alerts.push({
            id: `thunder_forecast_${city.city}_${dateStr}`,
            type: 'thunderstorm_forecast',
            city: city.city,
            cityEn: city.cityEn,
            wilaya: city.wilaya || '',
            severity: dayCode === 99 ? 'شديدة جداً' : dayCode === 96 ? 'شديدة' : 'متوسطة',
            icon: '⛈️',
            message: getWeatherDescription(dayCode),
            isNow: false,
            windSpeed: dayMaxWind,
            date: dateStr,
          });
        }

        if (dayCode < 95 && dayMaxWind > 60) {
          alerts.push({
            id: `wind_forecast_${city.city}_${dateStr}`,
            type: 'wind_forecast',
            city: city.city,
            cityEn: city.cityEn,
            wilaya: city.wilaya || '',
            severity: dayMaxWind > 90 ? 'خطيرة جداً' : dayMaxWind > 70 ? 'خطيرة' : 'عالية',
            icon: '💨',
            message: `رياح قوية متوقعة (${Math.round(dayMaxWind)} كم/س)`,
            isNow: false,
            windSpeed: dayMaxWind,
            date: dateStr,
          });
        }
      });
    }
  });

  const severityRank = { 'شديدة جداً': 0, 'خطيرة جداً': 0, 'خطيرة': 1, 'شديدة': 2, 'عالية': 3, 'متوسطة': 4 };
  return alerts.sort((a, b) => {
    if (a.isNow !== b.isNow) return a.isNow ? -1 : 1;
    return (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
  });
}
