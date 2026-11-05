// Supabase Edge Function: locust-observations
// مسوحات الجراد الصحراوي في موريتانيا من خدمة الإنذار بالجراد في الفاو (FAO DLIS):
// طبقة RAMSES العامة على ArcGIS، وهي ملاحظات فرق المركز الوطني لمكافحة الجراد الصحراوي
// بعد تأكيدها. كل صف موقع مسح: وُجد فيه جراد أو لم يوجد، ونوعه وكثافته وسلوكه.
//
// يُستدعى عبر pg_cron مرتين يومياً. يعيد قراءة آخر 60 يوماً في كل مرة ويستبدلها، لأن الفاو
// تضيف الملاحظات بعد أيام من رصدها. أول تشغيل على جدول فارغ يسترجع سنة كاملة.
// عند ظهور أسراب أو حشود أو تجمعات أو تكاثر جديد يُنبَّه المشرف على تيليغرام فقط، ولا يُنشر شيء.
//
// النشر:  supabase functions deploy locust-observations --no-verify-jwt
// الطلب (POST): {} — أو { "days": 400 } بمفتاح الخدمة لاسترجاع فترة أطول.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_ADMIN_ID') ?? '';
const SITE = 'https://www.jatkoumshab.com';

const LAYER = 'https://services5.arcgis.com/sjP4Ugu5s0dZWLjd/arcgis/rest/services/Ramses_Observations_Dashboard_View/FeatureServer/0/query';
const PAGE = 1000;

// اسم الولاية في بيانات الفاو ← اسمها في الموقع
const WILAYAS: Record<string, string> = {
  'Hodh Ech Chargui': 'الحوض الشرقي', 'Hodh El Gharbi': 'الحوض الغربي', 'Assaba': 'لعصابه',
  'Gorgol': 'كوركول', 'Brakna': 'البراكنة', 'Trarza': 'الترارزة', 'Adrar': 'آدرار',
  'Dakhlet Nouadhibou': 'داخلة نواذيبو', 'Tagant': 'تكانت', 'Guidimaka': 'كيدماغا',
  'Tiris Zemmour': 'تيرس زمور', 'Inchiri': 'انشيري', 'Nouakchott': 'نواكشوط',
};

const FIELDS = ['OBJECTID', 'Report_ID', 'Obs_Date', 'Region', 'District', 'Village', 'Latitude', 'Longitude',
  'Locust_Type', 'Presence_Type', 'Locust_Phase', 'Behaviour', 'Maturity', 'Breeding',
  'Sum__Area_Treated_ha', 'Vegetation_State'];

// 3: أسراب أو حشود يرقات، 2: تجمعات أو تكاثر، 1: أفراد متفرقة، 0: لا جراد
function severity(a: Record<string, unknown>): number {
  const type = String(a.Locust_Type ?? '').toUpperCase();
  if (type === 'NO LOCUST' || !type) return 0;
  if (type.includes('SWARM') || type.includes('BAND')) return 3;
  const phase = String(a.Locust_Phase ?? '').toUpperCase();
  const breeding = String(a.Breeding ?? '').toUpperCase();
  if (type.includes('GROUP') || String(a.Behaviour ?? '').toUpperCase() === 'GROUPS' ||
      phase.startsWith('GREGAR') || phase.startsWith('TRANSI') ||
      (breeding && breeding !== 'N/A')) return 2;
  return 1;
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function tg(text: string) {
  if (!BOT_TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

async function fetchSince(since: string) {
  const out: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where: `Country='Mauritania' AND Obs_Date >= DATE '${since}'`,
      outFields: FIELDS.join(','), orderByFields: 'OBJECTID', returnGeometry: 'false',
      resultOffset: String(offset), resultRecordCount: String(PAGE), f: 'json',
    });
    const res = await fetch(`${LAYER}?${params}`);
    if (!res.ok) throw new Error(`FAO ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`FAO: ${data.error.message}`);
    out.push(...data.features.map((f: { attributes: Record<string, unknown> }) => f.attributes));
    if (!data.exceededTransferLimit && data.features.length < PAGE) break;
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const isService = req.headers.get('authorization') === `Bearer ${SERVICE_KEY}`;
    const { count } = await supabase.from('locust_observations').select('*', { count: 'exact', head: true });
    const days = !count ? 365 : isService ? Math.min(Number(body.days) || 60, 3650) : 60;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const rows = (await fetchSince(since))
      .filter((a) => a.Obs_Date && a.Latitude != null && a.Longitude != null)
      .map((a) => ({
        id: String(a.OBJECTID),
        report_id: a.Report_ID ?? null,
        obs_date: new Date(Number(a.Obs_Date)).toISOString().slice(0, 10),
        region: a.Region ?? null,
        wilaya: WILAYAS[String(a.Region)] ?? null,
        district: a.District ?? null,
        village: a.Village ?? null,
        lat: Number(a.Latitude), lon: Number(a.Longitude),
        locust_type: a.Locust_Type ?? null,
        presence_type: a.Presence_Type ?? null,
        phase: a.Locust_Phase ?? null,
        behaviour: a.Behaviour ?? null,
        maturity: a.Maturity ?? null,
        breeding: a.Breeding ?? null,
        area_treated_ha: Number(a.Sum__Area_Treated_ha) || 0,
        vegetation_state: a.Vegetation_State ?? null,
        severity: severity(a),
      }));

    // الملاحظات الشديدة التي لم نرها من قبل، للتنبيه
    const { data: known } = await supabase.from('locust_observations')
      .select('id').gte('obs_date', since).gte('severity', 2);
    const knownIds = new Set((known ?? []).map((r) => r.id));
    const fresh = count ? rows.filter((r) => r.severity >= 2 && !knownIds.has(r.id)) : [];

    const { error: delError } = await supabase.from('locust_observations').delete().gte('obs_date', since);
    if (delError) throw delError;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('locust_observations').insert(rows.slice(i, i + 500));
      if (error) throw error;
    }

    if (fresh.length) {
      const label = (s: number) => s >= 3 ? '🔴 أسراب أو حشود يرقات' : '🟠 تجمعات أو تكاثر';
      const lines = fresh.slice(0, 15).map((r) =>
        `${label(r.severity)} — ${r.wilaya ?? r.region}${r.district ? ` (${r.district})` : ''} · ${r.obs_date}`);
      await tg(`🦗 *الجراد الصحراوي: ملاحظات جديدة في موريتانيا*\n\n${lines.join('\n')}` +
        `${fresh.length > 15 ? `\n… و${fresh.length - 15} أخرى` : ''}\n\n` +
        `المصدر: الفاو (DLIS)، مسوحات المركز الوطني لمكافحة الجراد.\n🔗 ${SITE}/pastures`);
    }
    return json({ ok: true, since, rows: rows.length, alerts: fresh.length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
