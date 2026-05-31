import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ متغيرات Supabase غير محددة. بعض الميزات قد لا تعمل.');
  console.warn('الرجاء تعديل .env.local بمعلومات Supabase الخاصة بك.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

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

// جلب سجل البحث
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
