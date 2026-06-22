import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import Navbar from '../components/Navbar';
import NewsTicker from '../components/NewsTicker';
import WeatherHero from '../components/WeatherHero';
import WeeklyForecast from '../components/WeeklyForecast';
import CityGrid from '../components/CityGrid';
import RuralTools from '../components/RuralTools';
import WeatherAlerts from '../components/WeatherAlerts';
import PrayerTimes from '../components/PrayerTimes';
import CloudTracker from '../components/CloudTracker';
import StormAlertBanner from '../components/StormAlertBanner';
import LivestockHomePreview from '../components/LivestockHomePreview';
import HomeHeroBanner from '../components/HomeHeroBanner';
import LightningSoundAlert from '../components/LightningSoundAlert';

// أثقل مكوّن (echarts) — يُحمَّل عند الحاجة فقط لتسريع أول تحميل
const WeatherCharts = lazy(() => import('../components/WeatherCharts'));

// غلاف يؤجّل تحميل المحتوى حتى يقترب من الشاشة (يوفّر تحميل echarts على الهاتف)
function LazyOnVisible({ children, minHeight = 256 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible || !ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);
  return (
    <div ref={ref}>
      {visible ? children : <div style={{ minHeight }} className="bg-white rounded-[2rem] animate-pulse border border-gray-100" />}
    </div>
  );
}

export default function Home() {
  const [selectedCity, setSelectedCity] = useState("نواكشوط");
  const [showLocBanner, setShowLocBanner] = useState(false);
  const [locLoading, setLocLoading] = useState(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setShowLocBanner(false);
        setLocLoading(false);
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ar`);
          if (!response.ok) throw new Error('Geocoding service unavailable');
          const data = await response.json();
          const cityName = data.address?.city || data.address?.town || data.address?.village || data.address?.state;
          if (cityName) {
            setSelectedCity({ name: cityName, lat: latitude, lon: longitude, isLocal: true });
          }
        } catch (error) {
          console.error('Error fetching city name:', error);
        }
      },
      (error) => {
        console.warn('Geolocation error:', error);
        setLocLoading(false);
        setShowLocBanner(true); // نسي/رفض الموقع → نعرض شريط دعوة لإعادة المحاولة
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const checkForUpdates = async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update();
            console.log('🔍 تم فحص تحديثات المتصفح...');
          }
        } catch (e) {
          console.error('Update check failed:', e);
        }
      };

      const interval = setInterval(checkForUpdates, 5 * 60 * 1000);

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      return () => clearInterval(interval);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 overflow-x-hidden" dir="rtl">
      <Navbar onCitySelect={setSelectedCity} />
      <NewsTicker />
      <HomeHeroBanner />
      <LightningSoundAlert />

      {/* شريط دعوة لتحديد الموقع عند نسيانه/رفضه */}
      {showLocBanner && (
        <div className="bg-blue-600 text-white">
          <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-xs md:text-sm font-bold flex items-center gap-2">
              📍 فعّل موقعك لعرض طقس منطقتك مباشرةً
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={requestLocation}
                disabled={locLoading}
                className="bg-white text-blue-700 text-xs font-black px-4 py-1.5 rounded-full hover:bg-blue-50 transition-all disabled:opacity-60"
              >
                {locLoading ? 'جارٍ...' : 'تحديد موقعي'}
              </button>
              <button
                onClick={() => setShowLocBanner(false)}
                className="text-white/80 hover:text-white text-lg leading-none px-1"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto px-4 mt-4 md:mt-8">
        <StormAlertBanner />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 mt-6">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-6 md:space-y-8">
            <WeatherHero city={selectedCity} />
            <WeeklyForecast city={selectedCity} />
            <WeatherAlerts />
            <LazyOnVisible minHeight={288}>
              <Suspense fallback={<div className="bg-white rounded-[2rem] h-64 animate-pulse border border-gray-100" />}>
                <WeatherCharts city={selectedCity} />
              </Suspense>
            </LazyOnVisible>
            <CloudTracker />

            <LivestockHomePreview />
            <CityGrid />
          </div>

          {/* Sidebar / Extra Info */}
          <div className="lg:col-span-4 space-y-6 md:space-y-8 lg:sticky lg:top-4 lg:self-start">
            <PrayerTimes city={selectedCity} />
            <RuralTools />

            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4">تابعنا على فيسبوك</h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                انضم لأكثر من 111 ألف متابع على صفحتنا الرسمية للحصول على آخر التحديثات الجوية المباشرة.
              </p>
              <a
                href="https://www.facebook.com/Beddetiii/"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 bg-[#1877F2] text-white rounded-xl font-bold text-center hover:bg-[#166fe5] transition-colors shadow-lg shadow-blue-100"
              >
                انتقل إلى صفحة فيسبوك
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-20 border-t border-gray-200 bg-white py-10">
        <div className="max-w-[1400px] mx-auto px-4 text-center">
          <p className="text-gray-500 font-bold">© 2026 جاتكم اسحاب - كافة الحقوق محفوظة</p>
          <div className="flex justify-center gap-4 mt-2">
            <a href="https://www.facebook.com/Beddetiii/" className="text-blue-600 hover:underline text-xs">صفحة فيسبوك</a>
            <span className="text-gray-300">|</span>
            <span className="text-xs text-gray-400">بيانات المركز الأوروبي للتنبؤات الجوية</span>
          </div>
          <p className="text-[10px] text-gray-300 mt-2">
            صوت الرعد: Bidgee / Wikimedia Commons (CC BY 3.0) · بيانات الصواعق: Blitzortung.org
          </p>
        </div>
      </footer>
    </div>
  );
}
