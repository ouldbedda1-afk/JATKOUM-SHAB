// علامات صور الحرائق: دائرة واحدة مفرغة حول كل بؤرة حريق في الصورة. البؤرة تجمع ما تقارب من نقاط
// FIRMS ومن بكسلات اللهب الحمراء التي يرسمها EVALSCRIPT، فيُحاط الحريق كله بحلقة واحدة لا تحجب اللهب.
// الدالة لا تستورد شيئاً لتُختبر في Node على صور حقيقية.

export interface Pixels {
  width: number;
  height: number;
  getPixelAt(x: number, y: number): number; // إحداثيات تبدأ من 1 كما في ImageScript
  setPixelAt(x: number, y: number, rgba: number): unknown;
}

const LINK_PX = 40;       // نقطتان أقرب من هذا (نحو 700 م) من البؤرة نفسها
const CELL = 4;           // بكسلات اللهب تُجمع في خلايا 4×4 قبل التجميع
const MIN_FLAME_CELLS = 1; // بقعة لهب واحدة تكفي: لون اللهب لا يُرسم إلا بشرط EVALSCRIPT
const MARGIN = 14, MIN_R = 22;

// لون اللهب في EVALSCRIPT هو [1, 0.1, 0]، ويبقى قريباً منه بعد ضغط JPEG
const isFlame = (c: number) => {
  const r = c >>> 24, g = (c >>> 16) & 255, b = (c >>> 8) & 255;
  return r > 190 && g < 90 && b < 70 && r - g > 140;
};

export function fireClusters(img: Pixels, spots: { x: number; y: number }[], maxY: number) {
  const pts: { x: number; y: number; spot: boolean }[] = spots.map((p) => ({ ...p, spot: true }));
  const cells = new Set<string>();
  for (let y = 1; y <= maxY; y++) {
    for (let x = 1; x <= img.width; x++) {
      if (!isFlame(img.getPixelAt(x, y))) continue;
      const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
      if (!cells.has(k)) { cells.add(k); pts.push({ x: (Math.floor(x / CELL) + 0.5) * CELL, y: (Math.floor(y / CELL) + 0.5) * CELL, spot: false }); }
    }
  }
  // تجميع بالربط المفرد (union-find)
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.abs(pts[i].x - pts[j].x) < LINK_PX && Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < LINK_PX) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map<number, typeof pts>();
  pts.forEach((p, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), p]); });
  return [...groups.values()]
    .filter((g) => g.some((p) => p.spot) || g.length >= MIN_FLAME_CELLS)
    .map((g) => {
      const xs = g.map((p) => p.x), ys = g.map((p) => p.y);
      const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2;
      const r = Math.max(MIN_R, Math.max(...g.map((p) => Math.hypot(p.x - x, p.y - y))) + MARGIN);
      return { x, y, r };
    });
}

// حلقة برتقالية بعرض 3 بكسل يحدّها خط داكن رفيع من الجهتين ليظهر على الأرض الفاتحة
const ORANGE = [249, 115, 22], DARK = [0, 0, 0];
export function drawRing(img: Pixels, cx: number, cy: number, r: number, maxY: number) {
  const outer = r + 2.5;
  for (let y = Math.max(1, Math.floor(cy - outer)); y <= Math.min(maxY, Math.ceil(cy + outer)); y++) {
    for (let x = Math.max(1, Math.floor(cx - outer)); x <= Math.min(img.width, Math.ceil(cx + outer)); x++) {
      const d = Math.abs(Math.hypot(x - cx, y - cy) - r);
      if (d > 2.5) continue;
      const [col, a] = d <= 1.5 ? [ORANGE, Math.min(1, 2 - d)] : [DARK, 0.5 * (2.5 - d)];
      const c = img.getPixelAt(x, y);
      const mix = (v: number, i: number) => Math.round(v * a + ((c >>> (24 - 8 * i)) & 255) * (1 - a));
      img.setPixelAt(x, y, ((mix(col[0], 0) << 24) | (mix(col[1], 1) << 16) | (mix(col[2], 2) << 8) | 255) >>> 0);
    }
  }
}
