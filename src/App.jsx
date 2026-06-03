import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import NewsTicker from './components/NewsTicker';
import WeatherHero from './components/WeatherHero';
import SatelliteViewer from './components/SatelliteViewer';
import CityGrid from './components/CityGrid';
import WeeklyForecast from './components/WeeklyForecast';
import RuralTools from './components/RuralTools';
import WeatherAlerts from './components/WeatherAlerts';
import WeatherCharts from './components/WeatherCharts';
import PrayerTimes from './components/PrayerTimes';
import WeeklyForecastPage from './components/WeeklyForecastPage';
import AlThalaPage from './components/AlThalaPage';
import ErrorBoundary from './components/ErrorBoundary';

function Home() {
  const [selectedCity, setSelectedCity] = useState("نواكشوط");

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ar`);
            const data = await response.json();
            const cityName = data.address.city || data.address.town || data.address.village || data.address.state;
            if (cityName) {
              setSelectedCity({
                name: cityName,
                lat: latitude,
                lon: longitude,
                isLocal: true
              });
            }
          } catch (error) {
            console.error('Error fetching city name:', error);
          }
        },
        (error) => {
          console.warn('Geolocation error:', error);
        }
      );
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 overflow-x-hidden" dir="rtl">
      <Navbar onCitySelect={setSelectedCity} />
      <NewsTicker />
      
      <main className="max-w-7xl mx-auto px-4 mt-4 md:mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-6 md:space-y-8">
            <WeatherHero city={selectedCity} />
            
            {/* التنبيهات الأوتوماتيكية في مكان بارز */}
            <WeatherAlerts />
            
            <WeatherCharts city={selectedCity} />
            <SatelliteViewer />
            <CityGrid />
          </div>

          {/* Sidebar / Extra Info */}
          <div className="lg:col-span-4 space-y-6 md:space-y-8">
            <PrayerTimes city={selectedCity} />
            <RuralTools />
            <WeeklyForecast city={selectedCity} />
            
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
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-500 font-bold">© 2026 جاتكم اسحاب - كافة الحقوق محفوظة</p>
          <div className="flex justify-center gap-4 mt-2">
            <a href="https://www.facebook.com/Beddetiii/" className="text-blue-600 hover:underline text-xs">صفحة فيسبوك</a>
            <span className="text-gray-300">|</span>
            <span className="text-xs text-gray-400">بيانات المركز الأوروبي للتنبؤات الجوية</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/forecast" element={<WeeklyForecastPage />} />
          <Route path="/althala" element={<AlThalaPage />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;