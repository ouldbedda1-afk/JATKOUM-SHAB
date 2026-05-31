import React from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useAllCitiesWeather } from '../useWeather';
import { getWeatherIcon, getWeatherDescription } from '../weatherApi';

const { FiCloud, FiCloudSnow, FiSun, FiCloudRain } = FiIcons;

const CityGrid = () => {
  const { data: cities, loading, error } = useAllCitiesWeather();

  if (loading) {
    return (
      <div className="mt-12">
        <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <span className="w-2 h-8 bg-emerald-500 rounded-full"></span>
          الطقس في المدن الكبرى
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, idx) => (
            <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-12 p-6 bg-red-50 border border-red-200 rounded-2xl">
        <p className="text-red-800">خطأ في تحميل بيانات المدن: {error}</p>
      </div>
    );
  }

  return (
    <div className="mt-12">
      <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
        الطقس في الولايات الرئيسية
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cities.map((city, idx) => {
          const temp = Math.round(city.current.temperature_2m);
          const weatherCode = city.current.weather_code;
          const condition = getWeatherDescription(weatherCode);
          const icon = getWeatherIcon(weatherCode);
          const rainProb = city.hourly.precipitation_probability[0];

          return (
            <div key={idx} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-100 transition-all cursor-pointer group">
              <div className="flex justify-between items-start mb-4">
                <p className="text-gray-800 font-bold">{city.city}</p>
                <span className="text-3xl">{icon}</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-3xl font-black text-gray-900">{temp}°</span>
                  <p className="text-[11px] text-gray-500 mt-1">{condition}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-blue-600">
                    <SafeIcon icon={FiCloudRain} className="text-sm" />
                    <span className="text-xs font-bold">{rainProb}%</span>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">احتمال مطر</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CityGrid;