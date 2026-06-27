// Supabase Edge Function: storm-notifier
// يُستدعى كل 30 دقيقة عبر pg_cron:
//   • ينشر الخلايا التي بلغت 30 دقيقة كنشرة في رصد اليوم
//   • يرسل تنبيه Telegram للتأكيد أو الحذف

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function tg(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

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
      return new Response(JSON.stringify({ published: 0, notified: 0 }));
    }

    let published = 0;
    let notified  = 0;

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

        // إشعار Telegram بالنشر
        await tg('sendMessage', {
          chat_id: ADMIN_ID,
          text:
            `⛈️ <b>نُشر تلقائياً في رصد اليوم</b>\n` +
            `📍 ${cityLabel}${wilayaLabel}\n` +
            `⏱️ مدة الرصد: ${ageMin} دقيقة\n\n` +
            `هل العاصفة مازالت نشطة؟`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ مازالت نشطة', callback_data: `storm:keep:${cell.id}` },
              { text: '❌ انتهت — احذف', callback_data: `storm:suppress:${cell.id}` },
            ]],
          },
        });

        published++;
        notified++;
        continue;
      }

      // ── تنبيه دوري للخلايا غير المنشورة بعد (< 30 دقيقة) ──
      const notifyThreshold = new Date(now.getTime() - 25 * 60 * 1000).toISOString();
      if (!cell.published_at && (!cell.notified_at || cell.notified_at < notifyThreshold)) {
        await tg('sendMessage', {
          chat_id: ADMIN_ID,
          text:
            `⛈️ <b>خلية عاصفة نشطة</b>\n` +
            `📍 ${cityLabel}${wilayaLabel}\n` +
            `⏱️ منذ ${ageMin} دقيقة\n\n` +
            `ستُنشر تلقائياً في رصد اليوم خلال ${30 - ageMin} دقيقة.`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ مازالت نشطة', callback_data: `storm:keep:${cell.id}` },
              { text: '❌ انتهت — احذف', callback_data: `storm:suppress:${cell.id}` },
            ]],
          },
        });

        await supabase.from('storm_cells')
          .update({ notified_at: now.toISOString() })
          .eq('id', cell.id);

        notified++;
      }
    }

    return new Response(JSON.stringify({ published, notified, total: cells.length }));
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
