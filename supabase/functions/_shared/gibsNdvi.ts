// قراءة صور NDVI من NASA GIBS: فك PNG، وتحويل اللون إلى قيمة NDVI بجدول ألوان GIBS
// (كل لون يقابل مجالاً عرضه 0.005). تستعملها pasture-ndvi و locust-habitat.

export const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';

// ── فك صورة PNG (8 بت: RGB أو RGBA أو بلوحة ألوان) إلى RGBA ─────────────────
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodePng(buf: Uint8Array): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos < buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8); height = view.getUint32(pos + 12);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || ![2, 3, 6].includes(colorType)) throw new Error(`PNG غير مدعوم: ${colorType}/${bitDepth}`);
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of idat) { joined.set(c, o); o += c.length; }
  const raw = await inflate(joined);

  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const pixels = new Uint8Array(height * stride);
  let prev = new Uint8Array(stride);
  for (let y = 0, p = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.slice(p, p + stride); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + up) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + up) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
      }
    }
    pixels.set(line, y * stride);
    prev = line;
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (colorType === 6) rgba.set(pixels.subarray(i * 4, i * 4 + 4), i * 4);
    else if (colorType === 2) { rgba.set(pixels.subarray(i * 3, i * 3 + 3), i * 4); rgba[i * 4 + 3] = 255; }
    else {
      const k = pixels[i];
      rgba[i * 4] = palette![k * 3]; rgba[i * 4 + 1] = palette![k * 3 + 1]; rgba[i * 4 + 2] = palette![k * 3 + 2];
      rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { width, height, rgba };
}

// ── جدول الألوان: لون ← قيمة NDVI (منتصف المجال) ───────────────────────────
export async function loadColormap(url: string): Promise<Map<number, number>> {
  const xml = await (await fetch(url)).text();
  const map = new Map<number, number>();
  const re = /rgb="(\d+),(\d+),(\d+)" transparent="(\w+)"[^>]*value="\[([-\d.]+),([-\d.]+)\)"/g;
  for (const m of xml.matchAll(re)) {
    if (m[4] !== 'false') continue;
    map.set((+m[1] << 16) | (+m[2] << 8) | +m[3], (parseFloat(m[5]) + parseFloat(m[6])) / 2);
  }
  if (map.size < 50) throw new Error('جدول ألوان NDVI غير متوقع');
  return map;
}

// قيمة NDVI لنقطة من الصورة، أو undefined إن كانت شفافة أو بلون خارج الجدول
export function ndviAt(rgba: Uint8Array, i: number, colors: Map<number, number>): number | undefined {
  if (rgba[i * 4 + 3] === 0) return undefined;
  return colors.get((rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]);
}
