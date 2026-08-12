// Supabase Edge Function: notify-telegram
// يرسل إشعار تيليجرام للأدمن عند بلاغ جديد، مع صورة البلاغ وأزرار نشر/رفض.
//
// النشر:   supabase functions deploy notify-telegram --no-verify-jwt
// الأسرار: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SITE_URL (اختياري)

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const CHAT = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const SITE = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const KIND: Record<string, string> = {
  livestock_reports: 'livestock',
  rain_reports: 'rain',
  news_submissions: 'news',
  forecast: 'forecast',
};

function buildCaption(table: string, r: Record<string, unknown>): string {
  if (table === 'livestock_reports') {
    const t = r.report_type === 'lost' ? 'مفقود' : r.report_type === 'found' ? 'موجود' : '';
    const loc = [r.region, r.village].filter(Boolean).join(' - ');
    return `🐫 بلاغ ظالة جديد بانتظار المراجعة\n` +
      `النوع: ${r.animal_type ?? '-'}${t ? ` (${t})` : ''}\n` +
      (loc ? `المكان: ${loc}\n` : '') +
      (r.contact_phone ? `الهاتف: ${r.contact_phone}\n` : '') +
      (r.description ? `الوصف: ${r.description}\n` : '');
  }
  if (table === 'rain_reports') {
    return `🌧️ تبشيرة مطر جديدة بانتظار المراجعة\n` +
      (r.city ? `المنطقة: ${r.city}\n` : '') +
      (r.rain_intensity ? `الشدة: ${r.rain_intensity}\n` : '') +
      (r.facebook_name ? `الناشر: ${r.facebook_name}\n` : '');
  }
  if (table === 'news_submissions') {
    return `📰 خبر جديد بانتظار المراجعة\n` + (r.title ? `العنوان: ${r.title}\n` : '');
  }
  if (table === 'forecast') {
    const catIcon = r.category === 'عواصف' ? '⛈️' : r.category === 'طقس حار' ? '🔥' : '🌧️';
    return `${catIcon} *توقّع جوي جديد نُشر:*\n\n` +
      `📌 ${r.title}\n` +
      (r.wilaya ? `📍 ${r.wilaya}\n` : '') +
      `\n🔗 ${SITE}/news/${r.slug}`;
  }
  return `🔔 إدخال جديد في ${table} بانتظار المراجعة`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    if (body.type && body.type !== 'INSERT') return new Response('skip', { headers: cors });

    const table: string = body.table ?? 'unknown';
    const r: Record<string, unknown> = body.record ?? body;
    const kind = KIND[table] ?? 'unknown';
    const id = r.id;

    const caption = buildCaption(table, r) + `\n🔎 المراجعة عبر الموقع: ${SITE}/admin`;
    const image = r.image_url as string | undefined;

    // أزرار النشر/الرفض (إن توفّر معرّف)
    const reply_markup = id
      ? {
          inline_keyboard: [[
            { text: '✅ نشر', callback_data: `approve:${kind}:${id}` },
            { text: '❌ رفض', callback_data: `reject:${kind}:${id}` },
          ]],
        }
      : undefined;

    const send = async (method: string, payload: Record<string, unknown>) => {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    };

    let out;
    if (image && /^https?:\/\//.test(image)) {
      out = await send('sendPhoto', { chat_id: CHAT, photo: image, caption, reply_markup });
      // احتياط: إن تعذّر جلب الصورة، نرسل النص حتى لا يضيع الإشعار
      if (!out.ok) {
        out = await send('sendMessage', { chat_id: CHAT, text: caption, disable_web_page_preview: true, reply_markup });
      }
    } else {
      out = await send('sendMessage', { chat_id: CHAT, text: caption, disable_web_page_preview: true, reply_markup });
    }

    return new Response(JSON.stringify({ ok: out.ok }), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
  }
});
