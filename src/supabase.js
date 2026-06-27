import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// التحقق من صحة الإعدادات - نكون صارمين جداً هنا
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'your_supabase_url_here' &&
  !supabaseUrl.includes('placeholder') &&
  supabaseUrl.startsWith('https://')
);

if (!isSupabaseConfigured) {
  console.warn('⚠️ تنبيه: لم يتم العثور على إعدادات Supabase صحيحة في ملف .env. سيتم تعطيل ميزات قاعدة البيانات (البلاغات، المفضلة).');
}

// إنشاء العميل فقط إذا كانت الإعدادات موجودة، وإلا إنشاء عميل وهمي لمنع الأخطاء القاتلة
const createDummyClient = () => {
  const handler = {
    get: (target, prop) => {
      if (prop === 'then') {
        return (resolve) => resolve({ data: [], error: null });
      }
      if (prop === 'storage') {
        return {
          from: () => ({
            upload: () => Promise.resolve({ data: null, error: null }),
            getPublicUrl: () => ({ data: { publicUrl: '' } })
          })
        };
      }
      return () => new Proxy({}, handler);
    }
  };
  return new Proxy({}, handler);
};

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createDummyClient();

/**
 * Supabase Client Services
 */

// التحقق من الاتصال
export async function testConnection() {
  try {
    const { data, error } = await supabase.from('_schema').select().limit(1);
    if (error) throw error;
    console.log('✅ اتصال Supabase ناجح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في الاتصال بـ Supabase:', error.message);
    return false;
  }
}

// إضافة مدينة للمفضلة
export async function addFavoriteCity(userId, cityName) {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .insert([{ user_id: userId, city_name: cityName }]);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في إضافة المدينة للمفضلة:', error);
    throw error;
  }
}

// الحصول على المدن المفضلة
export async function getFavoriteCities(userId) {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في جلب المدن المفضلة:', error);
    throw error;
  }
}

// حذف مدينة من المفضلة
export async function removeFavoriteCity(userId, cityName) {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('city_name', cityName);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في حذف المدينة من المفضلة:', error);
    throw error;
  }
}

// إضافة بحث للسجل
export async function addSearchHistory(userId, query) {
  try {
    const { data, error } = await supabase
      .from('search_history')
      .insert([{ user_id: userId, query }]);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في إضافة البحث للسجل:', error);
    throw error;
  }
}

/**
 * Livestock Lost & Found Services (الظالة)
 */

// إشعار الأدمن عبر تيليجرام ببلاغ جديد (fire-and-forget، لا يعطّل المستخدم)
function notifyNewSubmission(table, record) {
  if (!isSupabaseConfigured) return;
  try {
    fetch(`${supabaseUrl}/functions/v1/notify-telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'INSERT', table, record }),
    }).catch(() => {});
  } catch { /* تجاهل */ }
}

// إضافة بلاغ جديد (مفقود أو موجود)
export async function addLivestockReport(report) {
  try {
    // معرّف من جهة العميل ليُمرَّر لأزرار تيليجرام (نشر/رفض)
    const id = (globalThis.crypto?.randomUUID?.()) || undefined;
    const row = id ? { ...report, id, status: 'pending' } : { ...report, status: 'pending' };
    const { data, error } = await supabase
      .from('livestock_reports')
      .insert([row]);

    if (error) throw error;
    notifyNewSubmission('livestock_reports', row); // إشعار تيليجرام (مع المعرّف والصورة)
    return data;
  } catch (error) {
    console.error('خطأ في إضافة بلاغ الماشية:', error);
    throw error;
  }
}

// جلب البلاغات المعتمدة فقط (المنشورة للعموم)
export async function getLivestockReports(type = null) {
  if (!isSupabaseConfigured) return [];
  try {
    let query = supabase
      .from('livestock_reports')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('report_type', type);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في جلب بلاغات الماشية:', error);
    throw error;
  }
}

// رفع صورة الماشية
export async function uploadLivestockImage(file) {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `livestock/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error('خطأ في رفع الصورة:', error);
    throw error;
  }
}

// رفع ملف صوتي
export async function uploadLivestockAudio(file) {
  try {
    const fileExt = 'webm';
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `audio/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('audio').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error('خطأ في رفع الملف الصوتي:', error);
    throw error;
  }
}

/**
 * Rain Reporting Services (تبشيرة مطر)
 */

// إضافة بلاغ مطر جديد — يبدأ معلّقاً بانتظار موافقة الإدارة
export async function addRainReport(report) {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    const row = id ? { ...report, id, status: 'pending' } : { ...report, status: 'pending' };
    const { data, error } = await supabase
      .from('rain_reports')
      .insert([row]);

    if (error) throw error;
    notifyNewSubmission('rain_reports', row); // إشعار تيليجرام للأدمن
    return data;
  } catch (error) {
    console.error('خطأ في إضافة بلاغ المطر:', error);
    throw error;
  }
}

// جلب بلاغات المطر المعتمدة (آخر 24 ساعة)
export async function getRecentRainReports() {
  if (!isSupabaseConfigured) return [];
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('rain_reports')
      .select('*')
      .eq('status', 'approved')
      .gt('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في جلب بلاغات المطر:', error);
    return [];
  }
}

// جلب سجل البحث
export async function addBawahReport(report) {
  try {
    const { data, error } = await supabase
      .from('bawah_reports')
      .insert([report]);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في إضافة بلاغ البواه:', error);
    throw error;
  }
}

export async function getRecentBawahReports() {
  if (!isSupabaseConfigured) return [];
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('bawah_reports')
      .select('*')
      .order('created_at', { ascending: false });
    
    query = query.gt('created_at', sevenDaysAgo);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في جلب بلاغات البواه:', error);
    return [];
  }
}

export async function getSearchHistory(userId) {
  try {
    const { data, error } = await supabase
      .from('search_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في جلب سجل البحث:', error);
    throw error;
  }
}

// التحقق من التنبيهات النشطة
export async function getActiveAlerts() {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في جلب التنبيهات:', error);
    throw error;
  }
}
/**
 * توقعات الأمطار - Rain Forecasts Management
 */

// إضافة توقعات مطر جديدة (للإدارة فقط)
export async function addRainForecast(forecast) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('rain_forecasts')
      .insert([{
        date: forecast.date,
        date_ar: forecast.dateAr,
        cities: forecast.cities, // JSON array
        probability: forecast.probability,
        intensity: forecast.intensity,
        risk_level: forecast.riskLevel,
        icon: forecast.icon,
      }]);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في إضافة توقعات الأمطار:', error);
    throw error;
  }
}

// جلب توقعات الأمطار القادمة
export async function getUpcomingRainForecasts() {
  if (!isSupabaseConfigured) return [];
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('rain_forecasts')
      .select('*')
      .gte('date', today)
      .order('date', { ascending: true });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('خطأ في جلب توقعات الأمطار:', error);
    return [];
  }
}

// مراقبة التغييرات في توقعات الأمطار (real-time updates)
export function subscribeToRainForecasts(callback) {
  if (!isSupabaseConfigured) return null;
  
  return supabase
    .from('rain_forecasts')
    .on('*', payload => {
      console.log('🔔 تحديث جديد في توقعات الأمطار:', payload);
      callback(payload);
    })
    .subscribe();
}

// تحديث توقعات مطر موجودة
export async function updateRainForecast(forecastId, updates) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('rain_forecasts')
      .update(updates)
      .eq('id', forecastId);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في تحديث توقعات الأمطار:', error);
    throw error;
  }
}

// حذف توقعات مطر منتهية
export async function deleteRainForecast(forecastId) {
  if (!isSupabaseConfigured) return null;
  try {
    const { error } = await supabase
      .from('rain_forecasts')
      .delete()
      .eq('id', forecastId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('خطأ في حذف توقعات الأمطار:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════
// Web Push: اشتراكات الإشعارات الفورية
// ═══════════════════════════════════════════════════

/** حفظ (أو تحديث) اشتراك المتصفح في جدول push_subscriptions */
export async function savePushSubscription(subscription) {
  if (!isSupabaseConfigured) return null;
  try {
    const sub = subscription.toJSON ? subscription.toJSON() : subscription;
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          endpoint: sub.endpoint,
          p256dh: sub.keys?.p256dh,
          auth: sub.keys?.auth,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        },
        { onConflict: 'endpoint' }
      );

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('خطأ في حفظ اشتراك الإشعارات:', error);
    return null;
  }
}

/**
 * طلب بثّ إشعار فوري لكل المشتركين عبر دالة send-push الخلفية.
 * تتكفّل الدالة بمنع التكرار عبر dedupeKey/signature، فلا تُرسل
 * نفس الحدث مرتين حتى لو استدعاها أكثر من زائر.
 */
export async function broadcastPush({ title, body, url, tag, dedupeKey, signature, windowMinutes }) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { title, body, url, tag, dedupeKey, signature, windowMinutes },
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في بثّ الإشعار الفوري:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// المدوّنون والمقالات
// ═══════════════════════════════════════════════════

export async function getBloggers() {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('bloggers').select('*').eq('active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

export async function getBloggerBySlug(slug) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('bloggers').select('*').eq('slug', slug).eq('active', true).single();
    if (error) throw error;
    return data;
  } catch (e) { return null; }
}

export async function getBloggerByFacebookId(facebookId) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('bloggers').select('*').eq('facebook_id', facebookId).eq('active', true).single();
    if (error) throw error;
    return data;
  } catch (e) { return null; }
}

export async function getPostsByBlogger(bloggerId) {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('posts').select('*').eq('blogger_id', bloggerId).eq('published', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

export async function getPostById(id) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*, bloggers(name, slug, facebook_id, specialty, wilaya)')
      .eq('id', id).eq('published', true).single();
    if (error) throw error;
    return data;
  } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════
// إحصاءات — أسئلة الوكيل وزيارات الصفحة
// ═══════════════════════════════════════════════════

export function logAgentQuery(question, city = null) {
  if (!supabaseUrl || !supabaseAnonKey) return;
  const body = JSON.stringify({ question: String(question).slice(0, 300), city: city || null });
  fetch(`${supabaseUrl}/rest/v1/agent_queries`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body,
  }).catch(() => {});
}

export function logPageVisit() {
  if (!supabaseUrl || !supabaseAnonKey) return;
  if (sessionStorage.getItem('visit_logged')) return;
  sessionStorage.setItem('visit_logged', '1');
  fetch(`${supabaseUrl}/rest/v1/page_visits`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: '{}',
  }).catch(() => {});
}

export async function createPost(bloggerId, { title, content, cover_url, wilaya }) {
  const { data, error } = await supabase
    .from('posts')
    .insert([{ blogger_id: bloggerId, title, content, cover_url: cover_url || null, wilaya: wilaya || null, published: false }])
    .select().single();
  if (error) throw error;
  return data;
}

export async function updatePost(postId, bloggerId, fields) {
  const { data, error } = await supabase
    .from('posts').update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', postId).eq('blogger_id', bloggerId).select().single();
  if (error) throw error;
  return data;
}

// ═══════════════════════════════════════════════════
// نشرات الطقس الإدارية — تُنشر مباشرة عبر تيليجرام
// ═══════════════════════════════════════════════════

/** جلب النشرات النشطة (غير المنتهية) */
export async function getWeatherBulletins() {
  if (!isSupabaseConfigured) return [];
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('weather_bulletins')
      .select('id, text, icon, created_at')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('خطأ في جلب النشرات:', error);
    return [];
  }
}

/** حذف اشتراك عند إلغائه أو انتهاء صلاحيته */
export async function deletePushSubscription(endpoint) {
  if (!isSupabaseConfigured) return null;
  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('خطأ في حذف اشتراك الإشعارات:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// نظام المراجعة: الأخبار + الإدارة
// ═══════════════════════════════════════════════════

/** إرسال خبر من مستخدم — يُحفظ معلّقاً بانتظار موافقة الإدارة */
export async function submitNews(news) {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'قاعدة البيانات غير مهيأة' };
  }
  try {
    const { error } = await supabase
      .from('news_submissions')
      .insert([{
        title: news.title,
        body: news.body,
        category: news.category || 'عام',
        city: news.city || null,
        author_name: news.author_name || null,
        contact: news.contact || null,
        image_url: news.image_url || null,
        status: 'pending',
      }]);
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.error('خطأ في إرسال الخبر:', error);
    return { ok: false, error: error.message };
  }
}

/** جلب الأخبار المعتمدة (المنشورة) */
export async function getApprovedNews(limit = 20) {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('news_submissions')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('خطأ في جلب الأخبار المعتمدة:', error);
    return [];
  }
}

/**
 * استدعاء دالة المراجعة الخادمية (للإدارة فقط).
 * action: 'list' | 'approve' | 'reject' ، kind: 'news' | 'livestock'
 */
async function callModerate(adminToken, payload) {
  const url = `${supabaseUrl}/functions/v1/moderate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

/** الإدارة: جلب العناصر المعلّقة */
export async function adminListPending(adminToken, kind) {
  const data = await callModerate(adminToken, { action: 'list', kind });
  return data.items || [];
}

/** الإدارة: موافقة أو رفض عنصر */
export async function adminModerate(adminToken, kind, id, approve) {
  return callModerate(adminToken, { action: approve ? 'approve' : 'reject', kind, id });
}

/** الإدارة: حذف نهائي لعنصر */
export async function adminDelete(adminToken, kind, id) {
  return callModerate(adminToken, { action: 'delete', kind, id });
}
