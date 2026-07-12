// Supabase Edge Function: fb-comment-autoreply
// يستقبل ويب-هوك تعليقات صفحة فيسبوك (Beddetiii)، يقترح رداً سياقياً مبنياً على آخر
// الأخبار/التوقعات المنشورة في news_articles (بدون أي نموذج ذكاء اصطناعي خارجي)،
// ثم يرسل السؤال والرد المقترح إلى تيليجرام لمراجعة الأدمن — لا يُنشر أي شيء تلقائياً.
// الموافقة الفعلية والنشر على فيسبوك تتم من telegram-webhook عند الضغط على "✅ نشر".
//
// النشر:   supabase functions deploy fb-comment-autoreply --no-verify-jwt
// الربط:   في إعدادات تطبيق Meta for Developers → Webhooks → Page →
//          Callback URL = رابط هذه الدالة، Verify Token = نفس قيمة FB_VERIFY_TOKEN
//          واشترك في حقل "feed" لصفحة Beddetiii.
// الأسرار: FB_PAGE_ID, FB_VERIFY_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SITE_URL (اختياري)
//          (لاحظ: FB_PAGE_ACCESS_TOKEN غير مطلوب هنا — يُستخدم فقط في telegram-webhook عند النشر الفعلي)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERIFY_TOKEN = Deno.env.get('FB_VERIFY_TOKEN') ?? '';
const PAGE_ID       = Deno.env.get('FB_PAGE_ID') ?? '';
const SITE          = Deno.env.get('SITE_URL') ?? 'https://www.jatkoumshab.com';
const TG_TOKEN       = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TG_CHAT        = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ولايات موريتانيا (للمطابقة مع نص التعليق)
const WILAYAS = [
  'نواكشوط الشمالية', 'نواكشوط الغربية', 'نواكشوط الجنوبية', 'نواكشوط',
  'الترارزة', 'البراكنة', 'كوركول', 'كيدي ماغا', 'لعصابه',
  'الحوض الغربي', 'الحوض الشرقي', 'تكانت', 'آدرار',
  'إينشيري', 'داخلت نواذيبو', 'نواذيبو', 'تيرس زمور',
];

// كلمات مفتاحية لكل تصنيف أخبار
const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  'عواصف':   /عاصف|رعد|برق/u,
  'أمطار':   /مطر|أمطار|امطار|هطول|غيث/u,
  'طقس':     /رياح|رمال|غبار|عاصفة رملية/u,
  'طقس حار': /حر|حرارة|سخون/u,
};

const GREETING_RE = /السلام عليكم|مرحبا|أهلا|اهلا|صباح الخير|مساء الخير/u;
const THANKS_RE    = /شكرا|شكراً|بارك الله|جزاكم الله/u;

function findWilaya(text: string): string | null {
  return WILAYAS.find((w) => text.includes(w)) || null;
}

function findCategory(text: string): string | null {
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS)) {
    if (re.test(text)) return cat;
  }
  return null;
}

// يبني رداً سياقياً مقترحاً، أو null إذا لم نملك ثقة كافية
// (لتفادي اقتراح ردود عامة على تعليقات غير متعلقة بالطقس)
async function buildReply(commentText: string): Promise<string | null> {
  const text = commentText.trim();
  if (!text) return null;

  const wilaya   = findWilaya(text);
  const category = findCategory(text);

  if (wilaya || category) {
    let q = supabase
      .from('news_articles')
      .select('title, slug, published_at')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(1);
    if (wilaya)   q = q.eq('wilaya', wilaya);
    else if (category) q = q.eq('category', category);

    const { data } = await q.maybeSingle();

    if (data) {
      const link = `${SITE}/news/${data.slug}`;
      return wilaya
        ? `مرحباً 🌦️ آخر توقعاتنا لـ${wilaya}:\n"${data.title}"\n${link}`
        : `مرحباً 🌦️ آخر تحديث لدينا:\n"${data.title}"\n${link}`;
    }

    return wilaya
      ? `مرحباً 🌦️ لا نرصد حالياً توقعات بارزة جديدة لـ${wilaya}، تابعونا للتحديثات: ${SITE}`
      : `مرحباً 🌦️ تابعوا آخر تحديثات الطقس على موقعنا: ${SITE}`;
  }

  if (GREETING_RE.test(text)) {
    return 'وعليكم السلام 🌦️ أهلاً بكم في جاتكم اسحاب، تابعونا للتحديثات الجوية المباشرة.';
  }

  if (THANKS_RE.test(text)) {
    return 'العفو 🙏 تابعونا دائماً لآخر تحديثات الطقس والأمطار.';
  }

  // لا نقترح رداً على التعليقات غير المتعلقة بالطقس
  return null;
}

async function notifyTelegram(id: string, commentText: string, proposedReply: string) {
  const text =
    `💬 تعليق جديد على فيسبوك بانتظار مراجعتك:\n\n` +
    `"${commentText}"\n\n` +
    `📝 الرد المقترح:\n"${proposedReply}"`;

  const reply_markup = {
    inline_keyboard: [[
      { text: '✅ نشر الرد', callback_data: `approve:fbreply:${id}` },
      { text: '❌ تجاهل', callback_data: `reject:fbreply:${id}` },
    ]],
  };

  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, reply_markup }),
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── التحقق من الويب-هوك (Meta verification handshake) ──
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const rawText = await req.text();
    // تسجيل تشخيصي مؤقت: نحفظ أي طلب POST يصل من فيسبوك مهما كان محتواه، لتأكيد وصول الويب-هوك أصلاً
    supabase.from('fb_pending_replies').insert([{
      post_id: 'debug', comment_id: `__raw__${Date.now()}`,
      comment_text: rawText.slice(0, 2000), proposed_reply: 'debug-capture',
    }]).then(() => {}, () => {});
    const body = JSON.parse(rawText);
    if (body.object !== 'page') return new Response('ok');

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'feed') continue;
        const value = change.value || {};

        // فقط تعليقات جديدة (وليس تعديلاً أو حذفاً)
        if (value.item !== 'comment' || value.verb !== 'add') continue;

        // لا نتعامل مع تعليقاتنا نحن (تفادي حلقة لا نهائية)
        if (PAGE_ID && value.from?.id === PAGE_ID) continue;
        // لا نردّ على ردودنا السابقة كتعليق فرعي
        if (value.parent_id && value.parent_id !== value.post_id) continue;

        const message = value.message as string | undefined;
        const commentId = value.comment_id as string | undefined;
        const postId = value.post_id as string | undefined;
        if (!message || !commentId) continue;

        const proposed = await buildReply(message);
        if (!proposed) continue;

        const { data: row, error } = await supabase
          .from('fb_pending_replies')
          .insert([{ post_id: postId, comment_id: commentId, comment_text: message, proposed_reply: proposed }])
          .select('id')
          .single();

        if (error) {
          console.error('insert fb_pending_replies failed:', error);
          continue;
        }
        if (row) {
          await notifyTelegram(row.id, message, proposed);
        }
      }
    }

    return new Response('ok');
  } catch (e) {
    console.error('fb-comment-autoreply error:', e);
    return new Response('ok'); // نُرجع 200 دائماً كي لا يُعطّل Meta الويب-هوك
  }
});
