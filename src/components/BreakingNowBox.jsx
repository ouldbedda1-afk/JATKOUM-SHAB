import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useWeatherContext } from '../WeatherContext';
import { sendLocalNotification, requestNotificationPermission } from '../pwa';
import { broadcastPush, adminCreateNews } from '../supabase';
import { toArabicCommune } from '../mauritaniaCommuneNamesAr';

const { FiShare2, FiBookOpen } = FiIcons;

// بناء نص الخبر القابل للنشر
function buildBreakingText({ thunderCities, rainCities, modelThunder, modelRain, hasRadar }) {
  const stamp = new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  let text = hasRadar
    ? `🔴 *عاجل الآن — جاتكم اسحاب*\n📅 ${stamp}\n\n`
    : `🔭 *متابعة الطقس — جاتكم اسحاب*\n📅 ${stamp}\n\n`;
  if (thunderCities.length > 0) {
    text += `⚡ *عواصف رعدية وبرق مرصودة بالأقمار* في: ${thunderCities.join('، ')}.\nيُرجى الحذر والابتعاد عن الأودية والمناطق المكشوفة.\n\n`;
  }
  if (rainCities.length > 0) {
    text += `🌧️ *غيوم ماطرة مرصودة بالأقمار* في: ${rainCities.join('، ')}.\nجعلها الله أمطار خير وبركة.\n\n`;
  }
  if ((modelThunder?.length || 0) > 0) {
    text += `🔭 *عواصف رعدية محتملة (توقّع نموذجي غير مؤكد)* في: ${modelThunder.join('، ')}.\n\n`;
  }
  if ((modelRain?.length || 0) > 0) {
    text += `🔭 *أمطار محتملة (توقّع نموذجي غير مؤكد)* في: ${modelRain.join('، ')}.\n\n`;
  }
  text += `تابع الرصد المباشر: ${window.location.origin}`;
  return text;
}

export default function BreakingNowBox() {
  const { weatherData, rainingNow, modelRainingNow, loading } = useWeatherContext();
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);

  const breaking = useMemo(() => {
    if (loading || !weatherData) {
      return { thunderCities: [], rainCities: [], modelThunder: [], modelRain: [], active: false };
    }
    const satelliteSet = new Set((rainingNow || []).map((r) => r.city));
    const thunderCities = weatherData
      .filter((c) => satelliteSet.has(c.city) && (c.current?.weather_code ?? 0) >= 95)
      .map((c) => c.city);
    const rainCities = (rainingNow || []).map((r) => r.city).filter((city) => !thunderCities.includes(city));

    const radarSet = new Set([...thunderCities, ...rainCities]);
    const modelThunder = (modelRainingNow || []).filter((m) => m.isThunder && !radarSet.has(m.city)).map((m) => m.city);
    const modelRain = (modelRainingNow || [])
      .filter((m) => !m.isThunder && !radarSet.has(m.city) && !modelThunder.includes(m.city))
      .map((m) => m.city);

    const ar = (list) => list.map(toArabicCommune);
    return {
      thunderCities: ar(thunderCities),
      rainCities: ar(rainCities),
      modelThunder: ar(modelThunder),
      modelRain: ar(modelRain),
      hasRadar: thunderCities.length > 0 || rainCities.length > 0,
      active: thunderCities.length > 0 || rainCities.length > 0 || modelThunder.length > 0 || modelRain.length > 0,
    };
  }, [loading, weatherData, rainingNow, modelRainingNow]);

  const breakingText = useMemo(() => buildBreakingText(breaking), [breaking]);

  // إشعار/بثّ للمؤكّد بالرادار فقط
  const lastNotifiedRef = useRef('');
  useEffect(() => {
    if (!breaking.hasRadar) return;
    const allThunder = breaking.thunderCities;
    const allRain = breaking.rainCities;
    const signature = `T:${[...allThunder].sort().join(',')}|R:${[...allRain].sort().join(',')}`;
    if (signature === lastNotifiedRef.current) return;
    lastNotifiedRef.current = signature;

    (async () => {
      const granted = await requestNotificationPermission();
      if (!granted) return;
      const title = allThunder.length > 0 ? '⚡ عاجل: عواصف رعدية الآن' : '🌧️ عاجل: أمطار مرصودة الآن';
      const body = allThunder.length > 0
        ? `برق وعواصف رعدية في: ${allThunder.join('، ')}. يرجى الحذر.`
        : `غيوم ماطرة في: ${allRain.join('، ')}. جعلها الله خيراً.`;
      sendLocalNotification(title, { body, tag: 'breaking-weather', renotify: true });
      broadcastPush({ title, body, url: '/', tag: 'breaking-weather', dedupeKey: 'breaking-weather', signature, windowMinutes: 30 });
    })();
  }, [breaking]);

  const publishAsNews = async () => {
    setPublishing(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });

      const isStorm = breaking.thunderCities.length > 0;
      const isRain  = breaking.rainCities.length > 0;
      const category = isStorm ? 'عواصف' : 'أمطار';
      const icon     = isStorm ? '⛈️' : '🌧️';

      let title = '';
      if (isStorm)      title = `⚡ عاجل: عواصف رعدية مرصودة بالأقمار في ${breaking.thunderCities.slice(0,3).join('، ')}`;
      else if (isRain)  title = `🌧️ عاجل: غيوم ماطرة مرصودة بالأقمار في ${breaking.rainCities.slice(0,3).join('، ')}`;
      else if (breaking.modelThunder.length) title = `🔭 توقعات: عواصف رعدية محتملة في ${breaking.modelThunder.slice(0,3).join('، ')}`;
      else              title = `🔭 توقعات: أمطار محتملة في ${breaking.modelRain.slice(0,3).join('، ')}`;

      let excerpt = '';
      if (isStorm)      excerpt = `رُصدت عواصف رعدية وبرق بالأقمار الصناعية (Meteosat) في ${breaking.thunderCities.join('، ')}. يُرجى الحذر والابتعاد عن الأودية والمناطق المكشوفة.`;
      else if (isRain)  excerpt = `رُصدت غيوم ماطرة بالأقمار الصناعية في ${breaking.rainCities.join('، ')}. جعلها الله أمطار خير وبركة.`;
      else              excerpt = `تشير نماذج التوقع الجوي إلى احتمال تساقط أمطار وعواصف في ${[...breaking.modelThunder, ...breaking.modelRain].join('، ')}.`;

      let content = `📡 *نشرة طقس عاجلة — جاتكم اسحاب*\n`;
      content += `📅 ${dateStr} · الساعة ${timeStr}\n\n`;

      if (breaking.thunderCities.length) content += `⚡ **عواصف رعدية وبرق** (🛰️ رصد مباشر بالأقمار) في:\n${breaking.thunderCities.join('، ')}\n\n⚠️ يُرجى الحذر الشديد، والابتعاد عن الأودية والأماكن المكشوفة.\n\n`;
      if (breaking.rainCities.length)    content += `🌧️ **غيوم ماطرة** (🛰️ رصد مباشر بالأقمار) في:\n${breaking.rainCities.join('، ')}\n\nجعلها الله أمطار خير وبركة وتقبّل الله الدعاء.\n\n`;
      if (breaking.modelThunder.length)  content += `🔭 **عواصف رعدية محتملة** (توقّع نموذجي غير مؤكد) في:\n${breaking.modelThunder.join('، ')}\n\n`;
      if (breaking.modelRain.length)     content += `🔭 **أمطار محتملة** (توقّع نموذجي غير مؤكد) في:\n${breaking.modelRain.join('، ')}\n\n`;
      content += `---\nالمصدر: رصد الأقمار الصناعية Meteosat · جاتكم اسحاب\nتابع الرصد المباشر على الموقع.`;

      const article = await adminCreateNews({
        title,
        excerpt,
        content,
        category,
        author: 'جاتكم اسحاب',
        is_published: true,
        tags: ['عاجل', 'رصد مباشر', category],
        featured_image: '',
      });

      if (article?.slug) {
        navigate(`/news/${article.slug}`);
      }
    } catch (err) {
      console.error('خطأ في النشر:', err);
    } finally {
      setPublishing(false);
    }
  };

  const shareBreaking = (platform) => {
    if (platform === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(breakingText)}`, '_blank');
    } else if (platform === 'facebook') {
      const fbText = breakingText.replace(/\*/g, '').substring(0, 500);
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}&quote=${encodeURIComponent(fbText)}`, '_blank');
    } else {
      navigator.clipboard?.writeText(breakingText);
    }
  };

  if (!breaking.active) return null;

  return (
    <div className={`rounded-[1.6rem] border-2 overflow-hidden shadow-sm ${breaking.hasRadar ? 'border-red-200 bg-gradient-to-l from-red-50 via-rose-50 to-white' : 'border-amber-200 bg-gradient-to-l from-amber-50 via-orange-50 to-white'}`} dir="rtl">
      <div className={`px-4 py-2 flex items-center gap-2 ${breaking.hasRadar ? 'bg-red-600' : 'bg-amber-500'}`}>
        <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
        <span className="text-white font-black text-sm tracking-wide">
          {breaking.hasRadar ? 'عاجل الآن · رصد مباشر' : 'متابعة · توقّعات النموذج (غير مؤكدة)'}
        </span>
        <span className="mr-auto text-white/90 text-[10px] font-mono">
          {breaking.hasRadar ? '🛰️ رادار' : '🔭 نموذج'}
        </span>
      </div>
      <div className="p-4">
        {breaking.thunderCities.length > 0 && (
          <p className="text-sm font-bold text-red-900 mb-1.5 leading-7">
            ⚡ عواصف رعدية وبرق <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">🛰️ رادار</span> في:{' '}
            <span className="font-black">{breaking.thunderCities.join('، ')}</span>
          </p>
        )}
        {breaking.rainCities.length > 0 && (
          <p className="text-sm font-bold text-sky-900 mb-1.5 leading-7">
            🌧️ غيوم ماطرة <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">🛰️ رادار</span> في:{' '}
            <span className="font-black">{breaking.rainCities.join('، ')}</span>
          </p>
        )}
        {breaking.modelThunder.length > 0 && (
          <p className="text-sm font-bold text-amber-900 mb-1.5 leading-7">
            🔭 عواصف رعدية محتملة <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">توقّع نموذجي غير مؤكد</span> في:{' '}
            <span className="font-black">{breaking.modelThunder.join('، ')}</span>
          </p>
        )}
        {breaking.modelRain.length > 0 && (
          <p className="text-sm font-bold text-teal-900 mb-1.5 leading-7">
            🔭 أمطار محتملة <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">توقّع نموذجي غير مؤكد</span> في:{' '}
            <span className="font-black">{breaking.modelRain.join('، ')}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-current border-opacity-10">
          {/* زر نشر كخبر رئيسي */}
          <button
            onClick={publishAsNews}
            disabled={publishing}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black transition-all shadow-sm ${breaking.hasRadar ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'} disabled:opacity-60`}
          >
            <SafeIcon icon={FiBookOpen} />
            {publishing ? 'جارٍ النشر...' : '📰 نشر كخبر'}
          </button>
          <span className="text-[11px] text-gray-500 font-bold self-center">أو شارك:</span>
          <button onClick={() => shareBreaking('whatsapp')} className="inline-flex items-center gap-1 bg-green-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-green-600 transition-colors">💬 واتساب</button>
          <button onClick={() => shareBreaking('facebook')} className="inline-flex items-center gap-1 bg-[#1877F2] text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-[#166fe5] transition-colors">📘 فيسبوك</button>
          <button onClick={() => shareBreaking('copy')} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors">
            <SafeIcon icon={FiShare2} className="text-[11px]" /> نسخ
          </button>
        </div>
      </div>
    </div>
  );
}
