import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import NewsTicker from '../components/NewsTicker';
import WeatherHero from '../components/WeatherHero';
import WeeklyForecast from '../components/WeeklyForecast';
import CityGrid from '../components/CityGrid';
import TodaySummaryStrip from '../components/TodaySummaryStrip';
import { getFbStats } from '../supabase';
import TopRainRecordsCard from '../components/TopRainRecordsCard';
import StationObservationsCard from '../components/StationObservationsCard';
import HomeWeatherMap from '../components/HomeWeatherMap';
import { WILAYA_PAGES } from '../wilayaPages';

// مكونات ثقيلة — تُحمَّل عند الحاجة فقط
const WeatherAlerts       = lazy(() => import('../components/WeatherAlerts'));
const PrayerTimes         = lazy(() => import('../components/PrayerTimes'));
const CloudTracker        = lazy(() => import('../components/CloudTracker'));
const LivestockHomePreview = lazy(() => import('../components/LivestockHomePreview'));
const NewsSection         = lazy(() => import('../components/NewsSection'));
const LightningSoundAlert = lazy(() => import('../components/LightningSoundAlert'));
const FloatingAIAgent     = lazy(() => import('../components/FloatingAIAgent'));

const LazyFallback = () => <div className="h-32 bg-gray-50 rounded-2xl animate-pulse" />;


export default function Home() {
  const [favCity, setFavCity] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jatkoum_fav_city')) || null; } catch { return null; }
  });
  const [selectedCity, setSelectedCity] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jatkoum_fav_city')) || "نواكشوط"; } catch { return "نواكشوط"; }
  });

  const saveFavCity = (city) => {
    const val = typeof city === 'string' ? city : city?.name || city;
    localStorage.setItem('jatkoum_fav_city', JSON.stringify(val));
    setFavCity(val);
  };
  const [fbFollowers, setFbFollowers] = useState(null);
  useEffect(() => { getFbStats([]).then(({ followers }) => setFbFollowers(followers)); }, []);

  const [locLoading, setLocLoading] = useState(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
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
        // نسي/رفض الموقع: زر «موقعي» في بطاقة الطقس يعيد المحاولة
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    // إذا اختار المستخدم مدينة مفضّلة بالنجمة — لا نتجاوزها بالموقع الجغرافي
    const hasFav = !!localStorage.getItem('jatkoum_fav_city');
    if (!hasFav) requestLocation();
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
    <div className="min-h-screen pb-20 overflow-x-hidden" style={{background:'linear-gradient(180deg, #f0f4ff 0%, #f8faff 40%, #f5f7ff 100%)'}} dir="rtl">
      <Navbar onCitySelect={setSelectedCity} />
      <NewsTicker />
      <Suspense fallback={null}><LightningSoundAlert /></Suspense>

      <main className="max-w-[1600px] mx-auto px-4 md:px-6 mt-4 md:mt-8">
        <TodaySummaryStrip />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 mt-6">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-6 md:space-y-8">
            <WeatherHero city={selectedCity} favCity={favCity} onFavCity={saveFavCity} onLocate={requestLocation} locating={locLoading} />
            <HomeWeatherMap />
            <Suspense fallback={<LazyFallback />}><WeatherAlerts /></Suspense>
            <Suspense fallback={<LazyFallback />}><NewsSection /></Suspense>
            <Suspense fallback={<LazyFallback />}><LivestockHomePreview /></Suspense>
            <Suspense fallback={<LazyFallback />}><CloudTracker /></Suspense>
            <CityGrid />
          </div>

          {/* Sidebar / Extra Info */}
          <div className="lg:col-span-4 space-y-6 md:space-y-8 lg:sticky lg:top-4 lg:self-start">
            <Suspense fallback={<LazyFallback />}><PrayerTimes city={selectedCity} /></Suspense>
            <WeeklyForecast city={selectedCity} />
            <StationObservationsCard />
            <TopRainRecordsCard />
          </div>
        </div>


      </main>

      <footer className="mt-20 bg-gradient-to-l from-[#0b2c5e] via-[#103a78] to-[#0b2c5e] text-white" dir="rtl">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start text-center md:text-right">
            {/* الهوية */}
            <div className="space-y-3">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <div className="w-11 h-11 rounded-xl overflow-hidden ring-1 ring-white/20 bg-white/95">
                  <img
                    src="/logo.png"
                    alt="جاتكم اسحاب"
                    className="w-full h-full object-contain p-0.5"
                  />
                </div>
                <div>
                  <p className="font-black text-lg leading-none">جاتكم اسحاب</p>
                  <p className="text-[11px] text-blue-200/90 mt-1">رصد ومتابعة السحب والأمطار في موريتانيا</p>
                </div>
              </div>
              {fbFollowers != null && (
                <a
                  href="https://www.facebook.com/Beddetiii/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 transition-colors border border-white/15 rounded-full px-3 py-1.5 text-[11px] font-bold"
                >
                  <span className="text-blue-200">f</span>
                  {fbFollowers.toLocaleString('ar-u-nu-latn')} متابع على فيسبوك
                </a>
              )}
              <p className="text-[11px] text-blue-200/70 leading-relaxed">
                بيانات: المركز الأوروبي للتنبؤات (ECMWF) · Open-Meteo · EUMETSAT · Blitzortung.
              </p>
            </div>

            {/* الموقع على الهاتف: لا تطبيق في المتاجر بعد، والموقع نفسه يُثبَّت كتطبيق (PWA) */}
            <div className="space-y-3">
              <h4 className="font-black text-sm text-blue-100">📲 جاتكم اسحاب على هاتفك</h4>
              <p className="text-[12px] text-blue-200/90 leading-relaxed">
                من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية»، فيعمل الموقع كتطبيق وتصلك تنبيهات الطقس.
              </p>
            </div>

            {/* تابعنا */}
            <div className="space-y-3">
              <h4 className="font-black text-sm text-blue-100">روابط مفيدة</h4>
              <Link to="/pastures" className="block text-blue-200 hover:text-white text-sm font-bold transition-colors">
                🌿 المراعي والجراد
              </Link>
              <Link to="/seasonal" className="block text-blue-200 hover:text-white text-sm font-bold transition-colors">
                📅 النشرة الموسمية
              </Link>
              <div className="flex items-center justify-center md:justify-start gap-3">
                <a href="https://www.facebook.com/Beddetiii/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center" aria-label="فيسبوك">f</a>
              </div>
            </div>
          </div>

          {/* روابط صفحات الولايات: مدخل للزوار ولمحركات البحث */}
          <div className="border-t border-white/10 mt-10 pt-6">
            <h4 className="font-black text-sm text-blue-100 text-center md:text-right">🗺️ طقس الولايات</h4>
            <div className="flex flex-wrap justify-center md:justify-start gap-x-4 gap-y-2 mt-3">
              {WILAYA_PAGES.map((w) => (
                <Link key={w.slug} to={`/wilaya/${w.slug}`} className="text-[13px] text-blue-200 hover:text-white transition-colors">
                  {w.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 mt-6 pt-5 text-center">
            <p className="text-[11px] text-blue-200/80 font-bold">© 2026 جاتكم اسحاب — جميع الحقوق محفوظة</p>
            <p className="text-[10px] text-blue-200/50 mt-1">
              صوت الرعد: Bidgee / Wikimedia Commons (CC BY 3.0) · بيانات الصواعق: Blitzortung.org
            </p>
          </div>
        </div>
      </footer>

      <Suspense fallback={null}><FloatingAIAgent onCitySelect={setSelectedCity} /></Suspense>
    </div>
  );
}
