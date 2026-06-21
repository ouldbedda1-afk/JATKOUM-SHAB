import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPWA from './components/InstallPWA';
import WeeklyForecastPage from './components/WeeklyForecastPage';
import AlThalaPage from './components/AlThalaPage';
import AdminPage from './components/AdminPage';
import { WeatherProvider } from './WeatherContext';
import Home from './pages/Home';

function App() {
  return (
    <ErrorBoundary>
      <WeatherProvider>
        <Router>
          <InstallPWA />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/forecast" element={<WeeklyForecastPage />} />
            <Route path="/althala" element={<AlThalaPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Router>
      </WeatherProvider>
    </ErrorBoundary>
  );
}

export default App;