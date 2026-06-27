/**
 * كشف الصواعق الحقيقي عبر شبكة Blitzortung.org (مجتمعية، عالمية).
 * نتّصل عبر WebSocket، نفكّ ضغط الرسائل، ونحتفظ بضربات البرق فوق موريتانيا فقط.
 *
 * بيانات الصواعق: Blitzortung.org (استخدام غير تجاري — مع الإسناد).
 */

const WS_SERVERS = ['wss://ws1.blitzortung.org/', 'wss://ws7.blitzortung.org/', 'wss://ws8.blitzortung.org/'];
const MAURITANIA_BBOX = { latMin: 14.5, latMax: 27.8, lonMin: -17.6, lonMax: -4.4 };
const STRIKE_TTL = 15 * 60 * 1000; // نحتفظ بآخر 15 دقيقة فقط

let strikes = []; // [{ lat, lon, time }]
let listeners = [];
let ws = null;
let serverIdx = 0;
let reconnectTimer = null;
let started = false;

// فكّ ضغط رسائل Blitzortung (LZW)
function unpack(s) {
  const dict = {};
  const data = (s + '').split('');
  let currChar = data[0];
  let oldPhrase = currChar;
  const out = [currChar];
  let code = 256;
  let phrase;
  for (let i = 1; i < data.length; i++) {
    const currCode = data[i].charCodeAt(0);
    if (currCode < 256) phrase = data[i];
    else phrase = dict[currCode] ? dict[currCode] : oldPhrase + currChar;
    out.push(phrase);
    currChar = phrase.charAt(0);
    dict[code] = oldPhrase + currChar;
    code++;
    oldPhrase = phrase;
  }
  return out.join('');
}

function prune() {
  const cut = Date.now() - STRIKE_TTL;
  const before = strikes.length;
  strikes = strikes.filter((s) => s.time > cut);
  return strikes.length !== before;
}

function notify() {
  const snapshot = strikes.slice();
  listeners.forEach((fn) => { try { fn(snapshot); } catch { /* تجاهل */ } });
}

function addStrike(lat, lon, time) {
  const b = MAURITANIA_BBOX;
  if (lat < b.latMin || lat > b.latMax || lon < b.lonMin || lon > b.lonMax) return;
  strikes.push({ lat, lon, time: time || Date.now() });
  prune();
  notify();
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  serverIdx = (serverIdx + 1) % WS_SERVERS.length;
  reconnectTimer = setTimeout(connect, 6000);
}

function connect() {
  if (typeof WebSocket === 'undefined') return;
  try {
    ws = new WebSocket(WS_SERVERS[serverIdx]);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => { try { ws.send('{"a":111}'); } catch { /* تجاهل */ } };
  ws.onmessage = (ev) => {
    let obj;
    try { obj = JSON.parse(ev.data); }
    catch {
      try { obj = JSON.parse(unpack(ev.data)); } catch { return; }
    }
    if (obj && typeof obj.lat === 'number' && typeof obj.lon === 'number') {
      // obj.time بالنانوثانية منذ epoch
      const t = typeof obj.time === 'number' ? Math.round(obj.time / 1e6) : Date.now();
      addStrike(obj.lat, obj.lon, t);
    }
  };
  ws.onerror = () => { try { ws.close(); } catch { /* تجاهل */ } };
  ws.onclose = () => scheduleReconnect();
}

/** بدء خدمة الصواعق (مرة واحدة) */
export function startLightning() {
  if (started) return;
  started = true;
  connect();
  // تنظيف دوري للقديم حتى بدون رسائل جديدة
  setInterval(() => { if (prune()) notify(); }, 60 * 1000);
}

export function getRecentStrikes() {
  prune();
  return strikes.slice();
}

export function subscribeLightning(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

/**
 * يبني خبر برق حقيقي: ينسب الضربات لأقرب بلدية ويعدّها.
 * @returns { areas: [{city, count}], total, since } أو null
 */
export function buildLightningReport(strikeList, weatherData, maxAreas = 5) {
  if (!strikeList || strikeList.length === 0) return null;
  if (!weatherData || weatherData.length === 0) return null;

  const pts = weatherData
    .map((c) => ({ city: c.city, lat: c.latitude ?? c.lat, lon: c.longitude ?? c.lon }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  if (pts.length === 0) return null;

  const counts = new Map();
  let oldest = Date.now();
  for (const s of strikeList) {
    let best = null;
    let bestD = Infinity;
    for (const p of pts) {
      const d = Math.abs(p.lat - s.lat) + Math.abs(p.lon - s.lon); // تقريبي سريع
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      counts.set(best.city, (counts.get(best.city) || 0) + 1);
      if (s.time < oldest) oldest = s.time;
    }
  }

  const areas = [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxAreas);

  return { areas, total: strikeList.length, since: oldest };
}
