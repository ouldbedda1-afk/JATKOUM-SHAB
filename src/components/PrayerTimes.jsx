import React, { useState, useEffect } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiClock } = FiIcons;

const PrayerTimes = ({ city }) => {
  const [prayerTimes, setPrayerTimes] = useState(null);
  const [loading, setLoading] = useState(true);
  const cityName = typeof city === 'string' ? city : city.name;

  useEffect(() => {
    const fetchPrayerTimes = async () => {
      try {
        setLoading(true);
        // Using Aladhan API for prayer times
        const response = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(cityName)}&country=Mauritania&method=3`);
        const data = await response.json();
        if (data.code === 200) {
          setPrayerTimes(data.data.timings);
        }
      } catch (error) {
        console.error('Error fetching prayer times:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrayerTimes();
  }, [cityName]);

  if (loading) return (
    <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 animate-pulse h-48"></div>
  );

  if (!prayerTimes) return null;

  const prayers = [
    { name: 'الفجر', time: prayerTimes.Fajr },
    { name: 'الظهر', time: prayerTimes.Dhuhr },
    { name: 'العصر', time: prayerTimes.Asr },
    { name: 'المغرب', time: prayerTimes.Maghrib },
    { name: 'العشاء', time: prayerTimes.Isha },
  ];

  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
          <SafeIcon icon={FiClock} className="text-xl" />
        </div>
        <h3 className="text-xl font-bold text-gray-800">مواقيت الصلاة</h3>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {prayers.map((prayer, idx) => (
          <div key={idx} className="flex flex-col items-center p-2 bg-gray-50 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all group">
            <span className="text-[10px] text-gray-500 mb-1 group-hover:text-emerald-600 font-bold">{prayer.name}</span>
            <span className="text-sm font-black text-gray-800 group-hover:text-emerald-700">{prayer.time}</span>
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-center">
        <p className="text-[10px] text-gray-400 font-medium">توقيت ولاية {cityName}</p>
      </div>
    </div>
  );
};

export default PrayerTimes;
