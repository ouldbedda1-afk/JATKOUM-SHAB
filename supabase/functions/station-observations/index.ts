// Supabase Edge Function: station-observations
// يسحب قراءات محطات الأرصاد الجوية الموريتانية من wis2box (واجهة OGC API المفتوحة
// على wis2.meteomauritanie.mr) إلى جدول station_observations: صف لكل محطة في كل ساعة.
//
// يُستدعى عبر pg_cron كل ساعة (الدقيقة 20). يعيد قراءة آخر 6 ساعات في كل مرة، فتكتمل
// قراءة ساعة وصلت ناقصة، ولا تتكرر الصفوف (المفتاح: المحطة + الساعة).
//
// النشر:  supabase functions deploy station-observations --no-verify-jwt
// الطلب (POST): {} — أو { "hours": 800 } بمفتاح الخدمة لاسترجاع فترة أطول.
// أول تشغيل على جدول فارغ يسترجع حتى 90 يوماً تلقائياً.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const OAPI = 'https://wis2.meteomauritanie.mr/oapi';
const COLLECTION = 'urn:wmo:md:mr-onm:core.surface-based-observations.synop';
const PAGE = 2000;

// الاسم والولاية كما يكتبهما الموقع، بآخر جزء من معرّف WIGOS (الموانئ بلا معرّف تقليدي)
// lat/lon هنا تصحّح إحداثيات خاطئة في بيانات المحطة على wis2box
const STATIONS: Record<string, { name: string; wilaya: string | null; lat?: number; lon?: number }> = {
  '61499': { name: 'لعيون', wilaya: 'الحوض الغربي' },
  '61450': { name: 'تجكجة', wilaya: 'تكانت' },
  '61510': { name: 'سيلبابي', wilaya: 'كيدماغا' },
  '61498': { name: 'كيفة', wilaya: 'لعصابه' },
  '61492': { name: 'كيهيدي', wilaya: 'كوركول' },
  '61489': { name: 'روصو', wilaya: 'الترارزة' },
  '61470': { name: 'ألاك', wilaya: 'البراكنة' },
  '61497': { name: 'النعمة', wilaya: 'الحوض الشرقي' },
  // wis2box تضعه عند 18.65 شمالاً قرب تانيت
  '61521': { name: 'ميناء نواكشوط', wilaya: 'نواكشوط الجنوبية', lat: 17.99323, lon: -16.022342 },
  '61522': { name: 'ميناء انجاكو', wilaya: 'الترارزة' },
  '61526': { name: 'ميناء تانيت', wilaya: null },
};

// اسم المتغير في wis2box ← عمود الجدول
const COLUMNS: Record<string, string> = {
  air_temperature: 'temperature',
  relative_humidity: 'humidity',
  non_coordinate_pressure: 'pressure',
  wind_direction: 'wind_dir',
  wind_speed: 'wind_speed',
  total_precipitation_or_total_water_equivalent: 'precip_1h',
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function getJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    // استرجاع فترة أطول متاح لمفتاح الخدمة فقط، حتى لا يُثقَل خادم الأرصاد بطلبات عامة
    // وفي أول تشغيل (الجدول فارغ) يُسترجع التاريخ المتاح كله
    const isService = req.headers.get('authorization') === `Bearer ${SERVICE_KEY}`;
    const { count } = await supabase.from('station_observations').select('station_id', { count: 'exact', head: true });
    const hours = !count ? 24 * 90 : isService ? Math.min(Number(body.hours) || 6, 24 * 90) : 6;
    const since = new Date(Date.now() - hours * 3600_000).toISOString().slice(0, 19) + 'Z';

    // المحطات: الإحداثيات من wis2box ما لم تُصحَّح، والاسم والولاية من STATIONS
    const stationsGeo = await getJson(`${OAPI}/collections/stations/items?f=json&limit=100`);
    const stations = new Map<string, { name: string; wilaya: string | null; lat: number; lon: number }>();
    for (const f of stationsGeo.features ?? []) {
      const p = f.properties ?? {};
      const localId = String(p.wigos_station_identifier).split('-').pop()!;
      const known = STATIONS[localId] ?? { name: p.name, wilaya: null };
      stations.set(p.wigos_station_identifier, {
        name: known.name, wilaya: known.wilaya,
        lat: known.lat ?? f.geometry.coordinates[1], lon: known.lon ?? f.geometry.coordinates[0],
      });
    }

    // القراءات: كل متغير سجلّ مستقل، فتُجمع في صف لكل محطة وساعة
    const rows = new Map<string, Record<string, unknown>>();
    for (let offset = 0; ; offset += PAGE) {
      const page = await getJson(
        `${OAPI}/collections/${COLLECTION}/items?f=json&limit=${PAGE}&offset=${offset}&datetime=${since}/..`,
      );
      for (const f of page.features ?? []) {
        const p = f.properties ?? {};
        const column = COLUMNS[p.name];
        const station = stations.get(p.wigos_station_identifier);
        if (!column || !station || p.value == null) continue;
        // أمطار ساعة واحدة فقط، حتى يصحّ جمعها
        if (column === 'precip_1h') {
          const [from, to] = String(p.phenomenonTime).split('/');
          if (!to || Date.parse(to) - Date.parse(from) !== 3600_000) continue;
        }
        const key = `${p.wigos_station_identifier}|${p.reportTime}`;
        if (!rows.has(key)) {
          rows.set(key, {
            station_id: p.wigos_station_identifier, name_ar: station.name, wilaya: station.wilaya,
            lat: station.lat, lon: station.lon, observed_at: p.reportTime,
            temperature: null, humidity: null, pressure: null, wind_dir: null, wind_speed: null, precip_1h: null,
          });
        }
        rows.get(key)![column] = Math.round(p.value * 10) / 10;
      }
      if ((page.features ?? []).length < PAGE) break;
    }

    const list = [...rows.values()];
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await supabase.from('station_observations')
        .upsert(list.slice(i, i + 500), { onConflict: 'station_id,observed_at' });
      if (error) throw error;
    }

    const latest = list.reduce((m, r) => (String(r.observed_at) > m ? String(r.observed_at) : m), '');
    return json({ stations: stations.size, hours, rows: list.length, latest });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
