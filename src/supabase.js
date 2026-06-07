import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// التحقق من صحة الإعدادات
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'));

if (!isSupabaseConfigured) {
  console.warn('⚠️ تنبيه: لم يتم العثور على إعدادات Supabase صحيحة في ملف .env. سيتم تعطيل ميزات قاعدة البيانات (البلاغات، المفضلة).');
}

// إنشاء العميل فقط إذا كانت الإعدادات موجودة، وإلا إنشاء عميل وهمي لمنع الأخطاء القاتلة
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : { 
      from: () => ({ 
        select: () => ({ limit: () => ({ data: [], error: null }), order: () => ({ data: [], error: null }), eq: () => ({ data: [], error: null }), gt: () => ({ data: [], error: null }) }),
        insert: () => ({ data: null, error: null }),
        delete: () => ({ eq: () => ({ data: null, error: null }) })
      }),
      storage: { from: () => ({ upload: () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
    };

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

// إضافة بلاغ جديد (مفقود أو موجود)
export async function addLivestockReport(report) {
  try {
    const { data, error } = await supabase
      .from('livestock_reports')
      .insert([report]);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في إضافة بلاغ الماشية:', error);
    throw error;
  }
}

// جلب جميع البلاغات
export async function getLivestockReports(type = null) {
  try {
    let query = supabase.from('livestock_reports').select('*').order('created_at', { ascending: false });
    
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

// إضافة بلاغ مطر جديد
export async function addRainReport(report) {
  try {
    const { data, error } = await supabase
      .from('rain_reports')
      .insert([report]);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('خطأ في إضافة بلاغ المطر:', error);
    throw error;
  }
}

// جلب بلاغات المطر (آخر 24 ساعة مثلاً)
export async function getRecentRainReports() {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('rain_reports')
      .select('*')
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
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('bawah_reports')
      .select('*')
      .gt('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false });

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
