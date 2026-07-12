import { mauritaniaCommunesList } from './mauritaniaCommunes';
import { COMMUNE_NAMES_AR } from './mauritaniaCommuneNamesAr';
import {
  getCanonicalMauritaniaPlaceKey,
  normalizeMauritaniaMoughataaName,
  normalizeMauritaniaWilayaName,
} from './mauritaniaPlaceNames';

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

// --- تنظيف كاش v2 القديم وحظر اليوم عند كل تحميل ---
try {
  Object.keys(localStorage).filter(k => k.startsWith('wx_cache_v2_') || k === 'all_cities_weather_v2' || k.startsWith('all_cities_weather_v2')).forEach(k => { try { localStorage.removeItem(k); } catch {} });
} catch {}

// --- Cache في الذاكرة (يُمسح عند إعادة التحميل) ---
const memoryCache = new Map();

// --- Cache دائم في localStorage (يبقى بعد إعادة التحميل) ---
const LS_PREFIX = 'wx_cache_v3_';
const DAILY_LIMIT_KEY = `${LS_PREFIX}daily_limit_blocked`;
const ALL_CITIES_CACHE_KEY = 'all_cities_weather_v3';
const ALL_CITIES_STALE_CACHE_KEY = `${ALL_CITIES_CACHE_KEY}_stale`;
const ALL_CITIES_MERGED_CACHE_KEY = `${ALL_CITIES_CACHE_KEY}_merged`;
const COVERAGE_BATCH_INDEX_KEY = `${LS_PREFIX}coverage_batch_index`;

// --- تنظيف حظر اليوم عند كل تحميل (لا يستمر بين الجلسات) ---
try { localStorage.removeItem(DAILY_LIMIT_KEY); } catch {}
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
    if (age < CACHE_DURATION) return normalizeWeatherPayload(data);
    
    // إذا كانت البيانات "قديمة" ولكن مسموح بها (عند فشل الـ API)
    if (allowStale && age < STALE_DURATION) {
      console.warn(`📜 استخدام بيانات قديمة لـ ${key} (عمرها: ${Math.round(age/60000)} دقيقة)`);
      return normalizeWeatherPayload(data);
    }
    
    if (age >= STALE_DURATION) {
      localStorage.removeItem(LS_PREFIX + key);
    }
  } catch {}
  return null;
}

function lsSet(key, data) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data: normalizeWeatherPayload(data), timestamp: Date.now() }));
  } catch (e) {
    // localStorage ممتلئ — نمسح البيانات القديمة
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(LS_PREFIX))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data: normalizeWeatherPayload(data), timestamp: Date.now() }));
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
  if (mem && Date.now() - mem.timestamp < CACHE_DURATION && isValidWeatherData(mem.data)) {
    return normalizeWeatherPayload(mem.data);
  }
  // 2) localStorage ثانياً
  const ls = lsGet(key, allowStale);
  if (ls && isValidWeatherData(ls)) return ls;
  return null;
}

function setCached(key, data) {
  const normalizedData = normalizeWeatherPayload(data);
  memoryCache.set(key, { data: normalizedData, timestamp: Date.now() });
  lsSet(key, normalizedData);
}

function normalizeCityLookupName(value) {
  return String(value || '').trim().toLowerCase();
}

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

function getAdministrativeContext(coords = {}) {
  return {
    wilaya: normalizeMauritaniaWilayaName(coords.administrativeWilaya || coords.wilaya),
    moughataa: normalizeMauritaniaMoughataaName(coords.administrativeMoughataa || coords.moughataa),
  };
}

function normalizeWeatherEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const admin = getAdministrativeContext(entry);
  return {
    ...entry,
    ...admin,
  };
}

function normalizeWeatherPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeWeatherEntry(entry));
  }
  return normalizeWeatherEntry(payload);
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

async function enqueueFetch(url, options, { bypassCircuit = false } = {}) {
  await acquireSlot();
  try {
    return await fetchWithRetry(url, options, 3, 3000, bypassCircuit);
  } finally {
    releaseSlot();
  }
}

/**
 * fetch مع إعادة المحاولة التدريجية عند 429
 */
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 3000, bypassCircuit = false) {
  if (!bypassCircuit && !checkCircuit()) {
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
        return fetchWithRetry(url, options, retries - 1, backoff * 2, bypassCircuit);
      } else {
        if (!bypassCircuit) openCircuit();
        throw new Error('API error: Too Many Requests');
      }
    }

    return response;
  } catch (error) {
    if (error.message && error.message.includes('Too Many Requests')) throw error;

    if (retries > 0) {
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2, bypassCircuit);
    }
    throw error;
  }
}

// مدن ومقاطعات وبلديات مستخدمة للرصد والعرض، مع الاحتفاظ بالهيكلة الإدارية الرسمية في المصدر المستورد
const manualMauritanianCities = {
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
  'روصو': { lat: 17.5333, lon: -14.3333, name: 'Rosso', type: 'مقاطعة', wilaya: 'الترارزة' },
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
  'ونبو': { lat: 15.45, lon: -12.08, name: 'Wompou', type: 'بلدية', wilaya: 'كيدماغا' },
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

const manualCityCanonicalKeySet = new Set(
  Object.entries(manualMauritanianCities)
    .flatMap(([cityKey, city]) => [
      getCanonicalMauritaniaPlaceKey(cityKey),
      getCanonicalMauritaniaPlaceKey(city.name),
    ])
    .filter(Boolean)
);

const filteredMauritaniaCommunesList = mauritaniaCommunesList.filter(
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

const mauritanianCities = {
  ...filteredMauritaniaCommunes,
  ...manualMauritanianCities,
};

const coreMauritanianCities = [
  // نواكشوط
  'نواكشوط',
  // الترارزة
  'روصو', 'بوتلميت', 'كرمسين', 'المذرذرة', 'واد الناقة', 'اركيز', 'انتيكان',
  // البراكنة
  'ألاك', 'بابابى', 'بوكي', 'مقاطع لحجار', 'امباني', 'صنكرافه',
  'Chegar', 'Bouhdida', 'Aghchourguit', 'El Verae', "Aéré M'Bar",
  'Dar El Aviye', 'Dar El Barke', 'Ould Biram', 'Djonabe', 'Ouad Emmour',
  'Niabina', 'Edebaye El Hejjaj', 'Bagodine', 'Maal', 'Roumed',
  'Elwad Lebiadh', 'Bourat', 'Djelwar',
  // كوركول
  'كيهيدي', 'امبود', 'مقامة', 'مونغل',
  'Néré Walo', 'Djewol', 'Toghomadi', 'Tifondé Civé', 'Doo', 'Dolol Civé',
  'Beilouguet Litame', 'Vrea Litame', 'Toulel', 'Sagné', 'Wali Djantang',
  'Tikobra', 'Terenguel Ehel Moulaye Ely', "N'Djadjbenni Gandéga",
  'Edebaye Ehel Guelaye', 'Voum Legleite', 'Chelkhet Tiyab', 'Lahrach',
  'Souve', 'Bathet Moït', 'Bokhol', 'Melzem Teichet', 'Azgueilem Tiyab',
  'Lexeiba 1', 'Betengal', 'Talhaye', 'Ganki',
  // كيدماغا
  'سيلبابي', 'ولد ينج', 'غابو', 'ونبو', 'لعبلي',
  'Tektake', 'Davoue', 'Bouanz', 'Lehraj', 'Leaweinat', "Ould M'Bonny",
  'Tachout', 'Hassi Chegar', 'Chleikha', 'Diogountou', 'Bayediam',
  'Gouraye', 'Soufi', 'Agoueinitt', 'Ejar', 'Sagne Dieri', 'Arr',
  // لعصابه
  'كيفة', 'باركيول', 'كرو', 'بومديد', 'تناها', 'هامد',
  'Kankoussa', 'Gueller', 'Lebheir', 'Laweissi', 'Daghveg', 'El Ghabra',
  "R'Dheidhie", 'Bou Lahrath', 'Hseiy Tin', 'Lavtah', 'Oudeiy Jrid',
  'El Ghaira', 'Kamour', 'Sani', 'Blajmil', 'Nouamlein', 'Aghorat',
  'El Melgue', 'Kouroudjel', 'Legrane',
  // الحوض الغربي
  'لعيون', 'كنكوصة', 'تامشكط', 'كوبني', 'الطينطان',
  "N'Savenni", 'Doueirare', 'Ten Hamadi', 'Beneamane', 'Egjert',
  'Oum Lahyadh', 'Hassi Ehel Ahmed Bechne', 'Timzine', 'Leghlig',
  'Gougui Zemmal', 'Modibougou', 'Voullaniya', 'El Mabrouk 3', 'Radhi',
  'Guetae-Teidoume', 'Sava', 'Hassi Abdallah', 'Aweinat Thalle',
  'Aïn Varbe', 'Egharghar', 'Dev-a', 'Touil 2', 'Baghdad', 'Sett',
  'Lehreijat',
  // الحوض الشرقي
  'النعمة', 'تمبدغة', 'باسكنو', 'جيكني', 'امرج', 'ولاته',
  'فصاله', 'عدل بكرو', 'انبيكت لحواش', 'افيرني', 'اعوينات ازبل', 'بوسطيله',
  'Oum Echeich', 'Bougadoum', 'Djigui', 'Legdour', 'El Megve', 'Dhar',
  'El Mabrouk 1', 'Ghlig Ehel Beye', 'Kasr El Barke', 'Achemime', 'Jreif',
  'Bangou', 'Hassi Etile', 'Oum Avnadech', 'El Mabrouk 2', 'Beribavat',
  'Noual', 'Agoueinit', 'Elbatene', 'Touil 1', 'Koumbi Saleh',
  "Hassi M'Hadi", 'Elmessgoul', 'Sivane',
  // تكانت
  'تجكجة', 'تيشيت', 'موجريه',
  "N'Beike", 'Soudoud', 'Lekhcheb', 'El Wahat', 'Tensigh',
  'Boubacar Ben Amer', 'Lehsira',
  // آدرار
  'أطار', 'شنقيط', 'وادان', 'اوجفت', 'يغرف',
  'Maeden', "N'Teirguent", 'El Medah', 'Aïn Ehel Taya', 'Tawaz', 'Choum',
  'Aïn Savra',
  // انشيري
  'أكجوجت', 'بنيشاب',
  // داخلة نواذيبو
  'نواذيبو',
  // تيرس زمور
  'زويرات', 'بير أم اكرين', 'فديريك',
];

// دفعة تغطية إضافية واحدة لكل ولاية (بدل تقسيم عشوائي) — كل دورة خلفية
// تجلب بلديات ولاية واحدة كاملة، فتكون البلديات المتبقية دوماً مجمّعة
// بحسب ولايتها بدل التوزيع العشوائي على 5 دفعات ثابتة.
const wilayaCoverageBatchesMap = new Map();
filteredMauritaniaCommunesList
  .sort((a, b) => {
    const moughataaCompare = (a.moughataa || '').localeCompare(b.moughataa || '');
    if (moughataaCompare !== 0) return moughataaCompare;
    return (a.city || '').localeCompare(b.city || '');
  })
  .forEach((commune) => {
    const wilayaKey = commune.wilaya || 'أخرى';
    if (!wilayaCoverageBatchesMap.has(wilayaKey)) wilayaCoverageBatchesMap.set(wilayaKey, []);
    wilayaCoverageBatchesMap.get(wilayaKey).push(commune.city);
  });

const rotatingCommuneCoverageBatches = [...wilayaCoverageBatchesMap.values()];

// رصد دائم لكل بلديات موريتانيا في كل تحديث (لا دورة) — يُجلب على دفعات آمنة
const ALL_TRACKED_CITIES = [
  ...new Set([
    ...coreMauritanianCities,
    ...filteredMauritaniaCommunesList.map((commune) => commune.city),
  ]),
].filter((city) => mauritanianCities[city]);

const COVERAGE_CHUNK_SIZE = 100; // حد أقصى لكل طلب Open-Meteo (لتفادي طلب ضخم يفشل)

function getNextCoverageBatchIndex() {
  if (rotatingCommuneCoverageBatches.length === 0) return 0;

  try {
    const rawValue = Number(localStorage.getItem(COVERAGE_BATCH_INDEX_KEY));
    const currentIndex =
      Number.isFinite(rawValue) && rawValue >= 0
        ? rawValue % rotatingCommuneCoverageBatches.length
        : 0;
    const nextIndex = (currentIndex + 1) % rotatingCommuneCoverageBatches.length;
    localStorage.setItem(COVERAGE_BATCH_INDEX_KEY, String(nextIndex));
    return currentIndex;
  } catch {
    return 0;
  }
}

function mergeTrackedWeatherResults(freshResults, previousResults, prioritizedCityNames) {
  const prioritizedEntriesByKey = new Map(
    (prioritizedCityNames || [])
      .map((cityName) => [getCanonicalMauritaniaPlaceKey(cityName), cityName])
      .filter(([key]) => key)
  );
  const mergedByCanonicalKey = new Map();

  const mergeEntry = (entry) => {
    if (!entry?.city) return;

    const canonicalKey = getCanonicalMauritaniaPlaceKey(entry.city);
    const prioritizedCityName = prioritizedEntriesByKey.get(canonicalKey);

    if (!canonicalKey) {
      mergedByCanonicalKey.set(entry.city, entry);
      return;
    }

    const currentEntry = mergedByCanonicalKey.get(canonicalKey);
    const nextEntry =
      prioritizedCityName && prioritizedCityName !== entry.city
        ? {
            ...entry,
            city: prioritizedCityName,
            ...getAdministrativeContext({
              wilaya: manualMauritanianCities[prioritizedCityName]?.wilaya || entry.wilaya,
              moughataa: manualMauritanianCities[prioritizedCityName]?.moughataa || entry.moughataa,
              administrativeWilaya: manualMauritanianCities[prioritizedCityName]?.administrativeWilaya,
              administrativeMoughataa: manualMauritanianCities[prioritizedCityName]?.administrativeMoughataa,
            }),
          }
        : entry;

    if (!currentEntry) {
      mergedByCanonicalKey.set(canonicalKey, nextEntry);
      return;
    }

    const currentIsPrioritized = prioritizedEntriesByKey.get(canonicalKey) === currentEntry.city;
    const nextIsPrioritized = prioritizedEntriesByKey.get(canonicalKey) === nextEntry.city;
    if (!currentIsPrioritized || nextIsPrioritized) {
      mergedByCanonicalKey.set(canonicalKey, nextEntry);
    }
  };

  (previousResults || []).forEach(mergeEntry);
  (freshResults || []).forEach(mergeEntry);

  const orderedKeys = [
    ...new Set([
      ...(prioritizedCityNames || []).map((cityName) => getCanonicalMauritaniaPlaceKey(cityName)),
      ...Array.from(mergedByCanonicalKey.keys()),
    ]),
  ];

  return orderedKeys.map((key) => mergedByCanonicalKey.get(key)).filter(Boolean);
}

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

  const now = Date.now();
  // نافذة اليوم: من ساعتين مضت حتى ساعتين قادمتين (لالتقاط مطر دخل ومرّ أو يقترب)
  const WINDOW_BACK_MS = 2 * 60 * 60 * 1000;
  const WINDOW_FWD_MS = 2 * 60 * 60 * 1000;

  // يفحص ساعات اليوم القريبة: يرجع أعلى هطول/كود ماطر ضمن النافذة
  function scanRecentHours(c) {
    const times = c.hourly?.time || [];
    if (times.length === 0) return null;
    let best = null;
    for (let i = 0; i < times.length; i++) {
      const t = new Date(times[i]).getTime();
      if (Number.isNaN(t)) continue;
      if (t < now - WINDOW_BACK_MS || t > now + WINDOW_FWD_MS) continue;
      const hCode = c.hourly?.weather_code?.[i] ?? 0;
      const hPrecip = c.hourly?.precipitation?.[i] ?? 0;
      const hProb = c.hourly?.precipitation_probability?.[i] ?? 0;
      const hRainCode = (hCode >= 51 && hCode <= 67) || (hCode >= 80 && hCode <= 82) || hCode >= 95;
      // مطر فعلي فقط: هطول حقيقي أو كود ماطر (لا نعتمد الاحتمال وحده لتفادي إنذار كاذب)
      if (hPrecip > 0.1 || hRainCode) {
        const score = hPrecip * 10 + (hCode >= 95 ? 50 : 0) + (hRainCode ? 20 : 0) + hProb / 5;
        if (!best || score > best.score) {
          best = { score, code: hCode, precip: hPrecip, prob: hProb };
        }
      }
    }
    return best;
  }

  const out = [];
  weatherData.forEach((c) => {
    let code = c.current?.weather_code ?? 0;
    let precip = c.current?.precipitation ?? 0;

    const isThunder0 = code >= 95;
    const isRainCode0 = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || isThunder0;
    let isRaining = precip > 0.1 || isRainCode0;

    // إن كانت اللحظة جافة، نفحص ساعات اليوم القريبة (مطر دخل ومرّ أو يقترب)
    if (!isRaining) {
      const recent = scanRecentHours(c);
      if (recent) {
        isRaining = true;
        // نعتمد بيانات الساعة الأقوى لإظهار الحالة
        if (recent.precip > precip) precip = recent.precip;
        if (recent.code > code) code = recent.code;
      }
    }
    if (!isRaining) return;

    const isThunder = code >= 95;
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

export async function getWeatherData(city = 'نواكشوط', customCoords = null, { forecastDays = 7, bypassCircuit = false } = {}) {
  const lat = customCoords ? Math.round(customCoords.lat * 100) / 100 : null;
  const lon = customCoords ? Math.round(customCoords.lon * 100) / 100 : null;
  const daysSuffix = forecastDays > 7 ? `_d${forecastDays}` : '';
  const cacheKey = (customCoords ? `coord_${lat}_${lon}` : `city_${city}`) + daysSuffix;

  // طلبات المدينة الفردية لا تنتظر الـ circuit breaker الجماعي — تحاول مباشرة
  const allowStale = !bypassCircuit && (isCircuitOpen || isDailyLimitBlocked());
  const cached = getCached(cacheKey, allowStale);
  if (cached && !cached.isFallback) return cached;

  if (allowStale && !bypassCircuit) {
    const stale = getCached(cacheKey, true);
    if (stale && !stale.isFallback) return stale;
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
        hourly: 'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code,cape,convective_inhibition,lifted_index',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
        timezone: 'Africa/Nouakchott',
        temperature_unit: 'celsius',
        forecast_days: forecastDays,
      });

      const sourceUrl = `${OPEN_METEO_API}?${params}`;
      const target = buildProxyTarget(sourceUrl);
      const response = await enqueueFetch(target, undefined, { bypassCircuit });
      if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText || ''}`);

      const data = await response.json();
      const result = {
        city,
        cityEn: coords.name,
        cityType: coords.type || 'مدينة',
        ...getAdministrativeContext(coords),
        ...data,
      };

      if (result && result.current && !result.isFallback) {
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
            ...getAdministrativeContext(coords),
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
  // المرحلة الأولى فقط: المدن الأساسية (طلب واحد ~40 مدينة)
  // البلديات الإضافية تُجلب بشكل دوّار في الخلفية بعد تحميل الصفحة
  const trackedCities = coreMauritanianCities.filter(c => mauritanianCities[c]);
  const cacheKey = `${ALL_CITIES_CACHE_KEY}_core`;
  const mergedCache = getCached(ALL_CITIES_MERGED_CACHE_KEY, true) || lsGet(ALL_CITIES_MERGED_CACHE_KEY, true) || [];

  // Cache أولاً (يشمل localStorage لمنع إعادة الجلب بعد تحديث الصفحة)
  const cached = getCached(cacheKey, isCircuitOpen);
  if (cached) {
    console.log('✅ بيانات المدن الأساسية من الـ cache');
    return mergeTrackedWeatherResults(cached, mergedCache, trackedCities);
  }

  if (isCircuitOpen || isDailyLimitBlocked()) {
    const staleMerged = mergedCache.length > 0 ? mergedCache : lsGet(ALL_CITIES_STALE_CACHE_KEY, true);
    return staleMerged || getFallbackCitiesWeather(trackedCities);
  }

  // منع الطلبات المتزامنة لنفس المفتاح
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

  const promise = (async () => {
    try {
      // طلب واحد فقط للمدن الأساسية (≤50 مدينة)
      const dataItems = [];
      for (let start = 0; start < trackedCities.length; start += COVERAGE_CHUNK_SIZE) {
        const chunk = trackedCities.slice(start, start + COVERAGE_CHUNK_SIZE);
        const lats = chunk.map(c => mauritanianCities[c].lat).join(',');
        const lons = chunk.map(c => mauritanianCities[c].lon).join(',');

        const params = new URLSearchParams({
          latitude: lats,
          longitude: lons,
          current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,pressure_msl,precipitation',
          hourly: 'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code,cape,convective_inhibition,lifted_index',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
          timezone: 'Africa/Nouakchott',
          forecast_days: 3, // النشرة تستخدم 3 أيام؛ التوقعات الأسبوعية تُجلب لكل مدينة على حدة
        });

        const sourceUrl = `${OPEN_METEO_API}?${params}`;
        const target = buildProxyTarget(sourceUrl);
        const response = await enqueueFetch(target);
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText || ''}`);
        }

        const data = await response.json();
        const items = Array.isArray(data) ? data : [data];
        // Open-Meteo يرجّع كائناً واحداً لدفعة من موقع واحد
        if (items.length !== chunk.length || items.some(item => !item.current)) {
          throw new Error('Invalid batch weather response');
        }
        dataItems.push(...items);
      }

      const results = dataItems.map((item, index) => {
        const cityName = trackedCities[index];
        const coords = mauritanianCities[cityName];
        return {
          city: cityName,
          cityEn: coords.name,
          cityType: coords.type || 'مقاطعة',
          ...getAdministrativeContext(coords),
          ...item
        };
      });

      if (results.length > 0) {
        setCached(cacheKey, results);
        const mergedResults = mergeTrackedWeatherResults(results, mergedCache, trackedCities);
        setCached(ALL_CITIES_MERGED_CACHE_KEY, mergedResults);
        lsSet(ALL_CITIES_STALE_CACHE_KEY, mergedResults);
        return mergedResults;
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
        const cachedFallback =
          (mergedCache.length > 0 ? mergedCache : null) ||
          lsGet(ALL_CITIES_STALE_CACHE_KEY, true) ||
          lsGet(cacheKey, true);
        if (cachedFallback) {
          console.log(`✅ Returning cached weather for ${cachedFallback.length} cities`);
          return cachedFallback;
        }
        return getFallbackCitiesWeather(trackedCities);
      }

      // Non-daily-limit error: try individual city fetches
      console.log('⚠️ Batch failed, trying individual cities via fallback logic...');
      
      const results = [];
      for (const cityName of trackedCities) {
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
        const mergedResults = mergeTrackedWeatherResults(results, mergedCache, trackedCities);
        setCached(ALL_CITIES_MERGED_CACHE_KEY, mergedResults);
        lsSet(ALL_CITIES_STALE_CACHE_KEY, mergedResults);
        return mergedResults;
      }

      console.error('Error fetching all cities weather:', error);
      return (
        (mergedCache.length > 0 ? mergedCache : null) ||
        lsGet(ALL_CITIES_STALE_CACHE_KEY, true) ||
        lsGet(cacheKey, true) ||
        getFallbackCitiesWeather(trackedCities)
      );
    } finally {
      // ✅ إصلاح: تنظيف pendingRequests في جميع الحالات (نجاح أو فشل)
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

// جلب بلدية دوّار في الخلفية بعد تحميل البيانات الأساسية (بدون تأثير على الواجهة)
export async function fetchExtraCommunesBatch(onBatchReady) {
  if (isCircuitOpen || isDailyLimitBlocked()) return;
  const batchIndex = getNextCoverageBatchIndex();
  const batch = rotatingCommuneCoverageBatches[batchIndex] || [];
  if (batch.length === 0) return;

  const batchCacheKey = `${ALL_CITIES_CACHE_KEY}_extra_${batchIndex}`;
  const cached = getCached(batchCacheKey);
  if (cached) { if (onBatchReady) onBatchReady(cached); return; }

  if (pendingRequests.has(batchCacheKey)) return;

  const promise = (async () => {
    try {
      const lats = batch.map(c => mauritanianCities[c].lat).join(',');
      const lons = batch.map(c => mauritanianCities[c].lon).join(',');
      const params = new URLSearchParams({
        latitude: lats, longitude: lons,
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
        timezone: 'Africa/Nouakchott', forecast_days: 3,
      });
      const sourceUrl = `${OPEN_METEO_API}?${params}`;
      const target = buildProxyTarget(sourceUrl);
      const response = await enqueueFetch(target);
      if (!response.ok) return;
      const data = await response.json();
      const items = Array.isArray(data) ? data : [data];
      if (items.length !== batch.length) return;
      const results = items.map((item, i) => {
        const cityName = batch[i];
        const coords = mauritanianCities[cityName];
        return { city: cityName, cityEn: coords.name, cityType: coords.type || 'مقاطعة', ...getAdministrativeContext(coords), ...item };
      });
      setCached(batchCacheKey, results);
      if (onBatchReady) onBatchReady(results);
    } catch {
      // صامت — البلديات الإضافية ليست حرجة
    } finally {
      pendingRequests.delete(batchCacheKey);
    }
  })();
  pendingRequests.set(batchCacheKey, promise);
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
    ...getAdministrativeContext(coords),
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
