/**
 * تتبّع زمني لخلايا المطر عبر الإطارات المتتالية:
 *  - يجمّع نقاط الرصد القريبة في خلية واحدة (مركز ثقل).
 *  - يطابق خلية كل تحديث مع خلايا التحديث السابق (بالقرب).
 *  - يحسب الاتجاه والسرعة الفعليين من الإزاحة الحقيقية (لا من افتراض).
 *  - يتابع كل خلية ويسجّل مسارها حتى تختفي من الرصد (تتلاشى) فتُحذف.
 */

const CLUSTER_KM = 45;   // نقاط ضمن هذا النطاق = خلية واحدة
const MATCH_KM = 70;     // أقصى إزاحة لاعتبارها نفس الخلية بين تحديثين
const MAX_MISSING = 2;   // بعد غيابها عن الرصد مرتين تُعتبر متلاشية

const DEG2RAD = Math.PI / 180;
function distKm(aLat, aLon, bLat, bLon) {
  const dLat = (bLat - aLat) * DEG2RAD;
  const dLon = (bLon - aLon) * DEG2RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * DEG2RAD) * Math.cos(bLat * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function bearingDeg(aLat, aLon, bLat, bLon) {
  const y = Math.sin((bLon - aLon) * DEG2RAD) * Math.cos(bLat * DEG2RAD);
  const x = Math.cos(aLat * DEG2RAD) * Math.sin(bLat * DEG2RAD) -
    Math.sin(aLat * DEG2RAD) * Math.cos(bLat * DEG2RAD) * Math.cos((bLon - aLon) * DEG2RAD);
  return (Math.atan2(y, x) / DEG2RAD + 360) % 360;
}

let tracks = [];
let nextId = 1;

// يجمّع نقاط الرصد في خلايا (مركز ثقل مرجّح بالشدة)
function clusterDetections(dets) {
  const pts = (dets || [])
    .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lon))
    .sort((a, b) => (b.mmh || 0) - (a.mmh || 0));
  const used = new Set();
  const clusters = [];
  for (let i = 0; i < pts.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const members = [pts[i]];
    for (let j = i + 1; j < pts.length; j++) {
      if (used.has(j)) continue;
      if (distKm(pts[i].lat, pts[i].lon, pts[j].lat, pts[j].lon) <= CLUSTER_KM) {
        members.push(pts[j]); used.add(j);
      }
    }
    let sw = 0, la = 0, lo = 0, maxm = 0;
    const cities = [];
    for (const m of members) {
      const w = Math.max(m.mmh || 1, 0.5);
      sw += w; la += m.lat * w; lo += m.lon * w;
      maxm = Math.max(maxm, m.mmh || 0);
      cities.push({ city: m.city, wilaya: m.wilaya, mmh: m.mmh || 0 });
    }
    clusters.push({ lat: la / sw, lon: lo / sw, mmh: maxm, cities, size: members.length });
  }
  return clusters;
}

/**
 * يحدّث التتبّع بإطار رصد جديد ويعيد الخلايا النشطة (بمسارها واتجاهها الحقيقي).
 * يُستدعى مرة واحدة لكل تحديث بيانات (لا في كل رسم).
 */
export function updateTracks(detections, now = Date.now()) {
  const clusters = clusterDetections(detections);
  const matched = new Set();

  for (const c of clusters) {
    let best = null, bestD = Infinity;
    for (const t of tracks) {
      if (matched.has(t.id)) continue;
      const d = distKm(c.lat, c.lon, t.lat, t.lon);
      if (d < bestD) { bestD = d; best = t; }
    }

    if (best && bestD <= MATCH_KM) {
      const dtH = (now - best.lastSeen) / 3600000;
      const movedKm = distKm(best.lat, best.lon, c.lat, c.lon);
      // نحدّث الاتجاه فقط إذا تحرّكت بقدر كافٍ (تفادي ضجيج مركز الثقل)
      if (movedKm >= 4) best.heading = bearingDeg(best.lat, best.lon, c.lat, c.lon);
      // السرعة فقط ضمن فاصل زمني معقول
      if (dtH > 0.03 && dtH < 0.5) best.speed = Math.round(movedKm / dtH);
      best.lat = c.lat; best.lon = c.lon; best.mmh = c.mmh; best.cities = c.cities;
      best.lastSeen = now; best.missing = 0;
      best.path.push({ lat: c.lat, lon: c.lon, t: now });
      if (best.path.length > 16) best.path.shift();
      matched.add(best.id);
    } else {
      const t = {
        id: nextId++, lat: c.lat, lon: c.lon, mmh: c.mmh, cities: c.cities,
        firstSeen: now, lastSeen: now, missing: 0, heading: null, speed: null,
        path: [{ lat: c.lat, lon: c.lon, t: now }],
      };
      tracks.push(t);
      matched.add(t.id);
    }
  }

  // الخلايا التي لم تُرصد هذه المرة: غابت
  for (const t of tracks) {
    if (!matched.has(t.id)) t.missing = (t.missing || 0) + 1;
  }
  const faded = tracks.filter((t) => t.missing > MAX_MISSING);
  tracks = tracks.filter((t) => t.missing <= MAX_MISSING);

  return { active: tracks.slice(), faded };
}

export function getTracks() {
  return tracks.slice();
}
