import React from 'react';

// سطر ذكر المصوّر والرخصة تحت صورة معلم الولاية، كما تشترط رخص ويكيميديا كومنز
export default function LandmarkCredit({ landmark, className = '' }) {
  if (!landmark) return null;
  return (
    <p className={`text-[11px] text-gray-400 px-4 py-1.5 ${className}`} dir="rtl">
      📷 {landmark.label} — تصوير {landmark.artist} ·{' '}
      <a href={landmark.page} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
        {landmark.license} عبر ويكيميديا كومنز
      </a>
    </p>
  );
}
