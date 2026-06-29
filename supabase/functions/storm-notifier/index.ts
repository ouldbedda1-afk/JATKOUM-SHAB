// Supabase Edge Function: storm-notifier
// يُستدعى كل 30 دقيقة عبر pg_cron:
//   • ينشر الخلايا التي بلغت 30 دقيقة كنشرة في رصد اليوم
//   • يرسل تنبيه Telegram للتأكيد أو الحذف

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);


Deno.serve(async () => {
  try {
    const now = new Date();
    const thirtyMinAgo  = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const twoHoursAgo   = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();

    // جلب الخلايا النشطة غير المُخمَدة، آخر رصد < 2 ساعة
    const { data: cells, error } = await supabase
      .from('storm_cells')
      .select('*')
      .gt('last_seen', twoHoursAgo)
      .or(`suppressed_until.is.null,suppressed_until.lt.${now.toISOString()}`);

    if (error) throw error;
    if (!cells || cells.length === 0) {
      return new Response(JSON.stringify({ published: 0 }));
    }

    let published = 0;

    for (const cell of cells) {
      const age        = now.getTime() - new Date(cell.first_seen).getTime();
      const ageMin     = Math.round(age / 60000);
      const cityLabel  = cell.city    || `${cell.lat?.toFixed(1)}, ${cell.lon?.toFixed(1)}`;
      const wilayaLabel = cell.wilaya ? ` — ${cell.wilaya}` : '';

      // ── نشر تلقائي بعد 30 دقيقة (مرة واحدة فقط) ──
      if (age >= 30 * 60 * 1000 && !cell.published_at) {
        const bulletinText =
          `رُصدت عاصفة رعدية فوق ${cityLabel}${wilayaLabel} منذ ${ageMin} دقيقة.`;

        await supabase.from('weather_bulletins').insert([{
          text: bulletinText,
          icon: '⛈️',
        }]);

        await supabase.from('storm_cells')
          .update({ published_at: now.toISOString() })
          .eq('id', cell.id);

        published++;
        continue;
      }
    }

    return new Response(JSON.stringify({ published, total: cells.length }));
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
