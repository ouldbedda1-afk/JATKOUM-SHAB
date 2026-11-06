// Supabase Edge Function: river-flood
// تنبيه المشرف على تيليغرام بفيضان نهر السنغال على الضفة الموريتانية: كل صباح تُقرأ توقعات التصريف
// لثلاثين يوماً في سبع محطات من ݣوري إلى انجاݣو (Copernicus GloFAS عبر Open-Meteo)، ويُنبَّه المشرف حين
// يُتوقع أن تبلغ محطة «خطر فيضان» أو «فيضان كبير» لأول مرة (أو يرتفع مستواها). المشرف يقرر النشر.
// العتبات والبلديات في _shared/riverStations.ts (مولَّد من src/riverStations.js)، وآخر مستوى لكل محطة
// في جدول river_flood_state فلا يتكرر التنبيه كل يوم. الصفحة العامة: /river
//
// ويحدّث صور الأقمار الصناعية للنهر عند كل محطة (images.ts).
//
// يُستدعى عبر pg_cron يومياً (036_river_flood.sql).
// النشر:  supabase functions deploy river-flood --no-verify-jwt
// الطلب (POST): {}

import { createClient } from 'npm:@supabase/supabase-js@2';
import { RIVER_STATIONS, RIVER_PLACES } from '../_shared/riverStations.ts';
import { updateRiverImages } from './images.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const SITE = 'https://www.jatkoumshab.com';
const DAYS_AHEAD = 30;

const LEVEL_NAMES = ['عادي', 'أعلى من المعتاد', 'خطر فيضان', 'فيضان كبير'];
const level = (st: typeof RIVER_STATIONS[number], q: number) => (q >= st.major ? 3 : q >= st.flood ? 2 : q >= st.high ? 1 : 0);
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const arDate = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return `${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}`; };
const fmtQ = (q: number) => Math.round(q).toLocaleString('en-US');

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function tg(text: string) {
  if (!BOT_TOKEN || !ADMIN_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

Deno.serve(async () => {
  try {
    const params = new URLSearchParams({
      latitude: RIVER_STATIONS.map((s) => s.lat).join(','),
      longitude: RIVER_STATIONS.map((s) => s.lon).join(','),
      daily: 'river_discharge', forecast_days: String(DAYS_AHEAD),
    });
    const res = await fetch(`https://flood-api.open-meteo.com/v1/flood?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const raw = await res.json();
    const series = (Array.isArray(raw) ? raw : [raw]).map((s) => s.daily as { time: string[]; river_discharge: (number | null)[] });

    const { data: state } = await supabase.from('river_flood_state').select('station, level');
    const before = new Map((state ?? []).map((r) => [r.station, r.level as number]));

    const now = RIVER_STATIONS.map((st, i) => {
      const q = series[i].river_discharge.map((v) => v ?? 0);
      const peakK = q.indexOf(Math.max(...q));
      const lv = level(st, q[peakK]);
      const firstK = Math.max(0, q.findIndex((v) => level(st, v) >= lv));
      return { st, i, level: lv, peak: q[peakK], peakDay: series[i].time[peakK], from: series[i].time[firstK] };
    });

    // تنبيه حين تبلغ محطة «خطر فيضان» فأعلى ويرتفع مستواها عمّا نُبِّه به آخر مرة
    const rising = now.filter((r) => r.level >= 2 && r.level > (before.get(r.st.name) ?? 0));
    if (rising.length) {
      const lines = rising.map((r) => {
        const near = RIVER_PLACES.filter((p) => p.station === r.i).map((p) => p.name).join('، ');
        return `${r.level === 3 ? '🚨' : '⚠️'} ${r.st.name} (${r.st.wilaya}): ${LEVEL_NAMES[r.level]} ابتداءً من ${arDate(r.from)}، ` +
          `والذروة نحو ${fmtQ(r.peak)} م³/ث في ${arDate(r.peakDay)} (مستوى الفيضان ${fmtQ(r.st.flood)}).` +
          (near ? `\nالمناطق القريبة: ${near}` : '');
      });
      await tg(`🌊 فيضان نهر السنغال: توقعات الأيام الثلاثين القادمة\n\n${lines.join('\n\n')}\n\n` +
        `المصدر: Copernicus GloFAS (تقديرات نموذج، لا قراءات مقاييس)\n🔗 ${SITE}/river`);
    }

    const { error } = await supabase.from('river_flood_state').upsert(now.map((r) => ({
      station: r.st.name, level: r.level, peak: Math.round(r.peak), peak_day: r.peakDay, updated_at: new Date().toISOString(),
    })), { onConflict: 'station' });
    if (error) throw error;
    const images = await updateRiverImages(supabase).catch((e) => `صور: ${e}`);
    return json({ ok: true, alerts: rising.length, images, levels: Object.fromEntries(now.map((r) => [r.st.name, r.level])) });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
