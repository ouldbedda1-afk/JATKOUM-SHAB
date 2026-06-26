// Supabase Edge Function: telegram-webhook
// يستقبل:
//   • ضغطات أزرار الموافقة/الرفض (callback_query)
//   • أوامر نشر النشرة الجوية من الأدمن (text messages)
//
// أوامر النشرة الجوية:
//   /نشر <نص>          → ينشر النص في "رصد اليوم"
//   /حذف               → يحذف آخر نشرة منشورة
//   /نشرات             → يعرض النشرات النشطة
//
// النشر:  supabase functions deploy telegram-webhook --no-verify-jwt
// الربط:  https://api.telegram.org/bot<token>/setWebhook?url=<function-url>
// الأسرار: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const ADMIN_CHAT = String(Deno.env.get('TELEGRAM_CHAT_ID') ?? '');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TABLE: Record<string, string> = {
  livestock: 'livestock_reports',
  rain:      'rain_reports',
  news:      'news_submissions',
};

async function tg(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function reply(chatId: number | string, text: string) {
  await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

// ─── معالجة أوامر النشرة الجوية ───────────────────────────────────────────

async function handleBulletinCommand(chatId: number | string, text: string) {
  const trimmed = text.trim();

  // /نشر <نص>
  if (trimmed.startsWith('/نشر') || trimmed.startsWith('/publish')) {
    const content = trimmed.replace(/^\/نشر\s*|^\/publish\s*/u, '').trim();
    if (!content) {
      await reply(chatId, '⚠️ أرسل النص بعد الأمر:\n<code>/نشر نص النشرة الجوية هنا</code>');
      return true;
    }
    // اختار أيقونة تلقائياً من محتوى النص
    const icon =
      /عاصف|رعد|برق/.test(content) ? '⛈️' :
      /أمطار|هطول|مطر/.test(content)  ? '🌧️' :
      /رياح/.test(content)             ? '🌬️' :
      /حر|حرارة/.test(content)        ? '🌡️' :
      '📢';
    const { error } = await supabase.from('weather_bulletins').insert([{ text: content, icon }]);
    if (error) {
      await reply(chatId, `❌ خطأ في النشر: ${error.message}`);
    } else {
      await reply(chatId, `✅ تم نشر النشرة في "رصد اليوم"\n\n${icon} ${content}`);
    }
    return true;
  }

  // /حذف — يحذف آخر نشرة
  if (trimmed === '/حذف' || trimmed === '/delete') {
    const { data, error: fetchErr } = await supabase
      .from('weather_bulletins')
      .select('id, text')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (fetchErr || !data) {
      await reply(chatId, '🈳 لا توجد نشرات منشورة حالياً.');
      return true;
    }
    const { error } = await supabase.from('weather_bulletins').delete().eq('id', data.id);
    if (error) {
      await reply(chatId, `❌ خطأ في الحذف: ${error.message}`);
    } else {
      await reply(chatId, `🗑️ تم حذف النشرة:\n${data.text}`);
    }
    return true;
  }

  // /نشرات — عرض النشرات النشطة
  if (trimmed === '/نشرات' || trimmed === '/bulletins') {
    const { data, error } = await supabase
      .from('weather_bulletins')
      .select('id, icon, text, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error || !data?.length) {
      await reply(chatId, '🈳 لا توجد نشرات منشورة حالياً.');
      return true;
    }
    const list = data.map((b, i) =>
      `${i + 1}. ${b.icon} ${b.text.slice(0, 80)}${b.text.length > 80 ? '...' : ''}`
    ).join('\n\n');
    await reply(chatId, `📋 النشرات النشطة (${data.length}):\n\n${list}`);
    return true;
  }

  return false; // لم يكن أمر نشرة
}

// ─── الدالة الرئيسية ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const update = await req.json();

    // ── معالجة ضغطات الأزرار (approve/reject) ──
    const cq = update.callback_query;
    if (cq) {
      const fromId  = String(cq.from?.id ?? '');
      const chatId  = cq.message?.chat?.id;
      const msgId   = cq.message?.message_id;
      const data: string = cq.data ?? '';

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

      if (chatId && msgId && !error) {
        const tail = `\n\n${status === 'approved' ? '✅ نُشر' : '❌ رُفض'} — ${new Date().toLocaleString('en-GB')}`;
        if (cq.message.caption !== undefined) {
          await tg('editMessageCaption', { chat_id: chatId, message_id: msgId, caption: (cq.message.caption || '') + tail });
        } else {
          await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: (cq.message.text || '') + tail });
        }
      }
      return new Response('ok');
    }

    // ── معالجة رسائل النص (أوامر النشرة) ──
    const msg = update.message;
    if (msg?.text) {
      const fromId = String(msg.from?.id ?? '');
      const chatId = msg.chat?.id;

      // أمان: فقط الأدمن
      if (ADMIN_CHAT && fromId !== ADMIN_CHAT) {
        return new Response('ok');
      }

      const handled = await handleBulletinCommand(chatId, msg.text);

      // مساعدة: أرسل قائمة الأوامر إن كانت الرسالة غير معروفة وتبدأ بـ /
      if (!handled && msg.text.startsWith('/')) {
        await reply(chatId,
          '📋 أوامر النشرة الجوية:\n\n' +
          '/نشر &lt;نص&gt; — نشر نشرة في رصد اليوم\n' +
          '/حذف — حذف آخر نشرة\n' +
          '/نشرات — عرض النشرات النشطة'
        );
      }
    }

    return new Response('ok');
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
