const NEO_NDVI_INDEX_URL = 'https://neo.gsfc.nasa.gov/archive/csv/MOD_NDVI_16/';
const DATASET_NAME = 'NASA MODIS NDVI';

const samplePoints = {
  'الحوض الشرقي': [
    { lat: 16.61, lon: -7.25 },
    { lat: 16.2421, lon: -8.1721 },
    { lat: 15.8621, lon: -5.9543 },
    { lat: 16.1069, lon: -7.2143 },
  ],
  لعصابة: [
    { lat: 16.61, lon: -11.4 },
    { lat: 16.81, lon: -11.83 },
    { lat: 15.93, lon: -11.53 },
  ],
  اترارزة: [
    { lat: 17.5333, lon: -14.3333 },
    { lat: 17.51, lon: -14.76 },
    { lat: 16.91, lon: -15.28 },
    { lat: 16.91, lon: -15.65 },
  ],
  كوركول: [
    { lat: 16.15, lon: -13.5 },
    { lat: 16.18, lon: -12.6 },
    { lat: 16.26, lon: -13.23 },
  ],
};

function getLatestDatasetLink(indexHtml) {
  const matches = [...indexHtml.matchAll(/MOD_NDVI_16_(\d{4}-\d{2}-\d{2})\.CSV\.gz/g)]
    .map((match) => ({
      date: match[1],
      fileName: `MOD_NDVI_16_${match[1]}.CSV.gz`,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return matches[0] || null;
}

async function gunzipResponse(response) {
  if ('DecompressionStream' in window) {
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  throw new Error('لا يدعم المتصفح قراءة ملفات NASA المضغوطة.');
}

function parseNdviGrid(csvText) {
  return csvText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(',').map((value) => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : null;
    }))
    .filter((row) => row.some((value) => value !== null));
}

function normalizeNdvi(value) {
  if (value === null || value === undefined || value < -1) return null;
  if (value > 1) return value / 10000;
  return value;
}

function sampleGrid(grid, lat, lon) {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  if (!rows || !cols) return null;

  const row = Math.min(rows - 1, Math.max(0, Math.round(((90 - lat) / 180) * (rows - 1))));
  const col = Math.min(cols - 1, Math.max(0, Math.round(((lon + 180) / 360) * (cols - 1))));

  return normalizeNdvi(grid[row]?.[col]);
}

function describeVegetation(ndvi) {
  if (ndvi === null || ndvi === undefined) return { label: 'غير متاح', score: 0 };
  if (ndvi >= 0.45) return { label: 'غطاء نباتي جيد', score: 3 };
  if (ndvi >= 0.3) return { label: 'غطاء نباتي متوسط', score: 2 };
  if (ndvi >= 0.18) return { label: 'غطاء نباتي ضعيف', score: 1 };
  return { label: 'غطاء نباتي ضعيف جداً', score: 0 };
}

export async function getSatelliteVegetationStatus() {
  try {
    const indexResponse = await fetch(NEO_NDVI_INDEX_URL);
    if (!indexResponse.ok) throw new Error('تعذر جلب فهرس NASA NDVI.');

    const latest = getLatestDatasetLink(await indexResponse.text());
    if (!latest) throw new Error('لا توجد ملفات NDVI في فهرس NASA.');

    const dataUrl = `${NEO_NDVI_INDEX_URL}${latest.fileName}`;
    const dataResponse = await fetch(dataUrl);
    if (!dataResponse.ok) throw new Error('تعذر جلب ملف NASA NDVI.');

    const grid = parseNdviGrid(await gunzipResponse(dataResponse));
    const regions = Object.entries(samplePoints).reduce((acc, [regionName, points]) => {
      const values = points
        .map((point) => sampleGrid(grid, point.lat, point.lon))
        .filter((value) => value !== null);
      const ndvi = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
      const description = describeVegetation(ndvi);

      acc[regionName] = {
        ndvi,
        label: description.label,
        score: description.score,
      };
      return acc;
    }, {});

    return {
      source: DATASET_NAME,
      date: latest.date,
      dataUrl,
      imageUrl: `https://neo.gsfc.nasa.gov/view.php?datasetId=MOD_NDVI_16&date=${latest.date}`,
      regions,
    };
  } catch (error) {
    console.warn('Satellite vegetation unavailable:', error);
    return null;
  }
}
