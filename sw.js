const CACHE_NAME = 'jatkoum-shab-v4'; // تحديث النسخة لإجبار المتصفح على تجاوز الكاش القديم
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

// ملفات ثابتة: تحتوي على hash في اسمها (مثل index-Abc123.js) — لن تتغير أبداً
function isHashedAsset(url) {
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)(\?.*)?$/.test(url);
}

// صور ثابتة لا تحمل hash لكنها نادراً ما تتغير (شعار الموقع، صور التحذيرات الجوية)
function isStaticImage(url) {
  return /\/(logo\.png|weather\/[^/]+\.(jpg|jpeg|png|webp))(\?.*)?$/.test(url);
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // تجاهل طلبات الـ API والخارجية
  if (
    url.includes('supabase.co') ||
    url.includes('api.open-meteo.com') ||
    url.includes('nominatim.openstreetmap.org') ||
    url.includes('api.rainviewer.com') ||
    url.includes('counter.dev') ||
    url.includes('blitzortung') ||
    !url.startsWith('http')
  ) {
    return;
  }

  // ── Cache First للملفات الثابتة (JS/CSS بـ hash) ──
  // هذه الملفات لا تتغير → نخدمها من الكاش فوراً بدون طلب شبكة
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Cache First للصور الثابتة (الشعار وصور التحذيرات الجوية) ──
  // نادراً ما تتغير → نخدمها من الكاش فوراً، ونحدّث الكاش في الخلفية دون انتظار
  if (isStaticImage(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // ── Network First لملفات HTML وباقي الصور ──
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('Network error', { status: 408, headers: { 'Content-Type': 'text/plain' } });
      })
  );
});
