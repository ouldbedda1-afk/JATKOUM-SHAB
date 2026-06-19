const CACHE_NAME = 'jatkoum-shab-v3'; // تحديث النسخة لإجبار المتصفح على تجاوز الكاش القديم
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

// تثبيت الـ Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// تفعيل الـ Service Worker وحذف التخزين القديم فوراً
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 حذف الكاش القديم:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية الاستجابة: الشبكة أولاً للملفات الأساسية لضمان التحديث
// ═══════════════════════════════════════════════════
// Web Push: استقبال الإشعارات الفورية من الخادم
// ═══════════════════════════════════════════════════
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'جاتكم اسحاب', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || '🔴 عاجل · جاتكم اسحاب';
  const options = {
    body: payload.body || 'تحديث جوي عاجل، يرجى متابعة الموقع.',
    icon: payload.icon || './logo.png',
    badge: './logo.png',
    dir: 'rtl',
    lang: 'ar',
    tag: payload.tag || 'breaking-weather',
    renotify: true,
    requireInteraction: payload.requireInteraction ?? false,
    data: { url: payload.url || './' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// النقر على الإشعار: فتح الموقع أو التركيز على تبويب مفتوح
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // تجاهل طلبات الـ API لضمان بيانات حية
  if (
    event.request.url.includes('supabase.co') || 
    event.request.url.includes('api.open-meteo.com') ||
    event.request.url.includes('nominatim.openstreetmap.org')
  ) {
    return;
  }

  // لملفات HTML و الـ Assets، نستخدم Network First مع معالجة الأخطاء
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // إذا كانت الاستجابة صالحة، نقوم بتخزينها
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // إذا فشل الاتصال، نبحث في الكاش
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        // إذا لم يوجد كاش، نرجع خطأ شبكة بدلاً من تعليق المتصفح
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        
        return new Response('Network error occurred', {
          status: 408,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
