import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { searchCities } from '../weatherApi';

const { FiCloudRain, FiMap, FiInfo, FiSearch, FiMenu, FiX } = FiIcons;

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
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 px-4 py-3" dir="rtl">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <div className="relative w-10 h-10 md:w-12 md:h-12 overflow-hidden rounded-xl shadow-md border border-blue-100 bg-white">
            <img 
              src="https://graph.facebook.com/Beddetiii/picture?type=large" 
              alt="شعار جاتكم اسحاب" 
              className="w-full h-full object-contain p-0.5"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://images.unsplash.com/photo-1534088568595-a066f7104211?auto=format&fit=crop&q=80&w=100";
              }}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xl md:text-2xl font-black bg-gradient-to-l from-blue-700 to-orange-600 bg-clip-text text-transparent leading-none">
              جاتكم اسحاب
            </span>
            <span className="hidden xs:inline-flex text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mt-1 items-center gap-1 w-fit">
              <span className="w-1 h-1 bg-blue-600 rounded-full animate-pulse"></span>
              الصفحة الرسمية
            </span>
          </div>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-6 font-medium text-gray-700">
          <Link to="/" className="hover:text-blue-600 transition-colors">الرئيسية</Link>
          <Link to="/althala" className="bg-amber-100 text-amber-900 px-4 py-2 rounded-xl font-bold hover:bg-amber-200 transition-all flex items-center gap-2 border border-amber-200 shadow-sm">
            <span className="text-lg">🐫</span>
            دليل الظالة
          </Link>
          <a href="https://www.facebook.com/Beddetiii/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">فيسبوك</a>
          <Link to="/forecast" className="hover:text-blue-600 transition-colors">التوقعات الأسبوعية</Link>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 md:gap-4 relative">
          {/* Desktop Search */}
          <div className="relative hidden sm:block">
            <input 
              type="text" 
              placeholder="ابحث عن مدينة..." 
              value={searchQuery}
              onChange={handleSearch}
              onFocus={() => searchQuery && setShowResults(true)}
              className="bg-gray-100 border-none rounded-full py-2 px-10 focus:ring-2 focus:ring-emerald-500 w-48 lg:w-64"
            />
            <SafeIcon icon={FiSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            
            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full right-0 mt-2 w-full bg-white border border-gray-200 rounded-2xl shadow-2xl z-[60] overflow-hidden max-h-80 overflow-y-auto">
                {searchResults.map((city, idx) => (
                  <button
                    key={idx}
                    onMouseDown={(e) => {
                      e.preventDefault(); // يمنع فقدان التركيز (Blur) قبل الضغط
                      handleSelectCity(city);
                    }}
                    className="w-full text-right px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 text-gray-800 flex flex-col"
                  >
                    <span className="font-bold">{city.name}</span>
                    {city.admin1 && <span className="text-[10px] text-gray-500">{city.admin1}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-1 md:hidden">
            <Link to="/althala" className="bg-amber-600 text-white p-2 rounded-xl shadow-lg">
              <span className="text-xl">🐫</span>
            </Link>
            <button 
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`p-2 rounded-xl transition-colors ${isSearchOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
            >
              <SafeIcon icon={FiSearch} className="text-xl" />
            </button>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl"
            >
              <SafeIcon icon={isMenuOpen ? FiX : FiMenu} className="text-2xl" />
            </button>
          </div>
        </div>

        {/* Mobile Search Overlay */}
        {isSearchOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-xl p-4 z-50 md:hidden"
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

        {/* Mobile Side Menu */}
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 bg-white border-b border-gray-100 shadow-xl p-6 flex flex-col gap-4 md:hidden z-40"
          >
            <Link to="/" onClick={() => setIsMenuOpen(false)} className="text-gray-700 font-bold p-2 hover:bg-gray-50 rounded-xl">الرئيسية</Link>
            <Link to="/althala" onClick={() => setIsMenuOpen(false)} className="bg-amber-100 text-amber-900 p-4 rounded-2xl font-black flex items-center justify-center gap-3 border border-amber-200">
              <span className="text-2xl">🐫</span>
              دليل الظالة (الماشية)
            </Link>
            <Link to="/forecast" onClick={() => setIsMenuOpen(false)} className="text-gray-700 font-bold p-2 hover:bg-gray-50 rounded-xl">التوقعات الأسبوعية</Link>
            <a href="https://www.facebook.com/Beddetiii/" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold p-2 hover:bg-blue-50 rounded-xl">صفحة فيسبوك</a>
          </motion.div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;