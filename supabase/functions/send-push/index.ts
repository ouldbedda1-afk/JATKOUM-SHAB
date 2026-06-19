// Supabase Edge Function: send-push
// إرسال إشعار Web Push لكل المشتركين المخزّنين في push_subscriptions.
//
// النشر:
//   supabase functions deploy send-push
// المتغيرات المطلوبة (supabase secrets set ...):
//   VAPID_PUBLIC_KEY   المفتاح العام (نفس VITE_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY  المفتاح الخاص
//   VAPID_SUBJECT      mailto:you@example.com
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (متوفّران تلقائياً داخل المنصّة)
//
// الاستدعاء (POST) بترويسة Authorization تحمل service_role أو سرّ خاص:
//   { "title": "...", "body": "...", "url": "/", "tag": "breaking-weather" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { title, body, url, tag, requireInteraction, dedupeKey, signature, windowMinutes } =
      await req.json();

    // منع التكرار: إن مُرِّر dedupeKey، لا نرسل نفس الحدث مرتين خلال النافذة الزمنية
    if (dedupeKey) {
      const windowMs = (windowMinutes ?? 30) * 60 * 1000;
      const { data: state } = await supabase
        .from('push_state')
        .select('signature, sent_at')
        .eq('key', dedupeKey)
        .maybeSingle();

      if (
        state &&
        state.signature === (signature ?? '') &&
        Date.now() - new Date(state.sent_at).getTime() < windowMs
      ) {
        return new Response(JSON.stringify({ skipped: true, reason: 'deduped' }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      await supabase
        .from('push_state')
        .upsert({ key: dedupeKey, signature: signature ?? '', sent_at: new Date().toISOString() });
    }

    const payload = JSON.stringify({
      title: title ?? '🔴 عاجل · جاتكم اسحاب',
      body: body ?? 'تحديث جوي عاجل.',
      url: url ?? '/',
      tag: tag ?? 'breaking-weather',
      requireInteraction: requireInteraction ?? false,
    });

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth');
    if (error) throw error;

    let sent = 0;
    const stale: string[] = [];

    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent++;
        } catch (err: any) {
          // 404/410 = اشتراك منتهٍ → نحذفه
          if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(s.endpoint);
        }
      }),
    );

    if (stale.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale);
    }

    return new Response(
      JSON.stringify({ sent, removed: stale.length, total: subs?.length ?? 0 }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
