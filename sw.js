const CACHE_NAME = 'jatkoum-shab-v2'; // تحديث النسخة لإجبار المتصفح على تحميل الكود الجديد
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

// تثبيت الـ Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تفعيل النسخة الجديدة فوراً
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// تفعيل الـ Service Worker وحذف التخزين القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // السيطرة على الصفحات المفتوحة فوراً
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// التعامل مع الإشعارات عند الضغط عليها
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/') // فتح الموقع عند الضغط على الإشعار
  );
});

// استراتيجية الاستجابة: التخزين أولاً ثم الشبكة
self.addEventListener('fetch', (event) => {
  // تجاهل طلبات Supabase و API الطقس لضمان الحصول على بيانات حية وعدم حدوث تعارض
  if (event.request.url.includes('supabase.co') || event.request.url.includes('api.open-meteo.com')) {
    return; // دع المتصفح يتعامل معها بشكل طبيعي
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        // تخزين الاستجابات الجديدة ديناميكياً (اختياري)
        return caches.open(CACHE_NAME).then((cache) => {
          // نقوم بتخزين الملفات الثابتة فقط لتجنب تخزين طلبات API المتغيرة باستمرار
          if (event.request.url.includes('.js') || event.request.url.includes('.css') || event.request.url.includes('.png')) {
            cache.put(event.request, fetchResponse.clone());
          }
          return fetchResponse;
        });
      });
    }).catch(() => {
      // يمكن إضافة صفحة Offline هنا إذا لزم الأمر
    })
  );
});
