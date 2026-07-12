import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { logPageVisit } from './supabase';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPWA from './components/InstallPWA';
import { WeatherProvider } from './WeatherContext';
import Home from './pages/Home';

// تحميل الصفحات الثانوية عند الطلب فقط (تسريع أول تحميل خصوصاً على الهاتف)
const WeeklyForecastPage = lazy(() => import('./components/WeeklyForecastPage'));
const AlThalaPage = lazy(() => import('./components/AlThalaPage'));
const AdminPage = lazy(() => import('./components/AdminPage'));
const BloggersPage      = lazy(() => import('./pages/BloggersPage'));
const BloggerPage       = lazy(() => import('./pages/BloggerPage'));
const PostPage          = lazy(() => import('./pages/PostPage'));
const NewsPage              = lazy(() => import('./pages/NewsPage'));
const NewsArticlePage       = lazy(() => import('./pages/NewsArticlePage'));
const LivestockReportPage   = lazy(() => import('./pages/LivestockReportPage'));
const WilayaForecastPage    = lazy(() => import('./pages/WilayaForecastPage'));
const ForecastArchivePage   = lazy(() => import('./pages/ForecastArchivePage'));
const PrivacyPolicyPage     = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage             = lazy(() => import('./pages/TermsPage'));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
    </div>
  );
}

function App() {
  useEffect(() => { logPageVisit(); }, []);

  return (
    <ErrorBoundary>
      <WeatherProvider>
        <Router>
          <InstallPWA />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/forecast" element={<WeeklyForecastPage />} />
              <Route path="/forecast/:date/:wilayaSlug" element={<WilayaForecastPage />} />
              <Route path="/forecast-archive" element={<ForecastArchivePage />} />
              <Route path="/althala" element={<AlThalaPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/bloggers" element={<BloggersPage />} />
              <Route path="/blogger/:slug" element={<BloggerPage />} />
              <Route path="/post/:id" element={<PostPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/news/:slug" element={<NewsArticlePage />} />
              <Route path="/althala/:id" element={<LivestockReportPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsPage />} />
            </Routes>
          </Suspense>
        </Router>
      </WeatherProvider>
    </ErrorBoundary>
  );
}

export default App;
