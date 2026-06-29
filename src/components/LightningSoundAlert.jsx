import React, { useEffect, useRef, useState } from 'react';
import { useWeatherContext } from '../WeatherContext';
import { unlockAudio, playThunder } from '../thunderSound';

/**
 * عند رصد برق حقيقي جديد (Blitzortung) والموقع مفتوح:
 *  - يشغّل صوت رعد
 *  - يعرض إشعاراً قابلاً للضغط ينقل الزائر لبطاقة "رصد اليوم"
 */
export default function LightningSoundAlert() {
  const { lightningStrikes } = useWeatherContext();
  const prevCountRef = useRef(0);
  const initializedRef = useRef(false);
  const lastSoundRef = useRef(0);
  const [toast, setToast] = useState(null);

  // فتح قفل الصوت عند أول تفاعل من الزائر
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const count = lightningStrikes?.length || 0;

    // انتظر أول دفعة حقيقية من البيانات قبل التهيئة
    if (!initializedRef.current) {
      if (lightningStrikes == null) return; // لا تزال تُحمَّل
      initializedRef.current = true;
      prevCountRef.current = count;
      return;
    }

    if (count > prevCountRef.current) {
      const newOnes = count - prevCountRef.current;
      const now = Date.now();
      // حدّ للإزعاج: صوت/إشعار مرة كل 20 ثانية كحد أقصى
      if (now - lastSoundRef.current > 20000) {
        lastSoundRef.current = now;
        playThunder();
        setToast(`⚡ برق مرصود الآن (${newOnes} ضربة) — اضغط لرؤية الخبر`);
        setTimeout(() => setToast(null), 12000);
      }
    }
    prevCountRef.current = count;
  }, [lightningStrikes]);

  if (!toast) return null;

  return (
    <button
      onClick={() => {
        document.getElementById('today-observation')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setToast(null);
      }}
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 rounded-full border-2 border-white/30 bg-gradient-to-l from-amber-500 to-red-600 px-5 py-3 text-sm font-black text-white shadow-2xl animate-pulse"
      dir="rtl"
    >
      <span className="h-2.5 w-2.5 rounded-full bg-white animate-ping" />
      {toast}
    </button>
  );
}
