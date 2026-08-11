import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { searchCities } from '../weatherApi';

const { FiSearch, FiMenu, FiX, FiBell } = FiIcons;

const NAV_LINKS = [
  { icon: '🏠', label: 'الرئيسية',           to: '/'         },
  { icon: '📅', label: 'التوقعات الأسبوعية', to: '/forecast' },
  { icon: '📦', label: 'أرشيف التوقعات',     to: '/forecast-archive' },
  { icon: '🌧️', label: 'مقاييس الأمطار',     to: '/measurements' },
  { icon: '🐫', label: 'الظالة',             to: '/althala'  },
  { icon: '✍️', label: 'مدوّنو الطقس',       to: '/bloggers' },
];

const Navbar = ({ onCitySelect }) => {
  const location = useLocation();
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults]   = useState(false);
  const [isMenuOpen, setIsMenuOpen]     = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length > 0) {
      try {
        const results = await searchCities(query);
        setSearchResults(results);
        setShowResults(true);
      } catch {}
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  const handleSelectCity = (city) => {
    setSearchQuery('');
    setShowResults(false);
    setIsSearchOpen(false);
    if (onCitySelect) onCitySelect(city);
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav
      className="sticky top-0 z-50 text-white"
      dir="rtl"
      style={{ background: 'linear-gradient(135deg, #071e40 0%, #0b2c5e 50%, #0d3468 100%)', backdropFilter: 'blur(12px)', boxShadow: '0 4px 30px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.06) inset' }}
    >
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-3.5">

        {/* الشعار */}
        <Link to="/" className="flex items-center gap-3 shrink-0 group">
          <div className="relative w-11 h-11 md:w-13 md:h-13 overflow-hidden rounded-2xl shadow-lg ring-2 ring-white/15 group-hover:ring-white/30 transition-all bg-white/95">
            <img
              src="/logo.png"
              alt="شعار جاتكم اسحاب"
              className="w-full h-full object-contain p-0.5"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-lg md:text-xl font-black text-white tracking-tight">جاتكم اسحاب</span>
            <span className="hidden sm:block text-[10px] font-medium text-blue-200/70 mt-0.5">رصد الطقس والأمطار · موريتانيا</span>
          </div>
        </Link>

        {/* روابط سطح المكتب */}
        <div className="hidden md:flex items-center gap-1.5">
          {NAV_LINKS.map((l) => {
            const active = isActive(l.to);
            const base = `relative flex items-center gap-2 px-4 py-2 rounded-xl text-[14px] font-bold transition-all duration-200 whitespace-nowrap`;
            const cls = active
              ? `${base} bg-white text-[#0b2c5e] shadow-lg shadow-black/20`
              : `${base} text-white/80 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15`;
            return l.href ? (
              <a key={l.href} href={l.href} className={cls}>
                <span>{l.icon}</span>{l.label}
              </a>
            ) : (
              <Link key={l.label} to={l.to} className={cls}>
                <span>{l.icon}</span>{l.label}
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl" />}
              </Link>
            );
          })}
        </div>

        {/* أدوات اليسار */}
        <div className="flex items-center gap-2 relative">

          {/* بحث سطح المكتب */}
          <div className="relative hidden lg:block">
            <input
              type="text"
              placeholder="ابحث عن مدينة أو بلدية..."
              value={searchQuery}
              onChange={handleSearch}
              onFocus={() => searchQuery && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              className="bg-white/10 text-white placeholder-white/40 border border-white/15 rounded-full py-2 pr-10 pl-4 focus:bg-white/15 focus:border-white/30 focus:ring-2 focus:ring-white/20 focus:outline-none w-52 transition-all text-sm"
            />
            <SafeIcon icon={FiSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm" />
            <AnimatePresence>
              {showResults && searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[60] overflow-hidden max-h-80 overflow-y-auto text-gray-800"
                >
                  {searchResults.slice(0, 8).map((city, idx) => (
                    <button
                      key={idx}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectCity(city); }}
                      className="w-full text-right px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-b-0 flex flex-col transition-colors"
                    >
                      <span className="font-bold text-gray-900 text-sm">{city.name}</span>
                      {city.wilaya && <span className="text-[10px] text-gray-400 mt-0.5">{city.wilaya}</span>}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* زر متابعة فيسبوك */}
          <a
            href="https://www.facebook.com/Beddetiii"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[#1877F2] hover:bg-[#166fe5] active:bg-[#1464d8] text-white text-sm font-black px-4 py-2 rounded-xl shadow-lg shadow-blue-900/40 transition-all shrink-0"
            aria-label="تابعنا على فيسبوك"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
            </svg>
            <span className="hidden sm:inline">متابعة</span>
          </a>

          {/* جرس */}
          <button className="hidden sm:flex p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/15" aria-label="الإشعارات">
            <SafeIcon icon={FiBell} className="text-lg" />
          </button>

          {/* أزرار الجوال */}
          <div className="flex items-center gap-1.5 md:hidden">
            <Link to="/althala" className="flex items-center justify-center w-9 h-9 bg-amber-500/80 hover:bg-amber-500 rounded-xl shadow transition-all">
              <span className="text-base">🐫</span>
            </Link>
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all ${isSearchOpen ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
            >
              <SafeIcon icon={FiSearch} className="text-lg" />
            </button>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center justify-center w-9 h-9 text-white/60 hover:bg-white/10 hover:text-white rounded-xl transition-all"
            >
              <SafeIcon icon={isMenuOpen ? FiX : FiMenu} className="text-xl" />
            </button>
          </div>
        </div>
      </div>

      {/* بحث الجوال */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/10 md:hidden"
          >
            <div className="p-4 bg-[#071e40]">
              <div className="relative">
                <input
                  type="text"
                  placeholder="اكتب اسم المدينة..."
                  autoFocus
                  value={searchQuery}
                  onChange={handleSearch}
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl py-3 px-12 focus:outline-none focus:border-white/40 text-sm"
                />
                <SafeIcon icon={FiSearch} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40" />
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); setIsSearchOpen(false); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                  <SafeIcon icon={FiX} />
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="mt-3 bg-white rounded-2xl overflow-hidden border border-gray-100 max-h-64 overflow-y-auto">
                  {searchResults.slice(0, 8).map((city, idx) => (
                    <button key={idx} onClick={() => handleSelectCity(city)} className="w-full text-right px-5 py-3.5 hover:bg-blue-50 border-b border-gray-50 last:border-b-0 flex flex-col transition-colors">
                      <span className="font-bold text-gray-900 text-sm">{city.name}</span>
                      <span className="text-xs text-gray-400 mt-0.5">{city.wilaya || 'موريتانيا'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* قائمة الجوال */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/10 md:hidden"
          >
            <div className="p-4 grid grid-cols-2 gap-2 bg-[#071e40]">
              {NAV_LINKS.map((l) => {
                const active = isActive(l.to);
                const cls = `flex items-center gap-2.5 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all ${active ? 'bg-white text-[#0b2c5e] shadow' : 'bg-white/8 text-white/80 border border-white/10 hover:bg-white/15 hover:text-white active:scale-95'}`;
                return l.href ? (
                  <a key={l.href} href={l.href} onClick={() => setIsMenuOpen(false)} className={cls}>
                    <span className="text-lg">{l.icon}</span>{l.label}
                  </a>
                ) : (
                  <Link key={l.label} to={l.to} onClick={() => setIsMenuOpen(false)} className={cls}>
                    <span className="text-lg">{l.icon}</span>{l.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
