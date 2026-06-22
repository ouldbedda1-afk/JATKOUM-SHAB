// Supabase Edge Function: notify-telegram
// يرسل إشعار تيليجرام للأدمن عند وصول بلاغ جديد (ظالة / مطر / خبر).
// يُستدعى تلقائياً عبر Database Webhook على حدث INSERT.
//
// النشر:
//   supabase functions deploy notify-telegram --no-verify-jwt
// الأسرار:
//   supabase secrets set TELEGRAM_BOT_TOKEN=<token>
//   supabase secrets set TELEGRAM_CHAT_ID=<chat id>
//   supabase secrets set SITE_URL=https://www.jatkoumshab.com   (اختياري)

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const CHAT = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const SITE = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function buildMessage(table: string, r: Record<string, unknown>): string {
  const adminLink = `${SITE}/#/admin`;
  if (table === 'livestock_reports') {
    const t = r.report_type === 'lost' ? 'مفقود' : r.report_type === 'found' ? 'موجود' : '';
    const loc = [r.region, r.village].filter(Boolean).join(' - ');
    return `🐫 بلاغ ظالة جديد بانتظار المراجعة\n` +
      `النوع: ${r.animal_type ?? '-'}${t ? ` (${t})` : ''}\n` +
      (loc ? `المكان: ${loc}\n` : '') +
      (r.contact_phone ? `الهاتف: ${r.contact_phone}\n` : '') +
      `\n🔎 راجِعه: ${adminLink}`;
  }
  if (table === 'rain_reports') {
    return `🌧️ تبشيرة مطر جديدة بانتظار المراجعة\n` +
      (r.city ? `المنطقة: ${r.city}\n` : '') +
      (r.facebook_name ? `الناشر: ${r.facebook_name}\n` : '') +
      `\n🔎 راجِعها: ${adminLink}`;
  }
  if (table === 'news_submissions') {
    return `📰 خبر جديد بانتظار المراجعة\n` +
      (r.title ? `العنوان: ${r.title}\n` : '') +
      `\n🔎 راجِعه: ${adminLink}`;
  }
  return `🔔 إدخال جديد في ${table} بانتظار المراجعة\n🔎 ${adminLink}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    // صيغة Database Webhook: { type, table, record, schema, old_record }
    const table: string = body.table ?? body.record?.table ?? 'unknown';
    const record: Record<string, unknown> = body.record ?? body;

    // نتجاهل غير الإدراج
    if (body.type && body.type !== 'INSERT') {
      return new Response('skip', { headers: cors });
    }

    const text = buildMessage(table, record);
    const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
    });
    const ok = tgRes.ok;
    return new Response(JSON.stringify({ ok }), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
  }
});
