/**
 * PWA Configuration
 * تكوين تطبيق الويب التقدمي
 */

// تسجيل Service Worker
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const swPath = `${import.meta.env.BASE_URL}sw.js`;
      const registration = await navigator.serviceWorker.register(swPath);
      console.log('✅ Service Worker تم تسجيله بنجاح:', registration);
      return registration;
    } catch (error) {
      console.error('❌ خطأ في تسجيل Service Worker:', error);
      if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
        console.warn('⚠️ تنبيه: المتصفحات تمنع الـ PWA على بروتوكول HTTP للعناوين الخارجية. يرجى استخدام HTTPS أو localhost.');
      }
    }
  } else {
    console.warn('⚠️ هذا المتصفح لا يدعم Service Worker (PWA)');
  }
}

// التحقق من الاتصال
export function onOnline() {
  console.log('📡 الجهاز متصل');
  // تحديث البيانات
}

export function onOffline() {
  console.warn('📴 الجهاز غير متصل - بيانات مخزنة محليا');
  // استخدام البيانات المخزنة
}

// استماع لأحداث الاتصال
if (typeof window !== 'undefined') {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
}

// البيانات المخزنة محليا
export const localStorageKeys = {
  WEATHER_DATA: 'weather_data',
  FAVORITES: 'favorites',
  SEARCH_HISTORY: 'search_history',
  LAST_UPDATE: 'last_update',
};

export function saveToLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('خطأ في حفظ البيانات:', error);
  }
}

export function getFromLocalStorage(key) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error('خطأ في جلب البيانات:', error);
    return null;
  }
}
