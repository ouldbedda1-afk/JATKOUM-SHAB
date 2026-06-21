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
      
      // طلب إذن الإشعارات ثم الاشتراك في Web Push (إن توفّر مفتاح VAPID)
      requestNotificationPermission().then((granted) => {
        if (granted) subscribeToPush();
      });

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

// طلب إذن الإشعارات
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('هذا المتصفح لا يدعم الإشعارات');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

// إرسال إشعار محلي
export function sendLocalNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const defaultOptions = {
    icon: '/logo.png',
    badge: '/logo.png',
    dir: 'rtl',
    lang: 'ar',
    ...options
  };

  // محاولة الإرسال عبر Service Worker أولاً (لأنه يعمل في الخلفية)
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title, defaultOptions);
    });
  } else {
    // إرسال إشعار متصفح عادي
    new Notification(title, defaultOptions);
  }
}

// ═══════════════════════════════════════════════════
// Web Push: الاشتراك في الإشعارات الفورية من الخادم
// ═══════════════════════════════════════════════════

// تحويل مفتاح VAPID العام (Base64URL) إلى Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * اشتراك المتصفح في Web Push وحفظه في Supabase.
 * يحتاج VITE_VAPID_PUBLIC_KEY في ملف البيئة.
 */
export async function subscribeToPush() {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn('⚠️ Web Push معطّل: VITE_VAPID_PUBLIC_KEY غير مضبوط.');
    return null;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('⚠️ هذا المتصفح لا يدعم Web Push.');
    return null;
  }

  const granted = await requestNotificationPermission();
  if (!granted) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    // حفظ الاشتراك في قاعدة البيانات (استيراد كسول لتفادي حلقات الاعتماد)
    const { savePushSubscription } = await import('./supabase');
    await savePushSubscription(subscription);
    console.log('✅ تم الاشتراك في الإشعارات الفورية');
    return subscription;
  } catch (error) {
    console.error('❌ فشل الاشتراك في Web Push:', error);
    return null;
  }
}

/** إلغاء الاشتراك من Web Push */
export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const { deletePushSubscription } = await import('./supabase');
      await deletePushSubscription(endpoint);
      console.log('🔕 تم إلغاء الاشتراك من الإشعارات الفورية');
    }
  } catch (error) {
    console.error('❌ فشل إلغاء الاشتراك:', error);
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
