import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

// شريط تنقّل ثابت أسفل شاشة الهاتف (تحت 768 بكسل)، كتطبيقات الطقس؛ «المزيد» يفتح بقية الصفحات.
// ارتفاعه محجوز أسفل الصفحة في index.css (.has-tabbar)
const TABS = [
  { icon: '🏠', label: 'الرئيسية', to: '/' },
  { icon: '📦', label: 'التوقعات', to: '/forecast-archive' },
  { icon: '🌧️', label: 'المقاييس', to: '/measurements' },
  { icon: '🌿', label: 'المراعي', to: '/pastures' },
];
const MORE = [
  { icon: '📅', label: 'النشرة الموسمية', to: '/seasonal' },
  { icon: '📰', label: 'الأخبار', to: '/news' },
  { icon: '🐫', label: 'الظالة', to: '/althala' },
];
const HIDDEN_ON = ['/admin'];

export default function MobileTabBar() {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  if (HIDDEN_ON.includes(pathname)) return null;

  const isActive = (to) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const moreActive = MORE.some((m) => isActive(m.to));

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[150] bg-black/30" onClick={() => setMoreOpen(false)}>
          <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-3 bg-white rounded-2xl shadow-2xl p-2 grid gap-1"
            dir="rtl" onClick={(e) => e.stopPropagation()}>
            {MORE.map((m) => (
              <Link key={m.to} to={m.to} onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm ${isActive(m.to) ? 'bg-blue-50 text-[#0b2c5e]' : 'text-gray-700 hover:bg-gray-50'}`}>
                <span className="text-lg">{m.icon}</span>{m.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-[160] bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
        dir="rtl" aria-label="التنقل">
        <div className="grid grid-cols-5 h-16">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} onClick={() => setMoreOpen(false)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${isActive(t.to) ? 'text-[#0b2c5e]' : 'text-gray-400'}`}>
              <span className={`text-xl leading-none ${isActive(t.to) ? '' : 'grayscale opacity-70'}`}>{t.icon}</span>
              {t.label}
            </Link>
          ))}
          <button onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${moreOpen || moreActive ? 'text-[#0b2c5e]' : 'text-gray-400'}`}>
            <span className="text-xl leading-none">☰</span>
            المزيد
          </button>
        </div>
      </nav>
    </>
  );
}
