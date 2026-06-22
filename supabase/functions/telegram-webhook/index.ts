// Supabase Edge Function: telegram-webhook
// يستقبل ضغط أزرار تيليجرام (نشر/رفض) ويحدّث حالة البلاغ في قاعدة البيانات.
//
// النشر:  supabase functions deploy telegram-webhook --no-verify-jwt
// الربط:  https://api.telegram.org/bot<token>/setWebhook?url=<function-url>
// الأسرار: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (تُضبط مسبقاً)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_CHAT = String(Deno.env.get('TELEGRAM_CHAT_ID') ?? '');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TABLE: Record<string, string> = {
  livestock: 'livestock_reports',
  rain: 'rain_reports',
  news: 'news_submissions',
};

async function tg(method: string, payload: Record<string, unknown>) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  try {
    const update = await req.json();
    const cq = update.callback_query;
    if (!cq) return new Response('ok'); // نتجاهل غير ضغطات الأزرار

    const fromId = String(cq.from?.id ?? '');
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    const data: string = cq.data ?? '';

    // أمان: فقط الأدمن المصرّح له ينفّذ
    if (ADMIN_CHAT && fromId !== ADMIN_CHAT) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'غير مصرّح', show_alert: true });
      return new Response('ok');
    }

    const [action, kind, id] = data.split(':');
    const table = TABLE[kind];
    if (!table || !id || !['approve', 'reject'].includes(action)) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'طلب غير صالح' });
      return new Response('ok');
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const { error } = await supabase.from(table).update({ status }).eq('id', id);

    const resultText = error
      ? `⚠️ خطأ: ${error.message}`
      : action === 'approve' ? '✅ تم النشر' : '❌ تم الرفض';

    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: resultText });

    // نزيل الأزرار ونضيف الحالة للرسالة
    if (chatId && messageId && !error) {
      const tail = `\n\n${status === 'approved' ? '✅ نُشر' : '❌ رُفض'} — ${new Date().toLocaleString('en-GB')}`;
      if (cq.message.caption !== undefined) {
        await tg('editMessageCaption', { chat_id: chatId, message_id: messageId, caption: (cq.message.caption || '') + tail });
      } else {
        await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: (cq.message.text || '') + tail });
      }
    }

    return new Response('ok');
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
