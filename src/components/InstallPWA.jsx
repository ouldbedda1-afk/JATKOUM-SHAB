import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiDownload, FiX, FiPlusSquare, FiShare } = FiIcons;

const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // أُغلِق سابقاً؟ لا نعيد إظهاره قبل 7 أيام
  const recentlyDismissed = () => {
    try {
      const ts = Number(localStorage.getItem('pwa_install_dismissed') || 0);
      return ts && Date.now() - ts < 7 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // التحقق مما إذا كان التطبيق مثبتاً بالفعل
    const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(isRunningStandalone);

    if (recentlyDismissed()) return; // أُغلِق مؤخراً → لا نظهره

    // اكتشاف نظام iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // استماع لحدث تثبيت التطبيق (Android/Chrome)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // إظهار الرسالة بعد ثانيتين من دخول الموقع
      if (!isRunningStandalone && !recentlyDismissed()) {
        setTimeout(() => setIsVisible(true), 2000);
      }
    });

    // بالنسبة لـ iOS، نظهر الرسالة يدوياً لأن النظام لا يدعم الحدث التلقائي
    if (isIOSDevice && !isRunningStandalone) {
      setTimeout(() => setIsVisible(true), 2000);
    }

    // إخفاء الرسالة عند التثبيت بنجاح
    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setIsVisible(false);
      console.log('✅ تم تثبيت التطبيق بنجاح');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', () => {});
      window.removeEventListener('appinstalled', () => {});
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsVisible(false);
    }
  };

  if (isStandalone || !isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-4 left-4 right-4 z-[100] md:left-auto md:right-8 md:top-8 md:w-96"
      >
        <div className="bg-white rounded-[2rem] shadow-2xl border-2 border-emerald-500 p-5 overflow-hidden relative">
          {/* خلفية جمالية */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 z-0" />
          
          <button
            onClick={() => {
              try { localStorage.setItem('pwa_install_dismissed', String(Date.now())); } catch {}
              setIsVisible(false);
            }}
            className="absolute top-3 left-3 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors z-20"
            aria-label="إغلاق"
          >
            <SafeIcon icon={FiX} className="text-base" />
          </button>

          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg border border-gray-100 flex-shrink-0 bg-white">
                <img 
                  src="./logo.png" 
                  alt="شعار جاتكم اسحاب" 
                  className="w-full h-full object-contain p-1"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://graph.facebook.com/Beddetiii/picture?type=large";
                  }}
                />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 leading-tight">ثبت تطبيق جاتكم اسحاب</h3>
                <p className="text-xs text-gray-500 mt-1 font-bold">تابع الطقس والأمطار مباشرة من شاشتك</p>
              </div>
            </div>

            {isIOS ? (
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                <p className="text-sm text-blue-900 leading-relaxed font-bold">
                  لتثبيت التطبيق على آيفون:
                  <br />
                  1. اضغط على زر <SafeIcon icon={FiShare} className="inline mx-1 text-blue-600" /> **المشاركة** بالأسفل.
                  <br />
                  2. اختر <SafeIcon icon={FiPlusSquare} className="inline mx-1 text-blue-600" /> **إضافة إلى الشاشة الرئيسية**.
                </p>
              </div>
            ) : (
              <button
                onClick={handleInstallClick}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
              >
                <SafeIcon icon={FiDownload} className="text-xl" />
                تثبيت التطبيق الآن
              </button>
            )}
            
            <p className="text-[10px] text-center text-gray-400 font-medium">
              تطبيق خفيف وسريع • يعمل بدون إنترنت جزئياً • تحديثات فورية
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default InstallPWA;
