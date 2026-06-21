/**
 * تكامل جوجل: تسجيل الدخول لتوثيق هوية الناشر (الاسم + الصورة + المعرّف + البريد).
 * يستخدم Google Identity Services (OAuth2). يتطلب VITE_GOOGLE_CLIENT_ID.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let gisPromise = null;

export function isGoogleConfigured() {
  return Boolean(GOOGLE_CLIENT_ID);
}

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('Google Client ID غير مضبوط (VITE_GOOGLE_CLIENT_ID).'));
      return;
    }
    if (typeof window === 'undefined') {
      reject(new Error('بيئة غير متصفّحية.'));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve(window.google);
      return;
    }
    const id = 'google-gis';
    const existing = document.getElementById(id);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', () => reject(new Error('تعذّر تحميل جوجل.')));
      return;
    }
    const js = document.createElement('script');
    js.id = id;
    js.src = 'https://accounts.google.com/gsi/client';
    js.async = true;
    js.defer = true;
    js.onload = () => resolve(window.google);
    js.onerror = () => reject(new Error('تعذّر تحميل جوجل. تحقّق من الاتصال.'));
    document.head.appendChild(js);
  });
  return gisPromise;
}

/**
 * تسجيل الدخول بجوجل (نافذة منبثقة)، وإرجاع هوية الناشر.
 */
export async function loginWithGoogle() {
  const google = await loadGis();
  return new Promise((resolve, reject) => {
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'profile email',
        callback: async (resp) => {
          if (!resp || !resp.access_token) {
            reject(new Error('لم يكتمل تسجيل الدخول بجوجل.'));
            return;
          }
          try {
            const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${resp.access_token}` },
            });
            if (!r.ok) throw new Error('تعذّر جلب بيانات الحساب.');
            const u = await r.json();
            resolve({
              id: u.sub,
              name: u.name || u.email,
              picture: u.picture || '',
              email: u.email || '',
              link: u.email ? `mailto:${u.email}` : '',
              provider: 'google',
            });
          } catch (e) {
            reject(e);
          }
        },
        error_callback: () => reject(new Error('أُلغي تسجيل الدخول بجوجل.')),
      });
      client.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}
