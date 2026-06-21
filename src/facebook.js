/**
 * تكامل فيسبوك: تسجيل الدخول (توثيق هوية الناشر) + نافذة المشاركة.
 *
 * ملاحظة مهمة: فيسبوك ألغى النشر التلقائي على حساب المستخدم الشخصي
 * (publish_actions) عام 2018. لذا يتم النشر عبر "نافذة المشاركة" التي
 * يؤكّدها المستخدم بنفسه. هنا فقط: توثيق الهوية + فتح نافذة المشاركة.
 *
 * يتطلب: VITE_FACEBOOK_APP_ID في ملف البيئة.
 */

const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID;
const FB_VERSION = 'v19.0';

let fbReadyPromise = null;

export function isFacebookConfigured() {
  return Boolean(FB_APP_ID);
}

/** تحميل وتهيئة SDK فيسبوك مرة واحدة */
export function initFacebook() {
  if (fbReadyPromise) return fbReadyPromise;

  fbReadyPromise = new Promise((resolve, reject) => {
    if (!FB_APP_ID) {
      reject(new Error('Facebook App ID غير مضبوط (VITE_FACEBOOK_APP_ID).'));
      return;
    }
    if (typeof window === 'undefined') {
      reject(new Error('بيئة غير متصفّحية.'));
      return;
    }
    if (window.FB) {
      resolve(window.FB);
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: FB_APP_ID,
        cookie: true,
        xfbml: false,
        version: FB_VERSION,
      });
      resolve(window.FB);
    };

    const id = 'facebook-jssdk';
    if (document.getElementById(id)) return;
    const js = document.createElement('script');
    js.id = id;
    js.src = 'https://connect.facebook.net/ar_AR/sdk.js';
    js.async = true;
    js.defer = true;
    js.crossOrigin = 'anonymous';
    js.onerror = () => reject(new Error('تعذّر تحميل فيسبوك. تحقّق من الاتصال.'));
    document.head.appendChild(js);
  });

  return fbReadyPromise;
}

/**
 * تسجيل الدخول بفيسبوك وإرجاع هوية الناشر.
 * scope: public_profile فقط (لا يحتاج مراجعة تطبيق).
 */
export async function loginWithFacebook() {
  const FB = await initFacebook();
  return new Promise((resolve, reject) => {
    FB.login(
      (response) => {
        if (response && response.authResponse) {
          FB.api('/me', { fields: 'id,name,picture.width(120).height(120)' }, (user) => {
            if (!user || user.error) {
              reject(new Error('تعذّر جلب بيانات الحساب.'));
              return;
            }
            resolve({
              id: user.id,
              name: user.name,
              picture: user.picture?.data?.url || '',
              link: `https://www.facebook.com/${user.id}`,
              accessToken: response.authResponse.accessToken,
            });
          });
        } else {
          reject(new Error('لم يكتمل تسجيل الدخول بفيسبوك.'));
        }
      },
      { scope: 'public_profile' }
    );
  });
}

/**
 * فتح نافذة مشاركة فيسبوك — ينشر المستخدم بنفسه بضغطة "نشر".
 * إن لم يتوفّر SDK، نرجع إلى رابط sharer التقليدي.
 */
export async function shareOnFacebook(url, quote = '') {
  try {
    const FB = await initFacebook();
    return await new Promise((resolve) => {
      FB.ui(
        { method: 'share', href: url, quote },
        (response) => resolve({ shared: true, response })
      );
    });
  } catch {
    const sharer = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(quote)}`;
    window.open(sharer, '_blank', 'noopener,noreferrer');
    return { shared: true, fallback: true };
  }
}
