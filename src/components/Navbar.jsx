import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { searchCities } from '../weatherApi';

const { FiSearch, FiMenu, FiX, FiBell, FiUser } = FiIcons;

// روابط التنقّل (تشير إلى مسارات/أقسام حقيقية)
const NAV_LINKS = [
  { label: 'الرئيسية', to: '/' },
  { label: 'التوقعات الأسبوعية', to: '/forecast' },
  { label: 'دليل الظالة', to: '/althala' },
];

const Navbar = ({ onCitySelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.length > 0) {
      try {
        const results = await searchCities(query);
        setSearchResults(results);
        setShowResults(true);
      } catch (error) {
        console.error('خطأ في البحث:', error);
      }
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  const handleSelectCity = (city) => {
    setSearchQuery('');
    setShowResults(false);
    setIsSearchOpen(false);
    if (onCitySelect) {
      onCitySelect(city);
    }
  };

  return (
    <nav className="bg-gradient-to-l from-[#0b2c5e] via-[#103a78] to-[#0b2c5e] text-white sticky top-0 z-50 shadow-lg shadow-blue-950/20" dir="rtl">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3 px-4 py-2.5">
        {/* الشعار */}
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <div className="relative w-10 h-10 md:w-11 md:h-11 overflow-hidden rounded-xl shadow-md ring-1 ring-white/20 bg-white/95">
            <img
              src="https://graph.facebook.com/Beddetiii/picture?type=large"
              alt="شعار جاتكم اسحاب"
              className="w-full h-full object-contain p-0.5"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://images.unsplash.com/photo-1534088568595-a066f7104211?auto=format&fit=crop&q=80&w=100';
              }}
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-lg md:text-xl font-black text-white">جاتكم اسحاب</span>
            <span className="hidden sm:block text-[10px] font-medium text-blue-200/90">
              رصد ومتابعة السحب والأمطار في موريتانيا
            </span>
          </div>
        </Link>

        {/* روابط سطح المكتب */}
        <div className="hidden md:flex items-center gap-1 font-bold text-[13px]">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="px-3 py-2 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://www.facebook.com/Beddetiii/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 transition-colors"
          >
            فيسبوك
          </a>
        </div>

        {/* أدوات الجهة اليسرى */}
        <div className="flex items-center gap-2 relative">
          {/* بحث سطح المكتب */}
          <div className="relative hidden lg:block">
            <input
              type="text"
              placeholder="ابحث عن مدينة أو بلدية..."
              value={searchQuery}
              onChange={handleSearch}
              onFocus={() => searchQuery && setShowResults(true)}
              className="bg-white/15 text-white placeholder-blue-200/70 border border-white/15 rounded-full py-2 pr-10 pl-4 focus:bg-white/20 focus:ring-2 focus:ring-emerald-400/60 focus:outline-none w-56 transition-all"
            />
            <SafeIcon icon={FiSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-200" />

            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full right-0 mt-2 w-full bg-white border border-gray-200 rounded-2xl shadow-2xl z-[60] overflow-hidden max-h-80 overflow-y-auto text-gray-800">
                {searchResults.map((city, idx) => (
                  <button
                    key={idx}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectCity(city);
                    }}
                    className="w-full text-right px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 flex flex-col"
                  >
                    <span className="font-bold">{city.name}</span>
                    {city.admin1 && <span className="text-[10px] text-gray-500">{city.admin1}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* جرس الإشعارات */}
          <button
            className="hidden sm:flex p-2 rounded-xl text-blue-100 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="الإشعارات"
          >
            <SafeIcon icon={FiBell} className="text-lg" />
          </button>

          {/* تسجيل الدخول (واجهة — المصادقة مرحلة قادمة) */}
          <button
            className="hidden sm:flex items-center gap-1.5 bg-white text-[#0b2c5e] font-black text-[13px] px-4 py-2 rounded-full hover:bg-blue-50 transition-colors shadow-sm"
            title="قريباً"
          >
            <SafeIcon icon={FiUser} className="text-sm" />
            تسجيل الدخول
          </button>

          {/* أدوات الجوال */}
          <div className="flex items-center gap-1 md:hidden">
            <Link to="/althala" className="bg-amber-500 text-white p-2 rounded-xl shadow">
              <span className="text-lg">🐫</span>
            </Link>
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`p-2 rounded-xl transition-colors ${isSearchOpen ? 'bg-white/20 text-white' : 'text-blue-100 hover:bg-white/10'}`}
            >
              <SafeIcon icon={FiSearch} className="text-xl" />
            </button>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-blue-100 hover:bg-white/10 rounded-xl"
            >
              <SafeIcon icon={isMenuOpen ? FiX : FiMenu} className="text-2xl" />
            </button>
          </div>
        </div>

        {/* بحث الجوال */}
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-xl p-4 z-50 md:hidden text-gray-800"
          >
            <div className="relative">
              <input
                type="text"
                placeholder="اكتب اسم المدينة (مثل: النعمة)..."
                autoFocus
                value={searchQuery}
                onChange={handleSearch}
                className="w-full bg-gray-100 border-2 border-emerald-500 rounded-2xl py-3 px-12 focus:outline-none"
              />
              <SafeIcon icon={FiSearch} className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-600 text-xl" />
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setIsSearchOpen(false);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              >
                <SafeIcon icon={FiX} />
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-4 bg-white rounded-2xl overflow-hidden border border-gray-100 max-h-64 overflow-y-auto shadow-inner">
                {searchResults.map((city, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectCity(city)}
                    className="w-full text-right px-5 py-4 hover:bg-emerald-50 border-b last:border-b-0 flex flex-col active:bg-emerald-100 transition-colors"
                  >
                    <span className="font-bold text-gray-900">{city.name}</span>
                    <span className="text-xs text-gray-500">{city.admin1 || 'موريتانيا'}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* قائمة الجوال الجانبية */}
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 bg-white border-b border-gray-100 shadow-xl p-6 flex flex-col gap-2 md:hidden z-40 text-gray-800"
          >
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setIsMenuOpen(false)}
                className="font-bold p-3 hover:bg-gray-50 rounded-xl"
              >
                {l.label}
              </Link>
            ))}
            <a
              href="https://www.facebook.com/Beddetiii/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 font-bold p-3 hover:bg-blue-50 rounded-xl"
            >
              صفحة فيسبوك
            </a>
          </motion.div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
