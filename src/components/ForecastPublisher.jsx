import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminCreateNews } from '../supabase';
import { useWeatherContext } from '../WeatherContext';
import { autoPublishForecastNews, extractForecastDays } from '../forecastToNews';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiSend, FiPlus, FiTrash2, FiZap } = FiIcons;

const INTENSITIES = ['خفيفة', 'متوسطة', 'غزيرة', 'غزيرة جداً'];
const WEATHER_TYPES = [
  { label: 'أمطار',                       icon: '🌧️', tags: ['أمطار'] },
  { label: 'عواصف رعدية',                  icon: '⛈️', tags: ['عواصف', 'رعد', 'برق'] },
  { label: 'عواصف رعدية وأمطار غزيرة',    icon: '🌩️', tags: ['عواصف', 'أمطار غزيرة'] },
  { label: 'رياح شديدة',                   icon: '💨', tags: ['رياح'] },
  { label: 'رياح رملية',                   icon: '🌪️', tags: ['رياح رملية'] },
  { label: 'حرارة شديدة',                  icon: '🌡️', tags: ['حرارة'] },
];
const SOURCES = ['ECMWF', 'GFS', 'Meteosat', 'AROME', 'WRF'];
const HORIZONS = [
  { label: '24 ساعة', value: 24 },
  { label: '48 ساعة', value: 48 },
  { label: '72 ساعة', value: 72 },
];
const WILAYAS = [
  'الحوض الشرقي','الحوض الغربي','آسابه','كوركول','لبراكنه',
  'الترارزة','البراكنه','كيدي ماغا','لعصابه','تكانت','آدرار',
  'إينشيري','تيرس زمور','داخلت نواذيبو',
  'نواكشوط الشمالية','نواكشوط الغربية','نواكشوط الجنوبية',
];

function arabicDay(date) {
  return date.toLocaleDateString('ar-SA', { weekday: 'long' });
}
function arabicDate(date) {
  return date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long' });
}

// Next N days as options
function getDayOptions() {
  const days = [];
  for (let i = 0; i <= 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      label: i === 0 ? `اليوم · ${arabicDate(d)}` : i === 1 ? `غداً · ${arabicDate(d)}` : `${arabicDay(d)} · ${arabicDate(d)}`,
      date: d,
    });
  }
  return days;
}

const EMPTY_CITY = { city: '', wilaya: '', intensity: 'متوسطة', type: WEATHER_TYPES[0] };

export default function ForecastPublisher() {
  const navigate = useNavigate();
  const { weatherData, loading: weatherLoading } = useWeatherContext();
  const dayOptions = getDayOptions();

  const [source,    setSource]    = useState('ECMWF');
  const [horizon,   setHorizon]   = useState(72);
  const [dayIdx,    setDayIdx]    = useState(2);
  const [cities,    setCities]    = useState([{ ...EMPTY_CITY }]);
  const [notes,     setNotes]     = useState('');
  const [publishing,  setPublishing]  = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoResult,  setAutoResult]  = useState('');
  const [autoPreview, setAutoPreview] = useState([]);
  const [error,       setError]       = useState('');
  const [preview,     setPreview]     = useState(false);

  const selectedDay = dayOptions[dayIdx];

  // معاينة ما سيُنشر أوتوماتيكياً (بدون نشر فعلي)
  const autoDetected = extractForecastDays(weatherData || []);

  async function runAutoPublish() {
    if (!weatherData?.length) { setError('بيانات الطقس لم تُحمَّل بعد، انتظر لحظة.'); return; }
    setAutoRunning(true); setAutoResult(''); setError('');
    try {
      const result = await autoPublishForecastNews(weatherData);
      if (result.published === 0 && result.updated === 0) {
        setAutoResult(result.skipped > 0
          ? `☀️ ${result.skipped} ولاية مُتجاهَلة (لا تغيير حقيقي أو لا أمطار مهمة).`
          : '☀️ لا توقعات أمطار مهمة خلال 72 ساعة.');
      } else {
        const parts = [];
        if (result.published) parts.push(`نُشر ${result.published} خبراً جديداً`);
        if (result.updated)   parts.push(`حُدِّث ${result.updated} خبراً (تغيّرت توقعاته)`);
        setAutoResult(`✅ ${parts.join(' و')} من بيانات الصفحة الرئيسية.`);
        setAutoPreview(result.results || []);
      }
    } catch (e) {
      setError('فشل النشر: ' + e.message);
    } finally {
      setAutoRunning(false);
    }
  }

  function addCity() { setCities((c) => [...c, { ...EMPTY_CITY }]); }
  function removeCity(i) { setCities((c) => c.filter((_, idx) => idx !== i)); }
  function updateCity(i, field, val) {
    setCities((c) => c.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  // ── build the article content ─────────────────────────────
  function buildArticle() {
    const day    = selectedDay.date;
    const dayAr  = arabicDay(day);
    const dateAr = arabicDate(day);

    const valid = cities.filter((c) => c.city.trim());

    // ── Title: يتوقع بإذن الله هطول أمطار متوسطة على فصاله يوم الاثنين 29 يونيو مصحوبة بعواصف رعدية
    function cityTitle(c) {
      const isStorm = c.type.label.includes('عواصف');
      const isWind  = c.type.label.includes('رياح');
      const isHeat  = c.type.label.includes('حرارة');
      if (isWind)  return `يتوقع ${c.type.label} ${c.intensity} على ${c.city} يوم ${dayAr} ${dateAr}`;
      if (isHeat)  return `يتوقع موجة ${c.type.label} ${c.intensity} في ${c.city} يوم ${dayAr} ${dateAr}`;
      if (isStorm) return `يتوقع بإذن الله هطول أمطار ${c.intensity} على ${c.city} يوم ${dayAr} ${dateAr} مصحوبة بعواصف رعدية`;
      return `يتوقع بإذن الله هطول أمطار ${c.intensity} على ${c.city} يوم ${dayAr} ${dateAr}`;
    }

    let title;
    if (valid.length === 0) {
      title = `توقعات طقس — ${dayAr} ${dateAr}`;
    } else if (valid.length === 1) {
      title = cityTitle(valid[0]);
    } else {
      // multiple cities: use first city's wording then append remaining
      const first = valid[0];
      const rest  = valid.slice(1).map((c) => c.city).join(' و');
      const isStorm = valid.some((c) => c.type.label.includes('عواصف'));
      const intensity = first.intensity;
      const cityNames = valid.map((c) => c.city).join(' و');
      if (isStorm) {
        title = `يتوقع بإذن الله هطول أمطار ${intensity} على ${cityNames} يوم ${dayAr} ${dateAr} مصحوبة بعواصف رعدية`;
      } else {
        title = `يتوقع بإذن الله هطول أمطار ${intensity} على ${cityNames} يوم ${dayAr} ${dateAr}`;
      }
    }

    // Excerpt: same as title (the main sentence)
    const excerpt = title;

    // Full content
    let content = '';
    valid.forEach((c) => {
      const isStorm = c.type.label.includes('عواصف');
      const isWind  = c.type.label.includes('رياح');
      const isHeat  = c.type.label.includes('حرارة');
      const loc = c.wilaya ? `${c.city} (${c.wilaya})` : c.city;
      if (isWind) {
        content += `يتوقع ${c.type.icon} ${c.type.label} ${c.intensity} على ${loc} يوم ${dayAr} ${dateAr}.\n\n`;
      } else if (isHeat) {
        content += `يتوقع موجة ${c.type.icon} ${c.type.label} ${c.intensity} في ${loc} يوم ${dayAr} ${dateAr}.\n\n`;
      } else if (isStorm) {
        content += `يتوقع بإذن الله ${c.type.icon} هطول أمطار ${c.intensity} على ${loc} يوم ${dayAr} ${dateAr} مصحوبة بعواصف رعدية.\n\n`;
      } else {
        content += `يتوقع بإذن الله ${c.type.icon} هطول أمطار ${c.intensity} على ${loc} يوم ${dayAr} ${dateAr}.\n\n`;
      }
    });

    if (notes.trim()) content += `${notes.trim()}\n\n`;
    content += `المصدر: ${source} — جاتكم اسحاب\nجعلها الله خيراً وبركة.`;

    // Tags & category
    const allTags = ['توقعات', source, ...cities.flatMap((c) => c.type.tags)];
    const category = cities.some((c) => c.type.label.includes('عواصف')) ? 'عواصف' : 'أمطار';
    const wilaya = cities.find((c) => c.wilaya)?.wilaya || '';

    return { title, excerpt, content, category, wilaya, tags: [...new Set(allTags)] };
  }

  const built = buildArticle();

  async function handlePublish() {
    if (cities.filter((c) => c.city.trim()).length === 0) {
      setError('أدخل مدينة واحدة على الأقل'); return;
    }
    setError(''); setPublishing(true);
    try {
      const article = await adminCreateNews({
        ...built,
        author: 'جاتكم اسحاب',
        is_published: true,
        featured_image: '',
      });
      if (article?.slug) navigate(`/news/${article.slug}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black text-gray-800">📡 نشر توقعات جوية</h2>
        <div className="flex gap-2">
          <button onClick={runAutoPublish} disabled={autoRunning}
            className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-black hover:bg-green-700 disabled:opacity-60 transition-all">
            <SafeIcon icon={FiZap} />
            {autoRunning ? 'جارٍ الكشف...' : '⚡ نشر أوتوماتيك (ECMWF)'}
          </button>
          <button onClick={() => setPreview((p) => !p)}
            className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold">
            {preview ? '← إخفاء' : '👁️ معاينة'}
          </button>
        </div>
      </div>

      {/* معاينة ما سيُكشف أوتوماتيكياً */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1.5">
        <p><strong>⚡ أوتوماتيك:</strong> يقرأ نفس بيانات الصفحة الرئيسية ({weatherData?.length || 0} مدينة) وينشر خبراً لكل ولاية بنفس تنسيق بطاقات التوقعات.</p>
        {weatherLoading && <p className="text-gray-400">⏳ جارٍ تحميل البيانات...</p>}
        {!weatherLoading && autoDetected.length === 0 && (
          <p>☀️ لا توقعات أمطار أو عواصف مهمة في الـ 72 ساعة القادمة.</p>
        )}
        {!weatherLoading && autoDetected.length > 0 && (() => {
          // تجميع حسب الولاية للمعاينة
          const wMap = new Map();
          autoDetected.forEach((day) => {
            day.forecasts.forEach((f) => {
              if (!wMap.has(f.wilaya)) wMap.set(f.wilaya, { thunder: 0, heavy: 0, moderate: 0, days: new Set() });
              const w = wMap.get(f.wilaya);
              w.thunder  += f.thunder.length;
              w.heavy    += f.heavy.length;
              w.moderate += f.moderate.length;
              w.days.add(day.dateStr);
            });
          });
          const significant = [...wMap.entries()].filter(([,v]) => v.thunder||v.heavy||v.moderate);
          return (
            <div className="space-y-1">
              <p className="font-bold text-blue-800">📋 سيُنشر ({significant.length} ولاية):</p>
              {significant.map(([wilaya, v]) => (
                <div key={wilaya} className="bg-white rounded-lg px-2.5 py-1.5 border border-blue-100 flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{wilaya}</span>
                  {v.thunder  > 0 && <span>⛈️ عواصف</span>}
                  {v.heavy    > 0 && <span>🌧️ غزيرة</span>}
                  {v.moderate > 0 && <span>🌦️ متوسطة</span>}
                  <span className="text-gray-400">{v.days.size} يوم</span>
                </div>
              ))}
            </div>
          );
        })()}
        <p className="text-gray-500"><strong>📝 يدوي:</strong> استخدم النموذج أدناه لتوقع محدد.</p>
      </div>

      {/* نتيجة آخر تشغيل */}
      {autoResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm font-bold text-green-800 space-y-1">
          <p>{autoResult}</p>
          {autoPreview.map((r) => (
            <p key={r.wilaya} className="text-xs font-normal text-green-700">
              · {r.wilaya} — <a href="/news" className="underline">افتح الأخبار</a>
            </p>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600 font-bold bg-red-50 p-3 rounded-xl">{error}</p>}

      <div className={`grid gap-5 ${preview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* ── Form ── */}
        <div className="space-y-4">
          {/* Source + Horizon */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">المصدر</label>
              <select value={source} onChange={(e) => setSource(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50">
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">الأفق الزمني</label>
              <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50">
                {HORIZONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          </div>

          {/* Day picker */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-2">📅 اليوم المتوقع</label>
            <div className="flex gap-2 flex-wrap">
              {dayOptions.map((d, i) => (
                <button key={i} onClick={() => setDayIdx(i)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${dayIdx === i ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cities */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-600">المناطق المتأثرة</label>
              <button onClick={addCity}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
                <SafeIcon icon={FiPlus} /> إضافة منطقة
              </button>
            </div>
            <div className="space-y-3">
              {cities.map((c, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2">
                  <div className="flex gap-2">
                    <input value={c.city} onChange={(e) => updateCity(i, 'city', e.target.value)}
                      placeholder="اسم المدينة / المنطقة *"
                      className="flex-1 border border-gray-200 rounded-xl p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold" />
                    {cities.length > 1 && (
                      <button onClick={() => removeCity(i)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                        <SafeIcon icon={FiTrash2} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={c.wilaya} onChange={(e) => updateCity(i, 'wilaya', e.target.value)}
                      className="border border-gray-200 rounded-xl p-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                      <option value="">— الولاية —</option>
                      {WILAYAS.map((w) => <option key={w}>{w}</option>)}
                    </select>
                    <select value={c.intensity} onChange={(e) => updateCity(i, 'intensity', e.target.value)}
                      className="border border-gray-200 rounded-xl p-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                      {INTENSITIES.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {WEATHER_TYPES.map((t) => (
                      <button key={t.label} onClick={() => updateCity(i, 'type', t)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${c.type.label === t.label ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">ملاحظات إضافية (اختياري)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: يُرجى الحذر من السيول في الأودية..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          <button onClick={handlePublish} disabled={publishing}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-2xl font-black text-base hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100">
            <SafeIcon icon={FiSend} />
            {publishing ? 'جارٍ النشر...' : '📰 نشر النشرة كخبر'}
          </button>
        </div>

        {/* ── Preview ── */}
        {preview && (
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-3" dir="rtl">
            <p className="text-xs font-bold text-gray-400">👁️ معاينة الخبر</p>

            {/* Bulletin card preview — shows exactly as it will appear in news */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="bg-blue-700 px-4 py-2.5 flex items-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-white font-black text-xs tracking-wide">نشرة توقعات جوية · جاتكم اسحاب</span>
                <span className="mr-auto text-white/70 text-[10px]">{source}</span>
              </div>
              <div className="p-4">
                <p className="text-base font-black text-gray-900 leading-snug">{built.title}</p>
                {notes && <p className="text-sm text-gray-600 mt-2">{notes}</p>}
                <p className="text-[11px] text-gray-400 mt-3">
                  المصدر: {source} · جاتكم اسحاب · جعلها الله خيراً وبركة
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
